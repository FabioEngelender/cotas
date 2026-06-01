import React, { useState, useEffect, useRef, useContext } from 'react';
import { useParams, useLocation, Link, useNavigate } from 'react-router-dom';
import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { ArrowLeft, RefreshCw, Plus, Shield, Download } from 'lucide-react';

import { db, storage } from '../firebase.js';
import AuthContext from '../contexts/AuthContext.js';
import { Product, ChatMessage } from '../types.js';
import { cn } from '../utils/cn.js';

export default function ProductChatPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryParams = new URLSearchParams(location.search);
  const mentionUserId = queryParams.get('mention');
  
  const { user, tenantId } = useContext(AuthContext)!;
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [product, setProduct] = useState<Product | null>(null);

  useEffect(() => {
    if (!tenantId || !id) return;

    const productRef = doc(db, 'tenants', tenantId, 'products', id);
    getDoc(productRef).then(snap => {
      if (snap.exists()) setProduct({ id: snap.id, ...snap.data() } as Product);
    });

    const chatRef = collection(db, 'tenants', tenantId, 'products', id, 'chat');
    const q = query(chatRef, orderBy('created_at', 'asc'), limit(100));
    
    return onSnapshot(q, (snapshot) => {
      setMessages(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [id, tenantId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !tenantId || !id || !user) return;

    try {
      const chatRef = collection(db, 'tenants', tenantId, 'products', id, 'chat');
      await addDoc(chatRef, {
        userId: user.id,
        userName: user.name,
        message: input,
        mentionUserId: mentionUserId || null,
        created_at: serverTimestamp()
      });
      setInput('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!tenantId || !id || !user) {
      alert('Sessão inválida. Por favor, recarregue a página.');
      return;
    }

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      alert('O arquivo deve ter no máximo 10MB.');
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const storageRef = ref(storage, `tenants/${tenantId}/products/${id}/chat/${fileName}`);
      
      console.log("Iniciando upload para:", storageRef.fullPath);
      const snapshot = await uploadBytes(storageRef, file);
      console.log("Upload concluído, snapshot:", snapshot.metadata.fullPath);
      
      const downloadURL = await getDownloadURL(snapshot.ref);
      console.log("URL de download obtida:", downloadURL);

      const chatRef = collection(db, 'tenants', tenantId, 'products', id, 'chat');
      await addDoc(chatRef, {
        userId: user.id,
        userName: user.name,
        message: `Enviou um arquivo: ${file.name}`,
        fileUrl: downloadURL,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        isManagerUpload: user.role === 'admin' || user.role === 'manager',
        created_at: serverTimestamp()
      });
      
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      console.error("Erro no upload:", err);
      let errorMessage = "Erro desconhecido";
      if (err.code === 'storage/retry-limit-exceeded') {
        errorMessage = "Limite de tentativas excedido. Verifique se o serviço de Storage está ativo no seu Firebase Console.";
      } else if (err.code === 'storage/unauthorized') {
        errorMessage = "Sem permissão para fazer upload. Verifique as regras de segurança do Storage.";
      } else if (err.message) {
        errorMessage = err.message;
      }
      alert(`Erro ao enviar arquivo: ${errorMessage}`);
    } finally {
      setUploading(false);
    }
  };

  const canDownload = (msg: any) => {
    if (!user) return false;
    if (user.role === 'admin' || user.role === 'manager') return true;
    if (msg.isManagerUpload) return true;
    return msg.userId === user.id;
  };

  return (
    <div className="h-[calc(100vh-12rem)] flex flex-col bg-white rounded-[40px] border border-black/5 shadow-sm overflow-hidden">
      <div className="p-6 border-b border-black/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(`/products/${id}`)} className="p-2 hover:bg-black/5 rounded-full transition-all">
            <ArrowLeft size={20} />
          </button>
          <h3 className="font-bold text-xl">Chat do Produto {product ? `(${product.name})` : `#${id}`}</h3>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 p-6 overflow-y-auto space-y-4 bg-[#F9F9F7]">
        {messages.map((msg: any, i) => {
          const isMentioned = msg.mentionUserId === user?.id;
          const isOwn = msg.userId === user?.id;
          return (
            <div key={i} className={cn("flex flex-col", isOwn ? "items-end" : "items-start")}>
              <div className={cn(
                "max-w-[75%] p-4 rounded-2xl shadow-sm relative",
                isOwn ? "bg-black text-white rounded-tr-none" : "bg-white text-black rounded-tl-none",
                isMentioned && "ring-4 ring-amber-400"
              )}>
                {isMentioned && (
                  <div className="absolute -top-2 -right-2 bg-amber-400 text-black text-[8px] font-bold px-2 py-1 rounded-full uppercase">
                    Direta
                  </div>
                )}
                <p className={cn("text-[10px] font-bold uppercase tracking-widest mb-1", isOwn ? "opacity-50" : "opacity-40")}>{msg.userName}</p>
                <p className="text-sm">{msg.message}</p>
                
                {msg.fileUrl && (
                  <div className="mt-3 pt-3 border-t border-white/10">
                    {canDownload(msg) ? (
                      <a 
                        href={msg.fileUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className={cn(
                          "flex items-center gap-2 p-2 rounded-xl transition-all text-xs font-bold",
                          isOwn ? "bg-white/10 hover:bg-white/20 text-white" : "bg-black/5 hover:bg-black/10 text-black"
                        )}
                      >
                        <Download size={16} />
                        <span className="truncate max-w-[150px]">{msg.fileName}</span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 p-2 rounded-xl bg-black/5 text-black/40 text-[10px] italic">
                        <Shield size={14} /> Arquivo restrito
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={sendMessage} className="p-6 border-t border-black/5 flex gap-4 items-center bg-white">
        <input 
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          className="hidden"
          accept="image/*,.pdf"
        />
        <button 
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="p-4 bg-black/5 text-black/60 rounded-2xl hover:bg-black/10 transition-all disabled:opacity-50 flex items-center justify-center"
          title="Anexar arquivo (Foto ou PDF)"
        >
          {uploading ? <RefreshCw size={20} className="animate-spin" /> : <Plus size={20} />}
        </button>
        <input 
          value={input}
          onChange={e => setInput(e.target.value)}
          className="flex-1 p-4 bg-black/5 rounded-2xl border-none focus:ring-2 focus:ring-black/10 transition-all text-sm"
          placeholder="Digite sua mensagem..."
        />
        <button className="px-8 py-4 bg-black text-white rounded-2xl font-bold hover:scale-105 transition-all text-sm">
          Enviar
        </button>
      </form>
    </div>
  );
}
