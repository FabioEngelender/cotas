import React, { useState, useEffect, useContext, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  doc, 
  getDoc, 
  getDocs, 
  writeBatch, 
  serverTimestamp, 
  runTransaction, 
  deleteField 
} from 'firebase/firestore';
import { Navigate } from 'react-router-dom';
import { Search, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { db } from '../firebase.js';
import AuthContext from '../contexts/AuthContext.js';
import { cn } from '../utils/cn.js';

export default function PaymentManagementPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'received'>('pending');
  const [pending, setPending] = useState<any[]>([]);
  const [received, setReceived] = useState<any[]>([]);
  const [showRefundModal, setShowRefundModal] = useState<string | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const { user, tenantId, syncUserInstallments } = useContext(AuthContext)!;
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<'date' | 'name'>('date');

  if (user?.role === 'client') return <Navigate to="/my-payments" />;

  useEffect(() => {
    if (!tenantId) return;
    const q = query(
      collection(db, 'tenants', tenantId, 'installments'), 
      where('status', '==', activeTab === 'pending' ? 'pending' : 'paid'),
      orderBy(activeTab === 'pending' ? 'due_date' : 'paid_at', activeTab === 'pending' ? 'asc' : 'desc'),
      limit(activeTab === 'received' ? 100 : 1000)
    );
    
    return onSnapshot(q, (snapshot) => {
      const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      if (activeTab === 'pending') {
        const groups: { [key: string]: any } = {};
        all.forEach((inst: any) => {
          const key = `${inst.owner_id}_${inst.due_date}`;
          if (!groups[key]) {
            groups[key] = {
              owner_id: inst.owner_id,
              owner_name: inst.owner_name || 'Desconhecido',
              owner_cpf: inst.owner_cpf || 'Não informado',
              due_date: inst.due_date,
              product_name: inst.product_name,
              amount: 0,
              quota_numbers: [],
              ids: []
            };
          }
          groups[key].amount += inst.amount;
          if (inst.quota_number && !groups[key].quota_numbers.includes(inst.quota_number)) {
            groups[key].quota_numbers.push(inst.quota_number);
          }
          groups[key].ids.push(inst.id);
        });

        setPending(Object.values(groups).sort((a: any, b: any) => 
          new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
        ));
      } else {
        setReceived(all);
      }
    });
  }, [tenantId, activeTab]);

  const handleRefundPayment = async () => {
    if (!tenantId || !showRefundModal || !refundReason.trim()) return;
    
    try {
      const originalDoc = await getDoc(doc(db, 'tenants', tenantId, 'installments', showRefundModal));
      if (!originalDoc.exists()) return;
      
      const originalData = originalDoc.data();
      const batch = writeBatch(db);
      const now = new Date().toISOString();

      // 1. Create Negative Reversal Entry (Linked to original)
      const reversalRef = doc(collection(db, 'tenants', tenantId, 'installments'));
      const reversalData = {
        ...originalData,
        amount: -originalData.amount,
        status: 'refund',
        original_payment_id: showRefundModal,
        refund_reason: refundReason,
        refunded_by: user.id,
        refunded_at: now,
        is_paid: false,
        createdAt: serverTimestamp()
      };
      // Delete ID if it leaked from original spread
      delete (reversalData as any).id;
      batch.set(reversalRef, reversalData);

      // 2. Re-open the debt (Create a new pending installment)
      const newPendingRef = doc(collection(db, 'tenants', tenantId, 'installments'));
      const newPendingData = {
        ...originalData,
        status: 'pending',
        paid_at: deleteField(),
        createdAt: serverTimestamp(),
        id: deleteField()
      };
      batch.set(newPendingRef, newPendingData);

      // 3. Mark the quota as not fully paid
      if (originalData.quota_id) {
        const qRef = doc(db, 'tenants', tenantId, 'quotas', originalData.quota_id);
        batch.update(qRef, { is_paid: false });
      }

      // 4. Audit Log
      const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
      batch.set(auditRef, {
        user_id: user?.id || 'Sistema',
        user_name: user?.name || 'Sistema',
        action: 'ESTORNAR_PAGAMENTO',
        details: `Estornou pagamento ID: ${showRefundModal}. Motivo: ${refundReason}`,
        created_at: serverTimestamp()
      });

      await batch.commit();
      
      alert('Estorno realizado com sucesso! O histórico foi preservado e o débito foi reaberto.');
      setShowRefundModal(null);
      setRefundReason('');
    } catch (err) {
      console.error(err);
      alert('Erro ao realizar estorno.');
    }
  };

  const handleMarkAsPaid = async (ids: string[]) => {
    if (!tenantId || isProcessing) return;
    
    setIsProcessing(true);
    try {
      const now = new Date().toISOString();
      let ownerId = '';
      const affectedQuotaIds = new Set<string>();
      
      // Step A: Pre-fetch affected installments to find quota_id mappings & do quota-installment queries safely
      const installmentDocsData: any[] = [];
      for (const id of ids) {
        const instDocRef = doc(db, 'tenants', tenantId, 'installments', id);
        const instDoc = await getDoc(instDocRef);
        if (instDoc.exists()) {
          const data = instDoc.data();
          installmentDocsData.push({ id, ...data });
          if (data.quota_id) affectedQuotaIds.add(data.quota_id);
          ownerId = data.owner_id;
        }
      }

      // Pre-fetch all installments for each affected quota
      const quotasInstallmentsMap: { [key: string]: any[] } = {};
      for (const qId of affectedQuotaIds) {
        const qRef = collection(db, 'tenants', tenantId, 'installments');
        const instSnap = await getDocs(query(qRef, where('quota_id', '==', qId)));
        quotasInstallmentsMap[qId] = instSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      // Step B: Run Firestore Transaction for atomic read/writes
      await runTransaction(db, async (transaction) => {
        // 1. Double check and read all installments being marked as paid
        for (const id of ids) {
          const instRef = doc(db, 'tenants', tenantId, 'installments', id);
          const instSnap = await transaction.get(instRef);
          if (instSnap.exists()) {
            const data = instSnap.data();
            if (data.status !== 'pending') {
              throw new Error(`A parcela número ${data.quota_number || id} já possui baixa registrada ou não está pendente.`);
            }
          }
        }

        // 2. Read Quotas to be updated
        const quotaRefsMap: { [key: string]: any } = {};
        for (const qId of affectedQuotaIds) {
          const qRef = doc(db, 'tenants', tenantId, 'quotas', qId);
          await transaction.get(qRef); // register read first
          quotaRefsMap[qId] = qRef;
        }

        // 3. Perform Writes inside Transaction
        for (const id of ids) {
          const instRef = doc(db, 'tenants', tenantId, 'installments', id);
          transaction.update(instRef, {
            status: 'paid',
            paid_at: now,
            paid_by: user?.email || user?.name || 'Sistema'
          });
        }

        // 4. Update quotas that are now fully paid
        for (const qId of affectedQuotaIds) {
          const qRef = quotaRefsMap[qId];
          const allInsts = quotasInstallmentsMap[qId] || [];
          
          // Remaining pending are installments that are currently pending in database and NOT in the ids we are paying
          const remainingPending = allInsts.filter(inst => 
            inst.status === 'pending' && !ids.includes(inst.id)
          );

          if (remainingPending.length === 0) {
            transaction.update(qRef, { is_paid: true });
          }
        }

        // 5. Add audit log inside transaction
        const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
        transaction.set(auditRef, {
          user_id: user?.id || 'Sistema',
          user_name: user?.name || 'Sistema',
          action: 'CONFIRMAR_PAGAMENTO',
          details: `Confirmou atomicamente o recebimento de ${ids.length} parcelas.`,
          created_at: serverTimestamp()
        });
      });

      // Sync installments for the owner after payment
      if (ownerId) {
        syncUserInstallments(tenantId, ownerId);
      }

      alert('Pagamentos confirmados com sucesso!');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao confirmar pagamentos');
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredPending = useMemo(() => {
    let result = [...pending];
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => 
        (item.owner_name && item.owner_name.toLowerCase().includes(q)) || 
        (item.owner_cpf && item.owner_cpf.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
      );
    }

    if (sortMode === 'name') {
      result.sort((a, b) => (a.owner_name || '').localeCompare(b.owner_name || ''));
    } else {
      result.sort((a, b) => {
        const dateA = new Date(a.due_date).getTime();
        const dateB = new Date(b.due_date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return (a.owner_name || '').localeCompare(b.owner_name || '');
      });
    }

    return result;
  }, [pending, searchQuery, sortMode]);

  const filteredReceived = useMemo(() => {
    let result = [...received];
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => 
        (item.owner_name && item.owner_name.toLowerCase().includes(q)) || 
        (item.owner_cpf && item.owner_cpf.replace(/\D/g, '').includes(q.replace(/\D/g, '')))
      );
    }
    
    return result;
  }, [received, searchQuery]);

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Gestão de Pagamentos</h2>
          <p className="text-black/50">Dar baixa manual, verificar históricos ou emitir estornos operacionais</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 opacity-30" size={18} />
            <input 
              type="text"
              placeholder="Buscar por nome ou CPF..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-black/5 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-black/10 transition-all font-sans text-black"
            />
          </div>
          <div className="flex bg-black/5 p-1 rounded-2xl shrink-0">
            <button 
              onClick={() => setActiveTab('pending')}
              className={cn(
                "px-6 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                activeTab === 'pending' ? "bg-white text-black shadow-sm" : "text-black/40 hover:text-black"
              )}
            >
              Pendentes
            </button>
            <button 
              onClick={() => setActiveTab('received')}
              className={cn(
                "px-6 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer",
                activeTab === 'received' ? "bg-white text-black shadow-sm" : "text-black/40 hover:text-black"
              )}
            >
              Histórico / Recebidos
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'pending' ? (
        <div className="bg-white rounded-[40px] border border-black/5 shadow-sm overflow-hidden overflow-x-auto">
          <div className="p-6 border-b border-black/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 min-w-[1000px]">
            <div>
              <h3 className="font-bold text-lg">Parcelas Pendentes (Agrupadas)</h3>
              <p className="text-xs text-black/40">Visualizando {filteredPending.length} grupos correspondentes encontrados</p>
            </div>
            
            <div className="flex items-center gap-2 bg-black/5 p-1 rounded-xl">
              <button 
                onClick={() => setSortMode('date')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer",
                  sortMode === 'date' ? "bg-white text-black shadow-sm" : "text-black/40"
                )}
              >
                Por Vencimento
              </button>
              <button 
                onClick={() => setSortMode('name')}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer",
                  sortMode === 'name' ? "bg-white text-black shadow-sm" : "text-black/40"
                )}
              >
                Ordem Alfabética
              </button>
            </div>
          </div>
          <table className="w-full text-left min-w-[1000px]">
            <thead className="bg-[#FAF9F5] border-b border-black/5 text-[10px] font-bold uppercase tracking-widest opacity-40">
              <tr>
                <th className="p-6">Cliente</th>
                <th className="p-6">CPF</th>
                <th className="p-6">Ativo / Parcelas</th>
                <th className="p-6">Vencimento</th>
                <th className="p-6">Valor Total</th>
                <th className="p-6 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 font-mono text-xs">
              {filteredPending.map((group, idx) => {
                const isOverdue = new Date(group.due_date + 'T23:59:59') < new Date();
                return (
                  <tr key={idx} className="hover:bg-black/5 transition-colors">
                    <td className="p-6 text-sm font-bold font-sans text-black">{group.owner_name}</td>
                    <td className="p-6 text-sm text-black">{group.owner_cpf}</td>
                    <td className="p-6 font-sans">
                      <p className="text-sm font-medium text-black">{group.product_name}</p>
                      <p className="text-[10px] text-black/40 mt-0.5">Cota(s): {group.quota_numbers.join(', ')}</p>
                    </td>
                    <td className={cn(
                      "p-6 text-sm text-black",
                      isOverdue ? "text-red-600 font-bold" : ""
                    )}>
                      {new Date(group.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-6 font-bold text-emerald-600 text-sm">
                      {group.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="p-6 text-right">
                      <button 
                        onClick={() => handleMarkAsPaid(group.ids)}
                        disabled={isProcessing}
                        className="px-5 py-2.5 bg-black text-white rounded-xl text-xs font-bold hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100 cursor-pointer"
                      >
                        {isProcessing ? 'Gravando...' : 'Baixa Manual'}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredPending.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-20 text-center text-black/30 font-sans italic">Não existem parcelas pendentes no fluxo de cobrança.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="bg-white rounded-[40px] border border-black/5 shadow-sm overflow-hidden overflow-x-auto">
          <div className="p-6 border-b border-black/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 min-w-[1000px]">
            <h3 className="font-bold text-lg">Histórico Geral de Recebimentos</h3>
            <p className="text-xs text-black/40">Visualizando os últimos {filteredReceived.length} lançamentos processados</p>
          </div>
          <table className="w-full text-left min-w-[1000px]">
            <thead className="bg-[#FAF9F5] border-b border-black/5 text-[10px] font-bold uppercase tracking-widest opacity-40">
              <tr>
                <th className="p-6">Cliente</th>
                <th className="p-6">Ativo/Cota</th>
                <th className="p-6">Liquidado em</th>
                <th className="p-6">Valor</th>
                <th className="p-6 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5 font-mono text-xs">
              {filteredReceived.map((inst, idx) => (
                <tr key={idx} className="hover:bg-black/5 transition-colors">
                  <td className="p-6 font-sans">
                    <p className="font-bold text-sm text-black">{inst.owner_name}</p>
                    <p className="text-[10px] opacity-40 font-mono mt-0.5">{inst.owner_cpf}</p>
                  </td>
                  <td className="p-6 font-sans">
                    <p className="text-sm font-medium text-black">{inst.product_name}</p>
                    <p className="text-[10px] text-black/40 mt-0.5">Cota única: #{inst.quota_number}</p>
                  </td>
                  <td className="p-6 text-black/75">
                    {inst.paid_at ? new Date(inst.paid_at).toLocaleString('pt-BR') : '-'}
                  </td>
                  <td className="p-6 text-sm">
                    <p className={cn("font-bold", inst.status === 'refund' ? "text-red-500" : "text-emerald-600")}>
                      {inst.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                    {inst.status === 'refund' && <span className="text-[9px] font-bold uppercase text-red-500 font-sans tracking-wide">Estornado</span>}
                  </td>
                  <td className="p-6 text-right font-sans">
                    {inst.status === 'paid' && !inst.is_refunded && (
                      <button 
                        onClick={() => setShowRefundModal(inst.id)}
                        className="px-4 py-2 bg-red-50 text-red-600 rounded-xl text-xs font-bold hover:bg-red-100 transition-all cursor-pointer"
                      >
                        Estornar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredReceived.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-20 text-center text-black/30 font-sans italic">Nenhum recebimento sob este filtro de pesquisa.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Refund Modal */}
      <AnimatePresence>
        {showRefundModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRefundModal(null)} 
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-[95%] sm:w-full max-w-md bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-2xl space-y-6 overflow-y-auto max-h-[90vh]"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
                  <Shield size={32} />
                </div>
                <h3 className="text-2xl font-bold">Estornar Liquidação</h3>
                <p className="text-black/50 text-sm">Esta ação criará um lançamento de anulação negativo e reabrirá as pendências do cliente de forma automática para fins de controle e auditoria.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Motivo do Estorno (Obrigatório)</label>
                  <textarea 
                    value={refundReason}
                    onChange={e => setRefundReason(e.target.value)}
                    className="w-full p-4 bg-black/5 rounded-2xl border border-black/5 focus:bg-white focus:ring-2 focus:ring-red-500 outline-none transition-all h-24 text-black text-sm"
                    placeholder="Descreva detalhadamente o motivo que justifica o estorno..."
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-4 pt-2">
                  <button 
                    onClick={() => setShowRefundModal(null)}
                    type="button"
                    className="flex-1 py-4 bg-black/5 rounded-2xl font-bold hover:bg-black/10 transition-all text-sm cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button 
                    onClick={handleRefundPayment}
                    disabled={!refundReason.trim()}
                    className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-bold hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all shadow-lg text-sm cursor-pointer shadow-red-600/20"
                  >
                    Executar Estorno
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
