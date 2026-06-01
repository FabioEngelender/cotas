import * as React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  onSnapshot 
} from 'firebase/firestore';
import { 
  ArrowLeft, 
  FileSpreadsheet, 
  ChevronRight, 
  TrendingUp, 
  FileDown 
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  LineChart, 
  CartesianGrid, 
  XAxis, 
  YAxis, 
  Tooltip, 
  Line 
} from 'recharts';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { db } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.js';
import { Product, User } from '../types.js';
import { financialService } from '../services/financialService.js';
import { StatCard } from '../components/StatCard.js';
import { FinanceCard } from '../components/FinanceCard.js';
import { cn } from '../utils/cn.js';

export function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const { user, tenantId } = useAuth();
  const navigate = useNavigate();

  // Financial States
  const [financeData, setFinanceData] = useState<{
    collected: number;
    refunded: number;
    retained: number;
    net: number;
    items: any[];
  }>({ collected: 0, refunded: 0, retained: 0, net: 0, items: [] });
  const [financeLoading, setFinanceLoading] = useState(true);
  const [dbProducts, setDbProducts] = useState<Product[]>([]);
  const [dbClients, setDbClients] = useState<User[]>([]);
  
  const [filterProduct, setFilterProduct] = useState('all');
  const [filterClient, setFilterClient] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!tenantId) return;

    const productsRef = collection(db, 'tenants', tenantId, 'products');
    const quotasRef = collection(db, 'tenants', tenantId, 'quotas');
    const installmentsRef = collection(db, 'tenants', tenantId, 'installments');

    let products: any[] = [];
    let quotas: any[] = [];
    let installments: any[] = [];

    const updateStats = () => {
      const statsObj = financialService.calculateDashboardStats(products, quotas, installments, dbClients);
      setStats(statsObj);
    };

    const unsubProducts = onSnapshot(productsRef, (snapshot) => {
      products = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setDbProducts(products as Product[]);
      updateStats();
    });

    const unsubQuotas = onSnapshot(quotasRef, (snapshot) => {
      quotas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateStats();
    });

    const unsubInstallments = onSnapshot(installmentsRef, (snapshot) => {
      installments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      updateStats();
    });

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      unsubProducts();
      unsubQuotas();
      unsubInstallments();
      clearInterval(timer);
    };
  }, [tenantId, dbClients]);

  useEffect(() => {
    if (!tenantId) return;
    const fetchClients = async () => {
      const cSnapshot = await getDocs(query(collection(db, 'tenants', tenantId, 'users'), where('role', '==', 'client')));
      setDbClients(cSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as User)));
    };
    fetchClients();
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    setFinanceLoading(true);
    
    const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
    let q = query(installmentsRef, where('status', 'in', ['paid', 'refund', 'retention']));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rawItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
      
      const report = financialService.calculateConsolidatedReport(rawItems, filterProduct, filterClient, startDate, endDate);
      report.items.sort((a, b) => (b.paid_at || '').localeCompare(a.paid_at || ''));
      
      setFinanceData({
        collected: report.collected,
        refunded: report.refunded,
        retained: report.retained,
        net: report.net,
        items: report.items
      });
      setFinanceLoading(false);
    });

    return () => unsubscribe();
  }, [tenantId, filterProduct, filterClient, startDate, endDate]);

  const chartData = useMemo(() => {
    const dailyData: { [key: string]: number } = {};
    financeData.items.forEach(item => {
      if (item.status === 'paid') {
        const date = item.paid_at ? item.paid_at.split('T')[0] : '';
        if (date) {
          dailyData[date] = (dailyData[date] || 0) + (Number(item.amount) || 0);
        }
      }
    });

    return Object.entries(dailyData)
      .map(([date, amount]) => ({
        rawDate: date,
        date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR'),
        amount
      }))
      .sort((a, b) => a.rawDate.localeCompare(b.rawDate));
  }, [financeData.items]);

  const exportFinancialToCSV = () => {
    const headers = ['Data', 'Tipo', 'Produto', 'Cotista', 'Valor', 'Motivo'];
    const rows = financeData.items.map(i => [
      i.paid_at ? new Date(i.paid_at).toLocaleDateString() : '-',
      i.status === 'paid' ? 'Pagamento' : i.status === 'refund' ? 'Reembolso' : 'Retenção',
      i.product_name,
      i.owner_name,
      i.amount,
      i.reason || '-'
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + headers.join(";") + "\n"
      + rows.map(e => e.join(";")).join("\n");
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `painel_financeiro_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatCurrency = (val: number) => 
    val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });

  const exportProductToCSV = (productName: string, sales: any[]) => {
    const headers = ["Cota #", "Comprador", "CPF", "Chave PIX", "Parcelas Pagas", "Total Parcelas"];
    const rows = sales.map(s => [s.number || s.id, s.owner, s.cpf || 'Não informado', s.pix_key || '-', s.paid_installments, s.total_installments]);
    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(";")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `vendas_${productName.toLowerCase().replace(/\s+/g, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!stats) return <div className="p-8">Carregando dados...</div>;

  if (selectedProduct) {
    return (
      <div className="space-y-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setSelectedProduct(null)}
              className="p-2 hover:bg-black/5 rounded-full transition-all cursor-pointer border-none bg-transparent"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h2 className="text-3xl font-black tracking-tight">{selectedProduct.name}</h2>
              <p className="text-black/40 text-sm font-medium">Gestão de cotistas e progresso de pagamentos</p>
            </div>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => exportProductToCSV(selectedProduct.name, selectedProduct.sales_details)}
              className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-2xl text-sm font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 cursor-pointer border-none"
            >
              <FileSpreadsheet size={18} /> Exportar Planilha
            </button>
          </div>
        </header>

        <div className="bg-white rounded-3xl p-8 border border-black/5 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-black/5">
                  <th className="py-4 text-xs font-bold uppercase tracking-widest opacity-30 px-4">Cota #</th>
                  <th className="py-4 text-xs font-bold uppercase tracking-widest opacity-30 px-4">Proprietário</th>
                  <th className="py-4 text-xs font-bold uppercase tracking-widest opacity-30 px-4">CPF</th>
                  <th className="py-4 text-xs font-bold uppercase tracking-widest opacity-30 px-4">Chave PIX</th>
                  <th className="py-4 text-xs font-bold uppercase tracking-widest opacity-30 px-4">Parcelas Pagas</th>
                  <th className="py-4 text-xs font-bold uppercase tracking-widest opacity-30 px-4 text-right">Progresso</th>
                </tr>
              </thead>
              <tbody>
                {(selectedProduct.sales_details || []).map((sale: any, idx: number) => (
                  <tr key={idx} className="border-b border-black/5 last:border-0 hover:bg-black/[0.02] transition-all">
                    <td className="py-5 px-4 font-mono font-bold text-indigo-600">#{sale.number || sale.id}</td>
                    <td className="py-5 px-4 font-bold text-black/80">{sale.owner}</td>
                    <td className="py-5 px-4 text-sm text-black/50 font-medium">{sale.cpf || 'Não informado'}</td>
                    <td className="py-5 px-4 text-sm text-black/50 font-medium">{sale.pix_key || '-'}</td>
                    <td className="py-5 px-4 font-bold text-black/70">{sale.paid_installments} / {sale.total_installments}</td>
                    <td className="py-5 px-4">
                      <div className="flex items-center justify-end gap-3">
                        <div className="w-32 h-2 bg-black/5 rounded-full overflow-hidden">
                          <div 
                            className={cn(
                              "h-full transition-all duration-1000",
                              sale.paid_installments === sale.total_installments ? "bg-indigo-600" : "bg-emerald-500"
                            )} 
                            style={{ width: `${sale.total_installments > 0 ? (sale.paid_installments / sale.total_installments) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-black opacity-30 w-8 text-right">
                          {Math.round(sale.total_installments > 0 ? (sale.paid_installments / sale.total_installments) * 100 : 0)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
                {(selectedProduct.sales_details || []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-20 text-center opacity-30 italic font-medium">Nenhuma cota vinculada a este produto ainda.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12 pb-20 text-[#141414]">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-4xl font-black tracking-tighter text-black">Painel de Controle</h2>
          <p className="text-black/40 text-base font-medium">Gestão financeira e operacional consolidada</p>
        </div>
        <div className="flex items-center gap-4 bg-white/50 backdrop-blur-sm p-2 rounded-2xl border border-black/5">
          <div className="text-right px-4">
            <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Status do Servidor</p>
            <p className="text-xs font-black flex items-center gap-2 text-emerald-600">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> 
              Sincronizado {currentTime.toLocaleDateString('pt-BR')} {currentTime.toLocaleTimeString('pt-BR')}
            </p>
          </div>
        </div>
      </header>

      {/* Main Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          label="Produtos Ativos" 
          value={(dbProducts.length || 0).toString()} 
          sub="Total em oferta" 
          onClick={() => navigate('/products')}
        />
        <StatCard label="Vendas Totais" value={(stats?.sales || 0).toString()} sub="Cotas comercializadas" />
        <StatCard 
          label="Pagamentos Pendentes" 
          value={formatCurrency(stats?.pendingPayments || 0)} 
          sub="Aguardando confirmação" 
          onClick={() => navigate('/payments')} 
        />
        <FinanceCard label="Arrecadação Bruta" value={financeData.collected} color="text-emerald-600" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <FinanceCard label="Estornos Realizados" value={financeData.refunded} color="text-red-500" />
        <FinanceCard label="Valores Retidos" value={financeData.retained} color="text-amber-600" />
        <FinanceCard label="Resultado Líquido" value={financeData.net} color="text-indigo-600" bg="bg-indigo-50/50" />
      </div>

      {/* Product List - Full width, 4 per line */}
      <div className="space-y-6">
        <div className="px-4 flex items-center justify-between">
          <h3 className="font-black text-2xl tracking-tight">Produtos</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pr-2">
          {(stats?.productRevenue || []).map((pr: any, i: number) => (
            <div 
              key={i} 
              className="bg-white p-8 rounded-[40px] border border-black/5 shadow-sm space-y-6 hover:border-indigo-600/20 active:scale-[0.98] transition-all cursor-pointer group"
              onClick={() => setSelectedProduct(pr)}
            >
              <div className="flex justify-between items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-40 mb-2 truncate">{pr.name}</p>
                  <p className="text-3xl font-black font-serif leading-tight break-words text-[#141414]">{formatCurrency(pr.revenue)}</p>
                </div>
                <div className="bg-black/[0.03] p-4 rounded-3xl shrink-0 text-center min-w-[70px]">
                  <p className="text-[10px] font-bold uppercase tracking-widest opacity-20 leading-none mb-1">Cotas</p>
                  <p className="text-xl font-black font-serif text-black/80 leading-none">{pr.total_quotas}</p>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-6 border-t border-black/5">
                <button 
                  onClick={(e) => { e.stopPropagation(); exportProductToCSV(pr.name, pr.sales_details); }}
                  className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-xl hover:bg-indigo-600 transition-all text-[10px] font-black uppercase tracking-tighter cursor-pointer border-none"
                >
                  <FileSpreadsheet size={14} /> Planilha
                </button>
                <button className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-black/20 group-hover:text-indigo-600 transition-all bg-transparent border-none cursor-pointer">
                  Relatório <ChevronRight size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-8">
        {/* Performance Evolution Chart */}
        <div className="bg-white p-10 rounded-[48px] border border-black/5 shadow-sm space-y-8 w-full">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-black tracking-tight">Evolução de Fluxo</h3>
              <p className="text-black/40 text-sm font-medium">Acompanhamento diário de recebimentos</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
              <TrendingUp size={24} />
            </div>
          </div>
          {chartData.length > 0 ? (
            <div className="h-[350px] w-full animate-fade-in">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#14141408" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: '900', opacity: 0.3 }} dy={15} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: '900', opacity: 0.3 }} tickFormatter={(val) => `R$ ${val}`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '32px', border: 'none', boxShadow: '0 30px 60px -12px rgba(0,0,0,0.15)', padding: '24px' }} 
                    itemStyle={{ fontWeight: '900', color: '#141414', fontSize: '14px' }} 
                    cursor={{ stroke: '#4f46e5', strokeWidth: 1, strokeDasharray: '4 4' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="amount" 
                    name="Recebido" 
                    stroke="#4f46e5" 
                    strokeWidth={5} 
                    dot={{ r: 8, fill: '#4f46e5', strokeWidth: 3, stroke: '#fff' }} 
                    activeDot={{ r: 10, strokeWidth: 0 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[350px] flex items-center justify-center bg-black/[0.02] rounded-3xl border-2 border-dashed border-black/5 text-black/20 italic font-medium">
              Dados insuficientes para gerar a projeção de crescimento diário.
            </div>
          )}
        </div>
      </div>

      {/* Merged Transaction Conferencing */}
      <div className="bg-white p-10 rounded-[56px] border border-black/5 shadow-sm space-y-10">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div className="space-y-2">
            <h3 className="text-2xl font-black tracking-tight underline decoration-indigo-600 decoration-4 underline-offset-8">Extrato de Fluxo</h3>
            <p className="text-black/40 text-sm font-medium">Auditoria financeira detalhada e filtros de busca avançada</p>
          </div>
          <button 
            onClick={exportFinancialToCSV}
            className="flex items-center gap-3 px-8 py-4 bg-[#141414] text-white rounded-[24px] font-black hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-black/20 uppercase tracking-widest text-xs cursor-pointer border-none"
          >
            <FileDown size={20} /> Exportar CSV
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-2">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-30 ml-2">Seleção de Produto</label>
            <select value={filterProduct} onChange={e => setFilterProduct(e.target.value)} className="w-full p-5 bg-black/[0.03] rounded-[24px] font-bold outline-none border-2 border-transparent focus:border-indigo-600 focus:bg-white transition-all text-sm">
              <option value="all">Ver Todos os Produtos</option>
              {dbProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-30 ml-2">Filtro de Cotista</label>
            <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="w-full p-5 bg-black/[0.03] rounded-[24px] font-bold outline-none border-2 border-transparent focus:border-indigo-600 focus:bg-white transition-all text-sm">
              <option value="all">Ver Todos os Cotistas</option>
              {dbClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-30 ml-2">Data Inicial</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-5 bg-black/[0.03] rounded-[24px] text-sm font-bold outline-none focus:border-indigo-600 focus:bg-white border-2 border-transparent transition-all" />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-30 ml-2">Data Final</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-5 bg-black/[0.03] rounded-[24px] text-sm font-bold outline-none focus:border-indigo-600 focus:bg-white border-2 border-transparent transition-all" />
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-black/5">
                <th className="pb-6 text-[10px] font-black uppercase opacity-20 px-6">Data</th>
                <th className="pb-6 text-[10px] font-black uppercase opacity-20 px-6">Categoria</th>
                <th className="pb-6 text-[10px] font-black uppercase opacity-20 px-6">Especificação</th>
                <th className="pb-6 text-[10px] font-black uppercase opacity-20 px-6">Titular</th>
                <th className="pb-6 text-[10px] font-black uppercase opacity-20 px-6 text-right">Montante</th>
              </tr>
            </thead>
            <tbody>
              {financeLoading ? (
                <tr><td colSpan={5} className="py-32 text-center opacity-30 italic font-bold text-lg tracking-tight">Carregando registros financeiros...</td></tr>
              ) : financeData.items.length === 0 ? (
                <tr><td colSpan={5} className="py-32 text-center opacity-30 italic font-bold">Não detectamos lançamentos para este período e filtros.</td></tr>
              ) : financeData.items.map((item, idx) => (
                <tr key={idx} className="group border-b border-black/[0.03] last:border-0 hover:bg-black/[0.01] transition-all">
                  <td className="py-6 px-6 text-xs font-black font-mono opacity-60">
                    {item.paid_at ? new Date(item.paid_at).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="py-6 px-6">
                    <span className={cn(
                      "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.1em]",
                      item.status === 'paid' ? "bg-emerald-50 text-emerald-600" : 
                      item.status === 'refund' ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                    )}>
                      {item.status === 'paid' ? 'Crédito' : item.status === 'refund' ? 'Débito' : 'Retenção'}
                    </span>
                  </td>
                  <td className="py-6 px-6 text-sm font-black text-black/80">{item.product_name}</td>
                  <td className="py-6 px-6 text-sm font-bold text-black/40">{item.owner_name}</td>
                  <td className={cn(
                    "py-6 px-6 text-lg font-black text-right font-serif tracking-tighter",
                    item.status === 'paid' ? "text-emerald-600" : "text-red-500"
                  )}>
                    {item.status === 'refund' ? '-' : ''}{formatCurrency(item.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
