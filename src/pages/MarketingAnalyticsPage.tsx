import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Share2, 
  TrendingUp, 
  Users, 
  Copy, 
  Check, 
  Plus, 
  Calendar, 
  Eye, 
  Filter, 
  Sparkles, 
  UserCheck, 
  BarChart3,
  Globe,
  Loader2,
  Trash2,
  ChevronDown,
  ChevronUp,
  QrCode
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.js';
import { cn } from '../utils/cn.js';
import { createShortLink } from '../utils/urlShortener.js';
import { QrCodeModal } from '../components/QrCodeModal.js';

interface MarketingLinkItem {
  id: string;
  tenant_id: string;
  name: string;
  platform: string;
  campaign_date: string;
  notes?: string;
  conversion_count: number;
  status: 'active' | 'inactive';
  created_at: any;
  created_by: string;
  invite_link?: string;
  short_code?: string;
  short_url?: string;
}

interface ClientUser {
  id: string;
  name: string;
  email: string;
  created_at?: any;
  marketing_platform?: string;
  marketing_campaign_name?: string;
  marketing_link_id?: string;
  referral_type?: string;
  referrer_uid?: string;
  referrer_name?: string;
}

interface TopReferrer {
  uid: string;
  name: string;
  count: number;
  referredClients: ClientUser[];
}

const PLATFORM_OPTIONS = [
  { id: 'Instagram', label: 'Instagram', color: 'bg-pink-500 text-white', badge: 'bg-pink-100 text-pink-700 border-pink-200' },
  { id: 'TikTok', label: 'TikTok', color: 'bg-black text-white', badge: 'bg-slate-100 text-slate-800 border-slate-300' },
  { id: 'WhatsApp', label: 'WhatsApp', color: 'bg-emerald-600 text-white', badge: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  { id: 'Facebook', label: 'Facebook', color: 'bg-blue-600 text-white', badge: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'YouTube', label: 'YouTube', color: 'bg-red-600 text-white', badge: 'bg-red-100 text-red-800 border-red-200' },
  { id: 'Google Ads', label: 'Google Ads', color: 'bg-amber-500 text-white', badge: 'bg-amber-100 text-amber-800 border-amber-200' },
  { id: 'Outro', label: 'Outro Canal', color: 'bg-indigo-600 text-white', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200' }
];

export default function MarketingAnalyticsPage() {
  const { tenantId, user } = useAuth();
  const [links, setLinks] = useState<MarketingLinkItem[]>([]);
  const [clients, setClients] = useState<ClientUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // QR Modal State
  const [qrModalData, setQrModalData] = useState<{
    isOpen: boolean;
    title: string;
    longUrl: string;
    shortUrl: string;
    shortCode: string;
  }>({
    isOpen: false,
    title: '',
    longUrl: '',
    shortUrl: '',
    shortCode: ''
  });

  // Form State
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState('Instagram');
  const [campaignDate, setCampaignDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  // Expand state for checking clients per link/referrer
  const [expandedLinkId, setExpandedLinkId] = useState<string | null>(null);
  const [expandedReferrerUid, setExpandedReferrerUid] = useState<string | null>(null);

  // Security guard: Admin only
  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 font-bold">Acesso negado. Apenas administradores possuem acesso a estas estatísticas.</p>
      </div>
    );
  }

  const baseUrl = window.location.origin;

  // Realtime listeners for marketing links & client users
  useEffect(() => {
    if (!tenantId) return;

    // 1. Listen to Marketing Links
    const linksRef = collection(db, 'tenants', tenantId, 'marketing_links');
    const unsubLinks = onSnapshot(linksRef, (snapshot) => {
      const items: MarketingLinkItem[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as MarketingLinkItem));
      // Sort newest first
      items.sort((a, b) => {
        const da = a.created_at?.seconds ? new Date(a.created_at.seconds * 1000) : new Date(0);
        const db = b.created_at?.seconds ? new Date(b.created_at.seconds * 1000) : new Date(0);
        return db.getTime() - da.getTime();
      });
      setLinks(items);
      setLoading(false);
    }, (err) => {
      console.error("Error loading marketing links:", err);
      setLoading(false);
    });

    // 2. Listen to Clients list
    const clientsRef = collection(db, 'tenants', tenantId, 'users');
    const qClients = query(clientsRef, where('role', '==', 'client'));
    const unsubClients = onSnapshot(qClients, (snapshot) => {
      const cList: ClientUser[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ClientUser));
      setClients(cList);
    }, (err) => {
      console.error("Error loading clients for analytics:", err);
    });

    return () => {
      unsubLinks();
      unsubClients();
    };
  }, [tenantId]);

  // Handle creating new Marketing Campaign Link
  const handleCreateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (!tenantId) return;

    const currentUid = auth.currentUser?.uid;
    if (!currentUid) {
      alert('Sessão do usuário não identificada. Por favor, recarregue a página ou faça login novamente.');
      return;
    }

    setSubmitting(true);
    try {
      // Create marketing link ID
      const mktRef = doc(collection(db, 'tenants', tenantId, 'marketing_links'));
      const linkId = mktRef.id;

      // 1-year expiry or perpetual
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      const creatorName = user?.name || user?.email || (auth.currentUser?.email ? auth.currentUser.email.split('@')[0] : 'Admin');

      // Create short link entry
      const shortData = await createShortLink(tenantId, linkId, 'client', true, name.trim());

      // Create invite record so auth transaction validates it natively
      const inviteRef = doc(db, 'tenants', tenantId, 'invites', linkId);

      await setDoc(inviteRef, {
        id: linkId,
        tenant_id: tenantId,
        role: 'client',
        is_marketing: true,
        marketing_link_id: linkId,
        marketing_platform: platform,
        marketing_campaign_name: name.trim(),
        expires_at: expiresAt.toISOString(),
        used_at: null,
        used_by: null,
        created_at: serverTimestamp(),
        created_by: currentUid,
        created_by_name: creatorName,
        short_code: shortData.shortCode,
        short_url: shortData.shortUrl
      });

      // Save marketing link record
      await setDoc(mktRef, {
        tenant_id: tenantId,
        name: name.trim(),
        platform: platform,
        campaign_date: campaignDate,
        notes: notes.trim(),
        conversion_count: 0,
        status: 'active',
        created_at: serverTimestamp(),
        created_by: currentUid,
        created_by_name: creatorName,
        short_code: shortData.shortCode,
        short_url: shortData.shortUrl
      });

      // Reset form
      setName('');
      setNotes('');
      setShowCreateModal(false);
      alert(`Link de divulgação curto gerado com sucesso!\nURL: ${shortData.shortUrl}`);
    } catch (err: any) {
      console.error("Error creating marketing link:", err);
      handleFirestoreError(err, OperationType.WRITE, `tenants/${tenantId}/marketing_links`);
      alert(`Erro ao criar link de divulgação: ${err?.message || 'Permissão negada ou falha de conexão.'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const copyToClipboard = async (link: MarketingLinkItem) => {
    const fullUrl = link.short_url || `${baseUrl}/r/${link.short_code || link.id}` || `${baseUrl}/register-client/${tenantId}/${link.id}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(link.id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const openQrCodeModalForLink = (link: MarketingLinkItem) => {
    const longUrl = `${baseUrl}/register-client/${tenantId}/${link.id}`;
    const shortUrl = link.short_url || `${baseUrl}/r/${link.short_code || link.id}`;
    setQrModalData({
      isOpen: true,
      title: `QR Code: ${link.name}`,
      longUrl,
      shortUrl,
      shortCode: link.short_code || link.id
    });
  };

  const toggleLinkStatus = async (link: MarketingLinkItem) => {
    if (!tenantId) return;
    const newStatus = link.status === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'marketing_links', link.id), {
        status: newStatus
      });
    } catch (err) {
      console.error("Error updating link status:", err);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    if (!tenantId) return;
    if (!window.confirm("Deseja realmente remover este link de divulgação?")) return;
    try {
      await deleteDoc(doc(db, 'tenants', tenantId, 'marketing_links', linkId));
      await deleteDoc(doc(db, 'tenants', tenantId, 'invites', linkId));
    } catch (err) {
      console.error("Error deleting link:", err);
    }
  };

  // --- Analytical Calculations ---
  const totalClients = clients.length;
  
  // Clients registered via marketing links
  const mktClients = clients.filter(c => c.referral_type === 'marketing_link' || !!c.marketing_link_id);
  
  // Clients registered via friend referrals
  const friendReferralClients = clients.filter(c => c.referral_type === 'client_invite' || (c.referrer_uid && c.referrer_uid !== 'Sistema'));

  // Group clients by platform
  const platformCounts: { [platform: string]: number } = {};
  clients.forEach(c => {
    const plat = c.marketing_platform || (c.referrer_uid ? 'Indicação de Amigo' : 'Cadastro Direto');
    platformCounts[plat] = (platformCounts[plat] || 0) + 1;
  });

  // Top Referrer Clients ("Cliente tal trouxe X clientes")
  const referrerMap: { [uid: string]: TopReferrer } = {};
  clients.forEach(c => {
    if (c.referrer_uid && c.referrer_uid !== 'Sistema') {
      if (!referrerMap[c.referrer_uid]) {
        referrerMap[c.referrer_uid] = {
          uid: c.referrer_uid,
          name: c.referrer_name || 'Cliente Indicador',
          count: 0,
          referredClients: []
        };
      }
      referrerMap[c.referrer_uid].count += 1;
      referrerMap[c.referrer_uid].referredClients.push(c);
    }
  });

  const topReferrers = Object.values(referrerMap).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-8 pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 md:p-8 rounded-[32px] shadow-2xl relative overflow-hidden">
        <div className="relative z-10 space-y-2 max-w-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-xs font-mono font-bold uppercase tracking-wider">
            <Sparkles size={14} /> Exclusivo Administrador
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight">Estatísticas & Links de Divulgação</h1>
          <p className="text-slate-300 text-xs md:text-sm leading-relaxed">
            Acompanhe a origem de cada cliente cadastrado (Instagram, TikTok, WhatsApp ou indicações diretas entre clientes) e crie links reutilizáveis para suas campanhas.
          </p>
        </div>

        <div className="relative z-10">
          <button
            onClick={() => setShowCreateModal(true)}
            className="w-full md:w-auto px-6 py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl transition-all shadow-lg hover:scale-105 active:scale-95 flex items-center justify-center gap-2 cursor-pointer border-none text-xs uppercase tracking-wider"
          >
            <Plus size={18} /> Novo Link de Divulgação
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-[24px] border border-black/5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-black/50 text-xs font-bold uppercase tracking-wider">
            <span>Total de Clientes</span>
            <Users size={18} className="text-indigo-600" />
          </div>
          <div className="text-3xl font-black text-black">{totalClients}</div>
          <p className="text-[10px] text-black/40">Investidores e cotistas ativos na loja</p>
        </div>

        <div className="bg-white p-6 rounded-[24px] border border-black/5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-black/50 text-xs font-bold uppercase tracking-wider">
            <span>Via Mídias & Campanhas</span>
            <Share2 size={18} className="text-pink-600" />
          </div>
          <div className="text-3xl font-black text-pink-600">{mktClients.length}</div>
          <p className="text-[10px] text-black/40">Cadastros gerados através de links de divulgação</p>
        </div>

        <div className="bg-white p-6 rounded-[24px] border border-black/5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-black/50 text-xs font-bold uppercase tracking-wider">
            <span>Indicações de Clientes</span>
            <UserCheck size={18} className="text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-emerald-600">{friendReferralClients.length}</div>
          <p className="text-[10px] text-black/40">Clientes que trouxeram amigos pro app</p>
        </div>

        <div className="bg-white p-6 rounded-[24px] border border-black/5 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-black/50 text-xs font-bold uppercase tracking-wider">
            <span>Links de Divulgação</span>
            <Globe size={18} className="text-amber-600" />
          </div>
          <div className="text-3xl font-black text-amber-600">{links.filter(l => l.status === 'active').length}</div>
          <p className="text-[10px] text-black/40">Links ativos no Instagram, TikTok, etc.</p>
        </div>
      </div>

      {/* Main Content Layout: Links Table + Referral Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Marketing Links List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 border border-black/5 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-black/5 pb-4">
              <div>
                <h2 className="text-lg font-bold text-black flex items-center gap-2">
                  <Share2 className="text-indigo-600" size={20} /> Links de Divulgação Ativos
                </h2>
                <p className="text-xs text-black/50">
                  Links públicos com contagem de conversões para divulgar em redes sociais e WhatsApp.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-black/40 flex items-center justify-center gap-2 font-mono text-xs">
                <Loader2 className="animate-spin" size={18} /> Carregando estatísticas dos links...
              </div>
            ) : links.length === 0 ? (
              <div className="p-8 text-center rounded-2xl border border-dashed border-black/10 bg-black/[0.02] space-y-3">
                <Globe className="mx-auto text-black/20" size={32} />
                <p className="text-xs text-black/50 font-medium">Nenhum link de divulgação criado ainda.</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-black text-white text-xs font-bold rounded-xl cursor-pointer border-none"
                >
                  Criar Primeiro Link
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {links.map((link) => {
                  const platBadge = PLATFORM_OPTIONS.find(p => p.id === link.platform)?.badge || 'bg-slate-100 text-slate-700';
                  const isExpanded = expandedLinkId === link.id;

                  // Find clients registered with this link
                  const convertedClients = clients.filter(c => c.marketing_link_id === link.id || c.marketing_campaign_name === link.name);

                  return (
                    <div key={link.id} className="rounded-2xl border border-black/5 bg-[#FAFAFA] p-4 sm:p-5 transition-all space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border", platBadge)}>
                              {link.platform}
                            </span>
                            <span className="font-bold text-sm text-black">{link.name}</span>
                          </div>
                          <p className="text-[11px] text-black/50 flex items-center gap-2">
                            <Calendar size={12} /> Data do Link: {link.campaign_date || 'N/A'}
                            {link.notes && <span className="italic">• {link.notes}</span>}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-xl">
                            <span className="text-[10px] text-indigo-600 uppercase font-bold block leading-none">Cadastros</span>
                            <span className="text-base font-black text-indigo-900 leading-tight">{link.conversion_count || convertedClients.length}</span>
                          </div>

                          <button
                            onClick={() => openQrCodeModalForLink(link)}
                            className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer border-none shadow-sm"
                            title="Ver QR Code do Link"
                          >
                            <QrCode size={14} /> QR Code
                          </button>

                          <button
                            onClick={() => copyToClipboard(link)}
                            className="p-2.5 bg-black text-white rounded-xl hover:bg-black/80 transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer border-none"
                            title="Copiar Link Curto"
                          >
                            {copiedId === link.id ? (
                              <>
                                <Check size={14} className="text-emerald-400" /> Copiado!
                              </>
                            ) : (
                              <>
                                <Copy size={14} /> Copiar
                              </>
                            )}
                          </button>

                          <button
                            onClick={() => toggleLinkStatus(link)}
                            className={cn(
                              "px-2.5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer border-none",
                              link.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                            )}
                          >
                            {link.status === 'active' ? 'Ativo' : 'Pausado'}
                          </button>

                          <button
                            onClick={() => handleDeleteLink(link.id)}
                            className="p-2 text-black/40 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer border-none"
                            title="Excluir Link"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>

                      {/* Expand Button for Clients List */}
                      <div className="pt-2 border-t border-black/5 flex items-center justify-between">
                        <span className="text-[11px] text-black/50 font-medium">
                          {convertedClients.length} cliente(s) registrados neste link
                        </span>
                        <button
                          onClick={() => setExpandedLinkId(isExpanded ? null : link.id)}
                          className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer bg-transparent border-none"
                        >
                          {isExpanded ? <>Ocultar Clientes <ChevronUp size={14} /></> : <>Ver Clientes <ChevronDown size={14} /></>}
                        </button>
                      </div>

                      {/* Expanded Clients List */}
                      {isExpanded && (
                        <div className="mt-3 p-3 bg-white rounded-xl border border-black/5 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-black/40">Clientes Cadastrados via {link.name}:</p>
                          {convertedClients.length === 0 ? (
                            <p className="text-xs text-black/40 italic">Ainda não há clientes cadastrados por este link específico.</p>
                          ) : (
                            <div className="divide-y divide-black/5">
                              {convertedClients.map((client) => (
                                <div key={client.id} className="py-2 flex items-center justify-between text-xs">
                                  <div>
                                    <p className="font-bold text-black">{client.name}</p>
                                    <p className="text-[10px] text-black/50">{client.email}</p>
                                  </div>
                                  <span className="text-[10px] font-mono text-black/40 bg-black/5 px-2 py-0.5 rounded">
                                    Cliente
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Col: Client Referrals Ranking ("Quem Trouxe Quem") */}
        <div className="space-y-6">
          <div className="bg-white rounded-[32px] p-6 sm:p-8 border border-black/5 shadow-sm space-y-6">
            <div className="border-b border-black/5 pb-4">
              <h2 className="text-lg font-bold text-black flex items-center gap-2">
                <UserCheck className="text-emerald-600" size={20} /> Ranking de Indicações
              </h2>
              <p className="text-xs text-black/50">
                Mostra os clientes que mais trouxeram novos participantes para o aplicativo através do "Convidar Amigo".
              </p>
            </div>

            {topReferrers.length === 0 ? (
              <div className="p-6 text-center rounded-2xl border border-dashed border-black/10 bg-black/[0.01] space-y-2">
                <Users className="mx-auto text-black/20" size={28} />
                <p className="text-xs text-black/50 font-medium">Nenhuma indicação direta registrada ainda.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {topReferrers.map((refItem, index) => {
                  const isExpandedRef = expandedReferrerUid === refItem.uid;

                  return (
                    <div key={refItem.uid} className="p-4 rounded-2xl border border-black/5 bg-[#FAFAFA] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0",
                            index === 0 ? 'bg-amber-400 text-black font-black' :
                            index === 1 ? 'bg-slate-300 text-black font-black' :
                            index === 2 ? 'bg-amber-700 text-white font-black' :
                            'bg-black/5 text-black/60'
                          )}>
                            #{index + 1}
                          </span>
                          <div>
                            <p className="text-xs font-bold text-black leading-tight">{refItem.name}</p>
                            <p className="text-[10px] text-emerald-600 font-semibold">
                              Trouxe {refItem.count} cliente(s)
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => setExpandedReferrerUid(isExpandedRef ? null : refItem.uid)}
                          className="p-1.5 text-black/40 hover:text-black cursor-pointer bg-transparent border-none"
                        >
                          {isExpandedRef ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </div>

                      {/* Expanded list of referred friends */}
                      {isExpandedRef && (
                        <div className="pt-2 border-t border-black/5 space-y-1.5">
                          <p className="text-[10px] font-bold uppercase text-black/40">Amigos indicados por {refItem.name}:</p>
                          {refItem.referredClients.map(rc => (
                            <div key={rc.id} className="p-2 bg-white rounded-xl text-xs border border-black/5 flex items-center justify-between">
                              <span className="font-medium text-black">{rc.name}</span>
                              <span className="text-[10px] text-black/50 truncate max-w-[120px]">{rc.email}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Origem por Plataforma */}
          <div className="bg-white rounded-[32px] p-6 sm:p-8 border border-black/5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-black flex items-center gap-2">
              <BarChart3 className="text-indigo-600" size={18} /> Origem por Canal/Plataforma
            </h3>

            <div className="space-y-3 pt-2">
              {Object.entries(platformCounts).map(([platName, count]) => {
                const percent = totalClients > 0 ? Math.round((count / totalClients) * 100) : 0;

                return (
                  <div key={platName} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-black/80">{platName}</span>
                      <span className="font-mono text-black/60 font-semibold">{count} ({percent}%)</span>
                    </div>
                    <div className="w-full h-2.5 bg-black/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-600 rounded-full transition-all duration-500" 
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Criar Link de Divulgação */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreateModal(false)}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative w-full max-w-lg bg-white rounded-[32px] p-6 sm:p-8 shadow-2xl space-y-6 z-10"
            >
              <div className="flex items-center justify-between border-b border-black/5 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-black">Novo Link de Divulgação</h3>
                  <p className="text-xs text-black/50">Crie um link reutilizável para rastrear inscrições de campanhas específicas.</p>
                </div>
                <button 
                  onClick={() => setShowCreateModal(false)} 
                  className="text-black/40 hover:text-black p-2 cursor-pointer bg-transparent border-none"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateLink} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-black/70 mb-1">Nome da Campanha/Link *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Promocional Julho Instagram"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-black/10 text-xs font-medium focus:outline-none focus:border-black"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-black/70 mb-1">Mídia / Plataforma *</label>
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-black/10 text-xs font-medium focus:outline-none focus:border-black bg-white"
                    >
                      {PLATFORM_OPTIONS.map(p => (
                        <option key={p.id} value={p.id}>{p.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-black/70 mb-1">Data da Campanha *</label>
                    <input
                      type="date"
                      required
                      value={campaignDate}
                      onChange={(e) => setCampaignDate(e.target.value)}
                      className="w-full px-4 py-3 rounded-2xl border border-black/10 text-xs font-medium focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-black/70 mb-1">Observação / Descrição (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: Divulgado nos stories por @influencer"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-black/10 text-xs font-medium focus:outline-none focus:border-black"
                  />
                </div>

                <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl space-y-1">
                  <p className="text-[11px] font-bold text-indigo-900 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-600" /> Link de Uso Multiuso Reutilizável
                  </p>
                  <p className="text-[10px] text-indigo-800/80 leading-relaxed">
                    Ao contrário dos convites individuais, várias pessoas poderão se cadastrar através do mesmo link sem que ele expire ou dê erro.
                  </p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-5 py-3 rounded-2xl text-xs font-bold text-black/60 hover:bg-black/5 transition-all cursor-pointer border-none"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-6 py-3 rounded-2xl text-xs font-bold bg-black text-white hover:bg-black/80 transition-all flex items-center gap-2 cursor-pointer border-none"
                  >
                    {submitting ? <Loader2 size={16} className="animate-spin" /> : 'Criar Link de Divulgação'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR Code Modal */}
      <QrCodeModal
        isOpen={qrModalData.isOpen}
        onClose={() => setQrModalData(prev => ({ ...prev, isOpen: false }))}
        title={qrModalData.title}
        longUrl={qrModalData.longUrl}
        shortUrl={qrModalData.shortUrl}
        shortCode={qrModalData.shortCode}
      />
    </div>
  );
}
