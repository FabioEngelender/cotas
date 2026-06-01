import React, { useState, useEffect, useContext } from 'react';
import { collection, query, where, orderBy, onSnapshot, getDocs, getDoc, doc } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import { FileText, Package } from 'lucide-react';

import { db, handleFirestoreError, OperationType } from '../firebase.js';
import AuthContext from '../contexts/AuthContext.js';

export default function MyQuotasPage() {
  const [quotas, setQuotas] = useState<any[]>([]);
  const [termContent, setTermContent] = useState('');
  const { user, tenantId } = useContext(AuthContext)!;

  useEffect(() => {
    if (!tenantId || !user) return;
    
    // Fetch active term with real-time listener
    const termsRef = collection(db, 'tenants', tenantId, 'terms');
    const unsubTerm = onSnapshot(query(termsRef, where('is_active', '==', true)), (snapshot) => {
      if (!snapshot.empty) {
        setTermContent(snapshot.docs[0].data().content);
      }
    });

    const q = query(
      collection(db, 'tenants', tenantId, 'quotas'), 
      where('owner_id', '==', user.id),
      orderBy('number', 'asc')
    );
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const quotasData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Fetch product details for each quota to get image and name
      const productsRef = collection(db, 'tenants', tenantId, 'products');
      const enrichedQuotas = await Promise.all(quotasData.map(async (quota: any) => {
        try {
          const productSnap = await getDoc(doc(productsRef, quota.product_id));
          if (productSnap.exists()) {
            const pData = productSnap.data();
            return {
              ...quota,
              productName: pData.name,
              productImage: pData.image_url
            };
          }
        } catch (e) {
          console.error(e);
        }
        return {
          ...quota,
          productName: quota.product_name || 'Produto',
          productImage: null
        };
      }));
      
      // Prioritize integers before fractions, then natural sort
      enrichedQuotas.sort((a: any, b: any) => {
        const isFractionA = !!a.parent_id;
        const isFractionB = !!b.parent_id;
        if (isFractionA !== isFractionB) return isFractionA ? 1 : -1;
        return (String(a.number) || '').localeCompare(String(b.number) || '', undefined, { numeric: true, sensitivity: 'base' });
      });
      
      setQuotas(enrichedQuotas);
    }, (err) => {
      console.error("Error in MyQuotas listener:", err);
    });
    
    return () => {
      unsubscribe();
      unsubTerm();
    };
  }, [tenantId, user]);

  const downloadMyTerm = async () => {
    if (!user || !user.signed_term_at || !tenantId) return alert('Você ainda não assinou o termo.');
    
    try {
      // Fetch relevant data to reconstruct the plan info
      const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
      const instSnap = await getDocs(query(installmentsRef, where('owner_id', '==', user.id)));
      const allInstallments = instSnap.docs.map(d => d.data());

      const productsRef = collection(db, 'tenants', tenantId, 'products');
      const prodSnap = await getDocs(productsRef);
      const allProductsData = Object.fromEntries(prodSnap.docs.map(d => [d.id, d.data()]));

      const productGroups: { [key: string]: any } = {};
      quotas.forEach((q: any) => {
        if (!productGroups[q.product_id]) {
          const pData = allProductsData[q.product_id];
          productGroups[q.product_id] = { 
            name: pData?.name || q.productName || 'Produto', 
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
      const splitTerm = docPdf.splitTextToSize(termContent || 'Termos de adesão...', pageWidth - (margin * 2));
      
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

      // 3. Signature & Details Section
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
      docPdf.text(`Participante: ${user.name}`, margin, cursorY);
      cursorY += 7;
      docPdf.text(`CPF: ${user.cpf || 'Não informado'}`, margin, cursorY);
      cursorY += 7;
      docPdf.text(`Data do Aceite Original: ${new Date(user.signed_term_at).toLocaleString('pt-BR')}`, margin, cursorY);
      cursorY += 12;

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
      docPdf.text(`Autenticação Digital ID: ${user.id}-${new Date(user.signed_term_at).getTime()}`, margin, cursorY);
      
      docPdf.save(`meu_termo_assinado.pdf`);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar termo.');
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center bg-[#FAF9F5] p-8 rounded-3xl border border-black/5">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Minhas Cotas</h2>
          <p className="text-black/50">Lista de todas as cotas devidamente registradas em seu portfólio</p>
        </div>
        {user?.signed_term_at && (
          <button 
            onClick={downloadMyTerm}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl font-bold hover:scale-105 transition-all text-sm cursor-pointer"
          >
            <FileText size={18} /> Baixar Termo Assinado
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {quotas.map(quota => (
          <div key={quota.id} className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-hidden group hover:shadow-lg transition-all flex flex-col justify-between">
            <div>
              <div className="h-44 bg-black/5 relative overflow-hidden">
                {quota.productImage ? (
                  <img src={quota.productImage} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-black/10">
                    <Package size={48} />
                  </div>
                )}
                <div className="absolute top-4 right-4 bg-black text-white px-3 py-1 rounded-full text-xs font-bold font-mono shadow">
                  Cota #{quota.number}
                </div>
                {quota.parent_id && (
                  <div className="absolute top-4 left-4 bg-amber-500 text-white px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider font-sans shadow">
                    Fração Subdividida
                  </div>
                )}
              </div>
              <div className="p-6 space-y-2">
                <h3 className="font-bold text-lg mb-1">{quota.productName}</h3>
                <p className="text-xs text-black/40">Adquirida em: {new Date(quota.created_at).toLocaleDateString('pt-BR')}</p>
                
                <div className="mt-4 pt-4 border-t border-black/5">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Valor de Aporte</p>
                  <p className="font-black text-emerald-600 text-xl font-mono">
                    {quota.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="px-6 pb-6 pt-2">
              <Link to={`/products/${quota.product_id}`} className="w-full inline-flex items-center justify-center py-3 bg-black/5 text-black hover:bg-black/10 rounded-2xl text-xs font-bold transition-all">
                Ver Detalhes do Produto
              </Link>
            </div>
          </div>
        ))}
        
        {quotas.length === 0 && (
          <div className="col-span-full py-20 text-center bg-white rounded-[40px] border border-black/5 space-y-4">
            <p className="text-black/30 font-medium">Você ainda não adquiriu nenhuma cota de investimento.</p>
            <Link to="/products" className="inline-block px-8 py-3 bg-black text-white rounded-2xl font-bold text-xs hover:scale-105 transition-all">
              Explorar Produtos Disponíveis
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
