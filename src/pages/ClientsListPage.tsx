import React, { useState, useEffect, useContext } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  where, 
  getDocs, 
  getDoc, 
  doc, 
  setDoc, 
  updateDoc, 
  serverTimestamp, 
  writeBatch, 
  limit 
} from 'firebase/firestore';
import { jsPDF } from 'jspdf';
import { X, Share, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { db } from '../firebase.js';
import AuthContext from '../contexts/AuthContext.js';
import { cn } from '../utils/cn.js';
import { validateCPF } from '../utils/validators.js';
import { maskCPF } from '../utils/masks.js';
import { Role, User } from '../types.js';

export default function ClientsListPage() {
  const [clients, setClients] = useState<User[]>([]);
  const [overdueUserIds, setOverdueUserIds] = useState<Set<string>>(new Set());
  const [selectedUserDetails, setSelectedUserDetails] = useState<any>(null);
  const [termContent, setTermContent] = useState('');
  const { user, tenantId, syncUserInstallments } = useContext(AuthContext)!;

  const fetchUsers = () => {
    if (!tenantId) return;
    const q = query(collection(db, 'tenants', tenantId, 'users'));
    return onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      setClients(usersData);
    });
  };

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, 'tenants', tenantId, 'installments'), where('status', '==', 'pending'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const overdue = new Set<string>();
      const todayStr = new Date().toISOString().split('T')[0];
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.due_date < todayStr && data.owner_id) {
          overdue.add(data.owner_id);
        }
      });
      setOverdueUserIds(overdue);
    });
    return () => unsubscribe();
  }, [tenantId]);

  useEffect(() => {
    const unsubscribe = fetchUsers();
    
    if (tenantId) {
      const termsRef = collection(db, 'tenants', tenantId, 'terms');
      const termsQuery = query(termsRef, where('is_active', '==', true), limit(1));
      getDocs(termsQuery).then(snapshot => {
        if (!snapshot.empty) {
          setTermContent(snapshot.docs[0].data().content);
        } else {
          setTermContent('Termos padrão do sistema...');
        }
      });
    }

    return () => unsubscribe && unsubscribe();
  }, [tenantId]);

  const downloadClientTerm = (client: User, products: any[]) => {
    if (!client.signed_term_at) return alert('Este cliente ainda não assinou o termo.');
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let cursorY = 20;

    // 1. Term Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("TERMO DE CIENTIFICAÇÃO E ADESÃO AO BOLÃO", pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 10;

    // 2. Term Content
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const splitTerm = doc.splitTextToSize(termContent, pageWidth - (margin * 2));
    
    for (let i = 0; i < splitTerm.length; i++) {
      if (cursorY > pageHeight - 30) {
        doc.addPage();
        cursorY = 20;
      }
      doc.text(splitTerm[i], margin, cursorY);
      cursorY += 5;
    }

    cursorY += 10;
    if (cursorY > pageHeight - 80) {
      doc.addPage();
      cursorY = 20;
    }

    // 3. Signature & Details Section
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 10;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("ASSINATURA ELETRÔNICA E DETALHES", margin, cursorY);
    cursorY += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Participante: ${client.name}`, margin, cursorY);
    cursorY += 7;
    doc.text(`CPF: ${client.cpf || 'Não informado'}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Data do Aceite: ${new Date(client.signed_term_at).toLocaleString('pt-BR')}`, margin, cursorY);
    cursorY += 12;
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Resumo de Aquisições e Condições:", margin, cursorY);
    cursorY += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    products.forEach((p: any) => {
      if (cursorY > pageHeight - 40) {
        doc.addPage();
        cursorY = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.text(`Produto: ${p.name}`, margin, cursorY);
      cursorY += 5;
      doc.setFont("helvetica", "normal");
      
      const numbers = Array.isArray(p.quotaNumbers) 
        ? p.quotaNumbers.map((n: string) => `#${n}`).join(', ') 
        : (p.quotaNumbers ? p.quotaNumbers.split(',').map((n: string) => `#${n}`).join(', ') : '');
      
      const quotasText = `Cotas: ${numbers}`;
      const splitQuotas = doc.splitTextToSize(quotasText, pageWidth - (margin * 2));
      doc.text(splitQuotas, margin, cursorY);
      cursorY += (splitQuotas.length * 5) + 2;

      let conditionText = '';
      if (p.payment_type === 'recurrent') {
        conditionText = `Condição: Cobrança Recorrente Mensal de ${p.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / mês`;
      } else if (p.installmentCount > 1) {
        conditionText = `Condição: Parcelado em ${p.installmentCount}x de ${(p.totalValue / p.installmentCount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (Total: ${p.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`;
      } else {
        conditionText = `Condição: Pagamento à Vista no valor de ${p.totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`;
      }
      doc.text(conditionText, margin, cursorY);
      cursorY += 10;
    });

    if (cursorY > pageHeight - 20) {
      doc.addPage();
      cursorY = 20;
    }
    
    cursorY += 5;
    doc.setFontSize(9);
    doc.text(`Autenticação Digital ID: ${client.id}-${new Date(client.signed_term_at).getTime()}`, margin, cursorY);
    
    doc.save(`termo_assinado_${client.name.replace(/\s+/g, '_').toLowerCase()}.pdf`);
  };

  const fetchUserDetails = async (id: string) => {
    if (!tenantId) return;
    try {
      // Sync installments for this user before fetching details
      await syncUserInstallments(tenantId, id);

      const userDoc = await getDoc(doc(db, 'tenants', tenantId, 'users', id));
      if (userDoc.exists()) {
        const userData = { id: userDoc.id, ...userDoc.data() };
        
        const quotasRef = collection(db, 'tenants', tenantId, 'quotas');
        const quotasSnap = await getDocs(query(quotasRef, where('owner_id', '==', id)));
        const quotas = quotasSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
        const installmentsSnap = await getDocs(query(installmentsRef, where('owner_id', '==', id)));
        const installments = installmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const productsSnap = await getDocs(collection(db, 'tenants', tenantId, 'products'));
        const allProducts = Object.fromEntries(productsSnap.docs.map(d => [d.id, d.data()]));

        // Group quotas by product
        const productGroups: { [key: string]: any } = {};
        for (const q of quotas as any[]) {
          if (!productGroups[q.product_id]) {
            const pData = allProducts[q.product_id];
            productGroups[q.product_id] = {
              name: pData?.name || q.product_name || 'Produto',
              payment_type: pData?.payment_type || 'cash',
              quotaCount: 0,
              quotaNumbers: [],
              pendingValue: 0,
              totalValue: 0,
              installmentCount: 0
            };
          }
          productGroups[q.product_id].quotaCount++;
          productGroups[q.product_id].quotaNumbers.push(q.number);
          productGroups[q.product_id].totalValue += (q.price || 0);
        }

        // Add installment count and pending values from installments
        installments.forEach((inst: any) => {
          if (productGroups[inst.product_id]) {
            // Find max installments per quota
            const qInstCount = installments.filter((i: any) => i.quota_id === inst.quota_id).length;
            productGroups[inst.product_id].installmentCount = Math.max(
              productGroups[inst.product_id].installmentCount,
              qInstCount
            );
            
            if (inst.status === 'pending') {
              productGroups[inst.product_id].pendingValue += inst.amount;
            }
          }
        });

        setSelectedUserDetails({ 
          user: userData, 
          quotas, 
          installments,
          products: Object.values(productGroups)
        });
      }
    } catch (err) {
      console.error(err);
    }
  };



  const deleteUser = async (id: string) => {
    if (!tenantId) return;
    if (!confirm('Tem certeza que deseja excluir este usuário? Todos os seus pagamentos pendentes e compras vinculadas serão cancelados.')) return;
    try {
      const batch = writeBatch(db);

      // 1. Mark quotas as defaulted (legal requirement: don't automatically back to available)
      const quotasRef = collection(db, 'tenants', tenantId, 'quotas');
      const qQuotas = query(quotasRef, where('owner_id', '==', id));
      const qSnapshot = await getDocs(qQuotas);
      
      for (const qDoc of qSnapshot.docs) {
        batch.update(qDoc.ref, {
          status: 'defaulted'
          // We keep owner info (owner_name, owner_cpf) for legal audit trail
        });
      }
      
      // 2. Delete pending installments for this user
      const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
      const qInst = query(installmentsRef, where('owner_id', '==', id), where('status', '==', 'pending'));
      const instSnapshot = await getDocs(qInst);
      for (const iDoc of instSnapshot.docs) {
        batch.delete(iDoc.ref);
      }

      // 3. Delete user doc
      batch.delete(doc(db, 'tenants', tenantId, 'users', id));
      
      // 4. Log audit
      const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
      batch.set(auditRef, {
        user_id: user?.id || 'Sistema',
        user_name: user?.name || 'Sistema',
        action: 'EXCLUIR_USUARIO',
        details: `Excluiu o usuário ID: ${id} e limpou dados vinculados.`,
        created_at: serverTimestamp()
      });

      await batch.commit();
      alert('Usuário e seus dados pendentes foram excluídos com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir usuário');
    }
  };

  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);

  const handleGenerateSecureClientInvite = async () => {
    if (!tenantId) return;
    setIsGeneratingInvite(true);
    try {
      const invitesRef = collection(db, 'tenants', tenantId, 'invites');
      const inviteDoc = doc(invitesRef);
      const inviteId = inviteDoc.id;

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await setDoc(inviteDoc, {
        id: inviteId,
        tenant_id: tenantId,
        role: 'client',
        expires_at: expiresAt.toISOString(),
        used_at: null,
        used_by: null,
        created_at: serverTimestamp(),
        created_by: user?.id || 'Sistema'
      });

      const inviteLink = `${window.location.origin}/register-client/${tenantId}/${inviteId}`;
      await navigator.clipboard.writeText(inviteLink);
      alert('Convite de investidor de uso único (válido por 7 dias) gerado e copiado para a área de transferência!');
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar convite seguro.');
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const sortedClients = [...clients].sort((a, b) => {
    // Prioritize overdue payments
    const aOverdue = a.has_overdue_payments || overdueUserIds.has(a.id);
    const bOverdue = b.has_overdue_payments || overdueUserIds.has(b.id);
    
    if (aOverdue !== bOverdue) {
      return aOverdue ? -1 : 1;
    }
    const roleOrder: Record<string, number> = { admin: 1, manager: 2, client: 3 };
    if (roleOrder[a.role] !== roleOrder[b.role]) {
      return roleOrder[a.role] - roleOrder[b.role];
    }
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <header>
          <h2 className="text-3xl font-bold tracking-tight">Clientes e Usuários</h2>
          <p className="text-black/50">Base de investidores, gerentes e administradores do portal</p>
        </header>
        <div className="flex gap-3">
          <button 
            disabled={isGeneratingInvite}
            onClick={handleGenerateSecureClientInvite}
            className="flex items-center gap-2 px-6 py-3 bg-black/5 text-black rounded-2xl font-bold hover:bg-black/10 hover:scale-[1.02] active:scale-[0.98] transition-all text-sm cursor-pointer border-none"
          >
            <Share size={18} /> {isGeneratingInvite ? 'Gerando...' : 'Gerar Convite de Cliente'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-black/5 shadow-sm overflow-x-auto">
        <table className="w-full text-left min-w-[800px]">
          <thead className="bg-[#FAF9F5] border-b border-black/5 text-[10px] font-bold uppercase tracking-widest opacity-50">
            <tr>
              <th className="p-6">Nome</th>
              <th className="p-6">E-mail</th>
              <th className="p-6">Status Termo</th>
              <th className="p-6">Status Pagamento</th>
              <th className="p-6">Nível</th>
              <th className="p-6">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/5">
            {sortedClients.map(client => {
              const overdue = client.has_overdue_payments || overdueUserIds.has(client.id);
              return (
                <tr key={client.id} className="hover:bg-black/5 transition-colors">
                  <td className="p-6 font-semibold">{client.name}</td>
                  <td className="p-6 text-black/50 text-sm font-mono">{client.email}</td>
                  <td className="p-6">
                    {client.role === 'client' ? (
                      client.signed_term_at ? (
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-full text-[10px] font-bold uppercase">Assinado</span>
                      ) : (
                        <span className="px-3 py-1 bg-red-500/10 text-red-600 rounded-full text-[10px] font-bold uppercase">Pendente</span>
                      )
                    ) : (
                      <span className="text-black/20">-</span>
                    )}
                  </td>
                  <td className="p-6">
                    {client.role === 'client' ? (
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2.5 h-2.5 rounded-full",
                          overdue ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                        )} />
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-widest",
                          overdue ? "text-red-600" : "text-emerald-600"
                        )}>
                          {overdue ? 'EM ATRASO' : 'Em dia'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-black/20">-</span>
                    )}
                  </td>
                  <td className="p-6">
                    <span className="px-3 py-1 bg-black/5 text-black/50 rounded-full text-[10px] font-bold uppercase">
                      {client.role === 'admin' ? 'Admin' : client.role === 'manager' ? 'Gerente' : 'Cliente'}
                    </span>
                  </td>
                  <td className="p-6 flex gap-4 text-xs font-bold font-mono">
                    <button 
                      onClick={() => fetchUserDetails(client.id)}
                      className="hover:underline hover:text-indigo-600 cursor-pointer"
                    >
                      Ver Detalhes
                    </button>
                    {user?.role === 'admin' && client.id !== user.id && (
                      <button 
                        onClick={() => deleteUser(client.id)}
                        className="text-red-500 hover:underline cursor-pointer"
                      >
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* User Details Modal */}
      <AnimatePresence>
        {selectedUserDetails && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUserDetails(null)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-[95%] sm:w-full max-w-2xl bg-white rounded-[32px] sm:rounded-[40px] shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <div className="p-6 sm:p-10 space-y-8">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-3xl font-bold tracking-tight">{selectedUserDetails.user.name}</h3>
                    <p className="text-black/50">{selectedUserDetails.user.email}</p>
                  </div>
                  <button onClick={() => setSelectedUserDetails(null)} className="p-2 hover:bg-black/5 rounded-full cursor-pointer">
                    <X size={24} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-6 bg-black/5 p-6 rounded-3xl">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">CPF</p>
                    <p className="font-semibold text-sm">{selectedUserDetails.user.cpf || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Telefone</p>
                    <p className="font-semibold text-sm">{selectedUserDetails.user.phone || '-'}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Endereço Completo</p>
                    <p className="font-semibold text-sm">
                      {selectedUserDetails.user.address || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Chave PIX</p>
                    <p className="font-semibold text-sm">{selectedUserDetails.user.pix_key || '-'}</p>
                  </div>
                </div>

                {selectedUserDetails.user.signed_term_at && (
                  <div className="pt-4 border-t border-black/5">
                    <button 
                      onClick={() => downloadClientTerm(selectedUserDetails.user, selectedUserDetails.products)}
                      className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all cursor-pointer text-sm"
                    >
                      <FileText size={18} /> Baixar Termo de Adesão Assinado
                    </button>
                  </div>
                )}

                <div className="space-y-4">
                  <h4 className="font-bold text-lg">Produtos Adquiridos</h4>
                  <div className="bg-black/5 rounded-2xl overflow-hidden border border-black/5">
                    <table className="w-full text-left">
                      <thead className="bg-[#FAF9F5] border-b border-black/5 text-[10px] font-bold uppercase tracking-widest opacity-40">
                        <tr>
                          <th className="p-4">Produto</th>
                          <th className="p-4">Cotas Adquiridas</th>
                          <th className="p-4 text-right">Saldo Pendente</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5 font-mono text-xs">
                        {selectedUserDetails.products.map((p: any, i: number) => (
                          <tr key={i} className="hover:bg-black/5 transition-colors">
                            <td className="p-4 font-bold font-sans">{p.name}</td>
                            <td className="p-4 font-bold">{p.quotaCount} {p.quotaCount === 1 ? 'cota' : 'cotas'} ({p.quotaNumbers.map((n: string) => `#${n}`).join(', ')})</td>
                            <td className="p-4 font-bold text-red-500 text-right">
                              {(p.pendingValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </td>
                          </tr>
                        ))}
                        {selectedUserDetails.products.length === 0 && (
                          <tr>
                            <td colSpan={3} className="p-8 text-center text-black/30 italic font-sans">Nenhum produto adquirido sob este CPF ainda.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
