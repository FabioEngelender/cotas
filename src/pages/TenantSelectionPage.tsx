import * as React from 'react';
import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { doc, updateDoc, serverTimestamp, setDoc, addDoc, collection } from 'firebase/firestore';
import { RefreshCw, ArrowLeft, Shield, Trash2, Clover, Share } from 'lucide-react';
import { auth, db } from '../firebase.js';
import { useAuth, ADMIN_MASTER_EMAIL } from '../contexts/AuthContext.js';
import { tenantService } from '../services/tenantService.js';
import { Login } from './LoginPage.js';

export function TenantSelectionPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const { setTenantId, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: '', cnpj: '' });
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showLogin, setShowLogin] = useState(false);

  const isMasterAdmin = auth.currentUser?.email === ADMIN_MASTER_EMAIL;

  useEffect(() => {
    const unsub = tenantService.subscribeActiveTenants(
      (list) => {
        setTenants(list);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const handleDeleteTenant = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Tem certeza que deseja excluir esta loja permanentemente?')) return;
    
    setDeletingId(id);
    try {
      await tenantService.deleteTenant(id);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao excluir: ' + (err.message || err));
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await tenantService.createTenant(
        newTenant.name,
        newTenant.cnpj,
        '',
        auth.currentUser?.uid || null,
        auth.currentUser?.email || null,
        auth.currentUser?.displayName || null
      );
      setShowCreate(false);
      setNewTenant({ name: '', cnpj: '' });
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

  if (showLogin && !auth.currentUser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#F5F5F0]">
        <div className="max-w-md w-full">
          <button 
            onClick={() => setShowLogin(false)}
            className="mb-8 flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-40 hover:opacity-100 transition-all bg-transparent border-none cursor-pointer"
          >
            <ArrowLeft size={14} /> Voltar para Seleção de Loja
          </button>
          <Login />
        </div>
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

        {showCreate ? (
          <form onSubmit={handleCreateTenant} className="max-w-[500px] mx-auto bg-white p-8 rounded-[32px] border border-black/5 shadow-xl space-y-6 mb-8">
            <h3 className="text-2xl font-serif italic mb-2">Cadastrar Nova Loja</h3>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2">Nome da Loja</label>
              <input 
                required 
                type="text" 
                value={newTenant.name} 
                onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })}
                className="w-full px-5 py-3 bg-[#141414]/5 rounded-xl border-none outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2">CNPJ</label>
              <input 
                required 
                type="text" 
                value={newTenant.cnpj} 
                onChange={(e) => setNewTenant({ ...newTenant, cnpj: e.target.value })}
                className="w-full px-5 py-3 bg-[#141414]/5 rounded-xl border-none outline-none"
              />
            </div>
            <div className="flex gap-4">
              <button 
                type="button" 
                onClick={() => setShowCreate(false)}
                className="flex-1 py-3 bg-black/5 text-black rounded-xl font-bold cursor-pointer border-none"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                disabled={creating}
                className="flex-1 py-3 bg-black text-white rounded-xl font-bold cursor-pointer border-none"
              >
                {creating ? "Criando..." : "Criar Loja"}
              </button>
            </div>
          </form>
        ) : (
          isMasterAdmin && (
            <div className="flex justify-center mb-12">
              <button 
                onClick={() => setShowCreate(true)}
                className="px-6 py-3 bg-black text-white rounded-full text-xs font-bold uppercase tracking-widest cursor-pointer border-none"
              >
                Adicionar Nova Loja
              </button>
            </div>
          )
        )}

        <div className="flex flex-col items-center gap-6">
          {tenants.filter(t => t.name !== 'CotaMaster Matriz').map((tenant) => (
            <div key={tenant.id} className="relative w-full max-w-[500px] group">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setTenantId(tenant.id)}
                className="p-6 transition-all text-left w-full flex items-center gap-8 bg-white/50 hover:bg-white rounded-[32px] border border-transparent hover:border-black/5 cursor-pointer outline-none"
              >
                <div 
                  className="w-24 h-24 rounded-full bg-white overflow-hidden flex-shrink-0 relative shadow-lg group-hover:shadow-xl transition-all duration-500 flex items-center justify-center"
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
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-2xl font-serif italic group-hover:text-[#141414] transition-colors">{tenant.name}</h3>
                  {tenant.cnpj && <p className="text-[10px] text-black/30 mt-1 uppercase tracking-widest">{tenant.cnpj}</p>}
                </div>
              </motion.button>
              
              {isMasterAdmin && (
                <button
                  onClick={(e) => handleDeleteTenant(tenant.id, e)}
                  disabled={deletingId === tenant.id}
                  className="absolute top-4 right-4 p-3 bg-red-50 text-red-500 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white cursor-pointer border-none"
                  title="Excluir Loja"
                >
                  {deletingId === tenant.id ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              )}
            </div>
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
            {!auth.currentUser ? (
              <button 
                onClick={() => setShowLogin(true)}
                className="p-2 text-[#141414]/5 cursor-default hover:text-[#141414]/20 transition-all bg-transparent border-none outline-none"
                title="Acesso Administrativo"
              >
                <Clover size={16} />
              </button>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <div className="flex items-center gap-4 px-4 py-2 bg-white rounded-full border border-black/5 shadow-sm">
                  <span className="text-xs font-medium text-black/60">{auth.currentUser.email}</span>
                  <button 
                    onClick={() => logout()}
                    className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-600 bg-transparent border-none cursor-pointer"
                  >
                    Sair
                  </button>
                </div>
                
                {isMasterAdmin && (
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/register-tenant`;
                      navigator.clipboard.writeText(url);
                      alert('Link de cadastro copiado: ' + url);
                    }}
                    className="flex items-center gap-2 px-6 py-2 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold hover:bg-emerald-100 transition-all cursor-pointer border-none"
                  >
                    <Share size={14} />
                    Compartilhar Link para Nova Loja
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {tenants.length === 0 && (
          <div className="text-center p-12 bg-white rounded-3xl border border-dashed border-[#141414]/10 mt-8">
            <Shield className="w-12 h-12 mx-auto mb-4 text-[#141414]/10" />
            <p className="text-[#141414]/40">Nenhuma loja ativa encontrada.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default TenantSelectionPage;
