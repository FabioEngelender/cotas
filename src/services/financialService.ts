import { Quota, Installment, Product, User } from '../types.js';

/**
 * financialService.ts
 * Centralized financial service for pool operations.
 * Employs cent-based integer math to prevent floating point inaccuracies.
 */

export const toCents = (val: number): number => Math.round((val || 0) * 100);
export const fromCents = (cents: number): number => cents / 100;

export const exactSum = (arr: number[]): number => {
  const sumCents = arr.reduce((acc, val) => acc + toCents(val), 0);
  return fromCents(sumCents);
};

export interface DashboardStats {
  products: number;
  sales: number;
  revenue: number;
  pendingPayments: number;
  receivedPayments: number;
  productRevenue: {
    id: string;
    name: string;
    revenue: number;
    total_quotas: number;
    sales_details: {
      id: string;
      number: string;
      owner: string | undefined;
      cpf: string | undefined;
      pix_key: string;
      paid_installments: number;
      total_installments: number;
    }[];
  }[];
}

export const financialService = {
  toCents,
  fromCents,
  exactSum,

  /**
   * Calculate consolidated dashboard metrics
   */
  calculateDashboardStats(
    products: Product[],
    quotas: Quota[],
    installments: Installment[],
    dbClients: User[] = []
  ): DashboardStats {
    if (products.length === 0) {
      return {
        products: 0,
        sales: 0,
        revenue: 0,
        pendingPayments: 0,
        receivedPayments: 0,
        productRevenue: []
      };
    }

    const soldQuotasStats = quotas.filter(q => q.status === 'sold' || q.status === 'defaulted');
    
    // exact summation of paid status installments
    const receivedPayments = exactSum(installments
      .filter(i => i.status === 'paid' || i.status === 'refund')
      .map(i => Number(i.amount) || 0));

    // exact summation of pending status installments
    const pendingPayments = exactSum(installments
      .filter(i => i.status === 'pending')
      .map(i => Number(i.amount) || 0));

    const productRevenue = products.map((p: Product) => {
      const pQuotas = quotas.filter(q => q.product_id === p.id && q.status !== 'grouped');
      const pSoldQuotas = pQuotas.filter(q => q.status === 'sold' || q.status === 'defaulted');
      const pInstallments = installments.filter(i => i.product_id === p.id);
      
      const revenue = exactSum(pInstallments
        .filter(i => i.status === 'paid' || i.status === 'refund')
        .map(i => Number(i.amount) || 0));

      const sales_details = pSoldQuotas.map(q => {
        const client = dbClients.find(c => c.id === q.owner_id);
        const qInstallments = pInstallments.filter(i => i.quota_id === q.id);
        return {
          id: q.id,
          number: q.number,
          owner: q.owner_name,
          cpf: q.owner_cpf,
          pix_key: client?.pix_key || '-',
          paid_installments: qInstallments.filter(i => i.status === 'paid').length,
          total_installments: qInstallments.length
        };
      });

      return { 
        id: p.id,
        name: p.name, 
        revenue, 
        total_quotas: pQuotas.length,
        sales_details 
      };
    });

    return {
      products: products.length,
      sales: soldQuotasStats.length,
      revenue: receivedPayments,
      pendingPayments,
      receivedPayments,
      productRevenue
    };
  },

  /**
   * Estimates cancellation values (refund and retention) based on retention percentage rule
   */
  estimateCancellation(
    totalPaid: number,
    retentionPercent: number
  ): { retentionValue: number; suggestedRefund: number } {
    const totalPaidCents = toCents(totalPaid);
    const retentionCents = Math.round(totalPaidCents * (retentionPercent / 100));
    const refundCents = Math.max(0, totalPaidCents - retentionCents);

    return {
      retentionValue: fromCents(retentionCents),
      suggestedRefund: fromCents(refundCents)
    };
  },

  /**
   * Filters and summarizes financial entries for reports
   */
  calculateConsolidatedReport(
    installments: Installment[],
    filterProduct: string,
    filterClient: string,
    startDate?: string,
    endDate?: string
  ) {
    const filtered = installments.filter(item => {
      if (filterProduct !== 'all' && item.product_id !== filterProduct) return false;
      if (filterClient !== 'all' && item.owner_id !== filterClient) return false;
      if (startDate && item.paid_at && item.paid_at < startDate) return false;
      if (endDate && item.paid_at && item.paid_at > endDate + 'T23:59:59') return false;
      return true;
    });

    const collected = exactSum(filtered
      .filter(i => i.status === 'paid')
      .map(i => Number(i.amount) || 0));

    const refunded = exactSum(filtered
      .filter(i => i.status === 'refund')
      .map(i => Math.abs(Number(i.amount)) || 0));

    const retained = exactSum(filtered
      .filter(i => i.status === 'retention')
      .map(i => Number(i.amount) || 0));

    const net = fromCents(toCents(collected) - toCents(refunded));

    return {
      collected,
      refunded,
      retained,
      net,
      items: filtered
    };
  }
};
