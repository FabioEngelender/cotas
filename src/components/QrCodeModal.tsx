import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { 
  QrCode, 
  Download, 
  Copy, 
  Check, 
  Share2, 
  X, 
  ExternalLink, 
  Sparkles,
  MessageSquare,
  ShieldCheck,
  Loader2
} from 'lucide-react';
import { getTinyUrl } from '../utils/urlShortener.js';

interface QrCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  longUrl: string;
  shortUrl: string;
  shortCode?: string;
}

export function QrCodeModal({
  isOpen,
  onClose,
  title = 'QR Code & Link Direto',
  subtitle = 'Digitalize com a câmera do celular para se cadastrar ou comprar cotas',
  longUrl,
  shortUrl,
  shortCode
}: QrCodeModalProps) {
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [tinyUrl, setTinyUrl] = useState<string | null>(null);
  const [loadingTiny, setLoadingTiny] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Active link to display in QR Code and share
  const activeDisplayUrl = tinyUrl || shortUrl || longUrl;

  useEffect(() => {
    if (isOpen && longUrl) {
      setLoadingTiny(true);
      getTinyUrl(shortUrl || longUrl)
        .then((res) => {
          if (res) setTinyUrl(res);
        })
        .catch((e) => console.warn(e))
        .finally(() => setLoadingTiny(false));
    }
  }, [isOpen, longUrl, shortUrl]);

  if (!isOpen) return null;

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(label);
      setTimeout(() => setCopiedLink(null), 2500);
    } catch (err) {
      console.error('Falha ao copiar:', err);
    }
  };

  const handleDownloadPng = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    
    // Create a high resolution offscreen canvas for crisp download
    const scale = 4;
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = canvas.width * scale;
    offscreenCanvas.height = canvas.height * scale;
    const ctx = offscreenCanvas.getContext('2d');
    
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      ctx.drawImage(canvas, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
    }

    const image = offscreenCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = image;
    link.download = `qrcode-cotamaster-${shortCode || 'link'}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadSvg = () => {
    if (!svgRef.current) return;
    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    
    const downloadLink = document.createElement('a');
    downloadLink.href = svgUrl;
    downloadLink.download = `qrcode-cotamaster-${shortCode || 'link'}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(svgUrl);
  };

  const handleCopyImage = async () => {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (blob && navigator.clipboard && window.ClipboardItem) {
          const item = new ClipboardItem({ 'image/png': blob });
          await navigator.clipboard.write([item]);
          setCopiedImage(true);
          setTimeout(() => setCopiedImage(false), 2500);
        }
      });
    } catch (err) {
      console.error('Falha ao copiar imagem:', err);
    }
  };

  const handleShareWhatsApp = () => {
    const text = `🚀 *Convite Cotamaster*\n\nAcesse o link direto ou escaneie o QR Code para fazer seu cadastro:\n👉 ${activeDisplayUrl}`;
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(whatsappUrl, '_blank');
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-md" 
        />

        <motion.div 
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative w-full max-w-lg bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 shadow-2xl border border-black/10 overflow-hidden z-10 max-h-[92vh] flex flex-col justify-between"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-black/5 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
                <QrCode size={22} />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-black tracking-tight leading-tight">
                  {title}
                </h3>
                <p className="text-[11px] text-black/50 font-medium">
                  {subtitle}
                </p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-black/5 text-black/60 hover:text-black rounded-full transition-colors cursor-pointer border-none bg-transparent"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="my-6 space-y-6 overflow-y-auto pr-1">
            {/* Styled QR Card Frame */}
            <div className="bg-gradient-to-b from-[#141414] to-[#1f1f1f] text-white p-6 sm:p-8 rounded-[28px] text-center shadow-xl relative overflow-hidden flex flex-col items-center justify-center">
              {/* Background ambient lighting */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-4 flex flex-col items-center">
                {/* Brand Badge */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-widest text-emerald-300 border border-white/10">
                  <ShieldCheck size={12} /> Cotamaster • Link Seguro
                </div>

                {/* QR Code Canvas Frame */}
                <div className="bg-white p-4 sm:p-5 rounded-[24px] shadow-2xl border-4 border-white/10 inline-block relative group">
                  <QRCodeCanvas 
                    ref={canvasRef}
                    value={activeDisplayUrl} 
                    size={200}
                    level="H"
                    includeMargin={false}
                    className="rounded-lg max-w-full"
                  />

                  {/* Hidden SVG for vector download */}
                  <div className="hidden">
                    <QRCodeSVG 
                      ref={svgRef}
                      value={activeDisplayUrl} 
                      size={1000}
                      level="H"
                    />
                  </div>
                </div>

                {/* Short link badge */}
                <div className="bg-white/10 border border-white/15 px-4 py-2 rounded-xl text-center max-w-xs w-full">
                  <span className="text-[10px] text-white/50 uppercase tracking-wider font-bold block mb-0.5">Endereço Direto</span>
                  <span className="text-xs font-mono font-bold text-emerald-300 truncate block">
                    {activeDisplayUrl}
                  </span>
                </div>
              </div>
            </div>

            {/* Links Section */}
            <div className="space-y-3">
              {/* Short App Link */}
              <div className="p-3.5 bg-black/5 rounded-2xl border border-black/5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-black/50 block">Link Curto do App</span>
                  <span className="text-xs font-mono font-bold text-black truncate block">{shortUrl}</span>
                </div>
                <button
                  onClick={() => handleCopy(shortUrl, 'app')}
                  className="px-3 py-2 bg-black text-white hover:bg-black/80 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border-none shrink-0"
                >
                  {copiedLink === 'app' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copiedLink === 'app' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>

              {/* TinyURL / External Short Link */}
              <div className="p-3.5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-emerald-800">
                    <Sparkles size={12} /> Link Curto Web (TinyURL)
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-950 truncate block mt-0.5">
                    {loadingTiny ? (
                      <span className="flex items-center gap-1 text-black/40">
                        <Loader2 size={12} className="animate-spin" /> Gerando link super curto...
                      </span>
                    ) : (
                      tinyUrl || shortUrl
                    )}
                  </span>
                </div>
                <button
                  disabled={loadingTiny}
                  onClick={() => handleCopy(tinyUrl || shortUrl, 'tiny')}
                  className="px-3 py-2 bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border-none shrink-0"
                >
                  {copiedLink === 'tiny' ? <Check size={14} className="text-white" /> : <Copy size={14} />}
                  <span>{copiedLink === 'tiny' ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                onClick={handleDownloadPng}
                className="py-3 px-3 bg-black text-white rounded-2xl font-bold text-xs hover:bg-black/80 transition-all flex items-center justify-center gap-2 cursor-pointer border-none shadow-md"
              >
                <Download size={15} /> Baixar PNG
              </button>

              <button
                onClick={handleDownloadSvg}
                className="py-3 px-3 bg-black/5 text-black hover:bg-black/10 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border-none"
              >
                <Download size={15} /> Vetor (SVG)
              </button>

              <button
                onClick={handleCopyImage}
                className="py-3 px-3 bg-black/5 text-black hover:bg-black/10 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border-none"
              >
                {copiedImage ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}
                <span>{copiedImage ? 'Imagem Copiada!' : 'Copiar Imagem'}</span>
              </button>

              <button
                onClick={handleShareWhatsApp}
                className="py-3 px-3 bg-emerald-500 text-white hover:bg-emerald-600 rounded-2xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer border-none shadow-lg shadow-emerald-500/20"
              >
                <MessageSquare size={15} /> WhatsApp
              </button>
            </div>
          </div>

          {/* Footer */}
          <button 
            onClick={onClose}
            className="w-full py-3.5 bg-black/5 text-black rounded-2xl font-bold text-xs hover:bg-black/10 transition-all cursor-pointer border-none"
          >
            Fechar
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

export default QrCodeModal;
