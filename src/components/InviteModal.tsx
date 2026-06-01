import { useState } from 'react';
import { motion } from 'motion/react';
import { Users, Shield } from 'lucide-react';
import { cn } from '../utils/cn.js';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantId: string;
  userRole: string;
}

export function InviteModal({ isOpen, onClose, tenantId, userRole }: InviteModalProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const baseUrl = window.location.origin;
  
  const links = [
    { 
      label: userRole === 'client' ? 'Compartilhar Oportunidade' : 'Convite para Cliente', 
      url: `${baseUrl}/register-client/${tenantId}`, 
      icon: <Users size={20} />,
      variant: userRole === 'client' ? 'default' : 'client'
    },
    ...(userRole === 'admin' ? [{ 
      label: 'Convite para Gerente', 
      url: `${baseUrl}/register-manager/${tenantId}`, 
      icon: <Shield size={20} />,
      variant: 'manager'
    }] : []),
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
        className="relative w-[95%] sm:w-full max-w-md bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
      >
        <h3 className="text-2xl font-bold mb-6">{userRole === 'client' ? 'Convidar Amigo' : 'Convidar para a Loja'}</h3>
        <div className="space-y-4">
          {links.map((link, i) => (
            <div 
              key={i} 
              className={cn(
                "p-5 rounded-[24px] space-y-3 transition-all border border-black/5",
                link.variant === 'client' ? "bg-emerald-400 text-black shadow-xl shadow-emerald-400/20" :
                link.variant === 'manager' ? "bg-amber-400 text-black shadow-xl shadow-amber-400/20" :
                "bg-black/5"
              )}
            >
              <div className={cn(
                "flex items-center gap-2 text-[10px] font-black uppercase tracking-widest",
                link.variant !== 'default' ? "text-black" : "opacity-40"
              )}>
                {link.icon} {link.label}
              </div>
              <div className="flex gap-2">
                <input 
                  readOnly 
                  value={link.url} 
                  className={cn(
                    "flex-1 rounded-xl px-3 py-2 text-[10px] font-mono truncate border",
                    link.variant !== 'default' ? "bg-white/80 border-black/10 text-black" : "bg-white border-black/5 text-[#141414]"
                  )}
                />
                <button 
                  onClick={() => copyToClipboard(link.url, link.label)}
                  className={cn(
                    "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter hover:scale-105 transition-all shadow-md active:scale-95",
                    link.variant !== 'default' ? "bg-black text-white" : "bg-black text-white"
                  )}
                >
                  {copied === link.label ? 'Pronto!' : 'Copiar'}
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

export default InviteModal;
