import type { OrderStatus, Product, Settings, Status } from './types';

export const CATS = ['護膚', '化妝', '保健品', '日用品'];
export const CONCERNS = ['保濕', '美白', '防曬', '暗瘡', '毛孔', '敏感肌', '抗老', '眼睛疲勞', '腸胃保養', '睡眠質素', '關節保養', '日常營養'];
export const STATUS: Record<Status, string> = { preorder: '接受預訂', instock: '現貨', soldout: '售罄' };
export const TAGS: Record<string, string> = { '': '無', 新品: '新品', 限定: '限定', 熱賣: '熱賣' };
export const OST: Record<OrderStatus, string> = {
  pending: '待確認', confirmed: '已確認待付款', paid: '已付款', arrived: '已到港', done: '已取貨', cancelled: '已取消',
};
export const PICKUPS = ['順豐站或智能櫃自取', '順豐送貨上門', '約定地點面交'];
export const DEF_NAME = '日本藥妝預訂';
export const DEF_TAG = '日本藥妝、護膚及保健品代購，由日本買手定期採購，集中寄運香港。';
export const DEF_RETURNS = '代購貨品一經確認不設退換。如貨品於運送途中損壞或與訂單不符，請於取貨後48小時內以 WhatsApp 傳送相片通知我們處理。';

export const num = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isNaN(n) ? null : n;
};
export const money = (n: number | null | undefined) => Number(n || 0).toLocaleString('en-HK', { maximumFractionDigits: 1 });
export const yen = (n: number | null | undefined) => '¥' + Number(n || 0).toLocaleString('ja-JP');

export function saleOn(p: Product, now = Date.now()) {
  const sp = num(p.sale_price);
  if (sp == null || sp >= p.price) return false;
  if (!p.sale_ends) return true;
  const d = new Date(p.sale_ends).getTime();
  return Number.isNaN(d) || d > now;
}
export const priceOf = (p: Product, now = Date.now()) => (saleOn(p, now) ? (num(p.sale_price) as number) : p.price);
export const offPct = (p: Product, now = Date.now()) => (saleOn(p, now) ? Math.round((1 - (num(p.sale_price) as number) / p.price) * 100) : 0);
export function savePct(p: Product, now = Date.now()) {
  const hk = num(p.hk_price);
  const pr = priceOf(p, now);
  if (!hk || hk <= pr) return 0;
  return Math.round((1 - pr / hk) * 100);
}
export function remaining(p: Product) {
  const l = num(p.limit_qty);
  if (!l) return null;
  return Math.max(0, l - (p.sold || 0));
}
export const isSoldout = (p: Product) => p.status === 'soldout' || remaining(p) === 0;
export function maxOf(p: Product) {
  const r = remaining(p);
  return Math.max(1, Math.min(99, num(p.max_per_order) || 99, r == null ? 99 : r));
}
export function left(ms: number) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  return `${d ? d + '日 ' : ''}${h}小時 ${m}分`;
}

/* 一律以香港時間顯示，伺服器（UTC）和瀏覽器結果一致 */
const HK = 'Asia/Hong_Kong';
function hkParts(d: Date) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: HK, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' });
  const o: Record<string, string> = {};
  for (const x of f.formatToParts(d)) o[x.type] = x.value;
  return o;
}
export function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const o = hkParts(d);
  const h = Number(o.hour);
  const wd = { Sun: '日', Mon: '一', Tue: '二', Wed: '三', Thu: '四', Fri: '五', Sat: '六' }[o.weekday] || '';
  return `${Number(o.month)}月${Number(o.day)}日（${wd}）${h < 12 ? '上午' : h < 18 ? '下午' : '晚上'}${h % 12 || 12}:${o.minute}`;
}
/* datetime-local 欄位（香港時間）與 ISO 互換 */
export function toLocalInput(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const o = hkParts(d);
  const p = (s: string) => s.padStart(2, '0');
  return `${o.year}-${p(o.month)}-${p(o.day)}T${p(o.hour)}:${o.minute}`;
}
export function fromLocalInput(v: string) {
  return v ? new Date(v + ':00+08:00').toISOString() : null;
}

export function cutText(st: Settings) {
  return st.cutoff_at ? fmtDate(st.cutoff_at) : '';
}

export function shipping(st: Settings, sub: number) {
  const fee = num(st.ship_fee) || 0, free = num(st.free_ship);
  if (!fee) return { fee: 0, label: '運費按取貨方式另計' };
  if (free && sub >= free) return { fee: 0, label: '已達免運費門檻' };
  return { fee, label: free ? `滿 HK$${money(free)} 免運費，尚差 HK$${money(free - sub)}` : '' };
}

export function photoUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/${path}`;
}

export function waNumber(raw: string) {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length === 8 ? '852' + d : d;
}
