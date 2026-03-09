export type Role = 'admin' | 'manager' | 'client';

export interface User {
  id: number;
  tenant_id: number;
  name: string;
  email: string;
  role: Role;
  cpf?: string;
  pix_key?: string;
  signed_term_at?: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  image_url?: string;
  total_quotas: number;
  quota_price: number;
  available_quotas: number;
  sold_quotas: number;
  payment_type: 'cash' | 'installments';
  expiration_month?: string;
  created_at: string;
}

export interface Quota {
  id: number;
  product_id: number;
  number: string;
  owner_id?: number;
  status: 'available' | 'sold' | 'grouped';
  price: number;
  parent_quota_id?: number;
}

export interface ChatMessage {
  userName: string;
  message: string;
  createdAt: string;
  mentionUserId?: number | null;
}

export interface Installment {
  id: number;
  quota_id: number;
  amount: number;
  due_date: string;
  status: 'pending' | 'paid';
  paid_at?: string;
}
