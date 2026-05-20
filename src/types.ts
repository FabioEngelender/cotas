export type Role = 'admin' | 'manager' | 'client';

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: Role;
  cpf?: string;
  phone?: string;
  address?: string;
  pix_key?: string;
  signed_term_at?: string;
  signed_term_ip?: string;
  has_overdue_payments?: boolean;
}

// Explicit Profile Aliases
export interface Customer extends User {
  role: 'client';
}

export interface Product {
  id: string;
  name: string;
  description: string;
  image_url?: string;
  total_quotas: number;
  quota_price: number;
  available_quotas: number;
  sold_quotas: number;
  payment_type: 'cash' | 'installments' | 'recurrent';
  expiration_month?: string;
  created_at: string;
  status: 'draft' | 'active' | 'closed' | 'archived';
  closed_at?: string;
  closed_by_id?: string;
  closed_by_name?: string;
  default_rule_type?: 'percentage_of_paid';
  retention_percent?: number;
  allow_manual_adjustment?: boolean;
}

export interface OwnershipHistory {
  id: string;
  user_id: string;
  user_name: string;
  joined_at: string;
  left_at?: string;
  exit_type?: 'cancellation' | 'resale' | 'default';
  financial?: {
    total_paid: number;
    retention_value: number;
    refund_value: number;
  };
}

export interface Quota {
  id: string;
  product_id: string;
  number: string;
  owner_id?: string;
  owner_name?: string;
  owner_cpf?: string;
  product_name?: string;
  status: 'available' | 'sold' | 'grouped' | 'defaulted' | 'reserved';
  price: number;
  parent_quota_id?: string;
  parent_id?: string; // baseQuotaId
  baseQuotaId?: string;
  subdivided_into?: string;
  sold_at?: string;
  is_paid?: boolean;
  reserved_by?: string;
  reserved_at?: string;
  totalFractions?: number;
  occupiedFractions?: number;
}

export interface Fraction extends Quota {
  parent_id: string; // Must refer to a parent base quota
  baseQuotaId: string;
  fractionIndex: number;
  fractionSize: number;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  userName: string;
  message: string;
  createdAt: any;
  mentionUserId?: string | null;
}

export interface Installment {
  id: string;
  quota_id: string;
  quota_number?: string;
  product_id?: string;
  product_name?: string;
  owner_id?: string;
  owner_name?: string;
  owner_cpf?: string;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid' | 'refund' | 'retention' | 'cancelled';
  paid_at?: string;
  paid_by?: string;
  reason?: string;
  proof_url?: string;
  cancelled_at?: string;
  createdAt?: any;
}

// Payment Alias
export interface Payment extends Installment {}

export interface Refund {
  id: string;
  installment_id: string;
  quota_id: string;
  owner_id: string;
  owner_name: string;
  amount: number;
  reason: string;
  proof_url?: string;
  refunded_at: string;
}

export interface Transaction {
  id: string;
  tenant_id: string;
  quota_id: string;
  amount: number;
  type: 'payment' | 'refund' | 'retention';
  timestamp: string;
  processed_by: string;
}

export interface AuditLog {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  details: string;
  created_at: any;
  financial?: {
    total_paid: number;
    retention_value: number;
    refund_value: number;
    refund_proof_url?: string;
  };
  quota_id?: string;
  previous_owner_id?: string;
  previous_owner_name?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
}
