import { useState } from 'react';
import { motion } from 'motion/react';
import { Users, Shield, Loader2, Check } from 'lucide-react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase.js';
import { cn } from '../utils/cn.js';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  userRole: string;
}

export function InviteModal({ isOpen, onClose, tenantId, userRole }: InviteModalProps) {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  const [activeLinks, setActiveLinks] = useState<{ [role: string]: string }>({});
  
  const baseUrl = window.location.origin;

  const generateInvite = async (role: 'client' | 'manager') => {
    if (!tenantId) return;
    setLoadingRole(role);
    try {
      // 1. Generate unique document reference
      const invitesRef = collection(db, 'tenants', tenantId, 'invites');
      const inviteDoc = doc(invitesRef);
      const inviteId = inviteDoc.id;

      // 2. Set expiry date (7 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      // 3. Store invite token details securely
      await setDoc(inviteDoc, {
        id: inviteId,
        tenant_id: tenantId,
        role: role,
        expires_at: expiresAt.toISOString(),
        used_at: null,
        used_by: null,
        created_at: serverTimestamp(),
        created_by: auth.currentUser?.uid || 'Sistema'
      });

      // 4. Construct register Link
      const inviteLink = `${baseUrl}/register-${role}/${tenantId}/${inviteId}`;
      setActiveLinks(prev => ({ ...prev, [role]: inviteLink }));

      // 5. Copy link to clipboard
      await navigator.clipboard.writeText(inviteLink);
      setCopiedLabel(role);
      setTimeout(() => setCopiedLabel(null), 2500);
    } catch (err) {
      console.error('Erro ao gerar convite no Firebase:', err);
      alert('Falha ao gerar link de convite seguro.');
    } finally {
      setLoadingRole(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative w-[95%] sm:w-full max-w-md bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
      >
        <h3 className="text-2xl font-bold mb-6">
          {userRole === 'client' ? 'Convidar Amigo' : 'Gestão de Convites'}
        </h3>
        <p className="text-xs text-black/50 mb-6">
          Os convites gerados abaixo são de **uso único, possuem validade de 7 dias** e ficam vinculados de forma segura a esta loja.
        </p>

        <div className="space-y-6">
          {/* Client Invite Section */}
          <div className="p-5 rounded-[24px] border border-black/5 bg-emerald-400 text-black shadow-xl shadow-emerald-400/10 space-y-3">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black">
              <Users size={16} /> Compartilhar Link Cliente
            </div>
            
            <p className="text-[11px] text-black/75">
              Ideal para investidores ou cotistas comprarem cotas e frações de forma autônoma.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              {activeLinks['client'] && (
                <input 
                  readOnly 
                  value={activeLinks['client']} 
                  className="w-full rounded-xl px-3 py-2 text-[10px] font-mono truncate border bg-white/80 border-black/10 text-black outline-none"
                />
              )}
              <button 
                disabled={loadingRole !== null}
                onClick={() => generateInvite('client')}
                className="w-full py-3 rounded-xl text-xs font-bold uppercase tracking-tight bg-black text-white hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer border-none"
              >
                {loadingRole === 'client' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : copiedLabel === 'client' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" /> Link Copiado!
                  </>
                ) : (
                  'Gerar e Copiar Convite Seguro'
                )}
              </button>
            </div>
          </div>

          {/* Manager Invite Section (only if Admin) */}
          {userRole === 'admin' && (
            <div className="p-5 rounded-[24px] border border-black/5 bg-amber-400 text-black shadow-xl shadow-amber-400/10 space-y-3">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black">
                <Shield size={16} /> Convite para Gerente
              </div>
              
              <p className="text-[11px] text-black/75">
                Permite registro de novos gerentes de contas habilitados para baixa financeira de pagamentos.
              </p>

              <div className="flex flex-col gap-2 pt-2">
                {activeLinks['manager'] && (
                  <input 
                    readOnly 
                    value={activeLinks['manager']} 
                    className="w-full rounded-xl px-3 py-2 text-[10px] font-mono truncate border bg-white/80 border-black/10 text-black outline-none"
                  />
                )}
                <button 
                  disabled={loadingRole !== null}
                  onClick={() => generateInvite('manager')}
                  className="w-full py-3 rounded-xl text-xs font-bold uppercase tracking-tight bg-black text-white hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer border-none"
                >
                  {loadingRole === 'manager' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : copiedLabel === 'manager' ? (
                    <>
                      <Check className="w-4 h-4 text-amber-400" /> Link Copiado!
                    </>
                  ) : (
                    'Gerar e Copiar Convite Gerente'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        <button 
          onClick={onClose}
          className="w-full mt-8 py-4 bg-black/5 text-black rounded-2xl font-bold hover:bg-black/10 transition-all cursor-pointer border-none"
        >
          Fechar
        </button>
      </motion.div>
    </div>
  );
}

export default InviteModal;
