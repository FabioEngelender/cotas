import React, { useState, useEffect, useContext } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable'; // Ensure jsPDF tables can render consolidations
import { FileText } from 'lucide-react';

import { db } from '../firebase.js';
import AuthContext from '../contexts/AuthContext.js';
import { cn } from '../utils/cn.js';

interface MyPaymentsPageProps {
  settings: any;
}

export default function MyPaymentsPage({ settings }: MyPaymentsPageProps) {
  const [installments, setInstallments] = useState<any[]>([]);
  const [rawInstallments, setRawInstallments] = useState<any[]>([]);
  const { user, tenantId, syncUserInstallments } = useContext(AuthContext)!;

  useEffect(() => {
    if (!tenantId || !user) return;
    
    // Sync installments on load
    syncUserInstallments(tenantId, user.id);

    const q = query(collection(db, 'tenants', tenantId, 'installments'), where('owner_id', '==', user.id));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setRawInstallments(all);
      
      // Group by due date and status
      const groups: { [key: string]: any } = {};
      all.forEach((inst: any) => {
        const key = `${inst.due_date}_${inst.status}`;
        if (!groups[key]) {
          groups[key] = {
            due_date: inst.due_date,
            status: inst.status,
            productName: inst.product_name,
            amount: 0,
            quotaNumbers: [],
            paid_at: inst.paid_at
          };
        }
        groups[key].amount += inst.amount;
        if (inst.quota_number && !groups[key].quotaNumbers.includes(inst.quota_number)) {
          groups[key].quotaNumbers.push(inst.quota_number);
        }
      });

      const sorted = Object.values(groups).sort((a: any, b: any) => 
        new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
      );

      setInstallments(sorted);
    }, (err) => {
      console.error("Error in MyPayments listener:", err);
    });
    return () => unsubscribe();
  }, [tenantId, user]);

  const downloadPaymentReceipt = (group: any) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let cursorY = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("COMPROVANTE DE PAGAMENTO CONSOLIDADO", pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 10;

    doc.setFontSize(12);
    doc.setTextColor(255, 0, 0);
    doc.text("SEM VALOR FISCAL", pageWidth / 2, cursorY, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    cursorY += 15;

    // Store Info (if available)
    if (settings && settings.app_name) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(settings.app_name, margin, cursorY);
      cursorY += 10;
    }

    // User Info
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Participante: ${user?.name}`, margin, cursorY);
    cursorY += 6;
    doc.text(`CPF: ${group.items[0]?.owner_cpf || user?.cpf || 'Não informado'}`, margin, cursorY);
    cursorY += 6;
    doc.text(`Data do Pagamento: ${new Date(group.paidAt).toLocaleDateString('pt-BR')} ${new Date(group.paidAt).toLocaleTimeString('pt-BR')}`, margin, cursorY);
    cursorY += 15;

    // Table Header
    const tableColumn = ["Produto", "V. Unit", "Qtd", "Cotas", "Vencimento", "V. Total"];
    const tableRows: any[] = [];

    // Group items by product to show consolidated info per product
    const productGroups: { [key: string]: any } = {};
    group.items.forEach((inst: any) => {
      if (!productGroups[inst.product_id]) {
        productGroups[inst.product_id] = {
          name: inst.product_name || 'Produto',
          unitPrice: inst.amount,
          quantity: 0,
          quotas: [],
          dueDate: inst.due_date,
          total: 0
        };
      }
      productGroups[inst.product_id].quantity += 1;
      productGroups[inst.product_id].total += inst.amount;
      if (inst.quota_number && !productGroups[inst.product_id].quotas.includes(inst.quota_number)) {
        productGroups[inst.product_id].quotas.push(inst.quota_number);
      }
    });

    Object.values(productGroups).forEach((p: any) => {
      tableRows.push([
        p.name,
        p.unitPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
        p.quantity,
        p.quotas.sort((a: any, b: any) => Number(a) - Number(b)).join(', '),
        new Date(p.dueDate + 'T12:00:00').toLocaleDateString('pt-BR'),
        p.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      ]);
    });

    (doc as any).autoTable({
      head: [tableColumn],
      body: tableRows,
      startY: cursorY,
      theme: 'grid',
      headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { halign: 'right' },
        2: { halign: 'center' },
        3: { cellWidth: 40 },
        4: { halign: 'center' },
        5: { halign: 'right', fontStyle: 'bold' }
      }
    });

    cursorY = (doc as any).lastAutoTable.finalY + 15;

    // Summary
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`VALOR TOTAL PAGO: ${group.totalAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, pageWidth - margin, cursorY, { align: 'right' });
    cursorY += 15;

    // Authentication
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    const authCode = `${user?.id?.substring(0, 8)}-${group.paidAt.replace(/[^0-9]/g, '').substring(0, 12)}-${Date.now().toString().substring(8)}`;
    doc.text(`Autenticação Digital: ${authCode}`, margin, cursorY);
    cursorY += 5;
    doc.text(`Este documento é um comprovante de quitação de parcelas gerado pelo sistema ${settings?.app_name || 'Cotamaster'}.`, margin, cursorY);

    doc.save(`comprovante_consolidado_${group.paidAt.split('T')[0]}.pdf`);
  };

  const paidGroups = rawInstallments
    .filter(i => i.status === 'paid' && i.paid_at)
    .reduce((groups: any, inst) => {
      const date = inst.paid_at.split('T')[0];
      if (!groups[date]) {
        groups[date] = { paidAt: inst.paid_at, totalAmount: 0, items: [] };
      }
      groups[date].totalAmount += inst.amount;
      groups[date].items.push(inst);
      return groups;
    }, {});

  const totalPaid = installments.filter(i => i.status === 'paid' || i.status === 'refund').reduce((sum, i) => sum + i.amount, 0);
  const totalPending = installments.filter(i => i.status === 'pending').reduce((sum, i) => sum + i.amount, 0);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Meus Pagamentos</h2>
        <p className="text-black/50">Fluxo financeiro, boletos e parcelamento de suas cotas</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-emerald-50 p-8 rounded-3xl border border-emerald-100 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Total Devidamente Pago</p>
          <p className="text-4xl font-black text-emerald-700 font-mono">
            {totalPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
        
        <div className="bg-amber-50 p-8 rounded-3xl border border-amber-100 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Total em Aberto</p>
          <p className="text-4xl font-black text-amber-700 font-mono">
            {totalPending.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
          </p>
        </div>
      </div>

      {Object.keys(paidGroups).length > 0 && (
        <div className="space-y-4">
          <h3 className="font-bold text-xl">Comprovantes Digitais</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.values(paidGroups).map((group: any, idx: number) => (
              <button 
                key={idx}
                type="button"
                onClick={() => downloadPaymentReceipt(group)}
                className="flex items-center justify-between p-6 bg-white rounded-3xl border border-black/5 shadow-sm hover:border-black/20 hover:shadow transition-all group cursor-pointer text-left w-full"
              >
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Parcelas quitadas em</p>
                  <p className="font-bold text-sm">{new Date(group.paidAt).toLocaleDateString('pt-BR')}</p>
                  <p className="text-xs text-emerald-600 font-medium mt-1 font-mono">{group.items.length} {group.items.length === 1 ? 'parcela' : 'parcelas'} no recibo</p>
                </div>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-all font-mono">
                  <FileText size={18} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-[40px] border border-black/5 shadow-sm overflow-hidden overflow-x-auto">
        <table className="w-full text-left min-w-[800px]">
          <thead className="bg-[#FAF9F5] border-b border-black/5 text-[10px] font-bold uppercase tracking-widest opacity-40">
            <tr>
              <th className="p-6">Produto Adquirido</th>
              <th className="p-6">Data de Vencimento</th>
              <th className="p-6">Valor da Parcela</th>
              <th className="p-6">Status Operacional</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5 font-mono text-xs">
            {installments.map((inst, idx) => {
              const overdue = inst.status === 'pending' && new Date(inst.due_date + 'T23:59:59') < new Date();
              return (
                <tr key={idx} className="hover:bg-black/5 transition-colors">
                  <td className="p-6">
                    <p className="font-bold font-sans text-sm text-black">{inst.productName}</p>
                    <p className="text-[10px] text-black/40 mt-0.5">Cotas no Grupo: {inst.quotaNumbers.map((n: string) => `#${n}`).join(', ')}</p>
                  </td>
                  <td className="p-6 text-sm text-black/75">
                    {new Date(inst.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                  </td>
                  <td className={cn(
                    "p-6 font-bold text-sm text-black",
                    inst.status === 'pending' ? "text-amber-600" : ""
                  )}>
                    {inst.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                  <td className="p-6">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider font-sans",
                      inst.status === 'paid' ? "bg-emerald-100 text-emerald-700" : 
                      inst.status === 'refund' ? "bg-red-100 text-red-700" :
                      overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {inst.status === 'paid' ? 'Pago' : inst.status === 'refund' ? 'Estornado' : overdue ? 'Em Atraso' : 'Pendente'}
                    </span>
                    {inst.paid_at && (
                      <p className="text-[10px] text-black/30 mt-1 font-sans">
                        {inst.status === 'refund' ? 'Estornado em ' : 'Sinalizado em '}
                        {new Date(inst.status === 'refund' ? inst.refunded_at : inst.paid_at).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </td>
                </tr>
              );
            })}
            {installments.length === 0 && (
              <tr>
                <td colSpan={4} className="p-20 text-center text-black/30 font-sans italic">Nenhuma parcela registrada no seu portfólio.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
