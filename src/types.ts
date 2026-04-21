export type Role = 'admin' | 'manager' | 'client';

export interface User {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: Role;
  cpf?: string;
  pix_key?: string;
  signed_term_at?: string;
  has_overdue_payments?: boolean;
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
  status: 'active' | 'closed';
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
  status: 'available' | 'sold' | 'grouped' | 'defaulted';
  price: number;
  parent_quota_id?: string;
  sold_at?: string;
  is_paid?: boolean;
}

export interface ChatMessage {
  id: string;
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
  amount: number;
  due_date: string;
  status: 'pending' | 'paid' | 'refund' | 'retention';
  paid_at?: string;
  reason?: string;
  proof_url?: string;
}
