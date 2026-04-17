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
  amount: number;
  due_date: string;
  status: 'pending' | 'paid';
  paid_at?: string;
}
