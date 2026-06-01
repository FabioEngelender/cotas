import * as React from 'react';
import { useState, useEffect, useContext } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  setDoc, 
  serverTimestamp, 
  getDocs, 
  writeBatch 
} from 'firebase/firestore';
import { auth, db } from '../firebase.js';
import { loggerService } from '../services/loggerService.js';

export const ADMIN_MASTER_EMAIL = 'gamerengelender@gmail.com';

interface AuthContextType {
  user: any | null;
  tenantId: string | null;
  setTenantId: (id: string | null) => void;
  setUser: (user: any | null) => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  syncUserInstallments: (tenantId: string, userId: string) => Promise<void>;
  isAuthReady: boolean;
}

const AuthContext = React.createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // CRITICAL FIX: Initialize from localStorage immediately upon mount to prevent losing active store search!
  const [tenantId, setTenantStateId] = useState<string | null>(() => {
    return localStorage.getItem('tenantId');
  });
  const [user, setUser] = useState<any | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  useEffect(() => {
    let unsubUser: (() => void) | null = null;
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      const currentTenantId = tenantId || localStorage.getItem('tenantId');
      
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }

      if (firebaseUser) {
        if (currentTenantId) {
          const userDocRef = doc(db, 'tenants', currentTenantId, 'users', firebaseUser.uid);
          
          unsubUser = onSnapshot(userDocRef, async (snapshot) => {
            if (snapshot.exists()) {
              setUser({ id: firebaseUser.uid, ...snapshot.data() });
            } else if (firebaseUser.email === ADMIN_MASTER_EMAIL) {
              // Auto-provision default admin if missing in this tenant
              const adminProfile = {
                name: firebaseUser.displayName || 'Admin Master',
                email: firebaseUser.email,
                role: 'admin',
                tenant_id: currentTenantId,
                created_at: serverTimestamp()
              };
              await setDoc(userDocRef, adminProfile);
            } else {
              setUser(null);
            }
            setIsAuthReady(true);
          }, (err) => {
            console.error("Error in user profile listener:", err);
            setUser(null);
            setIsAuthReady(true);
          });
        } else {
          setUser(null);
          setIsAuthReady(true);
        }
      } else {
        setUser(null);
        setIsAuthReady(true);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubUser) unsubUser();
    };
  }, [tenantId]);

  const setTenantId = (id: string | null) => {
    if (id) {
      localStorage.setItem('tenantId', id);
    } else {
      localStorage.removeItem('tenantId');
    }
    setTenantStateId(id);
  };

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        console.log("Login popup closed or cancelled by user.");
        return;
      }
      throw err;
    }
  };

  const logout = async () => {
    try {
      if (tenantId && user) {
        await loggerService.logAuthEvent(tenantId, user.id, user.name, 'LOGOUT');
      }
      await signOut(auth);
      setUser(null);
    } catch (err) {
      console.error(err);
    }
  };

  const syncUserInstallments = async (tId: string, userId: string) => {
    try {
      const installmentsRef = collection(db, 'tenants', tId, 'installments');
      const q = query(installmentsRef, where('owner_id', '==', userId));
      const snapshot = await getDocs(q);
      const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      
      const quotaGroups: { [key: string]: any[] } = {};
      all.forEach((inst: any) => {
        if (!quotaGroups[inst.quota_id]) quotaGroups[inst.quota_id] = [];
        quotaGroups[inst.quota_id].push(inst);
      });
      
      const batch = writeBatch(db);
      let hasChanges = false;
      
      for (const qId in quotaGroups) {
        const installments = quotaGroups[qId];
        const pending = installments.filter(i => i.status === 'pending').sort((a, b) => a.due_date.localeCompare(b.due_date));
        const paid = installments.filter(i => i.status === 'paid');
        
        if (pending.length === 0) continue;
        
        const firstPending = pending[0];
        const firstPendingDate = new Date(firstPending.due_date + 'T12:00:00');
        
        if (firstPendingDate.getFullYear() < currentYear || (firstPendingDate.getFullYear() === currentYear && firstPendingDate.getMonth() < currentMonth)) {
          hasChanges = true;
          
          const totalPaid = paid.reduce((sum, i) => sum + i.amount, 0);
          const totalQuotaPrice = firstPending.total_quota_price || (firstPending.amount * (pending.length + paid.length));
          const expirationDateStr = firstPending.expiration_date;
          
          if (!expirationDateStr) continue;
          
          const expDate = new Date(expirationDateStr + 'T12:00:00');
          const diffMonths = (expDate.getFullYear() - currentYear) * 12 + (expDate.getMonth() - currentMonth);
          const remainingMonths = Math.max(1, diffMonths + 1);
          
          const remainingBalance = totalQuotaPrice - totalPaid;
          const newAmount = remainingBalance / remainingMonths;
          
          pending.forEach(i => {
            batch.delete(doc(db, 'tenants', tId, 'installments', i.id));
          });
          
          for (let i = 0; i < remainingMonths; i++) {
            const dueDate = new Date(currentYear, currentMonth + i, expDate.getDate());
            const newRef = doc(collection(db, 'tenants', tId, 'installments'));
            const { id, ...dataToCopy } = firstPending;
            batch.set(newRef, {
              ...dataToCopy,
              amount: newAmount,
              due_date: dueDate.toISOString().split('T')[0],
              status: 'pending',
              createdAt: serverTimestamp()
            });
          }
        }
      }
      
      if (hasChanges) {
        await batch.commit();
      }
    } catch (err) {
      console.error("Error syncing installments:", err);
    }
  };

  return (
    <AuthContext.Provider value={{ user, tenantId, setTenantId, setUser, login, logout, syncUserInstallments, isAuthReady }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
