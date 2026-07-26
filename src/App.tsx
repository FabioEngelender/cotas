import * as React from 'react';
import { useState, useEffect } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  useLocation,
  useNavigate
} from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  LogOut, 
  Shield, 
  CreditCard,
  FileText,
  Menu,
  X,
  Settings as SettingsIcon,
  UserPlus,
  Bell,
  Check,
  CheckCheck,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Context & Helper Services
import { db, auth } from './firebase.js';
import { testConnection } from './firebaseService.js';
import { onAuthStateChanged } from 'firebase/auth';
import { 
  doc, 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc, 
  setDoc, 
  onSnapshot, 
  writeBatch, 
  serverTimestamp, 
  limit,
  updateDoc
} from 'firebase/firestore';
import { AuthProvider, useAuth, ADMIN_MASTER_EMAIL } from './contexts/AuthContext.js';

// Visual & Layout Elements
import ErrorBoundary from './components/ErrorBoundary.js';
import SidebarLink from './components/SidebarLink.js';
import InviteModal from './components/InviteModal.js';
import AdBanner from './components/AdBanner.js';
import { cn } from './utils/cn.js';

// Modular Pages
import LoginPage from './pages/LoginPage.js';
import TenantSelectionPage from './pages/TenantSelectionPage.js';
import { Register, RegisterManager, RegisterClient, RegisterTenant } from './pages/RegisterPage.js';
import DashboardPage from './pages/DashboardPage.js';
import ProductsListPage from './pages/ProductsListPage.js';
import ProductDetailPage from './pages/ProductDetailPage.js';
import ProductChatPage from './pages/ProductChatPage.js';
import ClientsListPage from './pages/ClientsListPage.js';
import TermsPage from './pages/TermsPage.js';
import AuditLogsPage from './pages/AuditLogsPage.js';
import MyQuotasPage from './pages/MyQuotasPage.js';
import MyPaymentsPage from './pages/MyPaymentsPage.js';
import PaymentManagementPage from './pages/PaymentManagementPage.js';
import SettingsPage from './pages/SettingsPage.js';
import MarketingAnalyticsPage from './pages/MarketingAnalyticsPage.js';

// --- Background Worker Utilities ---

const checkRecurrentDefaults = async (tenantId: string) => {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  
  const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
  const q = query(
    installmentsRef, 
    where('status', '==', 'pending'),
    where('due_date', '<', now.toISOString().split('T')[0])
  );
  
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  
  const batch = writeBatch(db);
  const processedQuotas = new Set<string>();
  
  for (const installmentDoc of snapshot.docs) {
    const data = installmentDoc.data();
    const productRef = doc(db, 'tenants', tenantId, 'products', data.product_id);
    const productSnap = await getDoc(productRef);
    
    if (productSnap.exists() && productSnap.data().payment_type === 'recurrent') {
      const quotaId = data.quota_id;
      if (processedQuotas.has(quotaId)) continue;
      processedQuotas.add(quotaId);
      
      const quotaRef = doc(db, 'tenants', tenantId, 'quotas', quotaId);
      batch.update(quotaRef, {
        status: 'defaulted'
      });
      
      const futureQ = query(
        installmentsRef,
        where('quota_id', '==', quotaId),
        where('status', '==', 'pending')
      );
      const futureSnapshot = await getDocs(futureQ);
      futureSnapshot.docs.forEach(d => {
        batch.delete(d.ref);
      });
      
      const logRef = doc(collection(db, 'tenants', tenantId, 'logs'));
      batch.set(logRef, {
        action: 'AUTO_REMOVAL',
        details: `Cliente ${data.owner_name} removido por inadimplência no produto ${data.product_name} (Cota ${data.quota_number})`,
        userId: 'system',
        createdAt: serverTimestamp()
      });
    }
  }
  
  await batch.commit();
};

const cleanupOldData = async (tenantId: string) => {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 730);
  
  const batch = writeBatch(db);
  let hasDeletions = false;
  
  // 1. Audit logs older than 730 days
  try {
    const logsQ = query(
      collection(db, 'tenants', tenantId, 'audit_logs'), 
      where('created_at', '<', cutoff),
      limit(50)
    );
    const logsSnap = await getDocs(logsQ);
    logsSnap.docs.forEach(d => {
      batch.delete(d.ref);
      hasDeletions = true;
    });
  } catch (err) {
    console.error("Error cleaning audit logs:", err);
  }

  // 2. Old client-directed notifications older than 730 days
  try {
    const usersSnap = await getDocs(collection(db, 'tenants', tenantId, 'users'));
    for (const userDoc of usersSnap.docs) {
      const notifQ = query(
        collection(db, 'tenants', tenantId, 'users', userDoc.id, 'notifications'),
        where('created_at', '<', cutoff),
        limit(20)
      );
      const notifSnap = await getDocs(notifQ);
      notifSnap.docs.forEach(d => {
        batch.delete(d.ref);
        hasDeletions = true;
      });
    }
  } catch (err) {
    console.error("Error cleaning old notifications:", err);
  }

  // 3. Old chat messages older than 730 days under products
  try {
    const productsSnap = await getDocs(collection(db, 'tenants', tenantId, 'products'));
    for (const prodDoc of productsSnap.docs) {
      const chatQ = query(
        collection(db, 'tenants', tenantId, 'products', prodDoc.id, 'chat'),
        where('created_at', '<', cutoff),
        limit(20)
      );
      const chatSnap = await getDocs(chatQ);
      chatSnap.docs.forEach(d => {
        batch.delete(d.ref);
        hasDeletions = true;
      });
    }
  } catch (err) {
    console.error("Error cleaning old chat messages:", err);
  }

  if (hasDeletions) {
    await batch.commit();
  }
};

const scanOrphanedInstallments = async (tenantId: string) => {
  const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
  const q = query(installmentsRef, where('status', '==', 'pending'), limit(20));
  const snapshot = await getDocs(q);
  
  if (snapshot.empty) return;
  
  const batch = writeBatch(db);
  let changed = false;
  
  for (const instDoc of snapshot.docs) {
    const data = instDoc.data();
    if (data.owner_id) {
      const userRef = doc(db, 'tenants', tenantId, 'users', data.owner_id);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        batch.delete(instDoc.ref);
        changed = true;
      }
    }
  }
  
  if (changed) {
    await batch.commit();
  }
};

// --- Main Application Container ---

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function AppContent() {
  const { user, tenantId, isAuthReady } = useAuth();
  const [settings, setSettings] = useState<any>({ app_name: 'CotaMaster' });

  // 1. Run Background worker daemons on tenant/user detection
  useEffect(() => {
    if (tenantId && user && (user.role === 'admin' || user.role === 'manager')) {
      checkRecurrentDefaults(tenantId);
      cleanupOldData(tenantId);
      scanOrphanedInstallments(tenantId);
    }
  }, [tenantId, user]);

  // 2. Load and listen to general app Settings from database
  useEffect(() => {
    if (tenantId && user) {
      const unsub = onSnapshot(doc(db, 'tenants', tenantId, 'settings', 'general'), (doc) => {
        if (doc.exists()) setSettings(doc.data());
      }, (error) => {
        console.error("Error fetching settings:", error);
      });
      return () => unsub();
    }
  }, [tenantId, user]);

  // 3. Simple connectivity test
  useEffect(() => {
    if (user) {
      testConnection();
    }
  }, [user]);

  if (!isAuthReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#F5F5F0]">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-black/10 border-t-black rounded-full animate-spin mx-auto" />
          <span className="text-xs font-bold uppercase tracking-wider opacity-40">Carregando Cotamaster...</span>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans" translate="no">
        <Routes>
          <Route path="/" element={!tenantId ? <TenantSelectionPage /> : (user ? <Navigate to="/dashboard" /> : <Navigate to="/login" />)} />
          <Route path="/login" element={tenantId ? (!user ? <LoginPage /> : <Navigate to="/" />) : <Navigate to="/" />} />
          <Route path="/register" element={tenantId ? (!user ? <Register /> : <Navigate to="/" />) : <Navigate to="/" />} />
          <Route path="/register-manager/:inviteTenantId/:inviteToken" element={<RegisterManager />} />
          <Route path="/register-tenant" element={<RegisterTenant />} />
          <Route path="/register-client/:inviteTenantId/:inviteToken" element={<RegisterClient />} />
          <Route 
            path="/*" 
            element={user ? <AuthenticatedApp settings={settings} /> : <Navigate to="/" />} 
          />
        </Routes>
      </div>
    </Router>
  );
}

// --- Authenticated Layout (Sidebar, Drawer, Toolbar) ---

function AuthenticatedApp({ settings }: { settings: any }) {
  const { user, tenantId, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const location = useLocation();

  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotificationMenu, setShowNotificationMenu] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!tenantId || !user?.id) return;

    const notificationsRef = collection(db, 'tenants', tenantId, 'users', user.id, 'notifications');
    const q = query(notificationsRef, where('read', '==', false));

    return onSnapshot(q, (snapshot) => {
      setNotifications(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error loading notifications:", error);
    });
  }, [tenantId, user?.id]);

  const handleNotificationClick = async (notif: any) => {
    try {
      const notifRef = doc(db, 'tenants', tenantId!, 'users', user.id, 'notifications', notif.id);
      await updateDoc(notifRef, { read: true });
      setShowNotificationMenu(false);
      navigate(`/products/${notif.productId}/chat?mention=${user.id}`);
    } catch (err) {
      console.error("Error clicking notification:", err);
    }
  };

  const handleMarkAllAsRead = async () => {
    const batch = writeBatch(db);
    notifications.forEach(notif => {
      const notifRef = doc(db, 'tenants', tenantId!, 'users', user.id, 'notifications', notif.id);
      batch.update(notifRef, { read: true });
    });
    try {
      await batch.commit();
      setShowNotificationMenu(false);
    } catch (err) {
      console.error("Error marking all read:", err);
    }
  };

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 1024;
  const showLabels = isSidebarOpen || isMobile;

  return (
    <div className="flex h-screen overflow-hidden relative">
      <InviteModal 
        isOpen={showInviteModal} 
        onClose={() => setShowInviteModal(false)} 
        tenantId={tenantId!} 
        userRole={user.role}
      />
      
      {!isOnline && (
        <div className="bg-red-600 text-white text-xs px-4 py-3 flex items-center justify-center gap-2 font-mono font-bold w-full text-center fixed bottom-0 left-0 right-0 z-[100] border-t border-red-700 shadow-2xl">
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
          Módulo Offline ativado - Conexão suspensa. Operações de pagamento e reserva estão pausadas.
        </div>
      )}

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-black/5 flex items-center justify-between px-6 z-[60]">
        <div className="flex flex-col">
          <span className="font-bold text-lg tracking-tight leading-none">{settings.app_name}</span>
          <span className="flex items-center gap-1.5 text-[8px] font-mono font-bold mt-1">
            <span className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
            {isOnline ? "CONECTADO" : "OFFLINE"}
          </span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 hover:bg-black/5 rounded-xl cursor-pointer">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div 
            key="mobile-menu-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-[70]"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: showLabels ? 280 : 80,
          x: isMobile ? (isMobileMenuOpen ? 0 : -280) : 0
        }}
        className={cn(
          "bg-white border-r border-[#141414]/10 flex flex-col z-[80] transition-all duration-300",
          "fixed lg:relative h-full"
        )}
      >
        <div className="p-6 flex items-center justify-between border-b border-[#141414]/5">
          {showLabels ? (
            <div className="flex flex-col">
              <span className="font-bold text-xl tracking-tight leading-none">{settings.app_name}</span>
              <span className="flex items-center gap-1.5 text-[8px] font-mono font-bold mt-1 p-0.5 bg-black/5 rounded px-1.5 w-fit">
                <span className={cn("w-1.5 h-1.5 rounded-full", isOnline ? "bg-emerald-500 animate-pulse" : "bg-red-500")} />
                {isOnline ? "OPERANDO ONLINE" : "MODO OFFLINE"}
              </span>
            </div>
          ) : (
            <span className={cn("w-2 h-2 rounded-full mx-auto", isOnline ? "bg-emerald-500" : "bg-red-500")} />
          )}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="hidden lg:block p-1 hover:bg-black/5 rounded cursor-pointer">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <button onClick={() => setIsMobileMenuOpen(false)} className="lg:hidden p-1 hover:bg-black/5 rounded cursor-pointer">
            <X size={20} />
          </button>
        </div>

        <nav className="p-4 space-y-2 overflow-y-auto flex-1">
          {user.role === 'admin' && (
            <SidebarLink to="/dashboard" icon={<LayoutDashboard size={20} />} label="Painel" isOpen={showLabels} />
          )}
          <SidebarLink to="/products" icon={<Package size={20} />} label="Produtos" isOpen={showLabels} />
          {user.role === 'client' && (
            <>
              <SidebarLink to="/my-quotas" icon={<Package size={20} />} label="Minhas Cotas" isOpen={showLabels} />
              <SidebarLink to="/my-payments" icon={<CreditCard size={20} />} label="Meus Pagamentos" isOpen={showLabels} />
            </>
          )}
          {user.role !== 'client' && (
            <>
              <SidebarLink to="/clients" icon={<Users size={20} />} label="Clientes" isOpen={showLabels} />
              <SidebarLink to="/payments" icon={<CreditCard size={20} />} label="Pagamentos" isOpen={showLabels} />
            </>
          )}
          {user.role !== 'manager' && (
            <SidebarLink to="/terms" icon={<FileText size={20} />} label="Termo" isOpen={showLabels} />
          )}
          {user.role !== 'client' && (
            <SidebarLink to="/audit" icon={<Shield size={20} />} label="Auditoria" isOpen={showLabels} />
          )}
          {user.role === 'admin' && (
            <>
              <SidebarLink to="/marketing" icon={<Share2 size={20} />} label="Divulgação & Metrics" isOpen={showLabels} />
              <SidebarLink to="/settings" icon={<SettingsIcon size={20} />} label="Configurações" isOpen={showLabels} />
            </>
          )}
          <button 
            type="button"
            onClick={() => setShowInviteModal(true)}
            className={cn(
              "flex items-center gap-4 p-3 rounded-xl hover:bg-black/5 transition-all group w-full text-left cursor-pointer",
              !showLabels && "justify-center"
            )}
          >
            <div className="text-indigo-600"><UserPlus size={20} /></div>
            {showLabels && <span className="font-semibold text-xs text-black/70 group-hover:text-black">{user.role === 'client' ? 'Convidar Amigo' : 'Convidar'}</span>}
          </button>
        </nav>

        <AdBanner slot="your-ad-slot-id" showLabels={showLabels} />

        <div className="p-4 border-t border-[#141414]/5">
          <div className={cn("flex items-center gap-3 p-3 rounded-xl bg-black/5", !showLabels && "justify-center")}>
            <div className="w-8 h-8 rounded-full bg-indigo-505 bg-indigo-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {user.name ? user.name[0].toUpperCase() : 'U'}
            </div>
            {showLabels && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate text-black leading-tight">{user.name}</p>
                <p className="text-[9px] uppercase tracking-wider opacity-50 mt-0.5 leading-none font-bold">
                  {user.role === 'admin' ? 'Admin' : user.role === 'manager' ? 'Gerente' : 'Cliente'}
                </p>
              </div>
            )}
            {showLabels && (
              <button onClick={logout} className="p-1.5 hover:text-red-500 transition-colors cursor-pointer shrink-0" title="Sair do Sistema">
                <LogOut size={15} />
              </button>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content Pane */}
      <main className="flex-1 overflow-y-auto pt-16 lg:pt-0">
        <div className="max-w-7xl mx-auto p-4 lg:p-10">
          <Routes>
            <Route path="/" element={user.role === 'admin' ? <Navigate to="/dashboard" /> : <ProductsListPage />} />
            <Route path="/dashboard" element={user.role === 'admin' ? <DashboardPage /> : <Navigate to="/products" />} />
            <Route path="/products" element={<ProductsListPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/products/:id/chat" element={<ProductChatPage />} />
            <Route path="/clients" element={<ClientsListPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/audit" element={<AuditLogsPage />} />
            <Route path="/my-quotas" element={<MyQuotasPage />} />
            <Route path="/my-payments" element={<MyPaymentsPage settings={settings} />} />
            <Route path="/payments" element={<PaymentManagementPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/marketing" element={user.role === 'admin' ? <MarketingAnalyticsPage /> : <Navigate to="/products" />} />
            <Route path="/*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </main>

      {/* Floating Yellow Bell Indicator - Repositioned to top-middle for priority client attention */}
      {notifications.length > 0 && (
        <div className="fixed top-20 lg:top-6 left-1/2 -translate-x-1/2 z-[95] flex flex-col items-center gap-3">
          {/* Floating Yellow Bell Button */}
          <motion.button
            key="notification-bell"
            animate={{
              rotate: [0, -10, 10, -10, 10, 0],
              scale: [1, 1.05, 1],
            }}
            transition={{
              rotate: {
                repeat: Infinity,
                duration: 2.5,
                ease: "easeInOut",
                repeatDelay: 5
              },
              scale: {
                repeat: Infinity,
                duration: 2.5,
                ease: "easeInOut",
                repeatDelay: 5
              }
            }}
            onClick={() => setShowNotificationMenu(!showNotificationMenu)}
            className="w-14 h-14 rounded-full bg-amber-400 hover:bg-amber-500 text-black flex items-center justify-center shadow-xl border border-amber-500/20 shadow-amber-400/30 transition-all hover:scale-110 active:scale-95 cursor-pointer relative animate-bounce"
            title="Novas mensagens direcionadas"
          >
            <Bell size={24} className="animate-pulse" />
            <span className="absolute -top-1 -right-1 bg-black text-white text-[9px] font-black font-mono w-5 h-5 rounded-full flex items-center justify-center border border-amber-400">
              {notifications.length}
            </span>
          </motion.button>

          {/* Dropdown Menu below the button */}
          <AnimatePresence>
            {showNotificationMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -10 }}
                className="bg-white rounded-3xl p-6 border border-black/5 shadow-2xl w-80 max-w-sm flex flex-col space-y-4 max-h-[400px] overflow-hidden"
              >
                <div className="flex items-center justify-between border-b border-black/5 pb-3">
                  <span className="font-bold text-sm text-black">Atenção com Clientes</span>
                  <button 
                    onClick={handleMarkAllAsRead}
                    className="text-[10px] font-bold text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCheck size={12} /> Marcar lidas
                  </button>
                </div>
                <div className="flex-grow overflow-y-auto space-y-3 pr-1 max-h-[250px]">
                  {notifications.map((notif) => (
                    <div 
                      key={notif.id}
                      className="p-3 bg-black/5 hover:bg-black/10 rounded-2xl transition-all text-xs flex flex-col gap-1.5 relative group cursor-pointer"
                      onClick={() => handleNotificationClick(notif)}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <p className="font-bold text-black leading-snug">
                          {notif.fromUserName || 'Cliente'}
                        </p>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              const notifRef = doc(db, 'tenants', tenantId!, 'users', user.id, 'notifications', notif.id);
                              await updateDoc(notifRef, { read: true });
                            } catch (err) {
                              console.error(err);
                            }
                          }}
                          className="p-1 hover:bg-black/10 rounded text-black/40 hover:text-emerald-600 transition-all cursor-pointer"
                          title="Marcar como lida"
                        >
                          <Check size={12} />
                        </button>
                      </div>
                      <p className="text-black/60 italic font-mono text-[10px] truncate max-w-full">
                        "{notif.message}"
                      </p>
                      <p className="text-[9px] text-[#141414]/40 font-semibold self-end">
                        Ativo: {notif.productName}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
