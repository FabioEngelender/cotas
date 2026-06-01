import * as React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { doc, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { auth, db } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.js';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, tenantId, setTenantId, user, logout } = useAuth();
  const navigate = useNavigate();

  const handleGoogleLogin = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      await login();
      if (tenantId && auth.currentUser) {
        const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
        await setDoc(auditRef, {
          user_id: auth.currentUser.uid,
          user_name: auth.currentUser.displayName || auth.currentUser.email,
          action: 'LOGIN_GOOGLE',
          details: `Usuário ${auth.currentUser.email} entrou via Google`,
          created_at: serverTimestamp()
        });
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        return;
      }
      console.error(err);
      let message = 'Erro ao entrar com Google. Tente novamente.';
      if (err.code === 'auth/invalid-credential') {
        message = 'Credenciais inválidas ou expiradas. Tente entrar novamente.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!email || !password) {
      setError('Por favor, preencha e-mail e senha.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      if (tenantId) {
        const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
        await setDoc(auditRef, {
          user_id: email,
          user_name: email,
          action: 'LOGIN',
          details: `Usuário ${email} entrou no sistema`,
          created_at: serverTimestamp()
        });
      }
    } catch (err: any) {
      console.error(err);
      let message = 'Erro ao entrar. Verifique seus dados.';
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        message = 'E-mail ou senha incorretos.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'E-mail inválido.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Por favor, digite seu e-mail para recuperar a senha.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      alert('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (err: any) {
      console.error(err);
      let message = 'Erro ao enviar e-mail de recuperação.';
      if (err.code === 'auth/user-not-found') {
        message = 'E-mail não encontrado no sistema.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'E-mail inválido.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-10 rounded-[32px] border border-[#141414]/5 shadow-xl">
      <button 
        type="button"
        onClick={() => setTenantId(null)}
        className="mb-8 flex items-center text-sm text-[#141414]/40 hover:text-[#141414] transition-colors bg-transparent border-none outline-none cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> <span>Voltar para seleção de lojas</span>
      </button>

      <div className="mb-10 text-center">
        <h2 className="text-3xl font-serif italic mb-2">Entrar</h2>
        <p className="text-[#141414]/60">Acesse sua conta para continuar</p>
      </div>

      <div className="space-y-6">
        {error && (
          <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100">
            {error}
          </div>
        )}

        {auth.currentUser && !user && !loading && (
          <div className="p-4 bg-amber-50 text-amber-700 text-sm rounded-2xl border border-amber-100 mb-4">
            Você está conectado como <strong>{auth.currentUser.email}</strong>, mas não possui um perfil nesta loja. Por favor, solicite um convite ao administrador.
            <button 
              onClick={() => logout()}
              className="block mt-2 text-xs font-bold underline uppercase tracking-widest bg-transparent border-none cursor-pointer"
            >
              Sair e tentar outra conta
            </button>
          </div>
        )}
        
        <form onSubmit={handleEmailLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-4 bg-[#141414]/5 border-none rounded-2xl focus:ring-2 focus:ring-[#141414]/10 transition-all outline-none"
              placeholder="seu@email.com"
            />
          </div>
          <div>
            <div className="flex justify-between items-center mb-2 ml-1">
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40">
                Senha
              </label>
              <button 
                type="button"
                onClick={handleForgotPassword}
                className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 hover:text-black transition-colors bg-transparent border-none cursor-pointer"
              >
                Esqueci minha senha
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-5 py-4 bg-[#141414]/5 border-none rounded-2xl focus:ring-2 focus:ring-[#141414]/10 transition-all outline-none"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-[#141414] text-white rounded-2xl font-medium hover:bg-[#141414]/90 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-black/10 cursor-pointer border-none"
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <span>Entrar com E-mail</span>
            )}
          </button>
        </form>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#141414]/5"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-widest text-[#141414]/30">
            <span className="bg-white px-4">Ou</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-5 bg-white border border-black/10 text-black rounded-2xl font-medium hover:bg-black/5 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-sm cursor-pointer"
        >
          {loading ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>Entrar com Google</span>
            </>
          )}
        </button>
      </div>

      <div className="mt-8 pt-8 border-t border-[#141414]/5 text-center">
        <p className="text-sm text-[#141414]/40">
          Ao entrar, você concorda com nossos termos de uso.
        </p>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { setTenantId } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F5F0]">
      <motion.div 
        key="login-container-page"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <Login />
      </motion.div>
    </div>
  );
}

export default LoginPage;
