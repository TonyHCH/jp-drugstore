export type Status = 'preorder' | 'instock' | 'soldout';
export type OrderStatus = 'pending' | 'confirmed' | 'paid' | 'arrived' | 'done' | 'cancelled';

export interface Review { name: string; stars: number; text: string }

export interface Product {
  id: string;
  name: string;
  jp_name: string;
  brand: string;
  category: string;
  price: number;
  status: Status;
  tag: string;
  concerns: string[];
  hk_price: number | null;
  sale_price: number | null;
  sale_ends: string | null;
  limit_qty: number | null;
  max_per_order: number | null;
  jp_price: number | null;
  size: string;
  expiry: string;
  release_date: string;
  award: string;
  cosme_score: number | null;
  description: string;
  usage: string;
  ingredients: string;
  reviews: Review[];
  photos: string[];
  sold: number;
  example: boolean;
  created_at: string;
}

export interface Feature {
  id: string;
  title: string;
  description: string;
  sort_order: number;
  product_ids: string[];
}

export interface Settings {
  id: number;
  name: string;
  tagline: string;
  announcement: string;
  whatsapp: string;
  cutoff_at: string | null;
  eta: string;
  ship_fee: number | null;
  free_ship: number | null;
  fps: string;
  payme: string;
  returns: string;
}

export interface Promo { code: string; type: 'pct' | 'amt'; value: number; min_spend: number | null; expires: string | null }
export interface Cost { product_id: string; jpy: number; extra: number }

export interface OrderItem { id: string; name: string; jpName: string; price: number; qty: number }
export interface Order {
  code: string;
  round: string;
  name: string;
  phone: string;
  pickup: string;
  note: string;
  items: OrderItem[];
  subtotal: number;
  promo: string;
  discount: number;
  ship: number;
  total: number;
  status: OrderStatus;
  created_at: string;
}

export interface PlacedOrder {
  code: string;
  round: string;
  items: OrderItem[];
  subtotal: number;
  promo: string;
  discount: number;
  ship: number;
  total: number;
  promoError: string | null;
}

export interface ShopData { products: Product[]; features: Feature[]; settings: Settings }
