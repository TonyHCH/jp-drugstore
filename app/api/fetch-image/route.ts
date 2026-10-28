import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/* 管理員貼上相片網址時，由伺服器代為下載，瀏覽器再壓縮及上載；只接受已登入的管理員 */
const MAX = 8 * 1024 * 1024;

export async function POST(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: '請先登入' }, { status: 401 });
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: ok } = await db.rpc('is_admin');
  if (ok !== true) return NextResponse.json({ error: '沒有權限' }, { status: 403 });

  let url: URL;
  try { url = new URL(String((await req.json()).url || '')); } catch { return NextResponse.json({ error: '網址格式不正確' }, { status: 400 }); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return NextResponse.json({ error: '只接受 http 或 https 網址' }, { status: 400 });
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(url.hostname)) return NextResponse.json({ error: '不接受內部網址' }, { status: 400 });

  try {
    const r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (jp-drugstore image import)' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return NextResponse.json({ error: `對方網站回應 ${r.status}，未能下載` }, { status: 400 });
    const type = r.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return NextResponse.json({ error: '這個網址不是相片，請在相片上按右鍵選「複製圖片位址」' }, { status: 400 });
    const buf = await r.arrayBuffer();
    if (buf.byteLength > MAX) return NextResponse.json({ error: '相片太大（超過 8MB）' }, { status: 400 });
    return new NextResponse(buf, { headers: { 'content-type': type, 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: '未能下載這張相片，請稍後再試或改為直接上載' }, { status: 400 });
  }
}
