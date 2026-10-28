import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Feature, Product, Settings, ShopData } from './types';
import { DEF_NAME, DEF_TAG } from './shop';

export const REVALIDATE_SECONDS = 60;

const EMPTY_SETTINGS: Settings = {
  id: 1, name: DEF_NAME, tagline: DEF_TAG, announcement: '', whatsapp: '', cutoff_at: null, eta: '',
  ship_fee: null, free_ship: null, fps: '', payme: '', returns: '',
};

export function configured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

function client() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

/* 店面所需的公開資料；連線失敗時回傳空資料，頁面會顯示提示而不會整頁出錯 */
export async function getShopData(): Promise<ShopData & { error?: string }> {
  if (!configured()) return { products: [], features: [], settings: EMPTY_SETTINGS, error: '網店尚未接駁資料庫。' };
  try {
    const db = client();
    const [p, f, s] = await Promise.all([
      db.from('products').select('*').order('created_at', { ascending: false }),
      db.from('features').select('*').order('sort_order'),
      db.from('settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (p.error) throw p.error;
    return {
      products: (p.data || []) as Product[],
      features: (f.data || []) as Feature[],
      settings: { ...EMPTY_SETTINGS, ...((s.data || {}) as Partial<Settings>) },
    };
  } catch {
    return { products: [], features: [], settings: EMPTY_SETTINGS, error: '目前未能載入產品資料，請稍後重新整理頁面。' };
  }
}
