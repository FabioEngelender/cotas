import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  doc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  updateDoc, 
  deleteField, 
  writeBatch, 
  getDocs, 
  serverTimestamp, 
  setDoc, 
  runTransaction, 
  addDoc, 
  deleteDoc, 
  increment 
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Check, 
  Download, 
  History, 
  ImagePlus, 
  Info, 
  Lock, 
  MessageSquare, 
  Package, 
  RefreshCw, 
  Shield, 
  Trash2, 
  X 
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

import { db } from '../firebase.js';
import AuthContext from '../contexts/AuthContext.js';
import { financialService } from '../services/financialService.js';
import { Product, Quota, User, OwnershipHistory } from '../types.js';
import { cn } from '../utils/cn.js';

// Helper hashing utility
const computeHash = async (message: string) => {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

// Top-level appendAuditLog helper
const appendAuditLog = async (
  tenantId: string,
  userId: string,
  userName: string,
  action: string,
  entityType: string,
  entityId: string,
  details: string,
  oldValues?: any,
  newValues?: any
) => {
  try {
    const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
    await setDoc(auditRef, {
      user_id: userId || 'Sistema',
      user_name: userName || 'Sistema',
      action,
      entity_type: entityType,
      entity_id: entityId,
      details,
      old_values: oldValues || null,
      new_values: newValues || null,
      created_at: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to append audit log:", err);
  }
};

export default function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [selectedQuotas, setSelectedQuotas] = useState<string[]>([]);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [installmentCount, setInstallmentCount] = useState(1);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termContent, setTermContent] = useState('');
  const [activeTermObj, setActiveTermObj] = useState<any>(null);
  const [managers, setManagers] = useState<User[]>([]);
  const { user, tenantId } = React.useContext(AuthContext)!;
  const navigate = useNavigate();

  const getSubdivisionMetrics = () => {
    const parentChildrenMap: { [parentId: string]: number } = {};
    quotas.forEach(q => {
      if (q.parent_id) {
        parentChildrenMap[q.parent_id] = (parentChildrenMap[q.parent_id] || 0) + 1;
      }
    });

    let totalWeight = 0;
    let availableWeight = 0;
    let soldWeight = 0;

    quotas.forEach(q => {
      if (q.status === 'grouped') {
        return;
      }
      let weight = 1;
      if (q.parent_id) {
        const totalFractions = parentChildrenMap[q.parent_id] || 1;
        weight = 1 / totalFractions;
      }
      totalWeight += weight;
      if (q.status === 'available') {
        availableWeight += weight;
      } else if (q.status === 'sold' || q.status === 'defaulted') {
        soldWeight += weight;
      }
    });

    return {
      total: totalWeight,
      available: availableWeight,
      sold: soldWeight
    };
  };

  const formatWeight = (val: number) => {
    const rounded = Math.round(val * 1000) / 1000;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-4) {
      return Math.round(rounded).toString();
    }
    return rounded.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  };

  const getDynamicInstallmentCount = () => {
    if (!product || !product.expiration_month) return 0;
    const expDate = new Date(product.expiration_month + 'T12:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    if (product.payment_type === 'cash') {
      return expDate >= now ? 1 : 0;
    }
    
    const dueDay = expDate.getDate();
    let count = 0;
    for (let i = 0; i < 24; i++) {
      const year = now.getFullYear();
      const month = now.getMonth() + i;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const actualDay = Math.min(dueDay, lastDay);
      const d = new Date(year, month, actualDay, 12, 0, 0);
      
      if (d < now) continue;
      if (d > expDate) break;
      
      if (count === 0) {
        const diffTime = d.getTime() - now.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);
        if (diffDays < 30) continue;
      }
      
      count++;
      if (count >= 12) break;
    }
    
    return count;
  };

  const getInstallmentDates = (count: number) => {
    if (!product || !product.expiration_month) return [];
    if (product.payment_type === 'cash') {
      const now = new Date();
      now.setHours(12, 0, 0, 0);
      return [now];
    }
    
    const expDate = new Date(product.expiration_month + 'T12:00:00');
    const dueDay = expDate.getDate();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const dates: Date[] = [];
    for (let i = 0; i < 24; i++) {
      const year = now.getFullYear();
      const month = now.getMonth() + i;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const actualDay = Math.min(dueDay, lastDay);
      const d = new Date(year, month, actualDay, 12, 0, 0);
      
      if (d < now) continue;
      if (d > expDate) break;
      
      if (dates.length === 0) {
        const diffDays = (d.getTime() - now.getTime()) / (1000 * 3600 * 24);
        if (diffDays < 30) continue;
      }
      
      dates.push(d);
      if (dates.length >= count) break;
    }
    return dates;
  };

  const dynamicInstallmentCount = getDynamicInstallmentCount();

  useEffect(() => {
    if (!product || purchaseSuccess) return;
    
    if (product.payment_type === 'recurrent') {
      setInstallmentCount(dynamicInstallmentCount);
    } else {
      setInstallmentCount(1);
    }
  }, [product?.id, dynamicInstallmentCount, purchaseSuccess]);

  useEffect(() => {
    if (!id || !tenantId) return;

    // Fetch product detail
    const productRef = doc(db, 'tenants', tenantId, 'products', id);
    const unsubscribeProduct = onSnapshot(productRef, (doc) => {
      if (doc.exists()) {
        setProduct({ id: doc.id, ...doc.data() } as Product);
      }
    });

    // Fetch quotas
    const quotasRef = collection(db, 'tenants', tenantId, 'quotas');
    const q = query(quotasRef, where('product_id', '==', id), orderBy('number', 'asc'));
    const unsubscribeQuotas = onSnapshot(q, (snapshot) => {
      const quotasData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quota));
      
      // Auto-release expired reservations (older than 10 mins)
      const nowMs = Date.now();
      quotasData.forEach(async (quota) => {
        if (quota.status === 'reserved' && quota.reserved_at) {
          const reservedTime = new Date(quota.reserved_at).getTime();
          if (nowMs - reservedTime > 10 * 60 * 1000) {
            try {
              const eqRef = doc(db, 'tenants', tenantId, 'quotas', quota.id);
              await updateDoc(eqRef, {
                status: 'available',
                reserved_by: deleteField(),
                reserved_at: deleteField()
              });
              await appendAuditLog(
                tenantId,
                'Sistema',
                'Sistema',
                'LIBERACAO_RESERVA_EXPIRADA',
                'Quota',
                quota.id,
                `Reserva expirada para a cota #${quota.number} (timeout de 10 min)`,
                { status: 'reserved', reserved_at: quota.reserved_at },
                { status: 'available' }
              );
            } catch (err) {
              console.error("Failed to release expired quota reservation:", err);
            }
          }
        }
      });

      // Prioritize integers (no parent_id) before fractions, then natural sort
      quotasData.sort((a, b) => {
        const isFractionA = !!a.parent_id;
        const isFractionB = !!b.parent_id;
        if (isFractionA !== isFractionB) return isFractionA ? 1 : -1;
        return (String(a.number) || '').localeCompare(String(b.number) || '', undefined, { numeric: true, sensitivity: 'base' });
      });
      setQuotas(quotasData);
    });

    // Fetch terms
    const termsRef = collection(db, 'tenants', tenantId, 'terms');
    const termsQuery = query(termsRef, where('is_active', '==', true), limit(1));
    const unsubscribeTerms = onSnapshot(termsQuery, (snapshot) => {
      if (!snapshot.empty) {
        const docData = snapshot.docs[0].data();
        setTermContent(docData.content);
        setActiveTermObj({ id: snapshot.docs[0].id, ...docData });
      } else {
        setTermContent('Termos padrão do sistema...');
        setActiveTermObj(null);
      }
    });

    // Fetch managers for chat
    const managersRef = collection(db, 'tenants', tenantId, 'users');
    const managersQuery = query(managersRef, where('role', 'in', ['admin', 'manager']));
    const unsubscribeManagers = onSnapshot(managersQuery, (snapshot) => {
      setManagers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    });

    return () => {
      unsubscribeProduct();
      unsubscribeQuotas();
      unsubscribeTerms();
      unsubscribeManagers();
    };
  }, [id, tenantId]);

  const [publishingDraft, setPublishingDraft] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);

  const handlePublishDraft = async () => {
    if (!product || !tenantId) return;
    if (product.status !== 'draft') return;
    
    if (!confirm('Deseja realmente publicar este rascunho? Uma vez ativo, as cotas serão geradas de forma definitiva na base e as variáveis constitutivas (preço, quantidade) serão bloqueadas para edição.')) {
      return;
    }

    setPublishingDraft(true);
    setPublishProgress(0);

    try {
      const productRef = doc(db, 'tenants', tenantId, 'products', product.id);
      const totalQuotas = Number(product.total_quotas);
      const quotaPrice = Number(product.quota_price);

      // 1. Create quotas in database in batches
      const quotasRef = collection(db, 'tenants', tenantId, 'quotas');
      const batchSize = 500;
      const numBatches = Math.ceil(totalQuotas / batchSize);

      for (let b = 0; b < numBatches; b++) {
        const batch = writeBatch(db);
        const start = b * batchSize + 1;
        const end = Math.min((b + 1) * batchSize, totalQuotas);

        for (let i = start; i <= end; i++) {
          const quotaRef = doc(quotasRef);
          batch.set(quotaRef, {
            product_id: product.id,
            number: i.toString().padStart(4, '0'),
            status: 'available',
            price: quotaPrice,
            created_at: new Date().toISOString()
          });
        }
        
        await batch.commit();
        setPublishProgress(Math.round((end / totalQuotas) * 100));
      }

      // 2. Set product status as active
      await updateDoc(productRef, {
        status: 'active'
      });

      // Audit Log
      const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
      await setDoc(auditRef, {
        user_id: user?.id || 'Sistema',
        user_name: user?.name || 'Sistema',
        action: 'PUBLICAR_PRODUTO',
        details: `Publicou o rascunho de produto ${product.name} ativando ${totalQuotas} cotas`,
        created_at: serverTimestamp()
      });

      alert('Produto publicado com sucesso! Suas cotas estão agora prontas e disponíveis para aquisição.');
    } catch (err) {
      console.error(err);
      alert('Erro ao publicar rascunho.');
    } finally {
      setPublishingDraft(false);
      setPublishProgress(0);
    }
  };

  const [isPurchasing, setIsPurchasing] = useState(false);
  const [showCancellationModal, setShowCancellationModal] = useState<string | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationData, setCancellationData] = useState<any>(null);
  const [manualRefundValue, setManualRefundValue] = useState<number>(0);
  const [cancellationProofUrl, setCancellationProofUrl] = useState('');
  const [isProcessingCancellation, setIsProcessingCancellation] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [isClosingProduct, setIsClosingProduct] = useState(false);
  const [forceCloseChecked, setForceCloseChecked] = useState(false);
  const [closeMetrics, setCloseMetrics] = useState<{
    pendingInstallmentsCount: number;
    pendingAmount: number;
    availableQuotasCount: number;
    soldQuotasCount: number;
    unpaidQuotasCount: number;
    delinquents: string[];
    loading: boolean;
  }>({
    pendingInstallmentsCount: 0,
    pendingAmount: 0,
    availableQuotasCount: 0,
    soldQuotasCount: 0,
    unpaidQuotasCount: 0,
    delinquents: [],
    loading: false
  });

  useEffect(() => {
    if (!showCloseModal || !id || !tenantId) return;
    
    setCloseMetrics(prev => ({ ...prev, loading: true }));
    const fetchCloseMetrics = async () => {
      try {
        const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
        const qInst = query(installmentsRef, where('product_id', '==', id));
        const instSnap = await getDocs(qInst);
        
        const allInsts = instSnap.docs.map(d => d.data());
        const pendingInsts = allInsts.filter(i => i.status === 'pending');
        const pendingSum = pendingInsts.reduce((acc, i) => acc + (Number(i.amount) || 0), 0);
        
        const availQ = quotas.filter(q => q.status === 'available');
        const soldQ = quotas.filter(q => q.status === 'sold' || q.status === 'defaulted');
        const unpaidQ = soldQ.filter(q => !q.is_paid);

        const uniqueDelinquents = Array.from(new Set(pendingInsts.map(i => i.owner_name))).filter(Boolean) as string[];

        setCloseMetrics({
          pendingInstallmentsCount: pendingInsts.length,
          pendingAmount: pendingSum,
          availableQuotasCount: availQ.length,
          soldQuotasCount: soldQ.length,
          unpaidQuotasCount: unpaidQ.length,
          delinquents: uniqueDelinquents,
          loading: false
        });
      } catch (err) {
        console.error(err);
        setCloseMetrics(prev => ({ ...prev, loading: false }));
      }
    };

    fetchCloseMetrics();
  }, [showCloseModal, id, tenantId, quotas]);

  const [showQuotaMenu, setShowQuotaMenu] = useState<string | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<string | null>(null);
  const [quotaHistory, setQuotaHistory] = useState<OwnershipHistory[]>([]);
  const [clients, setClients] = useState<User[]>([]);
  const [searchClient, setSearchClient] = useState('');

  useEffect(() => {
    if (!tenantId || user?.role === 'client') return;
    const clientsRef = collection(db, 'tenants', tenantId, 'users');
    const q = query(clientsRef, where('role', '==', 'client'));
    return onSnapshot(q, (snapshot) => {
      setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    });
  }, [tenantId, user?.role]);

  const openCancellationModal = async (quotaId: string) => {
    if (!tenantId || !product) return;
    if (product.status === 'closed') return alert('Este produto está encerrado. Nenhuma alteração é permitida.');
    const quota = quotas.find(q => q.id === quotaId);
    if (!quota) return;

    try {
      const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
      const q = query(installmentsRef, where('quota_id', '==', quotaId), where('status', '==', 'paid'));
      const snapshot = await getDocs(q);
      
      const totalPaid = snapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
      const retentionPercent = product.retention_percent || 0;
      const { retentionValue, suggestedRefund } = financialService.estimateCancellation(totalPaid, retentionPercent);

      setCancellationData({
        quotaId,
        quotaNumber: quota.number,
        totalPaid,
        retentionPercent,
        retentionValue,
        suggestedRefund
      });
      setManualRefundValue(suggestedRefund);
      setShowCancellationModal(quotaId);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar dados de cancelamento');
    }
  };

  const handleCancelParticipation = async () => {
    if (!tenantId || !product || !cancellationData) return;
    if (!cancellationReason) return alert('Por favor, informe o motivo do cancelamento.');
    
    setIsProcessingCancellation(true);
    try {
      const { quotaId, totalPaid, retentionValue } = cancellationData;
      const batch = writeBatch(db);
      const now = new Date().toISOString();

      const quota = quotas.find(q => q.id === quotaId);

      // 1. Update Quota
      const quotaRef = doc(db, 'tenants', tenantId, 'quotas', quotaId);
      batch.update(quotaRef, {
        status: 'available',
        owner_id: deleteField(),
        owner_name: deleteField(),
        owner_cpf: deleteField(),
        sold_at: deleteField(),
        is_paid: deleteField()
      });

      // 2. Mark pending installments as cancelled
      const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
      const q = query(installmentsRef, where('quota_id', '==', quotaId), where('status', '==', 'pending'));
      const snapshot = await getDocs(q);
      snapshot.docs.forEach(d => {
        batch.update(d.ref, { status: 'cancelled', cancelled_at: now });
      });

      // 3. Create Refund Installment (to balance totals)
      if (manualRefundValue > 0) {
        const refundRef = doc(collection(db, 'tenants', tenantId, 'installments'));
        batch.set(refundRef, {
          quota_id: quotaId,
          quota_number: cancellationData.quotaNumber,
          product_id: product.id,
          product_name: product.name,
          owner_id: quota?.owner_id || '',
          owner_name: quota?.owner_name || '',
          owner_cpf: quota?.owner_cpf || '',
          amount: -manualRefundValue,
          status: 'refund',
          reason: `Reembolso de cancelamento: ${cancellationReason}`,
          proof_url: cancellationProofUrl || '',
          paid_at: now,
          due_date: now.split('T')[0],
          createdAt: serverTimestamp()
        });
      }

      // 3.1 Create Retention Record
      if (retentionValue > 0) {
        const retentionRef = doc(collection(db, 'tenants', tenantId, 'installments'));
        batch.set(retentionRef, {
          quota_id: quotaId,
          quota_number: cancellationData.quotaNumber,
          product_id: product.id,
          product_name: product.name,
          owner_id: quota?.owner_id || '',
          owner_name: quota?.owner_name || '',
          amount: retentionValue,
          status: 'retention',
          reason: `Retenção administrativa: ${cancellationReason}`,
          paid_at: now,
          due_date: now.split('T')[0],
          createdAt: serverTimestamp()
        });
      }

      // 4. Ownership History Entry (End of current)
      const previousOwnerLogRef = doc(collection(db, 'tenants', tenantId, 'quotas', quotaId, 'ownership_history'));
      batch.set(previousOwnerLogRef, {
        user_id: quota?.owner_id || '',
        user_name: quota?.owner_name || '',
        joined_at: quota?.sold_at || now,
        left_at: now,
        exit_type: 'cancellation',
        financial: {
          total_paid: totalPaid,
          retention_value: retentionValue,
          refund_value: manualRefundValue
        }
      });

      // 5. Create Cancellation Audit
      const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
      batch.set(auditRef, {
        user_id: user?.id || 'Sistema',
        user_name: user?.name || 'Sistema',
        action: 'CANCELAR_PARTICIPACAO',
        details: `Cancelamento da cota #${cancellationData.quotaNumber} do produto ${product.name}. Motivo: ${cancellationReason}`,
        financial: {
          total_paid: totalPaid,
          retention_value: retentionValue,
          refund_value: manualRefundValue,
          refund_proof_url: cancellationProofUrl || ''
        },
        quota_id: quotaId,
        previous_owner_id: quota?.owner_id || '',
        previous_owner_name: quota?.owner_name || '',
        created_at: serverTimestamp()
      });

      // Update product counts
      const productRef = doc(db, 'tenants', tenantId, 'products', product.id);
      batch.update(productRef, {
        sold_quotas: increment(-1),
        available_quotas: increment(1)
      });

      await batch.commit();
      alert('Participação cancelada com sucesso!');
      setShowCancellationModal(null);
      setCancellationData(null);
      setCancellationReason('');
      setCancellationProofUrl('');
    } catch (err) {
      console.error(err);
      alert('Erro ao processar cancelamento');
    } finally {
      setIsProcessingCancellation(false);
    }
  };

  const handleCloseProduct = async () => {
    if (!tenantId || !product) return;

    const hasPendencies = closeMetrics.pendingInstallmentsCount > 0 || closeMetrics.availableQuotasCount > 0;
    if (hasPendencies) {
      if (user?.role !== 'admin') {
        alert('Erro de Permissão: Apenas o Administrador Master pode forçar o fechamento do produto possuindo pendências de cotas ou financeiras.');
        return;
      }
      if (!forceCloseChecked) {
        alert('Confirmação pendente: Para forçar o fechamento, você precisa marcar a caixa atestando ciência das pendências listadas.');
        return;
      }
    }

    setIsClosingProduct(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const productRef = doc(db, 'tenants', tenantId, 'products', product.id);
      
      batch.update(productRef, {
        status: 'closed',
        closed_at: now,
        closed_by_id: user?.id,
        closed_by_name: user?.name,
        forced_with_pendencies: hasPendencies
      });

      // Snapshot of cotistas and quotas
      const snapshotRef = doc(collection(db, 'tenants', tenantId, 'closing_snapshots'));
      const activeQuotas = quotas.filter(q => q.status === 'sold');
      batch.set(snapshotRef, {
        product_id: product.id,
        product_name: product.name,
        closed_at: now,
        closed_by_id: user?.id,
        closed_by_name: user?.name,
        has_pendencies: hasPendencies,
        available_quotas_on_close: closeMetrics.availableQuotasCount,
        unpaid_quotas_on_close: closeMetrics.unpaidQuotasCount,
        pending_amount_on_close: closeMetrics.pendingAmount,
        delinquents: closeMetrics.delinquents,
        quotas_snapshot: activeQuotas.map(q => ({
          number: q.number,
          owner_name: q.owner_name,
          owner_id: q.owner_id,
          price: q.price,
          is_paid: q.is_paid || false
        })),
        total_collected: activeQuotas.reduce((sum, q) => sum + (q.is_paid ? q.price : 0), 0),
        total_pending: activeQuotas.reduce((sum, q) => sum + (!q.is_paid ? q.price : 0), 0)
      });

      // Audit Log
      const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
      batch.set(auditRef, {
        user_id: user?.id || 'Sistema',
        user_name: user?.name || 'Sistema',
        action: 'FECHAR_PRODUTO',
        details: `Fechamento definitivo do produto ${product.name}.${hasPendencies ? ' (FORÇADO com pendências financeiras ou cotas de saldo).' : ''}`,
        product_id: product.id,
        created_at: serverTimestamp()
      });

      await batch.commit();
      alert('Produto encerrado oficialmente com snapshot e histórico de fechamento criados!');
      setShowCloseModal(false);
      setForceCloseChecked(false);
    } catch (err) {
      console.error(err);
      alert('Erro ao fechar produto');
    } finally {
      setIsClosingProduct(false);
    }
  };

  const [showStandaloneRefundModal, setShowStandaloneRefundModal] = useState<string | null>(null);
  const [standaloneRefundReason, setStandaloneRefundReason] = useState('');
  
  const handleStandaloneRefund = async () => {
    if (!tenantId || !product || !cancellationData) return;
    if (!standaloneRefundReason) return alert('Por favor, informe o motivo do estorno.');
    
    setIsProcessingCancellation(true);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const quota = quotas.find(q => q.id === cancellationData.quotaId);

      // Create Refund Record
      const refundRef = doc(collection(db, 'tenants', tenantId, 'installments'));
      batch.set(refundRef, {
        quota_id: cancellationData.quotaId,
        quota_number: cancellationData.quotaNumber,
        product_id: product.id,
        product_name: product.name,
        owner_id: quota?.owner_id || '',
        owner_name: quota?.owner_name || '',
        amount: -manualRefundValue,
        status: 'refund',
        reason: standaloneRefundReason,
        proof_url: cancellationProofUrl || '',
        paid_at: now,
        due_date: now.split('T')[0],
        createdAt: serverTimestamp()
      });

      // Create Retention if applicable
      const calculatedRetained = cancellationData.totalPaid - manualRefundValue;
      if (calculatedRetained > 0) {
        const retentionRef = doc(collection(db, 'tenants', tenantId, 'installments'));
        batch.set(retentionRef, {
          quota_id: cancellationData.quotaId,
          quota_number: cancellationData.quotaNumber,
          product_id: product.id,
          product_name: product.name,
          owner_id: quota?.owner_id || '',
          owner_name: quota?.owner_name || '',
          amount: calculatedRetained,
          status: 'retention',
          reason: `Retenção vinculada ao estorno: ${standaloneRefundReason}`,
          paid_at: now,
          due_date: now.split('T')[0],
          createdAt: serverTimestamp()
        });
      }

      // Audit Log
      const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
      batch.set(auditRef, {
        user_id: user?.id || 'Sistema',
        user_name: user?.name || 'Sistema',
        action: 'ESTORNO_MANUAL',
        details: `Estorno de ${manualRefundValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} registrado para ${quota?.owner_name} (Cota #${cancellationData.quotaNumber}).`,
        quota_id: cancellationData.quotaId,
        created_at: serverTimestamp()
      });

      await batch.commit();
      alert('Estorno registrado com sucesso!');
      setShowStandaloneRefundModal(null);
      setCancellationData(null);
      setStandaloneRefundReason('');
    } catch (err) {
      console.error(err);
      alert('Erro ao registrar estorno');
    } finally {
      setIsProcessingCancellation(false);
    }
  };

  const openStandaloneRefundModal = async (quotaId: string) => {
    if (!tenantId || !product) return;
    if (product.status === 'closed') return alert('Este produto está encerrado. Nenhuma alteração é permitida.');
    const quota = quotas.find(q => q.id === quotaId);
    if (!quota) return;

    try {
      const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
      const q = query(installmentsRef, where('quota_id', '==', quotaId), where('status', '==', 'paid'));
      const snapshot = await getDocs(q);
      
      const totalPaid = snapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0);
      const retentionPercent = product.retention_percent || 0;
      const { retentionValue, suggestedRefund } = financialService.estimateCancellation(totalPaid, retentionPercent);

      setCancellationData({
        quotaId,
        quotaNumber: quota.number,
        totalPaid,
        retentionPercent,
        retentionValue,
        suggestedRefund
      });
      setManualRefundValue(suggestedRefund);
      setShowStandaloneRefundModal(quotaId);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar dados');
    }
  };

  const generateFinalReport = async () => {
    if (!product || !tenantId) return;
    
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      let cursorY = 20;

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("RELATÓRIO FINAL DE FECHAMENTO", pageWidth / 2, cursorY, { align: 'center' });
      cursorY += 15;

      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Produto: ${product.name}`, margin, cursorY);
      cursorY += 7;
      doc.text(`Data de Fechamento: ${product.closed_at ? new Date(product.closed_at).toLocaleString('pt-BR') : 'N/A'}`, margin, cursorY);
      cursorY += 7;
      doc.text(`Responsável: ${product.closed_by_name || 'Sistema'}`, margin, cursorY);
      cursorY += 15;

      // Table of Cotistas
      const soldQuotas = quotas.filter(q => q.status === 'sold');
      const tableData = soldQuotas.map(q => {
        const client = clients.find(c => c.id === q.owner_id);
        return [
          q.number,
          q.owner_name,
          q.owner_cpf || 'N/A',
          client?.pix_key || q.owner_pix || '-',
          q.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
          q.is_paid ? 'QUITADO' : 'PENDENTE'
        ];
      });

      (doc as any).autoTable({
        startY: cursorY,
        head: [['Cota', 'Cotista', 'CPF', 'Chave PIX', 'Valor', 'Status']],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [20, 20, 20] },
      });

      const finalY = (doc as any).lastAutoTable.finalY + 20;
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Resumo Financeiro:", margin, finalY);
      doc.setFontSize(12);
      doc.setFont("helvetica", "normal");
      doc.text(`Total de Cotas: ${product.total_quotas}`, margin, finalY + 10);
      doc.text(`Cotas Vendidas: ${product.sold_quotas}`, margin, finalY + 17);
      doc.text(`Valor Bruto Vendido: ${soldQuotas.reduce((sum, q) => sum + q.price, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, margin, finalY + 24);

      doc.save(`relatorio_final_${product.name.replace(/\s+/g, '_')}.pdf`);
    } catch (err) {
      console.error(err);
      alert('Erro ao gerar relatório final');
    }
  };

  const openHistoryModal = async (quotaId: string) => {
    if (!tenantId) return;
    try {
      const historyRef = collection(db, 'tenants', tenantId, 'quotas', quotaId, 'ownership_history');
      const q = query(historyRef, orderBy('joined_at', 'desc'));
      const snapshot = await getDocs(q);
      setQuotaHistory(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as OwnershipHistory)));
      setShowHistoryModal(quotaId);
    } catch (err) {
      console.error(err);
      alert('Erro ao carregar histórico da cota');
    }
  };

  const handleBuy = async () => {
    if (product?.status === 'closed') return alert('Este produto está encerrado. Nenhuma nova venda é permitida.');
    if (selectedQuotas.length === 0) return;
    const count = getDynamicInstallmentCount();
    if (count === 0) {
      alert('Este produto não pode mais ser adquirido ou parcelado pois a data final está muito próxima ou já expirou.');
      return;
    }

    // Reservation with runTransaction
    try {
      await runTransaction(db, async (trans) => {
        const quotaSnaps = [];
        for (const qId of selectedQuotas) {
          const qRef = doc(db, 'tenants', tenantId, 'quotas', qId);
          const snap = await trans.get(qRef);
          if (!snap.exists()) {
            throw new Error(`A cota de ID ${qId} não existe.`);
          }
          const quotaData = snap.data();
          if (quotaData.status !== 'available') {
            throw new Error(`A cota #${quotaData.number || qId} já não está mais disponível.`);
          }
          quotaSnaps.push({ ref: qRef, data: quotaData });
        }

        const nowIso = new Date().toISOString();
        for (const qs of quotaSnaps) {
          trans.update(qs.ref, {
            status: 'reserved',
            reserved_by: user?.id || 'client',
            reserved_at: nowIso
          });
        }
      });
      
      selectedQuotas.forEach(async (qId) => {
        const qObj = quotas.find(q => q.id === qId);
        await appendAuditLog(
          tenantId,
          user?.id || 'client',
          user?.name || 'Cliente',
          'RESERVA_COTA_INICIADA',
          'Quota',
          qId,
          `Reserva temporária de 10 min da cota #${qObj?.number || qId} para aquisição.`
        );
      });

    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao realizar a reserva temporária da cota.');
      return;
    }

    setAgreedToTerms(false);
    if (product?.payment_type === 'cash') {
      setInstallmentCount(1);
    } else {
      setInstallmentCount(count);
    }
    setShowBuyModal(true);
  };

  const handleCancelBuy = async () => {
    setShowBuyModal(false);
    if (!tenantId || selectedQuotas.length === 0) return;
    try {
      const batch = writeBatch(db);
      for (const qId of selectedQuotas) {
        batch.update(doc(db, 'tenants', tenantId, 'quotas', qId), {
          status: 'available',
          reserved_by: deleteField(),
          reserved_at: deleteField()
        });
      }
      await batch.commit();
      
      selectedQuotas.forEach(async (qId) => {
        const qObj = quotas.find(q => q.id === qId);
        await appendAuditLog(
          tenantId,
          user?.id || 'client',
          user?.name || 'Cliente',
          'RESERVA_CANCELADA_VOLUNTARIA',
          'Quota',
          qId,
          `O usuário cancelou o checkout e liberou a cota #${qObj?.number || qId} de volta para disponível.`
        );
      });
    } catch (err) {
      console.error("Erro ao liberar cota reservada:", err);
    }
  };

  const confirmPurchase = async () => {
    if (!agreedToTerms || !tenantId || !user || !product) return alert('Você precisa aceitar os termos para continuar.');

    setIsPurchasing(true);
    try {
      const now = new Date();
      const termVer = activeTermObj && typeof activeTermObj.version === 'number' ? activeTermObj.version : 1.0;
      const termH = await computeHash(termContent);
      
      const batchSize = 25; // Safer size considering installments
      const numBatches = Math.ceil(selectedQuotas.length / batchSize);

      for (let b = 0; b < numBatches; b++) {
        const batch = writeBatch(db);
        const start = b * batchSize;
        const end = Math.min((b + 1) * batchSize, selectedQuotas.length);
        const currentBatchQuotas = selectedQuotas.slice(start, end);

        for (const qId of currentBatchQuotas) {
          const quota = quotas.find(q => q.id === qId);
          if (!quota || (quota.status !== 'available' && quota.status !== 'reserved')) continue;

          // Update quota
          const quotaRef = doc(db, 'tenants', tenantId, 'quotas', qId);
          batch.update(quotaRef, {
            owner_id: user.id,
            owner_name: user.name,
            owner_cpf: user.cpf || '',
            product_name: product.name,
            status: 'sold',
            is_paid: false,
            sold_at: now.toISOString(),
            reserved_by: deleteField(),
            reserved_at: deleteField()
          });

          // Check fraction parent status update
          if (quota.parent_id) {
            const siblings = quotas.filter(q => q.parent_id === quota.parent_id && q.id !== quota.id);
            const allSiblingsSold = siblings.every(s => s.status === 'sold' || currentBatchQuotas.includes(s.id));
            if (allSiblingsSold) {
              const baseQuotaRef = doc(db, 'tenants', tenantId, 'quotas', quota.parent_id);
              batch.update(baseQuotaRef, {
                status: 'sold',
                sold_at: now.toISOString()
              });
            }
          }

          // Ownership History Entry (New)
          const historyEntryRef = doc(collection(db, 'tenants', tenantId, 'quotas', qId, 'ownership_history'));
          batch.set(historyEntryRef, {
            user_id: user.id,
            user_name: user.name,
            joined_at: now.toISOString()
          });

          // Create installments
          const dates = getInstallmentDates(installmentCount);
          if (dates.length === 0) throw new Error('Não foi possível gerar o cronograma de parcelas.');
          
          const amountPerInstallment = product.payment_type === 'recurrent' ? quota.price : quota.price / dates.length;
          
          for (let i = 0; i < dates.length; i++) {
            const dueDate = dates[i];

            const installmentRef = doc(collection(db, 'tenants', tenantId, 'installments'));
            batch.set(installmentRef, {
              quota_id: qId,
              quota_number: quota.number || '',
              product_id: product.id,
              product_name: product.name,
              owner_id: user.id,
              owner_name: user.name,
              owner_cpf: user.cpf || '',
              amount: amountPerInstallment,
              total_quota_price: quota.price,
              expiration_date: product.expiration_month,
              due_date: dueDate.toISOString().split('T')[0],
              status: 'pending',
              createdAt: serverTimestamp()
            });
          }
        }

        // Update product counts (only in the first batch)
        if (b === 0) {
          const productRef = doc(db, 'tenants', tenantId, 'products', product.id);
          batch.update(productRef, {
            sold_quotas: increment(selectedQuotas.length),
            available_quotas: increment(-selectedQuotas.length)
          });

          // Update user signed term status
          const userRef = doc(db, 'tenants', tenantId, 'users', user.id);
          const signedAt = now.toISOString();
          batch.update(userRef, {
            signed_term_at: signedAt
          });

          // Create signature record
          const signatureRef = doc(collection(db, 'tenants', tenantId, 'signatures'));
          batch.set(signatureRef, {
            user_id: user.id,
            user_name: user.name,
            user_cpf: user.cpf || '',
            product_id: product.id,
            product_name: product.name,
            quotas: selectedQuotas.map(id => quotas.find(q => q.id === id)?.number || id),
            payment_type: product.payment_type,
            installment_count: installmentCount,
            total_value: quotas.filter(q => selectedQuotas.includes(q.id)).reduce((sum, q) => sum + q.price, 0),
            signed_at: now.toISOString(),
            term_content: termContent,
            term_version: termVer,
            term_hash: termH,
            ip_device_info: navigator.userAgent,
            createdAt: serverTimestamp()
          });

          // Log audit
          const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
          batch.set(auditRef, {
            user_id: user.id,
            user_name: user.name,
            action: 'COMPRA_COTA',
            details: `Comprou ${selectedQuotas.length} cotas do produto ${product.name}`,
            created_at: serverTimestamp()
          });
        }

        await batch.commit();
      }

      setPurchaseSuccess(true);
    } catch (err) {
      console.error(err);
      alert('Erro ao processar compra no Firebase');
    } finally {
      setIsPurchasing(false);
    }
  };

  const downloadReceipt = () => {
    const quotasStr = selectedQuotas.map(id => quotas.find(q => q.id === id)?.number || id).join(', ');
    const totalValue = quotas
      .filter(q => selectedQuotas.includes(q.id))
      .reduce((sum, q) => sum + q.price, 0);

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let cursorY = 20;

    // 1. Term Section
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("TERMO DE CIENTIFICAÇÃO E ADESÃO AO BOLÃO", pageWidth / 2, cursorY, { align: 'center' });
    cursorY += 10;

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
    if (cursorY > pageHeight - 60) {
      doc.addPage();
      cursorY = 20;
    }

    // 2. Purchase Details
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, cursorY, pageWidth - margin, cursorY);
    cursorY += 10;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("DETALHES DA AQUISIÇÃO", margin, cursorY);
    cursorY += 10;
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Produto: ${product?.name}`, margin, cursorY);
    cursorY += 7;
    
    const quotaLabel = "Cotas: ";
    const splitQuotas = doc.splitTextToSize(quotasStr, pageWidth - (margin * 2) - 15);
    doc.text(quotaLabel, margin, cursorY);
    doc.text(splitQuotas, margin + 15, cursorY);
    cursorY += (splitQuotas.length * 5) + 5;

    if (product?.payment_type === 'recurrent') {
      doc.text(`Valor por Cota: ${product.quota_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / mês`, margin, cursorY);
      cursorY += 7;
      doc.text(`Total Mensal: ${totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / mês`, margin, cursorY);
      cursorY += 7;
      doc.setFont("helvetica", "bold");
      doc.text(`Condição de Pagamento: Cobrança Recorrente Mensal Fixa`, margin, cursorY);
      doc.setFont("helvetica", "normal");
    } else if (installmentCount === 1) {
      doc.text(`Valor Total: ${totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, margin, cursorY);
      cursorY += 7;
      doc.setFont("helvetica", "bold");
      doc.text(`Condição de Pagamento: Pagamento à Vista`, margin, cursorY);
      doc.setFont("helvetica", "normal");
    } else {
      doc.text(`Valor Total da Aquisição: ${totalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, margin, cursorY);
      cursorY += 7;
      doc.setFont("helvetica", "bold");
      doc.text(`Condição de Pagamento: Parcelado em ${installmentCount}x de ${(totalValue / installmentCount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`, margin, cursorY);
      doc.setFont("helvetica", "normal");
    }
    cursorY += 15;

    if (cursorY > pageHeight - 40) {
      doc.addPage();
      cursorY = 20;
    }

    // 3. Signature Info
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("ASSINATURA ELETRÔNICA", margin, cursorY);
    cursorY += 10;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Participante: ${user?.name}`, margin, cursorY);
    cursorY += 7;
    doc.text(`CPF: ${user?.cpf || 'Não informado'}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Data do Aceite: ${new Date().toLocaleString('pt-BR')}`, margin, cursorY);
    cursorY += 7;
    doc.text(`Autenticação: ${user?.id}-${Date.now()}`, margin, cursorY);
    
    // Footer
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Página ${i} de ${pageCount} - Este documento é um registro eletrônico e possui validade jurídica.`, 
        pageWidth / 2, 
        pageHeight - 10, 
        { align: 'center' }
      );
    }
    
    doc.save(`termo_adesao_${product?.name?.replace(/\s+/g, '_')}.pdf`);
  };

  const handleResetDefaultedQuota = async (quotaId: string) => {
    if (!tenantId) return;
    if (!window.confirm('Deseja disponibilizar esta cota novamente para venda?')) return;
    try {
      const quotaRef = doc(db, 'tenants', tenantId, 'quotas', quotaId);
      await updateDoc(quotaRef, {
        status: 'available',
        owner_id: deleteField(),
        owner_name: deleteField(),
        owner_cpf: deleteField(),
        sold_at: deleteField(),
        is_paid: deleteField()
      });
      alert('Cota disponibilizada com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao resetar cota');
    }
  };

  const handleCancelSale = async (quotaId: string) => {
    if (!confirm('Deseja realmente cancelar esta venda? A cota voltará a ficar disponível.')) return;
    
    try {
      if (!tenantId) return;
      
      await updateDoc(doc(db, 'tenants', tenantId, 'quotas', quotaId), {
        status: 'available',
        owner_id: deleteField(),
        owner_name: deleteField(),
        owner_cpf: deleteField(),
        sold_at: deleteField(),
        is_paid: deleteField()
      });

      const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
      const q = query(installmentsRef, where('quota_id', '==', quotaId));
      const snapshot = await getDocs(q);
      for (const d of snapshot.docs) {
        await deleteDoc(d.ref);
      }

      alert('Venda cancelada com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao cancelar venda');
    }
  };

  const handleReorganize = async (type: 'subdivide' | 'group') => {
    if (!tenantId || !product) return;
    
    try {
      if (type === 'subdivide') {
        const numFractionsStr = window.prompt(`Em quantas novas frações deseja dividir as ${selectedQuotas.length} cotas selecionadas?`, "10");
        if (!numFractionsStr) return;
        
        const numFractions = parseInt(numFractionsStr);
        if (isNaN(numFractions) || numFractions <= 0) {
          alert("Número de frações inválido");
          return;
        }

        const customName = window.prompt("Digite o nome base para as novas frações:", "Fração");
        if (!customName) return;

        let lastNumber = 0;
        quotas.forEach(q => {
          if (q.number && q.number.startsWith(customName)) {
            const parts = q.number.split(' ');
            const numPart = parts[parts.length - 1];
            const num = parseInt(numPart);
            if (!isNaN(num) && num > lastNumber) {
              lastNumber = num;
            }
          }
        });

        const selectedQuotasData = selectedQuotas.map(qId => quotas.find(q => q.id === qId)).filter(Boolean);
        const totalValue = selectedQuotasData.reduce((acc, q) => acc + (q?.price || 0), 0);
        const fractionPrice = totalValue / numFractions;
        const masterId = selectedQuotas[0];

        // Create fractions
        for (let i = 1; i <= numFractions; i++) {
          const sequentialNum = lastNumber + i;
          await addDoc(collection(db, 'tenants', tenantId, 'quotas'), {
            product_id: id,
            number: `${customName} ${String(sequentialNum).padStart(3, '0')}`,
            price: fractionPrice,
            status: 'available',
            parent_id: masterId,
            group_parents: selectedQuotas, 
            createdAt: serverTimestamp()
          });
        }

        // Mark parents as grouped
        for (const qId of selectedQuotas) {
          await updateDoc(doc(db, 'tenants', tenantId, 'quotas', qId), {
            status: 'grouped',
            subdivided_into: masterId
          });
        }
      } else {
        // Desfazer agrupamento
        for (const qId of selectedQuotas) {
          const quota = quotas.find(q => q.id === qId);
          if (!quota || quota.status !== 'grouped') continue;

          const masterId = quota.subdivided_into || qId;
          const q = query(collection(db, 'tenants', tenantId, 'quotas'), where('parent_id', '==', masterId));
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
            const firstChildData = snapshot.docs[0].data();
            const groupParents = firstChildData.group_parents || [masterId];
            
            for (const pId of groupParents) {
              await updateDoc(doc(db, 'tenants', tenantId, 'quotas', pId), {
                status: 'available',
                subdivided_into: deleteField()
              });
            }

            for (const d of snapshot.docs) {
              await deleteDoc(d.ref);
            }
          } else {
            await updateDoc(doc(db, 'tenants', tenantId, 'quotas', qId), {
              status: 'available',
              subdivided_into: deleteField()
            });
          }
        }
      }
      setSelectedQuotas([]);
      alert('Operação realizada com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao reorganizar cotas');
    }
  };

  const [isEditing, setIsEditing] = useState(false);
  const [editedProduct, setEditedProduct] = useState({ 
    name: '', 
    description: '', 
    image_url: '', 
    expiration_month: '',
    payment_type: 'installments' as 'cash' | 'installments' | 'recurrent',
    default_rule_type: 'percentage_of_paid',
    retention_percent: 25,
    allow_manual_adjustment: true,
    total_quotas: 0,
    quota_price: 0,
    available_quotas: 0
  });

  useEffect(() => {
    if (product) {
      setEditedProduct({ 
        name: product.name, 
        description: product.description, 
        image_url: product.image_url || '',
        expiration_month: product.expiration_month || '',
        payment_type: product.payment_type || 'installments',
        default_rule_type: product.default_rule_type || 'percentage_of_paid',
        retention_percent: product.retention_percent || 25,
        allow_manual_adjustment: product.allow_manual_adjustment ?? true,
        total_quotas: product.total_quotas,
        quota_price: product.quota_price,
        available_quotas: product.available_quotas
      });
    }
  }, [product]);

  const handleUpdateProduct = async () => {
    if (!tenantId || !id) return;
    if (product?.status === 'closed') return alert('Este produto está encerrado. Edições não são permitidas.');

    if (editedProduct.payment_type === 'installments') {
      const expDate = new Date(editedProduct.expiration_month + 'T12:00:00');
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const dueDay = expDate.getDate();
      
      let count = 0;
      for (let i = 0; i < 24; i++) {
        const year = now.getFullYear();
        const month = now.getMonth() + i;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const actualDay = Math.min(dueDay, lastDay);
        const d = new Date(year, month, actualDay, 12, 0, 0);
        
        if (d < now) continue;
        if (d > expDate) break;
        if (count === 0) {
          const diffDays = (d.getTime() - now.getTime()) / (1000 * 3600 * 24);
          if (diffDays < 30) continue;
        }
        count++;
        if (count >= 12) break;
      }
      
      if (count === 0) {
        return alert('A data de vencimento escolhida não permite gerar parcelas seguindo as regras (mínimo 30 dias para a primeira parcela e data final como limite).');
      }
    }

    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'products', id), editedProduct);
      setIsEditing(false);
      alert('Produto atualizado com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao atualizar produto');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        callback(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (!product) return <div className="p-8 text-center">Carregando produto...</div>;

  if (product.status === 'draft' && user?.role === 'client') {
    return (
      <div className="flex flex-col items-center justify-center p-20 text-center space-y-4">
        <Lock className="text-amber-500 w-16 h-16 animate-bounce" size={48} />
        <h3 className="text-2xl font-bold">Produto em Rascunho</h3>
        <p className="text-black/50 max-w-sm">Esta oferta ainda está em rascunho e não foi publicada pelo administrador.</p>
        <button onClick={() => navigate('/products')} className="px-6 py-3 bg-black text-white rounded-2xl font-bold text-sm">
          Voltar para Produtos
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/products')} className="flex items-center gap-2 px-4 py-2 hover:bg-black/5 rounded-xl transition-all font-bold text-sm">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-3xl font-bold tracking-tight">{product.name}</h2>
          {product.status === 'draft' && (
            <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[10px] font-black uppercase tracking-widest border border-amber-200">
              Rascunho
            </span>
          )}
          {product.status === 'closed' && (
            <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-[10px] font-black uppercase tracking-widest border border-red-200">
              Encerrado Oficialmente
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {product.status === 'closed' && (
            <button 
              onClick={generateFinalReport}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-emerald-700 transition-all cursor-pointer"
            >
              <Download size={18} /> Relatório de Fechamento
            </button>
          )}
          {user.role === 'admin' && product.status === 'draft' && (
            <button 
              onClick={handlePublishDraft}
              disabled={publishingDraft}
              className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={publishingDraft ? "animate-spin" : ""} size={18} />
              {publishingDraft ? `Publicando (${publishProgress}%)` : 'Publicar Rascunho'}
            </button>
          )}
          {user.role === 'admin' && product.status === 'active' && (
            <button 
              onClick={() => setShowCloseModal(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-red-700 transition-all cursor-pointer"
            >
              <X size={18} /> Encerrar Produto
            </button>
          )}
          {user.role === 'admin' && product.status !== 'closed' && (
            <button 
              onClick={() => setIsEditing(!isEditing)}
              className="px-4 py-2 bg-black text-white rounded-xl text-sm font-bold transition-all"
            >
              {isEditing ? 'Cancelar Edição' : 'Editar Produto'}
            </button>
          )}
        </div>
      </div>

      {isEditing && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl border border-black/5 shadow-sm space-y-4"
        >
          <h3 className="font-bold text-xl">Editar Informações</h3>
          <div className="flex gap-6">
            <div className="flex-1 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input 
                  className="w-full p-4 bg-black/5 rounded-2xl" 
                  placeholder="Nome do Produto" 
                  value={editedProduct.name}
                  onChange={e => setEditedProduct({...editedProduct, name: e.target.value})}
                />
                <div className="relative">
                  <input 
                  className="w-full p-4 bg-black/5 rounded-2xl pr-12" 
                    placeholder="URL da Imagem" 
                    value={editedProduct.image_url}
                    onChange={e => setEditedProduct({...editedProduct, image_url: e.target.value})}
                  />
                  <label className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer hover:text-indigo-600 transition-colors">
                    <ImagePlus size={20} />
                    <input 
                      type="file" 
                      className="hidden" 
                      accept="image/*"
                      onChange={e => handleImageUpload(e, (base64) => setEditedProduct({...editedProduct, image_url: base64}))}
                    />
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Tipo de Pagamento</label>
                    <select 
                      disabled={product.status !== 'draft'}
                      className="w-full p-4 bg-black/5 rounded-2xl mt-1 disabled:opacity-50"
                      value={editedProduct.payment_type}
                      onChange={e => setEditedProduct({...editedProduct, payment_type: e.target.value as any})}
                    >
                      <option value="installments">Parcelado</option>
                      <option value="cash">À Vista</option>
                      <option value="recurrent">Recorrente (Mensal Fixo)</option>
                    </select>
                  </div>
                  <div className="relative">
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Data de Vencimento Final</label>
                    <input 
                      type="date"
                      className="w-full p-4 bg-black/5 rounded-2xl mt-1" 
                      value={editedProduct.expiration_month}
                      onChange={e => setEditedProduct({...editedProduct, expiration_month: e.target.value})}
                    />
                  </div>
                </div>

                {product.status === 'draft' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Quantidade Geral de Cotas (Alterável em Rascunho)</label>
                      <input 
                        type="number"
                        className="w-full p-4 bg-black/5 rounded-2xl mt-1"
                        placeholder="Ex: 100"
                        value={editedProduct.total_quotas || ''}
                        onChange={e => setEditedProduct({...editedProduct, total_quotas: Number(e.target.value) || 0, available_quotas: Number(e.target.value) || 0})}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Valor da Cota em R$ (Alterável em Rascunho)</label>
                      <input 
                        type="number"
                        className="w-full p-4 bg-black/5 rounded-2xl mt-1"
                        placeholder="Ex: 50"
                        value={editedProduct.quota_price || ''}
                        onChange={e => setEditedProduct({...editedProduct, quota_price: Number(e.target.value) || 0})}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl text-[11px] text-amber-800 leading-tight">
                    🔒 <strong>Variáveis Constitutivas Bloqueadas:</strong> A quantidade geral de cotas ({product.total_quotas}), tipo de pagamento ({product.payment_type === 'installments' ? 'Parcelado' : product.payment_type === 'cash' ? 'À Vista' : 'Recorrente'}) e o valor unitário ({product.quota_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) estão travados porque este ativo já está publicado e ativo.
                  </div>
                )}
              </div>

              <div className="p-6 bg-black/5 rounded-3xl space-y-4">
                <h4 className="text-sm font-bold uppercase tracking-widest opacity-40">Regra de Inadimplência</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Tipo de Retenção</label>
                    <select 
                      className="w-full p-4 bg-white rounded-xl mt-1 text-sm outline-none"
                      value={editedProduct.default_rule_type}
                      onChange={e => setEditedProduct({...editedProduct, default_rule_type: e.target.value as any})}
                    >
                      <option value="percentage_of_paid">Perc. sobre valor pago</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Percentual (%)</label>
                    <input 
                      className="w-full p-4 bg-white rounded-xl mt-1 text-sm outline-none" 
                      type="number"
                      value={editedProduct.retention_percent}
                      onChange={e => setEditedProduct({...editedProduct, retention_percent: Number(e.target.value)})}
                    />
                  </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={cn(
                    "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                    editedProduct.allow_manual_adjustment ? "bg-black border-black" : "border-black/20 group-hover:border-black/40"
                  )}>
                    {editedProduct.allow_manual_adjustment && <Check size={14} className="text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={editedProduct.allow_manual_adjustment}
                    onChange={e => setEditedProduct({...editedProduct, allow_manual_adjustment: e.target.checked})}
                  />
                  <span className="text-sm font-medium">Permitir ajuste manual pelo administrador</span>
                </label>
              </div>

              <textarea 
                className="w-full p-4 bg-black/5 rounded-2xl h-32" 
                placeholder="Descrição detalhada" 
                value={editedProduct.description}
                onChange={e => setEditedProduct({...editedProduct, description: e.target.value})}
              />
            </div>
            <div className="w-48 h-48 rounded-3xl bg-black/5 overflow-hidden border border-black/5 flex items-center justify-center shrink-0">
              {editedProduct.image_url ? (
                <img src={editedProduct.image_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <Package size={48} className="text-black/10" />
              )}
            </div>
          </div>
          <button 
            onClick={handleUpdateProduct}
            className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold"
          >
            Salvar Alterações
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {product.image_url && (
            <div className="w-full h-64 rounded-[40px] overflow-hidden border border-black/5">
              <img 
                src={product.image_url} 
                alt={product.name} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
          <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
            <h3 className="font-bold text-xl mb-4">Descrição do Produto</h3>
            <p className="text-black/70 leading-relaxed whitespace-pre-wrap">{product.description || 'Sem descrição disponível.'}</p>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-bold text-xl">Mapa de Cotas</h3>
              <div className="flex gap-4 text-xs font-bold uppercase tracking-widest">
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500" /> Disponível</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500" /> Em Aberto</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500" /> Quitada</span>
                <span className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500" /> Agrupada</span>
              </div>
            </div>
            
            <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2 max-h-[500px] overflow-y-auto p-2">
              {quotas.map((quota, i) => (
                <button 
                  key={quota.id}
                  title={`Cota ${quota.number || i + 1} - ${quota.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
                  className={cn(
                    "aspect-[2/1] rounded-lg text-[10px] font-bold transition-all flex items-center justify-center border border-black/5",
                    quota.status === 'sold' ? (quota.is_paid ? "bg-blue-500/10 text-blue-600" : "bg-red-500/10 text-red-600") : 
                    quota.status === 'grouped' ? "bg-amber-500/10 text-amber-600" :
                    quota.status === 'defaulted' ? "bg-red-500 text-white font-black" :
                    "bg-emerald-500/10 text-emerald-600 hover:scale-110",
                    selectedQuotas.includes(quota.id) && "ring-2 ring-black bg-black text-white"
                  )}
                  onClick={() => {
                    if (quota.status === 'available' || (quota.status === 'grouped' && user.role === 'admin')) {
                      setSelectedQuotas(prev => 
                        prev.includes(quota.id) ? prev.filter(x => x !== quota.id) : [...prev, quota.id]
                      );
                    } else if (quota.status === 'sold' && user.role === 'admin') {
                      setShowQuotaMenu(quota.id);
                    } else if (quota.status === 'defaulted' && user.role === 'admin') {
                      handleResetDefaultedQuota(quota.id);
                    }
                  }}
                >
                  {quota.number || i + 1}
                </button>
              ))}
            </div>
          </div>

          {user.role === 'admin' && selectedQuotas.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-indigo-600 text-white p-8 rounded-3xl shadow-xl flex items-center justify-between"
            >
              <div>
                <h4 className="font-bold text-xl">{selectedQuotas.length} Cotas Selecionadas</h4>
                <p className="opacity-80">O que deseja fazer com as cotas remanescentes?</p>
              </div>
              <div className="flex gap-4">
                {selectedQuotas.every(id => quotas.find(q => q.id === id)?.status === 'available') && (
                  <button 
                    onClick={() => handleReorganize('subdivide')}
                    className="px-6 py-3 bg-white text-indigo-600 rounded-xl font-bold hover:bg-white/90 transition-all"
                  >
                    Subdividir em Frações
                  </button>
                )}
                {selectedQuotas.every(id => quotas.find(q => q.id === id)?.status === 'grouped') && (
                  <button 
                    onClick={() => handleReorganize('group')}
                    className="px-6 py-3 bg-white text-indigo-600 rounded-xl font-bold hover:bg-white/90 transition-all"
                  >
                    Desfazer Agrupamento
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {user.role === 'client' && selectedQuotas.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-emerald-600 text-white p-8 rounded-3xl shadow-xl flex items-center justify-between"
            >
              <div>
                <h4 className="font-bold text-xl">{selectedQuotas.length} Cotas Selecionadas</h4>
                <p className="opacity-80">
                  Total: {quotas
                    .filter(q => selectedQuotas.includes(q.id))
                    .reduce((sum, q) => sum + q.price, 0)
                    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>
              <button 
                onClick={handleBuy}
                className="px-8 py-4 bg-white text-emerald-600 rounded-2xl font-bold hover:bg-white/90 transition-all"
              >
                Confirmar Compra
              </button>
            </motion.div>
          )}

          <AnimatePresence>
            {showBuyModal && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={handleCancelBuy}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                 <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="relative w-[95%] sm:w-full max-w-lg bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
                >
                  {purchaseSuccess ? (
                    <div className="text-center space-y-6 py-4">
                      <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Check size={40} />
                      </div>
                      <h3 className="text-2xl font-bold">Compra Realizada!</h3>
                      <p className="text-black/50">Sua aquisição foi processada com sucesso e o termo foi assinado eletronicamente.</p>
                      
                      <div className="space-y-3 pt-4">
                        <button 
                          onClick={downloadReceipt}
                          className="w-full py-4 bg-black text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:scale-105 transition-all"
                        >
                          <Download size={20} /> Baixar Comprovante e Termo
                        </button>
                        <button 
                          onClick={() => {
                            setShowBuyModal(false);
                            setPurchaseSuccess(false);
                            navigate(user?.role === 'client' ? '/my-payments' : '/payments');
                          }}
                          className="w-full py-4 bg-black/5 text-black rounded-2xl font-bold hover:bg-black/10 transition-all"
                        >
                          Fechar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-2xl font-bold mb-2">Opções de Pagamento</h3>
                      <p className="text-black/50 mb-8">
                        {product?.payment_type === 'cash' 
                          ? 'Este produto aceita apenas pagamento à vista.' 
                          : product?.payment_type === 'recurrent'
                          ? 'Este produto possui cobrança recorrente mensal fixa.'
                          : 'Escolha o número de parcelas para sua compra.'}
                      </p>
                      
                      {product?.payment_type === 'recurrent' && (
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 mb-6">
                          <Info size={18} className="text-emerald-600" />
                          <p className="text-xs font-bold text-emerald-700">Este Produto tem Valor Mensal Inalterável</p>
                        </div>
                      )}

                      <div className="space-y-6">
                        {product?.payment_type === 'installments' && (
                          <div>
                            <label className="block text-xs font-bold uppercase tracking-widest opacity-40 mb-3">Número de Parcelas</label>
                            <select 
                              value={installmentCount}
                              onChange={(e) => setInstallmentCount(parseInt(e.target.value))}
                              className="w-full p-4 bg-black/5 rounded-2xl font-bold text-lg outline-none border-none cursor-pointer hover:bg-black/10 transition-all"
                            >
                              {Array.from({ length: dynamicInstallmentCount }, (_, i) => (
                                <option key={i + 1} value={i + 1}>{i + 1}x</option>
                              ))}
                            </select>
                            <p className="text-[10px] text-black/40 mt-2 italic">
                              * Você pode escolher pagar à vista ou parcelar em até {dynamicInstallmentCount}x (limite calculado para encerrar em {product.expiration_month ? new Date(product.expiration_month + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }) : 'Dezembro'}).
                            </p>
                          </div>
                        )}

                        <div className="bg-black/5 p-6 rounded-2xl space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="opacity-60">
                              {product?.payment_type === 'recurrent' ? 'Soma das Mensalidades' : 'Valor Total'}
                            </span>
                            <span className="font-bold">
                              {quotas.filter(q => selectedQuotas.includes(q.id)).reduce((sum, q) => sum + q.price, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              {product?.payment_type === 'recurrent' && ' / mês'}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="opacity-60">
                              {product?.payment_type === 'recurrent' ? 'Total a Pagar Hoje' : (installmentCount === 1 ? 'Total à Vista' : 'Valor por Parcela')}
                            </span>
                            <span className="font-bold text-emerald-600 font-mono">
                              {(product?.payment_type === 'recurrent'
                                ? quotas.filter(q => selectedQuotas.includes(q.id)).reduce((sum, q) => sum + q.price, 0)
                                : (quotas.filter(q => selectedQuotas.includes(q.id)).reduce((sum, q) => sum + q.price, 0) / installmentCount)
                              ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </span>
                          </div>
                          
                          {installmentCount > 1 && product?.payment_type !== 'recurrent' && (
                            <p className="text-[10px] text-black/40 text-right mt-1 italic">
                              Parcelamento em {installmentCount}x
                            </p>
                          )}
                          
                          <div className="pt-4 mt-2 border-t border-black/10">
                            <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2">
                              {product?.payment_type === 'recurrent' ? 'Cronograma de Mensalidades' : 'Cronograma de Vencimentos'}
                            </p>
                            <div className="space-y-1 max-h-24 overflow-y-auto pr-2">
                              {getInstallmentDates(installmentCount).map((d, i) => {
                                return (
                                  <div key={i} className="flex justify-between text-[10px]">
                                    <span className="opacity-60">{i + 1}ª {product?.payment_type === 'recurrent' ? 'Mensalidade' : 'Parcela'}</span>
                                    <span className="font-mono font-bold">{d.toLocaleDateString('pt-BR')}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Termo de Adesão</p>
                          <div className="bg-black/5 p-4 rounded-2xl text-[10px] text-black/60 h-32 overflow-y-auto leading-relaxed border border-black/5">
                            {termContent}
                          </div>
                        </div>

                        <div className="flex items-start gap-3 p-4 bg-black/5 rounded-2xl">
                          <input 
                            type="checkbox" 
                            id="agree-terms"
                            checked={agreedToTerms}
                            onChange={(e) => setAgreedToTerms(e.target.checked)}
                            className="mt-1 w-5 h-5 rounded border-black/10 text-black focus:ring-black/20"
                          />
                          <label htmlFor="agree-terms" className="text-xs text-black/60 leading-relaxed">
                            Li e concordo com os termos de adesão para a compra de <span className="font-bold text-black">{product.name}</span>. 
                            Cotas selecionadas: <span className="font-bold text-black">{selectedQuotas.map(id => quotas.find(q => q.id === id)?.number || id).join(', ')}</span>.
                          </label>
                        </div>

                        <button 
                          onClick={confirmPurchase}
                          disabled={!agreedToTerms || isPurchasing}
                          className="w-full py-4 bg-black text-white rounded-2xl font-bold hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
                        >
                          {isPurchasing ? (
                            <>
                              <RefreshCw size={20} className="animate-spin" />
                              Processando...
                            </>
                          ) : 'Finalizar Compra'}
                        </button>
                        {!isPurchasing && (
                          <button 
                            type="button"
                            onClick={handleCancelBuy}
                            className="w-full py-4 bg-black/5 text-black rounded-2xl font-bold hover:bg-black/10 transition-all flex items-center justify-center gap-2 mt-2"
                          >
                            Cancelar e Voltar
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showQuotaMenu && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowQuotaMenu(null)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="relative w-[95%] sm:w-full max-w-sm bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-2xl space-y-4 overflow-y-auto max-h-[90vh]"
                >
                  <h3 className="text-xl font-bold text-center">Ações na Cota</h3>
                  <div className="space-y-3">
                    <button 
                      onClick={() => {
                        setShowQuotaMenu(null);
                        openHistoryModal(showQuotaMenu);
                      }}
                      className="w-full py-4 bg-black/5 text-black rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-black/10 transition-all border border-black/5"
                    >
                      <History size={18} /> Ver Histórico de Posse
                    </button>
                    <button 
                      onClick={() => {
                        setShowQuotaMenu(null);
                        openStandaloneRefundModal(showQuotaMenu);
                      }}
                      className="w-full py-4 bg-amber-600/10 text-amber-600 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-amber-600/20 transition-all border border-amber-600/10"
                    >
                      <RefreshCw size={18} /> Registrar Estorno / Devolução
                    </button>
                    <button 
                      onClick={() => {
                        setShowQuotaMenu(null);
                        openCancellationModal(showQuotaMenu);
                      }}
                      className="w-full py-4 bg-red-600/10 text-red-600 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-red-600/20 transition-all"
                    >
                      <Trash2 size={20} /> Cancelar Participação
                    </button>
                    <button 
                      onClick={() => {
                        setShowQuotaMenu(null);
                        handleCancelSale(showQuotaMenu);
                      }}
                      className="w-full py-4 bg-neutral-100 text-neutral-800 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-neutral-200 transition-all"
                    >
                      Cancelar Venda (Reset Total)
                    </button>
                    <div className="pt-2">
                      <button 
                        onClick={() => setShowQuotaMenu(null)}
                        className="w-full py-4 bg-black/5 text-black rounded-2xl font-bold hover:bg-black/10 transition-all"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showHistoryModal && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowHistoryModal(null)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="relative w-[95%] sm:w-full max-w-2xl bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
                >
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold">Histórico de Posse</h3>
                    <p className="text-sm font-mono opacity-40">Cota #{quotas.find(q => q.id === showHistoryModal)?.number}</p>
                  </div>

                  <div className="space-y-6">
                    {quotaHistory.length === 0 && (
                      <div className="p-12 text-center text-black/30 bg-black/5 rounded-3xl">
                        Nenhum histórico registrado para esta cota ainda.
                      </div>
                    )}
                    
                    <div className="relative space-y-8 before:absolute before:left-6 before:top-4 before:bottom-4 before:w-[2px] before:bg-black/5">
                      {quotaHistory.map((entry, i) => (
                        <div key={entry.id} className="relative pl-16">
                          <div className={cn(
                            "absolute left-3 top-0 w-6 h-6 rounded-full border-4 border-white shadow-sm transition-all",
                            i === 0 ? "bg-indigo-600 scale-125" : "bg-black/20"
                          )} />
                          
                          <div className="bg-white border border-black/5 p-6 rounded-3xl space-y-4 hover:border-black/10 transition-all">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-1">Cotista</p>
                                <p className="font-bold text-lg">{entry.user_name}</p>
                              </div>
                              {i === 0 && !entry.left_at ? (
                                <span className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-full text-[10px] font-black uppercase">Atual</span>
                              ) : (
                                <span className="px-3 py-1 bg-black/5 text-black/40 rounded-full text-[10px] font-black uppercase">{entry.exit_type === 'resale' ? 'Revenda' : 'Cancelado'}</span>
                              )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-xs">
                              <div>
                                <p className="opacity-40 uppercase font-bold tracking-widest text-[9px]">Entrada</p>
                                <p className="font-medium">{new Date(entry.joined_at).toLocaleString('pt-BR')}</p>
                              </div>
                              {entry.left_at && (
                                <div>
                                  <p className="opacity-40 uppercase font-bold tracking-widest text-[9px]">Saída</p>
                                  <p className="font-medium">{new Date(entry.left_at).toLocaleString('pt-BR')}</p>
                                </div>
                              )}
                            </div>

                            {entry.financial && (
                              <div className="pt-4 mt-2 border-t border-black/5 grid grid-cols-3 gap-2">
                                <div>
                                  <p className="text-[9px] font-bold uppercase opacity-30 mb-1">Pago</p>
                                  <p className="text-xs font-bold font-mono">{entry.financial.total_paid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                </div>
                                <div className="text-red-500">
                                  <p className="text-[9px] font-bold uppercase opacity-30 mb-1">Retido</p>
                                  <p className="text-xs font-bold font-mono">-{entry.financial.retention_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                </div>
                                <div className="text-emerald-600">
                                  <p className="text-[9px] font-bold uppercase opacity-30 mb-1">Devolvido</p>
                                  <p className="text-xs font-bold font-mono">{entry.financial.refund_value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button 
                      onClick={() => setShowHistoryModal(null)}
                      className="w-full py-4 bg-black text-white rounded-2xl font-bold mt-4"
                    >
                      Fechar Histórico
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showCloseModal && product && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowCloseModal(false)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="relative w-[95%] sm:w-full max-w-lg bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-2xl space-y-6 overflow-y-auto max-h-[90vh]"
                >
                  <div className="text-center">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Shield size={32} />
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight">Encerrar Ativo Oficialmente?</h3>
                    <p className="text-black/50 text-xs mt-1">
                      Esta ação bloqueará definitivamente novas vendas, edições, ou revendas para este produto.
                    </p>
                  </div>

                  {closeMetrics.loading ? (
                    <div className="flex flex-col items-center justify-center py-6 gap-2">
                      <RefreshCw className="animate-spin text-black/40" size={24} />
                      <span className="text-xs text-black/40 font-medium">Analisando pendências do sistema...</span>
                    </div>
                  ) : (
                    <>
                      <div className="bg-black/5 p-6 rounded-3xl space-y-3">
                        <div className="text-xs font-bold uppercase opacity-40 tracking-wider">Métricas do Ativo</div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="opacity-50">Cotas Disponíveis</span>
                          <span className={closeMetrics.availableQuotasCount > 0 ? "font-bold text-amber-600" : "font-bold"}>
                            {closeMetrics.availableQuotasCount} em aberto
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="opacity-50">Parcelas Pendentes</span>
                          <span className={closeMetrics.pendingInstallmentsCount > 0 ? "font-bold text-red-500" : "font-bold"}>
                            {closeMetrics.pendingInstallmentsCount} parcelas ({closeMetrics.pendingAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="opacity-50">Participantes Ativos</span>
                          <span className="font-bold">{new Set(quotas.filter(q => q.status === 'sold').map(q => q.owner_id)).size}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm pt-2 border-t border-black/5">
                          <span className="opacity-50">Total Arrecadado Real</span>
                          <span className="font-black text-emerald-600 font-mono">
                            {quotas.filter(q => q.status === 'sold' && q.is_paid).reduce((sum, q) => sum + q.price, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </span>
                        </div>
                      </div>

                      {(closeMetrics.availableQuotasCount > 0 || closeMetrics.pendingInstallmentsCount > 0) && (
                        <div className="p-5 bg-amber-50 rounded-2xl border border-amber-100 space-y-3">
                          <div className="flex items-start gap-2 text-amber-800 text-xs font-bold">
                            <Info size={16} className="flex-shrink-0 mt-0.5" />
                            <span>Contém Pendências Impeditivas!</span>
                          </div>
                          <ul className="text-[11px] text-amber-700 list-disc list-inside space-y-1">
                            {closeMetrics.availableQuotasCount > 0 && (
                              <li>Existem {closeMetrics.availableQuotasCount} cotas não vendidas que serão expiradas permanentemente.</li>
                            )}
                            {closeMetrics.pendingInstallmentsCount > 0 && (
                              <li>Há {closeMetrics.pendingInstallmentsCount} parcelas em aberto, somando {closeMetrics.pendingAmount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.</li>
                            )}
                          </ul>
                          {closeMetrics.delinquents.length > 0 && (
                            <div className="text-[10px] text-amber-800 border-t border-amber-200/50 pt-2 font-mono">
                              <strong>Cotistas Pendentes:</strong> {closeMetrics.delinquents.join(', ')}
                            </div>
                          )}
                        </div>
                      )}

                      {(closeMetrics.availableQuotasCount > 0 || closeMetrics.pendingInstallmentsCount > 0) ? (
                        user?.role !== 'admin' ? (
                          <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3">
                            <Shield size={18} className="text-red-600 flex-shrink-0 mt-0.5" />
                            <p className="text-[11px] text-red-700 font-bold leading-normal">
                              🔒 Bloqueio de Segurança:<br />
                              Existem pendências financeiras ou cotas em aberto neste produto. Apenas o Administrador Master tem autorização para fechar o produto e assumir tais pendências.
                            </p>
                          </div>
                        ) : (
                          <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl space-y-3">
                            <p className="text-[11px] text-blue-700 leading-tight">
                              <strong>Bypass Master (Forçar Encerramento):</strong> Como administrador master, você pode prosseguir mesmo com pendências financeiras. Marque a declaração abaixo para habilitar o encerramento.
                            </p>
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input 
                                type="checkbox" 
                                className="rounded text-blue-600 focus:ring-blue-500" 
                                checked={forceCloseChecked}
                                onChange={e => setForceCloseChecked(e.target.checked)}
                              />
                              <span className="text-[11px] text-blue-800 font-bold">Declaro ciência e assumo as pendências financeiras listadas.</span>
                            </label>
                          </div>
                        )
                      ) : (
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3">
                          <Check size={18} className="text-emerald-600 flex-shrink-0" />
                          <p className="text-[10px] text-emerald-700 leading-tight">
                            <strong>Tudo limpo!</strong> Todas as cotas foram vendidas e quitadas integralmente. Pronto para encerramento regular.
                          </p>
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button 
                          onClick={() => {
                            setShowCloseModal(false);
                            setForceCloseChecked(false);
                          }}
                          className="w-full sm:flex-1 py-4 bg-black/5 text-black rounded-2xl font-bold order-2 sm:order-1 text-sm"
                        >
                          Voltar
                        </button>
                        <button 
                          onClick={handleCloseProduct}
                          disabled={
                            isClosingProduct || 
                            (((closeMetrics.availableQuotasCount > 0 || closeMetrics.pendingInstallmentsCount > 0)) && 
                              (user?.role !== 'admin' || !forceCloseChecked))
                          }
                          className="w-full sm:flex-[2] py-4 bg-neutral-900 text-white rounded-2xl font-bold hover:bg-neutral-800 duration-200 transition-all flex items-center justify-center gap-2 order-1 sm:order-2 text-sm disabled:opacity-40 disabled:hover:bg-red-600"
                        >
                          {isClosingProduct ? <RefreshCw className="animate-spin" size={20} /> : 'Confirmar Fechamento Definitivo'}
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showStandaloneRefundModal && cancellationData && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowStandaloneRefundModal(null)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="relative w-[95%] sm:w-full max-w-xl bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
                >
                  <h3 className="text-2xl font-bold mb-2">Registrar Devolução Financeira</h3>
                  <p className="text-black/50 mb-6 font-mono">Controle avulso para a Cota #{cancellationData.quotaNumber}</p>

                  <div className="space-y-6 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-black/5 p-4 rounded-3xl">
                        <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Cotista</p>
                        <p className="font-bold">{quotas.find(q => q.id === showStandaloneRefundModal)?.owner_name || 'Desconhecido'}</p>
                      </div>
                      <div className="bg-black/5 p-4 rounded-3xl">
                        <p className="text-[10px] font-bold uppercase opacity-40 mb-1">Total Já Pago</p>
                        <p className="font-bold text-emerald-600 font-mono">{cancellationData.totalPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                      </div>
                    </div>

                    <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-center gap-3">
                      <Info size={18} className="text-amber-600 animate-pulse" />
                      <p className="text-xs text-amber-700 leading-relaxed font-bold">
                        Esta ação registra um estorno/devolução de valor. <br/>
                        <span className="opacity-70 font-normal underline">Diferente do cancelamento, esta ação não retira a posse do cotista atual.</span>
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 ml-1">Retenção Sugerida ({cancellationData.retentionPercent}%)</label>
                        <div className="p-4 bg-black/5 rounded-2xl font-semibold opacity-50 font-mono">
                          {cancellationData.retentionValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 ml-1">Valor a Devolver (R$) *</label>
                        <input 
                          type="number"
                          className="w-full p-4 bg-black/5 rounded-2xl font-bold border-2 border-transparent focus:border-indigo-600 transition-all outline-none font-mono"
                          value={manualRefundValue}
                          max={cancellationData.totalPaid}
                          onChange={(e) => setManualRefundValue(Number(e.target.value))}
                        />
                      </div>
                    </div>

                    {manualRefundValue > cancellationData.totalPaid && (
                      <p className="text-[10px] text-red-500 font-bold">* O valor da devolução não pode exceder o total pago ({cancellationData.totalPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).</p>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 ml-1">Comprovante de Devolução (Opcional)</label>
                      <input 
                        type="text"
                        placeholder="Link do comprovante ou ID da transação Pix..."
                        className="w-full p-4 bg-black/5 rounded-2xl text-xs outline-none"
                        value={cancellationProofUrl}
                        onChange={(e) => setCancellationProofUrl(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 ml-1">Motivo do Estorno *</label>
                      <textarea 
                        className="w-full p-4 bg-black/5 rounded-2xl h-24 text-xs outline-none"
                        placeholder="Ex: Pagamento duplicado, devolução parcial autorizada..."
                        value={standaloneRefundReason}
                        onChange={(e) => setStandaloneRefundReason(e.target.value)}
                        required
                      />
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                      <button 
                        onClick={() => setShowStandaloneRefundModal(null)}
                        className="w-full sm:flex-1 py-4 bg-black/5 text-black rounded-2xl font-bold hover:bg-black/10 transition-all order-2 sm:order-1"
                      >
                        Cancelar
                      </button>
                      <button 
                        onClick={handleStandaloneRefund}
                        disabled={isProcessingCancellation || !standaloneRefundReason || manualRefundValue <= 0 || manualRefundValue > cancellationData.totalPaid}
                        className="w-full sm:flex-[2] py-4 bg-black text-white rounded-2xl font-bold hover:opacity-90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 order-1 sm:order-2"
                      >
                        {isProcessingCancellation ? <RefreshCw size={20} className="animate-spin" /> : 'Confirmar Devolução'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showCancellationModal && cancellationData && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowCancellationModal(null)}
                  className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.9, opacity: 0, y: 20 }}
                  className="relative w-[95%] sm:w-full max-w-lg bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
                >
                  <h3 className="text-2xl font-bold mb-2">Cancelar Participação</h3>
                  <p className="text-black/50 mb-8 font-mono">Cota #{cancellationData.quotaNumber}</p>

                  <div className="space-y-6">
                    <div className="bg-black/5 p-6 rounded-3xl space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="opacity-60">Total Pago</span>
                        <span className="font-bold font-mono">{cancellationData.totalPaid.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      </div>
                      <div className="flex justify-between text-sm text-red-600">
                        <span className="opacity-80">Valor de Retenção ({cancellationData.retentionPercent}%)</span>
                        <span className="font-bold font-mono">-{cancellationData.retentionValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      </div>
                      <div className="pt-3 border-t border-black/10 flex justify-between items-center">
                        <span className="font-bold">Valor Sugerido para Devolução</span>
                        <span className="text-xl font-bold text-emerald-600 font-mono">{cancellationData.suggestedRefund.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                      </div>
                    </div>

                    {product?.allow_manual_adjustment && (
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 ml-1">Ajuste Manual do Valor a Devolver (R$)</label>
                        <input 
                          type="number"
                          className="w-full p-4 bg-black/5 rounded-2xl font-bold font-mono"
                          value={manualRefundValue}
                          onChange={(e) => setManualRefundValue(Number(e.target.value))}
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 ml-1">Motivo do Cancelamento *</label>
                      <textarea 
                        className="w-full p-4 bg-black/5 rounded-2xl h-24 text-sm outline-none"
                        placeholder="Descreva o motivo da rescisão..."
                        value={cancellationReason}
                        onChange={(e) => setCancellationReason(e.target.value)}
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 ml-1">Comprovante de Devolução (Opcional)</label>
                      <div className="relative group">
                        <input 
                          type="text"
                          className="w-full p-4 bg-black/5 rounded-2xl text-xs pr-12 truncate"
                          placeholder="Cole o link ou clique para subir imagem"
                          value={cancellationProofUrl}
                          onChange={(e) => setCancellationProofUrl(e.target.value)}
                        />
                        <label className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer hover:text-indigo-600 transition-colors">
                          <ImagePlus size={20} />
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => setCancellationProofUrl(reader.result as string);
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </label>
                      </div>
                      {cancellationProofUrl && (
                        <div className="mt-2 text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                          <Check size={12} /> Comprovante anexado
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 pt-4">
                      <button 
                        onClick={() => setShowCancellationModal(null)}
                        className="w-full sm:flex-1 py-4 bg-black/5 text-black rounded-2xl font-bold hover:bg-black/10 transition-all order-2 sm:order-1"
                      >
                        Voltar
                      </button>
                      <button 
                        onClick={handleCancelParticipation}
                        disabled={isProcessingCancellation || !cancellationReason}
                        className="w-full sm:flex-[2] py-4 bg-red-600 text-white rounded-2xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2 order-1 sm:order-2"
                      >
                        {isProcessingCancellation ? <RefreshCw size={20} className="animate-spin" /> : 'Confirmar Cancelamento'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
            <h3 className="font-bold text-xl mb-6">Ações Rápidas</h3>
            <div className="space-y-3">
              <Link to={`/products/${id}/chat`} className="flex items-center gap-4 p-4 rounded-2xl bg-black/5 hover:bg-black/10 transition-all w-full">
                <MessageSquare size={20} />
                <span className="font-bold">Chat do Ativo</span>
              </Link>
              
              <div className="pt-4 border-t border-black/5">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-4">Gerentes do Sistema</p>
                <div className="space-y-2">
                  {managers.map(manager => (
                    <div key={manager.id} className="flex items-center justify-between p-3 rounded-xl bg-black/5 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold font-mono">
                          {manager.name[0]}
                        </div>
                        <span className="text-sm font-semibold">{manager.name}</span>
                      </div>
                      <Link to={`/products/${id}/chat?mention=${manager.id}`} className="p-2 hover:bg-black/5 rounded-lg text-indigo-600">
                        <MessageSquare size={16} />
                      </Link>
                    </div>
                  ))}
                  {managers.length === 0 && (
                    <p className="text-xs text-black/40 italic">Nenhum gerente disponível no momento.</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-neutral-900 text-white rounded-3xl p-8 shadow-xl">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-4">Resumo do Ativo</p>
            {(() => {
              const metrics = getSubdivisionMetrics();
              return (
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="opacity-60">Total de Cotas</span>
                    <span className="font-bold">{formatWeight(metrics.total)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Disponíveis</span>
                    <span className="font-bold text-emerald-400">{formatWeight(metrics.available)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-60">Vendidas</span>
                    <span className="font-bold text-red-400">{formatWeight(metrics.sold)}</span>
                  </div>
                  <div className="pt-4 border-t border-white/10">
                    <p className="text-[10px] font-bold uppercase tracking-widest opacity-50 mb-1">Progresso de Venda</p>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500" 
                        style={{ 
                          width: `${(metrics.sold / (metrics.total || 1)) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                  <div className="pt-4 border-t border-white/10 flex justify-between items-end">
                    <span className="opacity-60">Valor da Cota</span>
                    <span className="text-2xl font-bold font-mono">
                      {product.quota_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
