import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useParams, useLocation, Navigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  MessageSquare, 
  LogOut, 
  Plus, 
  ChevronRight, 
  Shield, 
  CreditCard,
  FileText,
  Menu,
  X,
  RefreshCw,
  ImagePlus,
  Download,
  FileSpreadsheet,
  FileDown,
  ArrowLeft,
  Settings as SettingsIcon,
  Upload,
  Trash2,
  Check,
  Share,
  UserPlus,
  Clover
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { io } from 'socket.io-client';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { User, Product, Quota, ChatMessage, Role } from './types.js';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Utils ---
const maskCPF = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

const maskPhone = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '($1)$2')
    .replace(/(\d{3})(\d)/, '$1-$2')
    .replace(/(\d{3})(\d)/, '$1-$2')
    .replace(/(\d{3})\d+?$/, '$1');
};

const maskCEP = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1-$2')
    .replace(/(-\d{3})\d+?$/, '$1');
};

// --- Auth Context ---
const AuthContext = React.createContext<{
  user: User | null;
  tenantId: number | null;
  setTenantId: (id: number | null) => void;
  setUser: (user: User | null) => void;
  login: (token: string, user: User) => void;
  logout: () => void;
} | null>(null);

const socket = io();

// API Helper
const apiFetch = async (url: string, options: any = {}) => {
  const token = localStorage.getItem('token');
  const tenantId = localStorage.getItem('tenantId');
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...(tenantId && { 'x-tenant-id': tenantId }),
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401 && window.location.pathname !== '/login') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
  return response;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [settings, setSettings] = useState<any>({ app_name: 'CotaMaster' });

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const savedTenantId = localStorage.getItem('tenantId');
    if (savedUser) setUser(JSON.parse(savedUser));
    if (savedTenantId) setTenantId(parseInt(savedTenantId));
    
    if (savedTenantId) {
      apiFetch('/api/settings')
        .then(res => res.json())
        .then(setSettings)
        .catch(console.error);
    }
  }, []);

  const handleSetTenantId = (id: number | null) => {
    if (id) localStorage.setItem('tenantId', id.toString());
    else localStorage.removeItem('tenantId');
    setTenantId(id);
  };

  const login = (token: string, user: User) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const handleSetUser = (u: User | null) => {
    if (u) localStorage.setItem('user', JSON.stringify(u));
    else localStorage.removeItem('user');
    setUser(u);
  };

  return (
    <AuthContext.Provider value={{ user, tenantId, setTenantId: handleSetTenantId, setUser: handleSetUser, login, logout }}>
      <Router>
        <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans">
          <Routes>
            <Route path="/" element={!tenantId ? <TenantSelection /> : (user ? <Navigate to="/dashboard" /> : <Navigate to="/login" />)} />
            <Route path="/login" element={tenantId ? (!user ? <Login /> : <Navigate to="/" />) : <Navigate to="/" />} />
            <Route path="/register" element={tenantId ? (!user ? <Register /> : <Navigate to="/" />) : <Navigate to="/" />} />
            <Route path="/register-manager/:inviteTenantId" element={<RegisterManager />} />
            <Route path="/register-tenant" element={<RegisterTenant />} />
            <Route path="/register-client/:inviteTenantId" element={<RegisterClient />} />
            <Route 
              path="/*" 
              element={user ? <AuthenticatedApp settings={settings} /> : <Navigate to="/" />} 
            />
          </Routes>
        </div>
      </Router>
    </AuthContext.Provider>
  );
}

function InviteModal({ isOpen, onClose, tenantId, userRole }: { isOpen: boolean, onClose: () => void, tenantId: number, userRole: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const baseUrl = window.location.origin;
  
  const links = [
    { label: 'Convite para Cliente', url: `${baseUrl}/register-client/${tenantId}`, icon: <Users size={20} /> },
    ...(userRole === 'admin' ? [{ label: 'Convite para Gerente', url: `${baseUrl}/register-manager/${tenantId}`, icon: <Shield size={20} /> }] : []),
  ];

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-full max-w-md bg-white rounded-[40px] p-10 shadow-2xl"
      >
        <h3 className="text-2xl font-bold mb-6">Convidar para a Loja</h3>
        <div className="space-y-4">
          {links.map((link, i) => (
            <div key={i} className="p-4 bg-black/5 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-40">
                {link.icon} {link.label}
              </div>
              <div className="flex gap-2">
                <input 
                  readOnly 
                  value={link.url} 
                  className="flex-1 bg-white border border-black/5 rounded-xl px-3 py-2 text-xs font-mono truncate"
                />
                <button 
                  onClick={() => copyToClipboard(link.url, link.label)}
                  className="px-4 py-2 bg-black text-white rounded-xl text-xs font-bold hover:scale-105 transition-all"
                >
                  {copied === link.label ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ))}
        </div>
        <button 
          onClick={onClose}
          className="w-full mt-8 py-4 bg-black/5 text-black rounded-2xl font-bold hover:bg-black/10 transition-all"
        >
          Fechar
        </button>
      </motion.div>
    </div>
  );
}

function AuthenticatedApp({ settings }: { settings: any }) {
  const { user, tenantId, logout } = React.useContext(AuthContext)!;
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <InviteModal 
        isOpen={showInviteModal} 
        onClose={() => setShowInviteModal(false)} 
        tenantId={tenantId!} 
        userRole={user.role}
      />
      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="bg-white border-r border-[#141414]/10 flex flex-col z-50"
      >
        <div className="p-6 flex items-center justify-between border-b border-[#141414]/5">
          {isSidebarOpen && <span className="font-bold text-xl tracking-tight">{settings.app_name}</span>}
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-1 hover:bg-black/5 rounded">
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {user.role === 'admin' && (
            <SidebarLink to="/dashboard" icon={<LayoutDashboard size={20} />} label="Painel" isOpen={isSidebarOpen} />
          )}
          <SidebarLink to="/products" icon={<Package size={20} />} label="Produtos" isOpen={isSidebarOpen} />
          {user.role === 'client' && (
            <>
              <SidebarLink to="/my-quotas" icon={<Package size={20} />} label="Minhas Cotas" isOpen={isSidebarOpen} />
              <SidebarLink to="/my-payments" icon={<CreditCard size={20} />} label="Meus Pagamentos" isOpen={isSidebarOpen} />
            </>
          )}
          {user.role !== 'client' && (
            <>
              <SidebarLink to="/clients" icon={<Users size={20} />} label="Clientes" isOpen={isSidebarOpen} />
              <SidebarLink to="/payments" icon={<CreditCard size={20} />} label="Pagamentos" isOpen={isSidebarOpen} />
            </>
          )}
          {user.role !== 'manager' && (
            <SidebarLink to="/terms" icon={<FileText size={20} />} label="Termo" isOpen={isSidebarOpen} />
          )}
          {user.role !== 'client' && (
            <SidebarLink to="/audit" icon={<Shield size={20} />} label="Auditoria" isOpen={isSidebarOpen} />
          )}
          {user.role === 'admin' && (
            <SidebarLink to="/settings" icon={<SettingsIcon size={20} />} label="Configurações" isOpen={isSidebarOpen} />
          )}
          <button 
            onClick={() => setShowInviteModal(true)}
            className={cn(
              "flex items-center gap-4 p-3 rounded-xl hover:bg-black/5 transition-all group w-full text-left",
              !isSidebarOpen && "justify-center"
            )}
          >
            <div className="text-indigo-600"><UserPlus size={20} /></div>
            {isSidebarOpen && <span className="font-medium">Convidar</span>}
          </button>
        </nav>

        <div className="p-4 border-t border-[#141414]/5">
          <div className={cn("flex items-center gap-3 p-3 rounded-xl bg-black/5", !isSidebarOpen && "justify-center")}>
            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
              {user.name[0]}
            </div>
            {isSidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user.name}</p>
                <p className="text-[10px] uppercase tracking-wider opacity-50">{user.role}</p>
              </div>
            )}
            {isSidebarOpen && (
              <button onClick={logout} className="p-1 hover:text-red-500 transition-colors">
                <LogOut size={16} />
              </button>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <Routes>
          <Route path="/" element={user.role === 'admin' ? <Navigate to="/dashboard" /> : <ProductsList />} />
          <Route path="/dashboard" element={user.role === 'admin' ? <Dashboard /> : <Navigate to="/products" />} />
          <Route path="/products" element={<ProductsList />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/products/:id/chat" element={<ProductChat />} />
          <Route path="/clients" element={<ClientsList />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/audit" element={<AuditLogs />} />
          <Route path="/my-quotas" element={<MyQuotas />} />
          <Route path="/my-payments" element={<MyPayments />} />
          <Route path="/payments" element={<PaymentManagement />} />
          <Route path="/register" element={<Register />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}

function SidebarLink({ to, icon, label, isOpen }: { to: string, icon: React.ReactNode, label: string, isOpen: boolean }) {
  return (
    <Link 
      to={to} 
      className="flex items-center gap-4 p-3 rounded-xl hover:bg-black/5 transition-all group"
    >
      <span className="text-black/60 group-hover:text-black">{icon}</span>
      {isOpen && <span className="font-medium">{label}</span>}
    </Link>
  );
}

// --- Components ---

function TenantSelection() {
  const [tenants, setTenants] = useState<any[]>([]);
  const { setTenantId } = React.useContext(AuthContext)!;
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: '', cnpj: '' });
  const [creating, setCreating] = useState(false);

  const fetchTenants = () => {
    apiFetch('/api/tenants')
      .then(res => res.json())
      .then(data => {
        setTenants(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await apiFetch('/api/tenants', {
        method: 'POST',
        body: JSON.stringify(newTenant)
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Loja criada com sucesso!\n\nAdmin: ${data.adminEmail}\nSenha: ${data.adminPassword}\n\nGuarde estas credenciais!`);
        fetchTenants();
        setShowCreate(false);
      } else {
        alert(data.error);
      }
    } catch (err: any) {
      console.error(err);
      alert('Erro ao criar loja: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F5F0]">
        <RefreshCw className="w-8 h-8 animate-spin text-[#141414]/20" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#F5F5F0]">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl w-full"
      >
        <div className="text-center mb-12">
          <h1 className="text-4xl font-serif italic mb-4">Bem-vindo ao CotaMaster</h1>
          <p className="text-[#141414]/60">Selecione uma loja para acessar o sistema</p>
        </div>

        <div className="flex flex-col items-center gap-6">
          {tenants.filter(t => t.name !== 'CotaMaster Matriz').map((tenant) => (
            <motion.button
              key={tenant.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setTenantId(tenant.id)}
              className="p-6 transition-all text-left group w-full max-w-[500px] flex items-center gap-8"
            >
              <motion.div 
                whileHover={{ scale: 1.1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="w-24 h-24 rounded-full bg-white overflow-hidden flex-shrink-0 relative shadow-lg group-hover:shadow-xl transition-all duration-500"
              >
                {tenant.image_url ? (
                  <img 
                    src={tenant.image_url} 
                    alt={tenant.name} 
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#141414]/10">
                    <Shield className="w-10 h-10" />
                  </div>
                )}
              </motion.div>
              <div className="flex-1 min-w-0">
                <h3 className="text-2xl font-serif italic group-hover:text-[#141414] transition-colors">{tenant.name}</h3>
              </div>
            </motion.button>
          ))}
        </div>

        <div className="mt-20 text-center space-y-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#141414]/30">
            Termo de Uso Simplificado
          </div>
          <p className="max-w-md mx-auto text-[11px] leading-relaxed text-[#141414]/40 italic">
            Ao acessar qualquer loja deste sistema, você concorda com o processamento de seus dados para fins de gestão de cotas e comunicações relacionadas, conforme a LGPD.
          </p>

          <div className="pt-4 flex flex-col items-center gap-4">
            {tenants.find(t => t.name === 'CotaMaster Matriz') && (
              <button 
                onClick={() => setTenantId(tenants.find(t => t.name === 'CotaMaster Matriz').id)}
                className="group flex flex-col items-center gap-2 transition-all"
              >
                <Clover className="w-5 h-5 text-emerald-500 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]" strokeWidth={1.5} />
              </button>
            )}
          </div>
          
          <div className="pt-8">
            <button 
              onClick={() => {
                const master = tenants.find(t => t.name.toLowerCase().includes('matriz') || t.id === 1);
                if (master) setTenantId(master.id);
              }}
              className="p-4 opacity-0 hover:opacity-10 transition-none cursor-default"
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </div>

        {tenants.length === 0 && !showCreate && (
          <div className="text-center p-12 bg-white rounded-3xl border border-dashed border-[#141414]/10">
            <Shield className="w-12 h-12 mx-auto mb-4 text-[#141414]/10" />
            <p className="text-[#141414]/40 mb-6">Nenhuma loja ativa encontrada.</p>
            <button 
              onClick={() => setShowCreate(true)}
              className="px-8 py-4 bg-black text-white rounded-2xl font-bold hover:scale-105 transition-all"
            >
              Criar Primeira Loja
            </button>
          </div>
        )}

        {showCreate && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="max-w-md mx-auto bg-white p-8 rounded-3xl border border-[#141414]/5 shadow-xl"
          >
            <h2 className="text-2xl font-bold mb-6">Nova Loja</h2>
            <form onSubmit={handleCreateTenant} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2">Nome da Loja</label>
                <input 
                  type="text" 
                  required
                  value={newTenant.name}
                  onChange={e => setNewTenant({...newTenant, name: e.target.value})}
                  className="w-full px-4 py-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black outline-none transition-all"
                  placeholder="Ex: Minha Loja de Cotas"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2">CNPJ (Opcional)</label>
                <input 
                  type="text" 
                  value={newTenant.cnpj}
                  onChange={e => setNewTenant({...newTenant, cnpj: e.target.value})}
                  className="w-full px-4 py-3 bg-[#F5F5F0] rounded-xl border-none focus:ring-2 focus:ring-black outline-none transition-all"
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 py-4 bg-[#F5F5F0] text-black rounded-2xl font-bold hover:bg-black/5 transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  disabled={creating}
                  className="flex-1 py-4 bg-black text-white rounded-2xl font-bold hover:scale-105 transition-all disabled:opacity-50"
                >
                  {creating ? 'Criando...' : 'Criar Loja'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, tenantId, setTenantId } = React.useContext(AuthContext)!;
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, tenantId }),
      });
      const data = await res.json();
      if (res.ok) {
        login(data.token, data.user);
        navigate('/');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <div className="bg-white p-10 rounded-[32px] border border-[#141414]/5 shadow-xl">
          <button 
            onClick={() => setTenantId(null)}
            className="mb-8 flex items-center text-sm text-[#141414]/40 hover:text-[#141414] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar para seleção de lojas
          </button>

          <div className="mb-10">
            <h2 className="text-3xl font-serif italic mb-2">Entrar</h2>
            <p className="text-[#141414]/60">Acesse sua conta para continuar</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                Nome, E-mail ou CPF
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none focus:ring-2 focus:ring-[#141414]/5 transition-all outline-none"
                required
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2 ml-1">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40">
                  Senha
                </label>
                <button 
                  type="button"
                  onClick={async () => {
                    if (!email) return alert('Por favor, insira seu e-mail primeiro.');
                    try {
                      const res = await apiFetch('/api/recover-password', {
                        method: 'POST',
                        body: JSON.stringify({ email, tenantId })
                      });
                      const data = await res.json();
                      if (res.ok) {
                        alert(data.message + (data.debug_password ? `\n\nSenha encontrada: ${data.debug_password}` : ''));
                      } else {
                        alert(data.error);
                      }
                    } catch (err) {
                      alert('Erro ao recuperar senha');
                    }
                  }}
                  className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 hover:text-[#141414] transition-colors"
                >
                  Esqueceu a senha?
                </button>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none focus:ring-2 focus:ring-[#141414]/5 transition-all outline-none"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-[#141414] text-white rounded-2xl font-medium hover:bg-[#141414]/90 transition-all disabled:opacity-50 shadow-lg shadow-black/10"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : 'Entrar'}
            </button>
          </form>

          <div className="mt-8 pt-8 border-top border-[#141414]/5 text-center">
            <p className="text-sm text-[#141414]/40">
              Não tem uma conta?{' '}
              <Link to="/register" className="text-[#141414] font-medium hover:underline">
                Cadastre-se
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function RegisterClient() {
  const { inviteTenantId } = useParams();
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    cpf: '', 
    phone: '', 
    address: '', 
    address_number: '',
    address_complement: '',
    address_cep: '',
    pix_key: '' 
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/register-client', {
        method: 'POST',
        body: JSON.stringify({ ...formData, tenantId: Number(inviteTenantId) }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Cadastro realizado com sucesso! Agora você pode fazer login.');
        navigate('/');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F5F0]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <div className="bg-white p-10 rounded-[32px] border border-[#141414]/5 shadow-xl">
          <div className="mb-10">
            <h2 className="text-3xl font-serif italic mb-2">Cadastro de Cliente</h2>
            <p className="text-[#141414]/60">Crie sua conta para participar desta loja</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                Nome Completo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  E-mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value.toLowerCase()})}
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  Senha <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  CPF <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({...formData, cpf: maskCPF(e.target.value)})}
                  placeholder="000.000.000-00"
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  Telefone <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: maskPhone(e.target.value)})}
                  placeholder="(00)000-000-000"
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                Endereço (Rua/Avenida) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  N° <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.address_number}
                  onChange={(e) => setFormData({...formData, address_number: e.target.value})}
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">Comp.</label>
                <input
                  type="text"
                  value={formData.address_complement}
                  onChange={(e) => setFormData({...formData, address_complement: e.target.value})}
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  CEP <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.address_cep}
                  onChange={(e) => setFormData({...formData, address_cep: maskCEP(e.target.value)})}
                  placeholder="00.000-000"
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                Chave PIX <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.pix_key}
                onChange={(e) => setFormData({...formData, pix_key: e.target.value})}
                className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[#141414] text-white rounded-2xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 mt-4"
            >
              {loading ? 'Cadastrando...' : 'Cadastrar'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function RegisterTenant() {
  const [formData, setFormData] = useState({ 
    name: '', 
    cnpj: '', 
    image_url: '',
    adminName: '',
    adminEmail: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/tenants', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Loja criada com sucesso!\n\nAdmin: ${data.adminEmail}\nSenha: ${data.adminPassword}\n\nGuarde estas credenciais!`);
        navigate('/');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F5F0]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <div className="bg-white p-10 rounded-[32px] border border-[#141414]/5 shadow-xl">
          <div className="mb-10">
            <h2 className="text-3xl font-serif italic mb-2">Criar Nova Loja</h2>
            <p className="text-[#141414]/60">Cadastre sua loja no sistema CotaMaster</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100">
                {error}
              </div>
            )}
            
            <div className="flex justify-center mb-4">
              <div className="w-24 h-24 rounded-full bg-black/5 border border-dashed border-black/10 flex items-center justify-center overflow-hidden relative">
                {formData.image_url ? (
                  <img src={formData.image_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <ImagePlus className="w-8 h-8 text-black/20" />
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Nome Completo (Admin)</label>
              <input
                type="text"
                value={formData.adminName}
                onChange={(e) => setFormData({...formData, adminName: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">E-mail (Admin)</label>
              <input
                type="email"
                value={formData.adminEmail}
                onChange={(e) => setFormData({...formData, adminEmail: e.target.value.toLowerCase()})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Senha (Admin)</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Nome da Loja (Obrigatório)</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">CNPJ (Opcional)</label>
              <input
                type="text"
                value={formData.cnpj}
                onChange={(e) => setFormData({...formData, cnpj: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">URL da Logomarca (Opcional)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.image_url}
                  onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                  className="flex-1 px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  placeholder="https://exemplo.com/logo.png"
                />
                <label className="p-4 bg-black/5 rounded-2xl cursor-pointer hover:bg-black/10 transition-all">
                  <ImagePlus size={20} className="text-black/40" />
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setFormData({...formData, image_url: reader.result as string});
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-[#141414] text-white rounded-[20px] font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {loading ? 'Criando...' : 'Criar Loja'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function RegisterManager() {
  const { inviteTenantId } = useParams();
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/register-manager', {
        method: 'POST',
        body: JSON.stringify({ ...formData, tenantId: Number(inviteTenantId) }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Gerente cadastrado com sucesso!');
        navigate('/');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F5F0]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <div className="bg-white p-10 rounded-[32px] border border-[#141414]/5 shadow-xl">
          <div className="mb-10">
            <h2 className="text-3xl font-serif italic mb-2">Cadastro de Gerente</h2>
            <p className="text-[#141414]/60">Crie sua conta de gerente para esta loja</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Nome Completo</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">E-mail</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value.toLowerCase()})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Senha</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-[#141414] text-white rounded-2xl font-medium hover:bg-[#141414]/90 transition-all disabled:opacity-50 shadow-lg shadow-black/10"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : 'Cadastrar como Gerente'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    cpf: '',
    phone: '',
    address: '',
    address_number: '',
    address_complement: '',
    address_cep: '',
    pix_key: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { tenantId, setTenantId } = React.useContext(AuthContext)!;
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await apiFetch('/api/register', {
        method: 'POST',
        body: JSON.stringify({ ...formData, tenantId }),
      });
      const data = await res.json();
      if (res.ok) {
        navigate('/login');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Erro ao conectar com o servidor');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl w-full"
      >
        <div className="bg-white p-10 rounded-[32px] border border-[#141414]/5 shadow-xl">
          <button 
            onClick={() => setTenantId(null)}
            className="mb-8 flex items-center text-sm text-[#141414]/40 hover:text-[#141414] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> Voltar para seleção de lojas
          </button>

          <div className="mb-10">
            <h2 className="text-3xl font-serif italic mb-2">Cadastre-se</h2>
            <p className="text-[#141414]/60">Crie sua conta para começar a investir</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100">
                {error}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  Nome Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  E-mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value.toLowerCase()})}
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  Senha <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  CPF <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({...formData, cpf: maskCPF(e.target.value)})}
                  placeholder="000.000.000-00"
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  Telefone <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: maskPhone(e.target.value)})}
                  placeholder="(00)000-000-000"
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  Chave PIX <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.pix_key}
                  onChange={(e) => setFormData({...formData, pix_key: e.target.value})}
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  Endereço (Rua/Avenida) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                    N° <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.address_number}
                    onChange={(e) => setFormData({...formData, address_number: e.target.value})}
                    className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Complemento</label>
                  <input
                    type="text"
                    value={formData.address_complement}
                    onChange={(e) => setFormData({...formData, address_complement: e.target.value})}
                    className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                    CEP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.address_cep}
                    onChange={(e) => setFormData({...formData, address_cep: maskCEP(e.target.value)})}
                    placeholder="00.000-000"
                    className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-[#141414] text-white rounded-2xl font-medium hover:bg-[#141414]/90 transition-all disabled:opacity-50 shadow-lg shadow-black/10"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : 'Criar Conta'}
            </button>
          </form>

          <div className="mt-8 pt-8 border-top border-[#141414]/5 text-center">
            <p className="text-sm text-[#141414]/40">
              Já tem uma conta?{' '}
              <Link to="/login" className="text-[#141414] font-medium hover:underline">
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function SettingsPage() {
  const [settings, setSettings] = useState<any>({ app_name: '', admin_name: '' });
  const [loading, setLoading] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: '', cnpj: '', image_url: '' });
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const { user } = React.useContext(AuthContext)!;

  const fetchTenants = () => {
    if (user?.tenant_id === 1) {
      apiFetch('/api/tenants')
        .then(res => res.json())
        .then(setTenants);
    }
  };

  useEffect(() => {
    apiFetch('/api/settings')
      .then(res => res.json())
      .then(setSettings);
    
    fetchTenants();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      if (res.ok) {
        alert('Configurações salvas com sucesso! Recarregue a página para aplicar todas as mudanças.');
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTenant(true);
    try {
      const res = await apiFetch('/api/tenants', {
        method: 'POST',
        body: JSON.stringify(newTenant)
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Loja criada com sucesso!\n\nAdmin: ${data.adminEmail}\nSenha: ${data.adminPassword}\n\nGuarde estas credenciais!`);
        setNewTenant({ name: '', cnpj: '', image_url: '' });
        fetchTenants();
      } else {
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao criar loja');
    } finally {
      setCreatingTenant(false);
    }
  };

  const handleDeleteTenant = async (id: number, name: string) => {
    if (!confirm(`TEM CERTEZA que deseja excluir a loja "${name}"? Todos os dados (usuários, produtos, vendas) serão permanentemente apagados.`)) return;
    
    try {
      const res = await apiFetch(`/api/tenants/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        alert('Loja excluída com sucesso!');
        fetchTenants();
      } else {
        alert(data.error || 'Erro desconhecido ao excluir loja');
      }
    } catch (err: any) {
      console.error(err);
      alert('Erro de conexão ou resposta inválida do servidor ao excluir loja');
    }
  };

  const handleExport = async () => {
    try {
      const res = await apiFetch('/api/backup/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_cotamaster_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
    } catch (err) {
      console.error(err);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm('ATENÇÃO: Isso irá sobrescrever todos os dados atuais. Deseja continuar?')) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        const res = await apiFetch('/api/backup/import', {
          method: 'POST',
          body: JSON.stringify(data)
        });
        if (res.ok) {
          alert('Backup importado com sucesso!');
          window.location.reload();
        }
      } catch (err) {
        alert('Erro ao importar backup: ' + err);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Configurações</h2>
        <p className="text-black/50">Gerencie a identidade e dados do sistema</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[40px] border border-black/5 shadow-sm space-y-6">
          <h3 className="font-bold text-xl">Identidade</h3>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-50">Nome da Loja</label>
              <input 
                type="text" 
                value={settings.app_name}
                onChange={e => setSettings({...settings, app_name: e.target.value})}
                className="w-full p-4 mt-1 bg-black/5 rounded-2xl border-none focus:ring-2 focus:ring-black/10 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-50">Nome do Administrador Master</label>
              <input 
                type="text" 
                value={settings.admin_name}
                onChange={e => setSettings({...settings, admin_name: e.target.value})}
                className="w-full p-4 mt-1 bg-black/5 rounded-2xl border-none focus:ring-2 focus:ring-black/10 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-50">Nova Senha do Admin (Opcional)</label>
              <input 
                type="password" 
                value={settings.password || ''}
                onChange={e => setSettings({...settings, password: e.target.value})}
                className="w-full p-4 mt-1 bg-black/5 rounded-2xl border-none focus:ring-2 focus:ring-black/10 transition-all"
                placeholder="Deixe em branco para não alterar"
              />
            </div>
            <button 
              onClick={handleSave}
              disabled={loading}
              className="w-full py-4 bg-black text-white rounded-2xl font-bold hover:scale-[1.02] transition-all disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-black/5 shadow-sm space-y-6">
          <h3 className="font-bold text-xl">Backup de Dados</h3>
          <p className="text-sm text-black/50">Exporte todos os dados do sistema para um arquivo JSON ou restaure um backup anterior.</p>
          
          <div className="space-y-4">
            <button 
              onClick={handleExport}
              className="w-full py-4 bg-emerald-50 text-emerald-600 rounded-2xl font-bold hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
            >
              <Download size={20} /> Exportar Backup
            </button>
            
            <div className="relative">
              <input 
                type="file" 
                accept=".json"
                onChange={handleImport}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <button 
                className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
              >
                <Upload size={20} /> Importar Backup
              </button>
            </div>
          </div>
        </div>

        {user?.tenant_id === 1 && (
          <div className="bg-white p-8 rounded-[40px] border border-black/5 shadow-sm space-y-6">
            <h3 className="font-bold text-xl">Criar Nova Loja</h3>
            <p className="text-sm text-black/60">Compartilhe o link abaixo para que alguém crie uma nova loja no sistema.</p>
            <div className="flex gap-2">
              <input 
                type="text" 
                readOnly 
                value={`${window.location.origin}/register-tenant`}
                className="flex-1 px-4 py-2 bg-black/5 rounded-xl text-sm"
              />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/register-tenant`);
                  alert('Link copiado!');
                }}
                className="px-4 py-2 bg-black text-white rounded-xl text-sm font-bold"
              >
                Copiar Link
              </button>
            </div>
          </div>
        )}

        {user?.tenant_id === 1 && (
          <div className="bg-white p-8 rounded-[40px] border border-black/5 shadow-sm space-y-6 md:col-span-2">
            <h3 className="font-bold text-xl">Gerenciar Lojas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tenants.map(t => (
                <div key={t.id} className="p-4 bg-black/5 rounded-2xl flex items-center justify-between group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-full bg-white overflow-hidden flex-shrink-0 border border-black/5">
                      {t.image_url ? (
                        <img src={t.image_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-black/10">
                          <Shield size={16} />
                        </div>
                      )}
                    </div>
                    <div className="truncate">
                      <p className="font-bold text-sm truncate">{t.name}</p>
                      <p className="text-[10px] opacity-40 uppercase tracking-wider">{t.id === 1 ? 'Matriz' : `${t.client_count} Clientes`}</p>
                    </div>
                  </div>
                  {t.id !== 1 && (
                    <button 
                      onClick={() => handleDeleteTenant(t.id, t.name)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    console.log("Dashboard: Iniciando carregamento de estatísticas...");
    apiFetch('/api/stats')
    .then(res => {
      console.log("Dashboard: Resposta da API recebida", res.status);
      if (!res.ok) throw new Error('Falha ao carregar estatísticas');
      return res.json();
    })
    .then(data => {
      console.log("Dashboard: Dados processados", data);
      if (data.error) {
        console.error("Erro ao carregar stats:", data.error);
        return;
      }
      setStats(data);
    })
    .catch(err => {
      console.error("Erro na requisição de stats:", err);
      alert('Erro ao carregar dados do painel. Verifique sua conexão.');
      setStats({
        products: 0,
        sales: 0,
        revenue: 0,
        pendingPayments: 0,
        receivedPayments: 0,
        productRevenue: [],
        recentActivity: []
      });
    });

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (!stats) return <div className="p-8">Carregando dados...</div>;

  const formatCurrency = (val: number) => 
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

  const exportToCSV = (productName: string, sales: any[]) => {
    const headers = ["Cota #", "Comprador", "CPF", "Parcelas Pagas", "Total Parcelas"];
    const rows = sales.map(s => [s.number || s.id, s.owner, s.owner_cpf || 'Não informado', s.paid_installments, s.total_installments]);
    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `vendas_${productName.toLowerCase().replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportToPDF = (productName: string, sales: any[]) => {
    const doc = new jsPDF();
    doc.text(`Lista de Vendas - ${productName}`, 14, 15);
    (doc as any).autoTable({
      startY: 20,
      head: [['Cota #', 'Comprador', 'Parcelas Pagas', 'Total']],
      body: sales.map(s => [s.number || s.id, s.owner, s.paid_installments, s.total_installments]),
    });
    doc.save(`vendas_${productName.toLowerCase().replace(/\s+/g, '_')}.pdf`);
  };

  if (selectedProduct) {
    return (
      <div className="space-y-8">
        <header className="flex items-center gap-4">
          <button 
            onClick={() => setSelectedProduct(null)}
            className="p-2 hover:bg-black/5 rounded-full transition-all"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Compradores: {selectedProduct.name}</h2>
            <p className="text-black/50">Lista detalhada de proprietários de cotas</p>
          </div>
        </header>

        <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <h3 className="font-bold text-xl">Relatório de Vendas</h3>
            <div className="flex gap-4">
              <button 
                onClick={() => exportToCSV(selectedProduct.name, selectedProduct.sales_details)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-bold hover:bg-emerald-100 transition-all"
              >
                <FileSpreadsheet size={18} /> Planilha
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="py-4 text-xs font-bold uppercase tracking-widest opacity-40">Cota #</th>
                  <th className="py-4 text-xs font-bold uppercase tracking-widest opacity-40">Proprietário</th>
                  <th className="py-4 text-xs font-bold uppercase tracking-widest opacity-40">CPF</th>
                  <th className="py-4 text-xs font-bold uppercase tracking-widest opacity-40">Parcelas Pagas</th>
                  <th className="py-4 text-xs font-bold uppercase tracking-widest opacity-40">Progresso</th>
                </tr>
              </thead>
              <tbody>
                {selectedProduct.sales_details.map((sale: any, idx: number) => (
                  <tr key={idx} className="border-b border-black/5 last:border-0 hover:bg-black/[0.02] transition-all">
                    <td className="py-4 font-mono font-bold text-indigo-600">#{sale.number || sale.id}</td>
                    <td className="py-4 font-medium">{sale.owner}</td>
                    <td className="py-4 text-sm text-black/60">{sale.owner_cpf || 'Não informado'}</td>
                    <td className="py-4 font-medium">{sale.paid_installments} / {sale.total_installments}</td>
                    <td className="py-4">
                      <div className="w-24 h-2 bg-black/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 transition-all" 
                          style={{ width: `${sale.total_installments > 0 ? (sale.paid_installments / sale.total_installments) * 100 : 0}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {selectedProduct.sales_details.length === 0 && (
                  <tr>
                    <td colSpan={2} className="py-12 text-center text-black/30">Nenhuma cota vendida para este produto ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Painel</h2>
          <p className="text-black/50">Visão geral do sistema e performance</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Horário do Servidor</p>
          <p className="text-xs font-medium flex items-center gap-2 text-emerald-600">
            <RefreshCw size={12} className="animate-spin-slow" /> {currentTime.toLocaleDateString('pt-BR')} {currentTime.toLocaleTimeString('pt-BR')}
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard 
          label="Produtos Ativos" 
          value={(stats?.products || 0).toString()} 
          sub="Total cadastrado" 
          onClick={() => navigate('/products')}
        />
        <StatCard label="Cotas Vendidas" value={(stats?.sales || 0).toString()} sub="Total de vendas" />
        <StatCard label="Recebido" value={formatCurrency(stats?.receivedPayments || 0)} sub="Pagamentos confirmados" />
        <StatCard label="Pendente" value={formatCurrency(stats?.pendingPayments || 0)} sub="Aguardando baixa" onClick={() => navigate('/payments')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <h3 className="font-bold text-xl">Receita por Produto</h3>
          <div className="grid grid-cols-1 gap-4">
            {(stats?.productRevenue || []).map((pr: any, i: number) => (
              <div 
                key={i} 
                className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm space-y-4 hover:border-black/20 transition-all cursor-pointer group"
                onClick={() => setSelectedProduct(pr)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest opacity-50 mb-1">{pr.name}</p>
                    <p className="text-3xl font-bold tracking-tighter">{formatCurrency(pr.revenue)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold opacity-40 uppercase tracking-widest">Cotas Totais</p>
                    <p className="text-xl font-bold">{pr.total_quotas}</p>
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-4 border-t border-black/5">
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); exportToCSV(pr.name, pr.sales_details); }}
                      className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-all"
                      title="Exportar Planilha"
                    >
                      <FileSpreadsheet size={16} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-bold text-black/40 group-hover:text-black transition-all">
                    Ver Compradores <ChevronRight size={14} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm h-fit">
          <h3 className="font-bold text-xl mb-6">Atividade Recente</h3>
          <div className="space-y-4">
            {(stats?.recentActivity || []).map((activity: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-4 border-b border-black/5 last:border-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center">
                    <RefreshCw size={18} className="text-black/40" />
                  </div>
                  <div>
                    <p className="font-semibold">{activity.title}</p>
                    <p className="text-xs text-black/40">{activity.details}</p>
                  </div>
                </div>
                <span className="text-sm text-black/40">{new Date(activity.createdAt).toLocaleString()}</span>
              </div>
            ))}
            {(stats?.recentActivity || []).length === 0 && (
              <p className="text-center text-black/30 py-8">Nenhuma atividade registrada ainda.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, onClick }: { label: string, value: string, sub: string, onClick?: () => void }) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-white p-8 rounded-3xl border border-black/5 shadow-sm",
        onClick && "cursor-pointer hover:bg-black/5 transition-all"
      )}
    >
      <p className="text-xs font-bold uppercase tracking-widest opacity-50 mb-2">{label}</p>
      <p className="text-4xl font-bold tracking-tighter mb-2">{value}</p>
      <p className="text-xs text-emerald-600 font-medium">{sub}</p>
    </div>
  );
}

function ProductsList() {
  const [products, setProducts] = useState<Product[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newProduct, setNewProduct] = useState<any>({ 
    name: '', 
    description: '', 
    image_url: '', 
    total_quotas: '', 
    quota_price: '',
    payment_type: 'installments',
    expiration_month: ''
  });
  const { user } = React.useContext(AuthContext)!;

  const fetchProducts = () => {
    apiFetch('/api/products')
    .then(res => res.json())
    .then(setProducts);
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleCreateProduct = async () => {
    if (!newProduct.name || !newProduct.total_quotas || !newProduct.quota_price) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    try {
      const res = await apiFetch('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          ...newProduct,
          total_quotas: Number(newProduct.total_quotas),
          quota_price: Number(newProduct.quota_price)
        })
      });
      if (res.ok) {
        setShowCreate(false);
        fetchProducts();
        setNewProduct({ 
          name: '', 
          description: '', 
          image_url: '', 
          total_quotas: '', 
          quota_price: '',
          payment_type: 'installments',
          expiration_month: ''
        });
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao criar produto');
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão com o servidor');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        callback(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const deleteProduct = async (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Tem certeza que deseja excluir este produto? Todas as cotas serão removidas.')) return;

    try {
      const res = await apiFetch(`/api/products/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setProducts(prev => prev.filter(p => p.id !== id));
        alert('Produto excluído com sucesso!');
      } else {
        const data = await res.json();
        alert('Erro ao excluir produto: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão ao excluir produto');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <header>
          <h2 className="text-3xl font-bold tracking-tight">Produtos</h2>
          <p className="text-black/50">Gerencie seus ativos e cotas</p>
        </header>
        {user?.role === 'admin' && (
          <button 
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-2xl font-bold hover:scale-105 transition-all"
          >
            <Plus size={20} /> Novo Produto
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map(product => (
          <Link key={product.id} to={`/products/${product.id}`} className="group relative">
            <div className="bg-white rounded-3xl overflow-hidden border border-black/5 shadow-sm hover:shadow-xl transition-all duration-500">
              <div className="h-48 bg-black/5 relative overflow-hidden">
                {product.image_url ? (
                  <img 
                    src={product.image_url} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Package size={40} className="text-black/10" />
                  </div>
                )}
                <div className="absolute top-4 right-4 px-3 py-1 bg-white/90 backdrop-blur rounded-full text-[10px] font-bold uppercase tracking-widest">
                  {product.available_quotas} Disponíveis
                </div>
                {user?.role === 'admin' && (
                  <button 
                    onClick={(e) => deleteProduct(e, product.id)}
                    className="absolute top-4 left-4 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              <div className="p-6">
                <h3 className="font-bold text-xl mb-2">{product.name}</h3>
                <p className="text-sm text-black/50 line-clamp-2 mb-4">{product.description}</p>
                <div className="flex items-center justify-between pt-4 border-t border-black/5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Valor da Cota</p>
                    <p className="font-bold text-lg">
                      {product.quota_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                  <ChevronRight size={20} className="text-black/20 group-hover:text-black group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Create Product Modal Placeholder */}
      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreate(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-[40px] p-10 shadow-2xl"
            >
              <h3 className="text-2xl font-bold mb-6">Novo Produto</h3>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1 space-y-4">
                    <input 
                      className="w-full p-4 bg-black/5 rounded-2xl" 
                      placeholder="Nome do Produto" 
                      value={newProduct.name}
                      onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                    />
                    <div className="relative">
                      <input 
                        className="w-full p-4 bg-black/5 rounded-2xl pr-12" 
                        placeholder="URL da Imagem" 
                        value={newProduct.image_url}
                        onChange={e => setNewProduct({...newProduct, image_url: e.target.value})}
                      />
                      <label className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer hover:text-indigo-600 transition-colors">
                        <ImagePlus size={20} />
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={e => handleImageUpload(e, (base64) => setNewProduct({...newProduct, image_url: base64}))}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="w-32 h-32 rounded-2xl bg-black/5 overflow-hidden border border-black/5 flex items-center justify-center">
                    {newProduct.image_url ? (
                      <img src={newProduct.image_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Package size={32} className="text-black/10" />
                    )}
                  </div>
                </div>
                <textarea 
                  className="w-full p-4 bg-black/5 rounded-2xl h-32" 
                  placeholder="Descrição detalhada" 
                  value={newProduct.description}
                  onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Quantidade de Cotas</label>
                    <input 
                      className="w-full p-4 bg-black/5 rounded-2xl mt-1" 
                      placeholder="Ex: 100" 
                      type="number" 
                      value={newProduct.total_quotas}
                      onChange={e => setNewProduct({...newProduct, total_quotas: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Valor de Cada Cota (R$)</label>
                    <input 
                      className="w-full p-4 bg-black/5 rounded-2xl mt-1" 
                      placeholder="Ex: 1000,00" 
                      type="number" 
                      step="0.01"
                      value={newProduct.quota_price}
                      onChange={e => setNewProduct({...newProduct, quota_price: e.target.value})}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Data de Vencimento da Última Parcela</label>
                  <div className="relative mt-1">
                    <input 
                      type="date"
                      className="w-full p-4 bg-black/5 rounded-2xl appearance-none focus:ring-2 focus:ring-black/5 transition-all"
                      value={newProduct.expiration_month}
                      onChange={e => setNewProduct({...newProduct, expiration_month: e.target.value})}
                      min={new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                </div>

                <button 
                  onClick={handleCreateProduct}
                  className="w-full py-4 bg-black text-white rounded-2xl font-bold mt-4"
                >
                  Criar Produto
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [selectedQuotas, setSelectedQuotas] = useState<number[]>([]);
  const [managers, setManagers] = useState<User[]>([]);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(1);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termContent, setTermContent] = useState('');
  const { user, setUser } = React.useContext(AuthContext)!;
  const navigate = useNavigate();

  const getMaxInstallments = () => {
    if (!product) return 1;
    if (product.payment_type === 'cash') return 1;
    if (!product.expiration_month) return 12;

    const expDate = new Date(product.expiration_month);
    const now = new Date();
    
    const diffMonths = (expDate.getFullYear() - now.getFullYear()) * 12 + (expDate.getMonth() - now.getMonth());
    return Math.max(1, diffMonths + 1);
  };

  const maxInstallments = getMaxInstallments();

  useEffect(() => {
    // Fetch product detail
    apiFetch('/api/products')
    .then(res => res.json())
    .then(data => {
      const p = data.find((x: any) => x.id === Number(id));
      setProduct(p);
    });

    // Fetch quotas
    apiFetch(`/api/products/${id}/quotas`)
    .then(res => res.json())
    .then(setQuotas);

    // Fetch managers
    apiFetch('/api/managers')
    .then(res => res.json())
    .then(setManagers);

    // Fetch terms
    apiFetch('/api/terms')
    .then(res => res.json())
    .then(data => setTermContent(data.content));
  }, [id]);

  const handleReorganize = async (type: 'subdivide' | 'group') => {
    if (selectedQuotas.length === 0) return;
    
    if (type === 'group') {
      if (!confirm('Deseja realmente desfazer o agrupamento destas cotas?')) return;
      try {
        const res = await apiFetch('/api/quotas/undo-reorganize', {
          method: 'POST',
          body: JSON.stringify({ quotaIds: selectedQuotas })
        });
        if (res.ok) {
          alert('Agrupamento desfeito com sucesso!');
          setSelectedQuotas([]);
          window.location.reload();
        }
      } catch (err) {
        console.error(err);
      }
      return;
    }

    const subdivisionCount = prompt('Em quantas frações deseja dividir?');
    if (!subdivisionCount) return;

    const customName = prompt('Deseja dar um nome para esta subdivisão? (Deixe em branco para usar os números originais)');

    try {
      const res = await apiFetch('/api/quotas/reorganize', {
        method: 'POST',
        body: JSON.stringify({
          productId: id,
          quotasToGroup: selectedQuotas,
          subdivisionCount: Number(subdivisionCount),
          customName: customName || undefined
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        alert('Reorganização concluída com sucesso!');
        setSelectedQuotas([]);
        window.location.reload();
      } else {
        alert(`Erro: ${data.error || 'Falha na reorganização'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão com o servidor');
    }
  };

  const handleBuy = async () => {
    if (selectedQuotas.length === 0) return;
    setAgreedToTerms(false);
    if (product?.payment_type === 'cash') {
      setInstallmentCount(1);
    }
    setShowBuyModal(true);
  };

  const confirmPurchase = async () => {
    if (!agreedToTerms) return alert('Você precisa aceitar os termos para continuar.');

    try {
      const quotasStr = selectedQuotas.map(id => quotas.find(q => q.id === id)?.number || id).join(', ');
      
      // Sign the term for this specific purchase
      const signRes = await apiFetch('/api/terms/sign', {
        method: 'POST',
        body: JSON.stringify({
          productName: product?.name,
          quotas: quotasStr
        })
      });
      const signData = await signRes.json();
      
      if (signRes.ok && user) {
        setUser({ ...user, signed_term_at: signData.signed_at });
      }

      const res = await apiFetch('/api/quotas/buy', {
        method: 'POST',
        body: JSON.stringify({ 
          quotaIds: selectedQuotas,
          installmentCount: installmentCount
        })
      });
      
      const data = await res.json();
      
      if (res.ok) {
        setPurchaseSuccess(true);
      } else {
        alert(`Erro: ${data.error || 'Falha na compra'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Erro de conexão com o servidor');
    }
  };

  const downloadReceipt = () => {
    const quotasStr = selectedQuotas.map(id => quotas.find(q => q.id === id)?.number || id).join(', ');
    const totalValue = quotas
      .filter(q => selectedQuotas.includes(q.id))
      .reduce((sum, q) => sum + q.price, 0);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let cursorY = 20;

    // 1. Term Section
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("TERMO DE CIENTIFICAÇÃO E ADESÃO AO BOLÃO", pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 10;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const splitTerm = doc.splitTextToSize(termContent, pageWidth - (margin * 2));
    
    for (let i = 0; i < splitTerm.length; i++) {
      if (cursorY > pageHeight - 30) {
        doc.addPage();
        cursorY = 20;
      }
      doc.text(splitTerm[i], margin, cursorY);
      cursorY += 5;
    }

    cursorY += 10;
    if (cursorY > pageHeight - 60) {
      doc.addPage();
      cursorY = 20;
    }

    // 2. Purchase Details
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 10;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("DETALHES DA AQUISIÇÃO", margin, cursorY);
    cursorY += 10;
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Produto: ${product?.name}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Cotas: ${quotasStr}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Valor Total: ${totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Parcelamento: ${installmentCount}x de ${(totalValue / installmentCount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, margin, cursorY);
    cursorY += 15;

    if (cursorY > pageHeight - 40) {
      doc.addPage();
      cursorY = 20;
    }

    // 3. Signature Info
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("ASSINATURA ELETRÔNICA", margin, cursorY);
    cursorY += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Participante: ${user?.name}`, margin, cursorY);
    cursorY += 7;
    doc.text(`CPF: ${user?.cpf || 'Não informado'}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Data do Aceite: ${new Date().toLocaleString('pt-BR')}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Autenticação: ${user?.id}-${Date.now()}`, margin, cursorY);
    
    // Footer on each page
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Página ${i} de ${pageCount} - Este documento é um registro eletrônico e possui validade jurídica.`, 
        pageWidth / 2, 
        pageHeight - 10, 
        { align: 'center' }
      );
    }
    
    doc.save(`termo_adesao_${product?.name?.replace(/\s+/g, '_')}.pdf`);
  };

  const handleCancelSale = async (quotaId: number) => {
    if (!confirm('Deseja realmente cancelar esta venda? A cota voltará a ficar disponível.')) return;
    
    try {
      const res = await apiFetch(`/api/quotas/${quotaId}/cancel`, {
        method: 'POST'
      });
      if (res.ok) {
        alert('Venda cancelada com sucesso!');
        window.location.reload();
      } else {
        const data = await res.json();
        alert(`Erro: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editedProduct, setEditedProduct] = useState({ name: '', description: '', image_url: '', expiration_month: '' });

  useEffect(() => {
    if (product) {
      setEditedProduct({ 
        name: product.name, 
        description: product.description, 
        image_url: product.image_url || '',
        expiration_month: product.expiration_month || ''
      });
    }
  }, [product]);

  const handleUpdateProduct = async () => {
    try {
      const res = await apiFetch(`/api/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(editedProduct)
      });
      if (res.ok) {
        setIsEditing(false);
        alert('Produto atualizado com sucesso!');
        window.location.reload();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        callback(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!product) return <div>Carregando...</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/products')} className="flex items-center gap-2 px-4 py-2 hover:bg-black/5 rounded-xl transition-all font-bold text-sm">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-3xl font-bold tracking-tight">{product.name}</h2>
        </div>
        {user.role === 'admin' && (
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className="px-4 py-2 bg-black text-white rounded-xl text-sm font-bold"
          >
            {isEditing ? 'Cancelar Edição' : 'Editar Produto'}
          </button>
        )}
      </div>

      {isEditing && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm space-y-4"
        >
          <h3 className="font-bold text-xl">Editar Informações</h3>
          <div className="flex gap-6">
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  className="w-full p-4 bg-black/5 rounded-2xl" 
                  placeholder="Nome do Produto" 
                  value={editedProduct.name}
                  onChange={e => setEditedProduct({...editedProduct, name: e.target.value})}
                />
                <div className="relative">
                  <input 
                    className="w-full p-4 bg-black/5 rounded-2xl pr-12" 
                    placeholder="URL da Imagem" 
                    value={editedProduct.image_url}
                    onChange={e => setEditedProduct({...editedProduct, image_url: e.target.value})}
                  />
                  <label className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer hover:text-indigo-600 transition-colors">
                    <ImagePlus size={20} />
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={e => handleImageUpload(e, (base64) => setEditedProduct({...editedProduct, image_url: base64}))}
                    />
                  </label>
                </div>
                <div className="relative">
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Data de Vencimento Final</label>
                  <input 
                    type="date"
                    className="w-full p-4 bg-black/5 rounded-2xl mt-1" 
                    value={editedProduct.expiration_month}
                    onChange={e => setEditedProduct({...editedProduct, expiration_month: e.target.value})}
                  />
                </div>
              </div>
              <textarea 
                className="w-full p-4 bg-black/5 rounded-2xl h-32" 
                placeholder="Descrição detalhada" 
                value={editedProduct.description}
                onChange={e => setEditedProduct({...editedProduct, description: e.target.value})}
              />
            </div>
            <div className="w-48 h-48 rounded-3xl bg-black/5 overflow-hidden border border-black/5 flex items-center justify-center shrink-0">
              {editedProduct.image_url ? (
                <img src={editedProduct.image_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Package size={48} className="text-black/10" />
              )}
            </div>
          </div>
          <button 
            onClick={handleUpdateProduct}
            className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold"
          >
            Salvar Alterações
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {product.image_url && (
            <div className="w-full h-64 rounded-[40px] overflow-hidden border border-black/5">
              <img 
                src={product.image_url} 
                alt={product.name} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
          <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-bold text-xl">Mapa de Cotas</h3>
              <div className="flex gap-4 text-xs font-bold uppercase tracking-widest">
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /> Disponível</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /> Vendida</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500" /> Agrupada</span>
              </div>
            </div>
            
            <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2 max-h-[500px] overflow-y-auto p-2">
              {quotas.map((quota, i) => (
                <button 
                  key={quota.id}
                  title={`Cota ${quota.number || i + 1} - ${quota.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                  className={cn(
                    "aspect-[2/1] rounded-lg text-[10px] font-bold transition-all flex items-center justify-center border border-black/5",
                    quota.status === 'sold' ? "bg-red-500/10 text-red-600" : 
                    quota.status === 'grouped' ? "bg-amber-500/10 text-amber-600" :
                    "bg-emerald-500/10 text-emerald-600 hover:scale-110",
                    selectedQuotas.includes(quota.id) && "ring-2 ring-black bg-black text-white"
                  )}
                  onClick={() => {
                    if (quota.status === 'available' || (quota.status === 'grouped' && user.role === 'admin')) {
                      setSelectedQuotas(prev => 
                        prev.includes(quota.id) ? prev.filter(x => x !== quota.id) : [...prev, quota.id]
                      );
                    } else if (quota.status === 'sold' && user.role === 'admin') {
                      handleCancelSale(quota.id);
                    }
                  }}
                >
                  {quota.number || i + 1}
                </button>
              ))}
            </div>
          </div>

          {user.role === 'admin' && selectedQuotas.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-indigo-600 text-white p-8 rounded-3xl shadow-xl flex items-center justify-between"
            >
              <div>
                <h4 className="font-bold text-xl">{selectedQuotas.length} Cotas Selecionadas</h4>
                <p className="opacity-80">O que deseja fazer com as cotas remanescentes?</p>
              </div>
              <div className="flex gap-4">
                {selectedQuotas.every(id => quotas.find(q => q.id === id)?.status === 'available') && (
                  <button 
                    onClick={() => handleReorganize('subdivide')}
                    className="px-6 py-3 bg-white text-indigo-600 rounded-xl font-bold hover:bg-white/90 transition-all"
                  >
                    Subdividir em Frações
                  </button>
                )}
                {selectedQuotas.every(id => quotas.find(q => q.id === id)?.status === 'grouped') && (
                  <button 
                    onClick={() => handleReorganize('group')}
                    className="px-6 py-3 bg-white text-indigo-600 rounded-xl font-bold hover:bg-white/90 transition-all"
                  >
                    Desfazer Agrupamento
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {user.role === 'client' && selectedQuotas.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-600 text-white p-8 rounded-3xl shadow-xl flex items-center justify-between"
            >
              <div>
                <h4 className="font-bold text-xl">{selectedQuotas.length} Cotas Selecionadas</h4>
                <p className="opacity-80">
                  Total: {quotas
                    .filter(q => selectedQuotas.includes(q.id))
                    .reduce((sum, q) => sum + q.price, 0)
                    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <button 
                onClick={handleBuy}
                className="px-8 py-4 bg-white text-emerald-600 rounded-2xl font-bold hover:bg-white/90 transition-all"
              >
                Confirmar Compra
              </button>
            </motion.div>
          )}

          <AnimatePresence>
            {showBuyModal && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowBuyModal(false)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                 <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="relative w-full max-w-lg bg-white rounded-[40px] p-10 shadow-2xl"
                >
                  {purchaseSuccess ? (
                    <div className="text-center space-y-6 py-4">
                      <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Check size={40} />
                      </div>
                      <h3 className="text-2xl font-bold">Compra Realizada!</h3>
                      <p className="text-black/50">Sua aquisição foi processada com sucesso e o termo foi assinado eletronicamente.</p>
                      
                      <div className="space-y-3 pt-4">
                        <button 
                          onClick={downloadReceipt}
                          className="w-full py-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:scale-105 transition-all"
                        >
                          <Download size={20} /> Baixar Comprovante e Termo
                        </button>
                        <button 
                          onClick={() => {
                            setShowBuyModal(false);
                            window.location.reload();
                          }}
                          className="w-full py-4 bg-black/5 text-black rounded-2xl font-bold hover:bg-black/10 transition-all"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-2xl font-bold mb-2">Opções de Pagamento</h3>
                      <p className="text-black/50 mb-8">
                        {product?.payment_type === 'cash' 
                          ? 'Este produto aceita apenas pagamento à vista.' 
                          : 'Escolha o número de parcelas para sua compra.'}
                      </p>
                      
                      <div className="space-y-6">
                        {product?.payment_type === 'installments' && (
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-widest opacity-40 mb-3">Número de Parcelas</label>
                            <select 
                              value={installmentCount}
                              onChange={(e) => setInstallmentCount(Number(e.target.value))}
                              className="w-full p-4 bg-black/5 rounded-2xl border-none focus:ring-2 focus:ring-black/10"
                            >
                              {Array.from({ length: maxInstallments }, (_, i) => i + 1).map(n => (
                                <option key={n} value={n}>{n}x {n === 1 ? '(À vista)' : ''}</option>
                              ))}
                            </select>
                            <p className="text-[10px] text-black/40 mt-2 italic">
                              * O parcelamento deve ser encerrado impreterivelmente em {product.expiration_month ? new Date(product.expiration_month + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Dezembro'}.
                            </p>
                          </div>
                        )}

                        <div className="bg-black/5 p-6 rounded-2xl space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="opacity-60">Valor Total</span>
                            <span className="font-bold">
                              {quotas
                                .filter(q => selectedQuotas.includes(q.id))
                                .reduce((sum, q) => sum + q.price, 0)
                                .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="opacity-60">Valor por Parcela</span>
                            <span className="font-bold text-emerald-600">
                              {(quotas
                                .filter(q => selectedQuotas.includes(q.id))
                                .reduce((sum, q) => sum + q.price, 0) / installmentCount)
                                .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                          
                          <div className="pt-4 mt-2 border-t border-black/10">
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">Cronograma de Vencimentos</p>
                            <div className="space-y-1 max-h-24 overflow-y-auto pr-2">
                              {Array.from({ length: installmentCount }, (_, i) => {
                                const today = new Date();
                                const d = new Date(today.getFullYear(), today.getMonth() + i, 20);
                                return (
                                  <div key={i} className="flex justify-between text-[10px]">
                                    <span className="opacity-60">{i + 1}ª Parcela</span>
                                    <span className="font-mono font-bold">{d.toLocaleDateString('pt-BR')}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Termo de Adesão</p>
                          <div className="bg-black/5 p-4 rounded-2xl text-[10px] text-black/60 h-32 overflow-y-auto leading-relaxed border border-black/5">
                            {termContent}
                          </div>
                        </div>

                        <div className="flex items-start gap-3 p-4 bg-black/5 rounded-2xl">
                          <input 
                            type="checkbox" 
                            id="agree-terms"
                            checked={agreedToTerms}
                            onChange={(e) => setAgreedToTerms(e.target.checked)}
                            className="mt-1 w-5 h-5 rounded border-black/10 text-black focus:ring-black/20"
                          />
                          <label htmlFor="agree-terms" className="text-xs text-black/60 leading-relaxed">
                            Li e concordo com os termos de adesão para a compra de <span className="font-bold text-black">{product.name}</span>. 
                            Cotas selecionadas: <span className="font-bold text-black">{selectedQuotas.map(id => quotas.find(q => q.id === id)?.number || id).join(', ')}</span>.
                          </label>
                        </div>

                        <button 
                          onClick={confirmPurchase}
                          disabled={!agreedToTerms}
                          className="w-full py-4 bg-black text-white rounded-2xl font-bold hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
                        >
                          Finalizar Compra
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
            <h3 className="font-bold text-xl mb-6">Ações Rápidas</h3>
            <div className="space-y-3">
              <Link to={`/products/${id}/chat`} className="flex items-center gap-4 p-4 rounded-2xl bg-black/5 hover:bg-black/10 transition-all w-full">
                <MessageSquare size={20} />
                <span className="font-bold">Chat do Produto</span>
              </Link>
              
              <div className="pt-4 border-t border-black/5">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-4">Gerentes Disponíveis</p>
                <div className="space-y-2">
                  {managers.map(manager => (
                    <div key={manager.id} className="flex items-center justify-between p-3 rounded-xl bg-black/5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                          {manager.name[0]}
                        </div>
                        <span className="text-sm font-semibold">{manager.name}</span>
                      </div>
                      <Link to={`/products/${id}/chat?mention=${manager.id}`} className="p-2 hover:bg-black/5 rounded-lg text-indigo-600">
                        <MessageSquare size={16} />
                      </Link>
                    </div>
                  ))}
                  {managers.length === 0 && (
                    <p className="text-xs text-black/40 italic">Nenhum gerente disponível no momento.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-black text-white rounded-3xl p-8 shadow-xl">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-4">Resumo do Ativo</p>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="opacity-60">Total de Cotas</span>
                <span className="font-bold">{product.total_quotas}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">Disponíveis</span>
                <span className="font-bold text-emerald-400">{product.available_quotas}</span>
              </div>
              <div className="flex justify-between">
                <span className="opacity-60">Vendidas</span>
                <span className="font-bold text-red-400">{product.sold_quotas}</span>
              </div>
              <div className="pt-4 border-t border-white/10">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Progresso de Venda</p>
                <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500" 
                    style={{ width: `${(product.sold_quotas / product.total_quotas) * 100}%` }}
                  />
                </div>
              </div>
              <div className="pt-4 border-t border-white/10 flex justify-between items-end">
                <span className="opacity-60">Valor da Cota</span>
                <span className="text-2xl font-bold">
                  {product.quota_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductChat() {
  const { id } = useParams();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const mentionUserId = query.get('mention');
  const { user } = React.useContext(AuthContext)!;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load history
    apiFetch(`/api/products/${id}/chat`)
    .then(res => res.json())
    .then(setMessages);

    socket.emit('join_room', id);
    socket.on('receive_message', (msg: ChatMessage) => {
      setMessages(prev => [...prev, msg]);
    });
    return () => {
      socket.off('receive_message');
    };
  }, [id]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    socket.emit('send_message', {
      productId: id,
      userId: user.id,
      userName: user.name,
      message: input,
      mentionUserId: mentionUserId ? parseInt(mentionUserId) : null,
      tenantId: user.tenant_id
    });
    setInput('');
  };

  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    apiFetch('/api/products')
      .then(res => res.json())
      .then(data => {
        const p = data.find((x: any) => x.id === Number(id));
        setProduct(p);
      });
  }, [id]);

  return (
    <div className="h-full flex flex-col bg-white rounded-[40px] border border-black/5 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-black/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to={`/products/${id}`} className="p-2 hover:bg-black/5 rounded-full transition-all">
            <ArrowLeft size={20} />
          </Link>
          <h3 className="font-bold text-xl">Chat do Produto {product ? `(${product.name})` : `#${id}`}</h3>
        </div>
        <span className="text-xs font-bold uppercase tracking-widest opacity-40">Apenas primeiro nome visível</span>
      </div>

      <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-4 bg-[#F9F9F7]">
        {messages.map((msg, i) => {
          const isMentioned = msg.mentionUserId === user.id;
          return (
            <div key={i} className={cn("flex flex-col", msg.userName === user.name.split(" ")[0] ? "items-end" : "items-start")}>
              <div className={cn(
                "max-w-[70%] p-4 rounded-2xl shadow-sm relative",
                msg.userName === user.name.split(" ")[0] ? "bg-black text-white rounded-tr-none" : "bg-white text-black rounded-tl-none",
                isMentioned && "ring-4 ring-amber-400"
              )}>
                {isMentioned && (
                  <div className="absolute -top-2 -right-2 bg-amber-400 text-black text-[8px] font-bold px-2 py-1 rounded-full uppercase">
                    Direta
                  </div>
                )}
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">{msg.userName}</p>
                <p className="text-sm">{msg.message}</p>
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={sendMessage} className="p-6 border-t border-black/5 flex gap-4">
        <input 
          value={input}
          onChange={e => setInput(e.target.value)}
          className="flex-1 p-4 bg-black/5 rounded-2xl border-none focus:ring-2 focus:ring-black/10 transition-all"
          placeholder="Digite sua mensagem..."
        />
        <button className="px-8 bg-black text-white rounded-2xl font-bold hover:scale-105 transition-all">
          Enviar
        </button>
      </form>
    </div>
  );
}

function ClientsList() {
  const [clients, setClients] = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedUserDetails, setSelectedUserDetails] = useState<any>(null);
  const [termContent, setTermContent] = useState('');
  const [newUser, setNewUser] = useState({ name: '', email: '', password: 'user123', role: 'client' as Role, cpf: '', pix_key: '' });
  const { user } = React.useContext(AuthContext)!;

  const fetchUsers = () => {
    apiFetch('/api/users')
    .then(res => res.json())
    .then(setClients);
  };

  useEffect(() => {
    fetchUsers();
    apiFetch('/api/terms')
      .then(res => res.json())
      .then(data => setTermContent(data.content))
      .catch(console.error);
  }, []);

  const downloadClientTerm = (client: User, products: any[]) => {
    if (!client.signed_term_at) return alert('Este cliente ainda não assinou o termo.');
    
    const quotasStr = products.map((p: any) => `${p.quotaCount} cota(s) de ${p.name}`).join(', ');

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let cursorY = 20;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("TERMO DE CIENTIFICAÇÃO E ADESÃO AO BOLÃO", pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 10;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const splitTerm = doc.splitTextToSize(termContent, pageWidth - (margin * 2));
    
    for (let i = 0; i < splitTerm.length; i++) {
      if (cursorY > pageHeight - 40) {
        doc.addPage();
        cursorY = 20;
      }
      doc.text(splitTerm[i], margin, cursorY);
      cursorY += 5;
    }

    cursorY += 10;
    if (cursorY > pageHeight - 60) {
      doc.addPage();
      cursorY = 20;
    }

    doc.setDrawColor(200, 200, 200);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 10;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("ASSINATURA ELETRÔNICA", margin, cursorY);
    cursorY += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Participante: ${client.name}`, margin, cursorY);
    cursorY += 7;
    doc.text(`CPF: ${client.cpf || 'Não informado'}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Data do Aceite: ${new Date(client.signed_term_at).toLocaleString('pt-BR')}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Produtos/Cotas: ${quotasStr || 'Nenhuma cota registrada no momento da assinatura.'}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Autenticação Digital ID: ${client.id}-${new Date(client.signed_term_at).getTime()}`, margin, cursorY);
    
    doc.save(`termo_assinado_${client.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
  };

  const fetchUserDetails = async (id: number) => {
    try {
      const res = await apiFetch(`/api/users/${id}/details`);
      if (res.ok) {
        const data = await res.json();
        setSelectedUserDetails(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateUser = async () => {
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(newUser)
      });
      if (res.ok) {
        setShowCreate(false);
        fetchUsers();
        setNewUser({ name: '', email: '', password: 'user123', role: 'client', cpf: '', pix_key: '' });
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteUser = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;
    try {
      const res = await apiFetch(`/api/users/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setClients(prev => prev.filter(c => c.id !== id));
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao excluir');
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <header>
          <h2 className="text-3xl font-bold tracking-tight">Clientes</h2>
          <p className="text-black/50">Base de investidores e gerentes</p>
        </header>
        <div className="flex gap-3">
          <button 
            onClick={() => {
              const link = `${window.location.origin}/register-client/${user.tenant_id}`;
              navigator.clipboard.writeText(link);
              alert('Link de cadastro de cliente copiado!');
            }}
            className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-2xl font-bold hover:scale-105 transition-all"
          >
            <Share size={20} /> Compartilhar Link de Cadastro
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-black/5 text-[10px] font-bold uppercase tracking-widest opacity-50">
            <tr>
              <th className="p-6">Nome</th>
              <th className="p-6">E-mail</th>
              <th className="p-6">Status Termo</th>
              <th className="p-6">Nível</th>
              <th className="p-6">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {clients.map(client => (
              <tr key={client.id} className="hover:bg-black/5 transition-colors">
                <td className="p-6 font-semibold">{client.name}</td>
                <td className="p-6 text-black/50">{client.email}</td>
                <td className="p-6">
                  {client.role === 'client' ? (
                    client.signed_term_at ? (
                      <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-[10px] font-bold uppercase">Assinado</span>
                    ) : (
                      <span className="px-3 py-1 bg-red-500/10 text-red-600 rounded-full text-[10px] font-bold uppercase">Pendente</span>
                    )
                  ) : (
                    <span className="text-black/20">-</span>
                  )}
                </td>
                <td className="p-6">
                  <span className="px-3 py-1 bg-black/5 text-black/50 rounded-full text-[10px] font-bold uppercase">{client.role}</span>
                </td>
                <td className="p-6 flex gap-2">
                  <button 
                    onClick={() => fetchUserDetails(client.id)}
                    className="text-xs font-bold hover:underline"
                  >
                    Ver
                  </button>
                  {user?.role === 'admin' && client.id !== user.id && (
                    <button 
                      onClick={() => deleteUser(client.id)}
                      className="text-xs font-bold text-red-500 hover:underline"
                    >
                      Excluir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* User Details Modal */}
      <AnimatePresence>
        {selectedUserDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUserDetails(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-10 space-y-8">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-3xl font-bold tracking-tight">{selectedUserDetails.user.name}</h3>
                    <p className="text-black/50">{selectedUserDetails.user.email}</p>
                  </div>
                  <button onClick={() => setSelectedUserDetails(null)} className="p-2 hover:bg-black/5 rounded-full">
                    <X size={24} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">CPF</p>
                    <p className="font-medium">{selectedUserDetails.user.cpf || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Telefone</p>
                    <p className="font-medium">{selectedUserDetails.user.phone || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Endereço</p>
                    <p className="font-medium">{selectedUserDetails.user.address || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Chave PIX</p>
                    <p className="font-medium">{selectedUserDetails.user.pix_key || '-'}</p>
                  </div>
                </div>

                {selectedUserDetails.user.signed_term_at && (
                  <div className="pt-4 border-t border-black/5">
                    <button 
                      onClick={() => downloadClientTerm(selectedUserDetails.user, selectedUserDetails.products)}
                      className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all"
                    >
                      <FileText size={20} /> Termo Assinado
                    </button>
                  </div>
                )}

                <div className="space-y-4">
                  <h4 className="font-bold text-lg">Produtos Adquiridos</h4>
                  <div className="bg-black/5 rounded-2xl overflow-hidden">
                    <table className="w-full text-left">
                      <thead className="text-[10px] font-bold uppercase tracking-widest opacity-40">
                        <tr>
                          <th className="p-4">Produto</th>
                          <th className="p-4">Cotas</th>
                          <th className="p-4">Pendente</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {selectedUserDetails.products.map((p: any, i: number) => (
                          <tr key={i}>
                            <td className="p-4 font-medium">{p.name}</td>
                            <td className="p-4">{p.quotaCount}</td>
                            <td className="p-4 font-bold text-red-500">
                              {(p.pendingValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                          </tr>
                        ))}
                        {selectedUserDetails.products.length === 0 && (
                          <tr>
                            <td colSpan={3} className="p-8 text-center text-black/30 italic">Nenhum produto adquirido.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Create User Modal */}
      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreate(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-xl bg-white rounded-[40px] p-10 shadow-2xl"
            >
              <h3 className="text-2xl font-bold mb-6">Novo Usuário</h3>
              <div className="space-y-4">
                <input 
                  className="w-full p-4 bg-black/5 rounded-2xl" 
                  placeholder="Nome Completo" 
                  value={newUser.name}
                  onChange={e => setNewUser({...newUser, name: e.target.value})}
                />
                <input 
                  className="w-full p-4 bg-black/5 rounded-2xl" 
                  placeholder="E-mail" 
                  type="email"
                  value={newUser.email}
                  onChange={e => setNewUser({...newUser, email: e.target.value})}
                />
                <input 
                  className="w-full p-4 bg-black/5 rounded-2xl" 
                  placeholder="Senha" 
                  type="password"
                  value={newUser.password}
                  onChange={e => setNewUser({...newUser, password: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-4">
                  <select 
                    className="w-full p-4 bg-black/5 rounded-2xl"
                    value={newUser.role}
                    onChange={e => setNewUser({...newUser, role: e.target.value as Role})}
                  >
                    <option value="client">Cliente</option>
                    <option value="manager">Gerente</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <input 
                    className="w-full p-4 bg-black/5 rounded-2xl" 
                    placeholder="CPF" 
                    value={newUser.cpf}
                    onChange={e => setNewUser({...newUser, cpf: e.target.value})}
                  />
                </div>
                <input 
                  className="w-full p-4 bg-black/5 rounded-2xl" 
                  placeholder="Chave Pix" 
                  value={newUser.pix_key}
                  onChange={e => setNewUser({...newUser, pix_key: e.target.value})}
                />
                <button 
                  onClick={handleCreateUser}
                  className="w-full py-4 bg-black text-white rounded-2xl font-bold mt-4"
                >
                  Criar Usuário
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TermsPage() {
  const { user, setUser } = React.useContext(AuthContext)!;
  const [term, setTerm] = useState<{ content: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState('');

  useEffect(() => {
    apiFetch('/api/terms')
    .then(res => res.json())
    .then(data => {
      setTerm(data);
      setContent(data.content);
    });
  }, []);

  const handleSave = async () => {
    try {
      const res = await apiFetch('/api/terms', {
        method: 'POST',
        body: JSON.stringify({ content })
      });
      if (res.ok) {
        setIsEditing(false);
        alert('Termo atualizado com sucesso!');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSign = async () => {
    try {
      const res = await apiFetch('/api/terms/sign', {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        alert('Termo assinado com sucesso!');
        if (user) {
          const updatedUser = { ...user, signed_term_at: data.signed_at };
          setUser(updatedUser);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const downloadTerm = async () => {
    try {
      // Fetch user's sold quotas to include in the term
      const res = await apiFetch('/api/my-quotas');
      const myQuotas = await res.json();
      
      const quotasStr = myQuotas.map((q: any) => `Cota ${q.number} (${q.productName})`).join('\n');

      const element = document.createElement("a");
      const footer = `\n\n----------------------------------\nCOTAS ADQUIRIDAS:\n${quotasStr || 'Nenhuma cota registrada.'}\n\nAssinado eletronicamente por ${user?.name} em ${new Date(user?.signed_term_at!).toLocaleString()}`;
      const file = new Blob([content + footer], {type: 'text/plain'});
      element.href = URL.createObjectURL(file);
      element.download = "termo_adesao_assinado.txt";
      document.body.appendChild(element);
      element.click();
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar cópia do termo.');
    }
  };

  if (!term) return <div>Carregando...</div>;

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Termo de Adesão</h2>
          <p className="text-black/50">Visualize o termo de compromisso</p>
        </div>
        {user?.role === 'admin' && (
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className="px-6 py-3 bg-black text-white rounded-2xl font-bold"
          >
            {isEditing ? 'Cancelar' : 'Editar Termo'}
          </button>
        )}
      </header>

      <div className="bg-white rounded-3xl p-10 border border-black/5 shadow-sm space-y-8">
        {isEditing ? (
          <div className="space-y-6">
            <textarea 
              className="w-full h-[500px] p-8 bg-black/5 rounded-3xl border-none focus:ring-0 font-serif text-lg leading-relaxed"
              value={content}
              onChange={e => setContent(e.target.value)}
            />
            <div className="flex justify-end">
              <button onClick={handleSave} className="px-10 py-4 bg-emerald-600 text-white rounded-2xl font-bold">Salvar e Ativar</button>
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            <div className="prose prose-lg max-w-none font-serif text-lg leading-relaxed whitespace-pre-wrap">
              {term.content}
            </div>
            
            <div className="pt-10 border-t border-black/5 flex flex-col items-center gap-6">
              {user?.signed_term_at && (
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full font-bold text-sm">
                    ✓ Termo Assinado em {new Date(user.signed_term_at).toLocaleString()}
                  </div>
                  <br />
                  <button 
                    onClick={downloadTerm}
                    className="inline-flex items-center gap-2 px-8 py-4 bg-black text-white rounded-2xl font-bold hover:scale-105 transition-all"
                  >
                    <FileText size={20} /> Baixar Cópia do Termo
                  </button>
                </div>
              )}
              {!user?.signed_term_at && (
                <p className="text-black/40 italic">O termo será assinado eletronicamente no momento da primeira compra.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AuditLogs() {
  const [logs, setLogs] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/api/audit-logs')
    .then(res => res.json())
    .then(setLogs);
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Logs de Auditoria</h2>
        <p className="text-black/50">Rastreabilidade completa de ações no sistema</p>
      </header>
      <div className="space-y-4">
        {logs.map((log, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <div>
                <p className="font-bold">{log.action}</p>
                <p className="text-xs text-black/40">{log.details} (por {log.userName || 'Sistema'})</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono text-black/40">{new Date(log.created_at).toLocaleString()}</p>
            </div>
          </div>
        ))}
        {logs.length === 0 && (
          <p className="text-center text-black/30 py-20 bg-white rounded-3xl border border-black/5">Nenhum log registrado.</p>
        )}
      </div>
    </div>
  );
}

function MyQuotas() {
  const [quotas, setQuotas] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/api/my-quotas')
    .then(res => res.json())
    .then(setQuotas);
  }, []);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Minhas Cotas</h2>
        <p className="text-black/50">Lista de cotas adquiridas por você</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {quotas.map(quota => (
          <div key={quota.id} className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden group hover:shadow-xl transition-all">
            <div className="h-32 bg-black/5 relative overflow-hidden">
              {quota.productImage ? (
                <img src={quota.productImage} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-black/10">
                  <Package size={48} />
                </div>
              )}
              <div className="absolute top-4 right-4 bg-black text-white px-3 py-1 rounded-full text-xs font-bold">
                #{quota.number}
              </div>
            </div>
            <div className="p-6">
              <h3 className="font-bold text-lg mb-1">{quota.productName}</h3>
              <p className="text-xs text-black/40 mb-4">Adquirida em {new Date(quota.created_at).toLocaleDateString('pt-BR')}</p>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Valor Pago</p>
                  <p className="font-bold text-emerald-600">
                    {quota.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
                <Link to={`/products/${quota.product_id}`} className="text-xs font-bold text-indigo-600 hover:underline">
                  Ver Ativo
                </Link>
              </div>
            </div>
          </div>
        ))}
        {quotas.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white rounded-[40px] border border-black/5">
            <p className="text-black/30">Você ainda não adquiriu nenhuma cota.</p>
            <Link to="/products" className="mt-4 inline-block text-indigo-600 font-bold hover:underline">
              Explorar Produtos
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function MyPayments() {
  const [installments, setInstallments] = useState<any[]>([]);
  const { user } = React.useContext(AuthContext)!;

  useEffect(() => {
    apiFetch('/api/my-installments')
    .then(res => res.json())
    .then(setInstallments);
  }, []);

  const downloadPaymentReceipt = (inst: any) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let cursorY = 20;

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("COMPROVANTE DE PAGAMENTO", pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 10;

    doc.setFontSize(12);
    doc.setTextColor(255, 0, 0);
    doc.text("SEM VALOR FISCAL", pageWidth / 2, cursorY, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    cursorY += 20;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Participante: ${user?.name}`, margin, cursorY);
    cursorY += 7;
    doc.text(`CPF: ${inst.owner_cpf || user?.cpf || 'Não informado'}`, margin, cursorY);
    cursorY += 15;

    doc.setFont("helvetica", "bold");
    doc.text("DETALHES DO PAGAMENTO", margin, cursorY);
    cursorY += 10;
    doc.setFont("helvetica", "normal");
    doc.text(`Produto: ${inst.productName}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Cotas: ${inst.quotaNumbers}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Valor: ${inst.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Data de Vencimento: ${new Date(inst.due_date).toLocaleDateString('pt-BR')}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Data de Pagamento: ${new Date(inst.paid_at).toLocaleDateString('pt-BR')}`, margin, cursorY);
    cursorY += 7;
    if (inst.processed_by_name) {
      doc.text(`Baixa realizada por: ${inst.processed_by_name} (${inst.processed_by_role})`, margin, cursorY);
      cursorY += 7;
    }
    cursorY += 13;

    doc.setFontSize(10);
    doc.text(`Autenticação: ${user?.id}-${inst.id}-${Date.now()}`, margin, cursorY);
    
    doc.save(`comprovante_${inst.id}.pdf`);
  };

  const totalPaid = installments.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0);
  const totalPending = installments.filter(i => i.status === 'pending').reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Meus Pagamentos</h2>
        <p className="text-black/50">Acompanhe a evolução de suas parcelas</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50 p-8 rounded-3xl border border-emerald-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 mb-2">Total Pago</p>
          <p className="text-4xl font-bold text-emerald-700">{totalPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
        <div className="bg-amber-50 p-8 rounded-3xl border border-amber-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-2">Total Pendente</p>
          <p className="text-4xl font-bold text-amber-700">{totalPending.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-black/5 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-black/5 bg-black/[0.02]">
              <th className="p-6 text-xs font-bold uppercase tracking-widest opacity-40">Produto / Cota</th>
              <th className="p-6 text-xs font-bold uppercase tracking-widest opacity-40">Vencimento</th>
              <th className="p-6 text-xs font-bold uppercase tracking-widest opacity-40">Valor</th>
              <th className="p-6 text-xs font-bold uppercase tracking-widest opacity-40">Status</th>
            </tr>
          </thead>
          <tbody>
            {installments.map((inst, idx) => (
              <tr key={idx} className="border-b border-black/5 last:border-0 hover:bg-black/[0.01] transition-all">
                <td className="p-6">
                  <p className="font-bold">{inst.productName}</p>
                  <p className="text-xs text-black/40">Cotas: {inst.quotaNumbers}</p>
                </td>
                <td className="p-6 font-mono text-sm">
                  {new Date(inst.due_date).toLocaleDateString('pt-BR')}
                </td>
                <td className="p-6 font-bold">
                  {inst.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="p-6">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                    inst.status === 'paid' ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                  )}>
                    {inst.status === 'paid' ? 'Pago' : 'Pendente'}
                  </span>
                  {inst.paid_at && (
                    <>
                      <p className="text-[10px] text-black/30 mt-1">Pago em {new Date(inst.paid_at).toLocaleDateString('pt-BR')}</p>
                      <button 
                        onClick={() => downloadPaymentReceipt(inst)}
                        className="mt-3 flex items-center gap-1 text-[9px] font-bold hover:underline text-left"
                      >
                        Emitir comprovante de pagamento <span className="text-red-500 uppercase">SEM VALOR FISCAL</span>
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {installments.length === 0 && (
              <tr>
                <td colSpan={4} className="p-20 text-center text-black/30">Nenhum pagamento registrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentManagement() {
  const [pending, setPending] = useState<any[]>([]);

  const fetchPending = () => {
    apiFetch('/api/installments/pending')
    .then(res => res.json())
    .then(setPending);
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleMarkAsPaid = async (id: number) => {
    if (!confirm('Deseja confirmar o recebimento desta parcela?')) return;
    
    try {
      const res = await apiFetch(`/api/installments/${id}/pay`, {
        method: 'POST'
      });
      if (res.ok) {
        alert('Pagamento confirmado com sucesso!');
        fetchPending();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Gestão de Pagamentos</h2>
        <p className="text-black/50">Baixa manual de parcelas recebidas</p>
      </header>

      <div className="bg-white rounded-[40px] border border-black/5 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-black/5 flex justify-between items-center">
          <h3 className="font-bold text-xl">Parcelas Pendentes</h3>
          <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-bold">
            {pending.length} Aguardando
          </span>
        </div>
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-black/5 bg-black/[0.02]">
              <th className="p-6 text-xs font-bold uppercase tracking-widest opacity-40">Cliente</th>
              <th className="p-6 text-xs font-bold uppercase tracking-widest opacity-40">Produto / Cota</th>
              <th className="p-6 text-xs font-bold uppercase tracking-widest opacity-40">Vencimento</th>
              <th className="p-6 text-xs font-bold uppercase tracking-widest opacity-40">Valor</th>
              <th className="p-6 text-xs font-bold uppercase tracking-widest opacity-40 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {pending.map(inst => (
              <tr key={inst.id} className="border-b border-black/5 last:border-0 hover:bg-black/[0.01] transition-all">
                <td className="p-6">
                  <p className="font-bold">{inst.userName}</p>
                </td>
                <td className="p-6">
                  <p className="font-medium text-sm">{inst.productName}</p>
                  <p className="text-[10px] text-black/40">Cotas: {inst.quotaNumbers}</p>
                </td>
                <td className="p-6 font-mono text-sm">
                  {new Date(inst.due_date).toLocaleDateString('pt-BR')}
                </td>
                <td className="p-6 font-bold text-emerald-600">
                  {inst.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </td>
                <td className="p-6 text-right">
                  <button 
                    onClick={() => handleMarkAsPaid(inst.id)}
                    className="px-4 py-2 bg-black text-white rounded-xl text-xs font-bold hover:scale-105 transition-all"
                  >
                    Confirmar Recebimento
                  </button>
                </td>
              </tr>
            ))}
            {pending.length === 0 && (
              <tr>
                <td colSpan={5} className="p-20 text-center text-black/30">Nenhuma parcela pendente de recebimento.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
