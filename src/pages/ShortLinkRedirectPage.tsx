import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Loader2, AlertCircle, ArrowRight, ShieldCheck } from 'lucide-react';
import { resolveShortLink } from '../utils/urlShortener.js';

export function ShortLinkRedirectPage() {
  const { param1, param2 } = useParams<{ param1?: string; param2?: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function redirect() {
      if (!param1) {
        if (isMounted) setError('Link inválido ou não informado.');
        return;
      }

      try {
        const result = await resolveShortLink(param1, param2);
        if (result && isMounted) {
          navigate(result.targetUrl, { replace: true });
        } else if (isMounted) {
          setError('O link informado expirou ou não foi localizado no sistema.');
        }
      } catch (err) {
        console.error('Erro ao redirecionar link curto:', err);
        if (isMounted) setError('Ocorreu uma falha ao resolver o endereço seguro.');
      }
    }

    redirect();

    return () => {
      isMounted = false;
    };
  }, [param1, param2, navigate]);

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[32px] p-8 max-w-md w-full shadow-xl border border-black/5 text-center space-y-6"
        >
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle size={32} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-black">Link Indisponível</h2>
            <p className="text-xs text-black/60 mt-2">{error}</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3.5 bg-black text-white rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-black/80 transition-all cursor-pointer"
          >
            Ir para a Página Inicial <ArrowRight size={16} />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[32px] p-10 max-w-sm w-full shadow-2xl border border-black/5 text-center space-y-5"
      >
        <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 animate-ping" />
          <div className="w-16 h-16 bg-emerald-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
            <ShieldCheck size={32} />
          </div>
        </div>
        <div>
          <h3 className="font-bold text-lg text-black">Redirecionando...</h3>
          <p className="text-xs text-black/50 mt-1">Acessando o link de cadastro seguro</p>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs font-mono font-bold text-black/40">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          <span>Aguarde um instante</span>
        </div>
      </motion.div>
    </div>
  );
}

export default ShortLinkRedirectPage;
