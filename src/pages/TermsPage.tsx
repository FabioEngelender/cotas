import React, { useState, useEffect, useContext } from 'react';
import { 
  collection, 
  query, 
  where, 
  limit, 
  onSnapshot, 
  addDoc, 
  doc, 
  updateDoc, 
  serverTimestamp, 
  writeBatch, 
  getDocs 
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { RefreshCw, FileText } from 'lucide-react';

import { db } from '../firebase.js';
import AuthContext from '../contexts/AuthContext.js';

export default function TermsPage() {
  const { user, setUser, tenantId } = useContext(AuthContext)!;
  const [term, setTerm] = useState<{ id: string, content: string } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    const termsRef = collection(db, 'tenants', tenantId, 'terms');
    const q = query(termsRef, where('is_active', '==', true), limit(1));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as any;
        setTerm(data);
        setContent(data.content);
      } else {
        setTerm(null);
        setContent('Termo padrão de adesão. O administrador pode editar este conteúdo nas configurações.');
      }
      setLoading(false);
    }, (err) => {
      console.error("Error in Terms listener:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId) return;
    try {
      const parsedVersion = term && typeof (term as any).version === 'number' ? (term as any).version : 1.0;
      const nextVersion = Math.round((parsedVersion + 0.1) * 10) / 10;

      if (term) {
        const batch = writeBatch(db);
        // Deactivate old one
        const oldRef = doc(db, 'tenants', tenantId, 'terms', term.id);
        batch.update(oldRef, { is_active: false });

        // Add new one with incremented version
        const newRef = doc(collection(db, 'tenants', tenantId, 'terms'));
        batch.set(newRef, {
          content,
          is_active: true,
          version: nextVersion,
          parent_id: term.id,
          created_at: serverTimestamp()
        });

        await batch.commit();
        setTerm({ id: newRef.id, content, version: nextVersion, parent_id: term.id } as any);
      } else {
        const docRef = await addDoc(collection(db, 'tenants', tenantId, 'terms'), {
          content,
          is_active: true,
          version: 1.0,
          created_at: serverTimestamp()
        });
        setTerm({ id: docRef.id, content, version: 1.0 } as any);
      }
      setIsEditing(false);
      alert('Nova versão do termo salva e publicada com sucesso! As versões antigas foram arquivadas de forma imutável.');
    } catch (err) {
      console.error(err);
      alert('Erro ao salvar termo');
    }
  };

  const downloadTerm = async () => {
    if (!tenantId || !user) return;
    try {
      const quotasRef = collection(db, 'tenants', tenantId, 'quotas');
      const q = query(quotasRef, where('owner_id', '==', user.id));
      const snapshot = await getDocs(q);
      const quotasData = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
      
      // Prioritize integers before fractions, then natural sort
      quotasData.sort((a, b) => {
        const isFractionA = !!a.parent_id;
        const isFractionB = !!b.parent_id;
        if (isFractionA !== isFractionB) return isFractionA ? 1 : -1;
        return (String(a.number) || '').localeCompare(String(b.number) || '', undefined, { numeric: true, sensitivity: 'base' });
      });
      
      const productsRef = collection(db, 'tenants', tenantId, 'products');
      const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
      
      const [productsSnap, instSnap] = await Promise.all([
        getDocs(productsRef),
        getDocs(query(installmentsRef, where('owner_id', '==', user.id)))
      ]);
      
      const allProducts = Object.fromEntries(productsSnap.docs.map(d => [d.id, d.data()]));
      const allInstallments = instSnap.docs.map(d => d.data());

      const productGroups: { [key: string]: any } = {};
      quotasData.forEach((q: any) => {
        if (!productGroups[q.product_id]) {
          const pData = allProducts[q.product_id];
          productGroups[q.product_id] = { 
            name: pData?.name || q.product_name || 'Produto', 
            numbers: [],
            totalValue: 0,
            paymentType: pData?.payment_type || 'cash',
            installmentCount: 0
          };
        }
        productGroups[q.product_id].numbers.push(q.number);
        productGroups[q.product_id].totalValue += (q.price || 0);

        const qInsts = allInstallments.filter(i => i.quota_id === q.id);
        productGroups[q.product_id].installmentCount = Math.max(productGroups[q.product_id].installmentCount, qInsts.length);
      });

      const docPdf = new jsPDF();
      const pageWidth = docPdf.internal.pageSize.getWidth();
      const pageHeight = docPdf.internal.pageSize.getHeight();
      const margin = 14;
      let cursorY = 20;

      // 1. Term Header
      docPdf.setFontSize(16);
      docPdf.setFont("helvetica", "bold");
      docPdf.text("TERMO DE CIENTIFICAÇÃO E ADESÃO AO BOLÃO", pageWidth / 2, cursorY, { align: 'center' });
      cursorY += 10;

      // 2. Term Content
      docPdf.setFontSize(9);
      docPdf.setFont("helvetica", "normal");
      docPdf.setTextColor(50, 50, 50);
      const displayContent = term ? term.content : content;
      const splitTerm = docPdf.splitTextToSize(displayContent, pageWidth - (margin * 2));
      
      for (let i = 0; i < splitTerm.length; i++) {
        if (cursorY > pageHeight - 30) {
          docPdf.addPage();
          cursorY = 20;
        }
        docPdf.text(splitTerm[i], margin, cursorY);
        cursorY += 5;
      }

      cursorY += 10;
      if (cursorY > pageHeight - 80) {
        docPdf.addPage();
        cursorY = 20;
      }

      // 3. Details & Signature Section
      docPdf.setDrawColor(200, 200, 200);
      docPdf.line(margin, cursorY, pageWidth - margin, cursorY);
      cursorY += 10;

      docPdf.setFontSize(14);
      docPdf.setFont("helvetica", "bold");
      docPdf.setTextColor(0, 0, 0);
      docPdf.text("ASSINATURA ELETRÔNICA E DETALHES", margin, cursorY);
      cursorY += 10;

      docPdf.setFontSize(11);
      docPdf.setFont("helvetica", "normal");
      docPdf.text(`Participante: ${user?.name}`, margin, cursorY);
      cursorY += 7;
      docPdf.text(`CPF: ${user?.cpf || 'Não informado'}`, margin, cursorY);
      cursorY += 7;
      docPdf.text(`Data do Aceite: ${new Date(user?.signed_term_at!).toLocaleString('pt-BR')}`, margin, cursorY);
      cursorY += 10;
      
      docPdf.setFontSize(11);
      docPdf.setFont("helvetica", "bold");
      docPdf.text("Resumo de Aquisições e Condições:", margin, cursorY);
      cursorY += 7;

      docPdf.setFontSize(10);
      docPdf.setFont("helvetica", "normal");
      
      Object.values(productGroups).forEach((p: any) => {
        if (cursorY > pageHeight - 40) {
          docPdf.addPage();
          cursorY = 20;
        }

        docPdf.setFont("helvetica", "bold");
        docPdf.text(`Produto: ${p.name}`, margin, cursorY);
        cursorY += 5;
        docPdf.setFont("helvetica", "normal");
        
        const quotasText = `Cotas: #${p.numbers.join(', #')}`;
        const splitQuotas = docPdf.splitTextToSize(quotasText, pageWidth - (margin * 2));
        docPdf.text(splitQuotas, margin, cursorY);
        cursorY += (splitQuotas.length * 5) + 2;

        let conditionText = '';
        if (p.paymentType === 'recurrent') {
          conditionText = `Condição: Cobrança Recorrente Mensal de ${p.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / mês`;
        } else if (p.installmentCount > 1) {
          conditionText = `Condição: Parcelado em ${p.installmentCount}x de ${(p.totalValue / p.installmentCount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (Total: ${p.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`;
        } else {
          conditionText = `Condição: Pagamento à Vista no valor de ${p.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
        }
        docPdf.text(conditionText, margin, cursorY);
        cursorY += 10;
      });

      if (cursorY > pageHeight - 20) {
        docPdf.addPage();
        cursorY = 20;
      }

      cursorY += 5;
      docPdf.setFontSize(9);
      docPdf.text(`Autenticação Digital ID: ${user?.id}-${new Date(user?.signed_term_at!).getTime()}`, margin, cursorY);
      
      docPdf.save(`termo_adesao_assinado.pdf`);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar cópia do termo.');
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center p-20">
      <RefreshCw className="w-8 h-8 animate-spin text-black/20" />
      <span className="ml-3 text-black/40 font-medium">Carregando termos...</span>
    </div>
  );

  const displayContent = term ? term.content : content;

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Termo de Adesão</h2>
          <p className="text-black/50">
            {term && (term as any).version ? `Versão ${(term as any).version.toFixed(1)}` : 'Versão Inicial'} • Visualize o termo de compromisso
          </p>
        </div>
        {user?.role === 'admin' && (
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className="px-6 py-3 bg-black text-white rounded-2xl font-bold text-sm cursor-pointer hover:bg-neutral-850"
          >
            {isEditing ? 'Cancelar' : (term ? 'Editar Termo' : 'Criar Termo')}
          </button>
        )}
      </header>

      <div className="bg-white rounded-3xl p-10 border border-black/5 shadow-sm space-y-8">
        {isEditing || !term ? (
          <div className="space-y-6">
            {!term && !isEditing && user?.role === 'admin' && (
              <div className="p-6 bg-amber-50 text-amber-700 rounded-2xl border border-amber-100 text-sm">
                Nenhum termo configurado para esta loja. Use o editor abaixo para criar o primeiro termo.
              </div>
            )}
            {(isEditing || (!term && user?.role === 'admin')) ? (
              <>
                <textarea 
                  className="w-full h-[500px] p-8 bg-black/5 rounded-3xl border-none focus:ring-0 font-serif text-lg leading-relaxed text-black"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Escreva aqui o conteúdo do termo de adesão..."
                />
                <div className="flex justify-end">
                  <button onClick={handleSave} className="px-10 py-4 bg-emerald-600 text-white rounded-2xl font-bold text-sm cursor-pointer">
                    {term ? 'Salvar e Ativar' : 'Criar e Ativar'}
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center p-20 text-black/40 italic">
                Nenhum termo de adesão configurado pelo administrador.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-10">
            <div className="prose prose-lg max-w-none font-serif text-lg leading-relaxed whitespace-pre-wrap text-black">
              {displayContent}
            </div>
            
            <div className="pt-10 border-t border-black/5 flex flex-col items-center gap-6">
              {user?.signed_term_at && (
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full font-bold text-sm">
                     Termo Assinado em {new Date(user.signed_term_at).toLocaleString('pt-BR')}
                  </div>
                  <br />
                  <button 
                    onClick={downloadTerm}
                    className="inline-flex items-center gap-2 px-8 py-4 bg-black text-white rounded-2xl font-bold hover:scale-105 transition-all text-sm cursor-pointer"
                  >
                    <FileText size={18} /> Baixar Cópia do Termo
                  </button>
                </div>
              )}
              {!user?.signed_term_at && (
                <p className="text-black/40 italic text-sm">O termo será assinado eletronicamente no momento da primeira compra.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
