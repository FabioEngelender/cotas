import { useState } from 'react';
import { motion } from 'motion/react';
import { Users, Shield, Loader2, Check, QrCode, Sparkles } from 'lucide-react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase.js';
import { createShortLink } from '../utils/urlShortener.js';
import { QrCodeModal } from './QrCodeModal.js';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  userRole: string;
}

export function InviteModal({ isOpen, onClose, tenantId, userRole }: InviteModalProps) {
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  
  // Active links storage: stores shortUrl, fullUrl, and shortCode per role
  const [activeLinksData, setActiveLinksData] = useState<{ 
    [role: string]: { shortUrl: string; fullUrl: string; shortCode: string } 
  }>({});

  // QR Modal State
  const [qrModalData, setQrModalData] = useState<{
    isOpen: boolean;
    title: string;
    longUrl: string;
    shortUrl: string;
    shortCode: string;
  }>({
    isOpen: false,
    title: '',
    longUrl: '',
    shortUrl: '',
    shortCode: ''
  });

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
        created_by: auth.currentUser?.uid || 'Sistema',
        created_by_name: auth.currentUser?.displayName || (auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Usuário')
      });

      // 4. Create ultra clean Short Link
      const shortData = await createShortLink(tenantId, inviteId, role);
      
      const fullLink = shortData.fullUrl;
      const shortLink = shortData.shortUrl;

      setActiveLinksData(prev => ({ 
        ...prev, 
        [role]: { shortUrl: shortLink, fullUrl: fullLink, shortCode: shortData.shortCode } 
      }));

      // 5. Copy short link to clipboard by default
      await navigator.clipboard.writeText(shortLink);
      setCopiedLabel(role);
      setTimeout(() => setCopiedLabel(null), 2500);
    } catch (err) {
      console.error('Erro ao gerar convite no Firebase:', err);
      alert('Falha ao gerar link de convite seguro.');
    } finally {
      setLoadingRole(null);
    }
  };

  const openQrModal = (role: string) => {
    const linkObj = activeLinksData[role];
    if (!linkObj) return;
    setQrModalData({
      isOpen: true,
      title: role === 'manager' ? 'QR Code Convite Gerente' : 'QR Code Convite Cliente',
      longUrl: linkObj.fullUrl,
      shortUrl: linkObj.shortUrl,
      shortCode: linkObj.shortCode
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative w-[95%] sm:w-full max-w-md bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
        >
          <h3 className="text-2xl font-bold mb-2">
            {userRole === 'client' ? 'Convidar Amigo' : 'Gestão de Convites'}
          </h3>
          <p className="text-xs text-black/50 mb-6">
            Convites seguros de uso único (validade de 7 dias) com **links curtos automáticos e QR Code**.
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
                {activeLinksData['client'] && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input 
                        readOnly 
                        value={activeLinksData['client'].shortUrl} 
                        className="w-full rounded-xl px-3 py-2 text-[11px] font-mono font-bold truncate border bg-white border-black/10 text-black outline-none shadow-inner"
                      />
                      <button
                        onClick={() => openQrModal('client')}
                        className="p-2 bg-black text-white rounded-xl hover:bg-black/80 transition-all shrink-0 cursor-pointer border-none flex items-center gap-1 text-xs font-bold"
                        title="Ver QR Code & Baixar"
                      >
                        <QrCode size={16} /> QR Code
                      </button>
                    </div>
                  </div>
                )}

                <button 
                  disabled={loadingRole !== null}
                  onClick={() => generateInvite('client')}
                  className="w-full py-3 rounded-xl text-xs font-bold uppercase tracking-tight bg-black text-white hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer border-none shadow-md"
                >
                  {loadingRole === 'client' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                  ) : copiedLabel === 'client' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" /> Link Curto Copiado!
                    </>
                  ) : (
                    <>
                      <Sparkles size={15} /> Gerar Link Curto + QR Code
                    </>
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
                  Permite registro de novos gerentes habilitados para baixa financeira de pagamentos.
                </p>

                <div className="flex flex-col gap-2 pt-2">
                  {activeLinksData['manager'] && (
                    <div className="flex items-center gap-2">
                      <input 
                        readOnly 
                        value={activeLinksData['manager'].shortUrl} 
                        className="w-full rounded-xl px-3 py-2 text-[11px] font-mono font-bold truncate border bg-white border-black/10 text-black outline-none shadow-inner"
                      />
                      <button
                        onClick={() => openQrModal('manager')}
                        className="p-2 bg-black text-white rounded-xl hover:bg-black/80 transition-all shrink-0 cursor-pointer border-none flex items-center gap-1 text-xs font-bold"
                        title="Ver QR Code & Baixar"
                      >
                        <QrCode size={16} /> QR Code
                      </button>
                    </div>
                  )}
                  <button 
                    disabled={loadingRole !== null}
                    onClick={() => generateInvite('manager')}
                    className="w-full py-3 rounded-xl text-xs font-bold uppercase tracking-tight bg-black text-white hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer border-none shadow-md"
                  >
                    {loadingRole === 'manager' ? (
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                    ) : copiedLabel === 'manager' ? (
                      <>
                        <Check className="w-4 h-4 text-amber-400" /> Link Curto Copiado!
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} /> Gerar Link Curto + QR Code
                      </>
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

      {/* QR Code Modal Integration */}
      <QrCodeModal 
        isOpen={qrModalData.isOpen}
        onClose={() => setQrModalData(prev => ({ ...prev, isOpen: false }))}
        title={qrModalData.title}
        longUrl={qrModalData.longUrl}
        shortUrl={qrModalData.shortUrl}
        shortCode={qrModalData.shortCode}
      />
    </>
  );
}

export default InviteModal;
