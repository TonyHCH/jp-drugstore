'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from '@/lib/supabase-browser';
import {
  CATS, CONCERNS, DEF_RETURNS, OST, STATUS, TAGS, cutText, fromLocalInput, isSoldout, money, num, photoUrl, priceOf,
  remaining, saleOn, toLocalInput, waNumber, yen,
} from '@/lib/shop';
import type { Cost, Feature, Order, OrderStatus, Product, Promo, Review, Settings } from '@/lib/types';

type Tab = 'products' | 'orders' | 'purchase' | 'features' | 'settings';
interface Data {
  products: Product[]; costs: Record<string, Cost>; orders: Order[]; features: Feature[];
  settings: Settings | null; promos: Promo[]; rate: number;
}
const EMPTY: Data = { products: [], costs: {}, orders: [], features: [], settings: null, promos: [], rate: 0.052 };

/* 通知店面重新整理快取，令修改即時生效 */
async function refreshStore() {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  try { await fetch('/api/revalidate', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }); } catch { /* 下一次自動更新時仍會生效 */ }
}

async function copy(t: string, toast: (s: string) => void) {
  try { await navigator.clipboard.writeText(t); toast('已複製'); } catch { toast('未能複製，請手動選取'); }
}

export default function Admin() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [d, setD] = useState<Data>(EMPTY);
  const [tab, setTab] = useState<Tab>('orders');
  const [toastMsg, setToastMsg] = useState('');
  const [sheet, setSheet] = useState<null | { kind: 'product'; id: string | null } | { kind: 'feature'; id: string | null } | { kind: 'msg'; code: string }>(null);

  const toast = useCallback((t: string) => { setToastMsg(t); setTimeout(() => setToastMsg(''), 2800); }, []);

  useEffect(() => {
    sb().auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = sb().auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const db = sb();
    const [adm, p, c, o, f, s, pr, cf] = await Promise.all([
      db.rpc('is_admin'),
      db.from('products').select('*').order('created_at', { ascending: false }),
      db.from('costs').select('*'),
      db.from('orders').select('*').order('created_at', { ascending: false }),
      db.from('features').select('*').order('sort_order'),
      db.from('settings').select('*').eq('id', 1).maybeSingle(),
      db.from('promos').select('*').order('code'),
      db.from('config').select('*').eq('id', 1).maybeSingle(),
    ]);
    setIsAdmin(adm.data === true);
    if (adm.data !== true) return;
    const costs: Record<string, Cost> = {};
    (c.data || []).forEach((x: Cost) => { costs[x.product_id] = x; });
    setD({
      products: (p.data || []) as Product[], costs, orders: (o.data || []) as Order[], features: (f.data || []) as Feature[],
      settings: (s.data || null) as Settings | null, promos: (pr.data || []) as Promo[], rate: num(cf.data?.rate) || 0.052,
    });
  }, []);

  useEffect(() => { if (session) load(); else setIsAdmin(null); }, [session, load]);
  /* 訂單會由客人直接送入，停留在訂單頁時每分鐘自動更新 */
  useEffect(() => {
    if (!session || tab !== 'orders') return;
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [session, tab, load]);
  useEffect(() => { document.body.style.overflow = sheet ? 'hidden' : ''; }, [sheet]);

  if (!ready) return <main className="wrap"><div className="login"><p className="hint">載入中…</p></div></main>;
  if (!session) return <Login />;
  if (isAdmin === false) {
    return (
      <main className="wrap"><div className="login">
        <h1>沒有管理權限</h1>
        <p className="hint">這個帳戶（{session.user.email}）不在管理員名單內。</p>
        <p style={{ marginTop: 14 }}><button className="btn" type="button" onClick={() => sb().auth.signOut()}>登出</button></p>
      </div></main>
    );
  }

  const pend = d.orders.filter((o) => o.status === 'pending').length;
  const tabs: [Tab, string][] = [['orders', '訂單'], ['products', '產品'], ['purchase', '採購清單'], ['features', '專題'], ['settings', '店舖設定']];
  const costOf = (id: string) => { const c = d.costs[id]; if (!c || (!c.jpy && !c.extra)) return null; return Number(c.jpy || 0) * d.rate + Number(c.extra || 0); };

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brand"><h1>{d.settings?.name || '日本藥妝預訂'}・管理</h1><small>{session.user.email}</small></div>
          <div className="topnav">
            <Link className="btn" href="/" target="_blank">打開店面</Link>
            <button className="btn" type="button" onClick={() => sb().auth.signOut()}>登出</button>
          </div>
        </div>
      </header>
      <main className="wrap">
        <div className="admin">
          <nav className="tabs" aria-label="管理分頁">
            {tabs.map(([k, t]) => (
              <button key={k} className="tab" type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
                {t}{k === 'orders' && pend ? <> <span className="count">{pend}</span></> : null}
              </button>))}
          </nav>
          {isAdmin === null ? <p className="hint">載入中…</p> : (
            <>
              {tab === 'products' && <Products d={d} costOf={costOf} edit={(id) => setSheet({ kind: 'product', id })} />}
              {tab === 'orders' && <Orders d={d} costOf={costOf} reload={load} toast={toast} msg={(code) => setSheet({ kind: 'msg', code })} />}
              {tab === 'purchase' && <Purchase d={d} toast={toast} />}
              {tab === 'features' && <Features d={d} edit={(id) => setSheet({ kind: 'feature', id })} />}
              {tab === 'settings' && <SettingsForm d={d} reload={load} toast={toast} />}
            </>)}
        </div>
      </main>
      {sheet && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) setSheet(null); }}>
          <div className="sheet" role="dialog" aria-modal="true">
            {sheet.kind === 'product' && <ProductEditor d={d} id={sheet.id} close={() => setSheet(null)} reload={load} toast={toast} />}
            {sheet.kind === 'feature' && <FeatureEditor d={d} id={sheet.id} close={() => setSheet(null)} reload={load} toast={toast} />}
            {sheet.kind === 'msg' && <OrderMsg d={d} code={sheet.code} close={() => setSheet(null)} toast={toast} />}
          </div>
        </div>)}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </>
  );
}

function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('');
    const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password: pw });
    setBusy(false);
    if (error) setErr(error.message.includes('Invalid') ? '電郵或密碼不正確' : '未能登入，請稍後再試');
  }
  return (
    <main className="wrap">
      <form className="login f" onSubmit={submit}>
        <h1>網店管理登入</h1>
        <p className="hint">只限管理員使用。</p>
        <div className="fld"><label htmlFor="em">電郵</label><input id="em" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="fld"><label htmlFor="pw">密碼</label><input id="pw" type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <button className="btn primary" type="submit" disabled={busy} style={{ padding: 10 }}>{busy ? '登入中…' : '登入'}</button>
        {err && <p className="err">{err}</p>}
      </form>
    </main>
  );
}

function SheetHead({ title, close }: { title: string; close: () => void }) {
  return <div className="sheet-head"><h3>{title}</h3><button className="x" type="button" onClick={close} aria-label="關閉">×</button></div>;
}
const marginCls = (m: number) => (m >= 0.5 ? 'm-good' : m >= 0.25 ? 'm-warn' : 'm-bad');

/* ---------- 產品 ---------- */
function Products({ d, costOf, edit }: { d: Data; costOf: (id: string) => number | null; edit: (id: string | null) => void }) {
  return (
    <>
      <div className="row"><div><h2>產品管理</h2><p className="hint">成本及毛利只在管理介面顯示，客人看不到。毛利按現時售價（包括特價）計算。</p></div>
        <button className="btn primary" type="button" onClick={() => edit(null)}>＋ 上架新產品</button></div>
      <div className="tbl" style={{ marginTop: 12 }}>
        {d.products.length ? (
          <table><thead><tr><th>產品</th><th>狀態</th><th className="num">售價</th><th className="num">成本</th><th className="num">毛利</th><th className="num">已預訂</th><th /></tr></thead>
            <tbody>{d.products.map((p) => {
              const c = costOf(p.id), pr = priceOf(p), m = c != null && pr ? (pr - c) / pr : null, r = remaining(p);
              return (
                <tr key={p.id}>
                  <td>{p.name}{p.example && <> <span className="badge eg">示例</span></>}{saleOn(p) && <> <span className="badge sale">特價</span></>}<br /><span className="hint">{p.category}{p.brand ? ' · ' + p.brand : ''}</span></td>
                  <td>{isSoldout(p) ? '售罄' : STATUS[p.status]}{r != null && <><br /><span className="hint">尚餘 {r}</span></>}</td>
                  <td className="num">HK${money(pr)}{saleOn(p) && <><br /><span className="hint" style={{ textDecoration: 'line-through' }}>HK${money(p.price)}</span></>}</td>
                  <td className="num">{c != null ? 'HK$' + money(c) : '未填'}</td>
                  <td className="num">{m != null ? <span className={marginCls(m)}>{Math.round(m * 100)}%</span> : '未填'}</td>
                  <td className="num">{p.sold || 0}</td>
                  <td><button className="btn sm" type="button" onClick={() => edit(p.id)}>編輯</button></td>
                </tr>);
            })}</tbody></table>
        ) : <p className="hint">未有產品。按「上架新產品」開始。</p>}
      </div>
    </>
  );
}

const reviewsToText = (rs: Review[]) => (rs || []).map((r) => [r.name || '', r.stars || 5, r.text || ''].join('｜')).join('\n');
const parseReviews = (t: string): Review[] => t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
  const parts = l.split(/[|｜]/);
  if (parts.length < 3) return { name: '客人', stars: 5, text: l };
  return { name: parts[0].trim() || '客人', stars: Math.max(1, Math.min(5, num(parts[1]) || 5)), text: parts.slice(2).join('｜').trim() };
}).filter((r) => r.text);

/* 相片統一處理：長邊最多 1400 像素，放入淺色正方形底，令貨架上每件產品大小一致 */
async function shrink(file: Blob): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const side = Math.min(1400, Math.max(bmp.width, bmp.height));
    const sc = side / Math.max(bmp.width, bmp.height);
    const w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
    const c = document.createElement('canvas');
    c.width = side; c.height = side;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, side, side);
    g.drawImage(bmp, Math.round((side - w) / 2), Math.round((side - h) / 2), w, h);
    const b = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.88));
    return b || file;
  } catch { return file; }
}

/* 由網址取得相片（經伺服器下載），轉成可上載的檔案 */
async function fileFromUrl(url: string): Promise<File> {
  const { data } = await sb().auth.getSession();
  const r = await fetch('/api/fetch-image', {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}` },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || '未能下載相片'); }
  const blob = await r.blob();
  return new File([blob], 'web.jpg', { type: blob.type || 'image/jpeg' });
}

function ProductEditor({ d, id, close, reload, toast }: { d: Data; id: string | null; close: () => void; reload: () => Promise<void>; toast: (s: string) => void }) {
  const p = id ? d.products.find((x) => x.id === id) || null : null;
  const c = id ? d.costs[id] : undefined;
  const [f, setF] = useState({
    name: p?.name || '', jp_name: p?.jp_name || '', brand: p?.brand || '', category: p?.category || '護膚',
    status: p?.status || 'preorder', tag: p?.tag || '', concerns: new Set(p?.concerns || []),
    price: String(p?.price ?? ''), hk_price: String(p?.hk_price ?? ''), sale_price: String(p?.sale_price ?? ''), sale_ends: toLocalInput(p?.sale_ends || null),
    limit_qty: String(p?.limit_qty ?? ''), max_per_order: String(p?.max_per_order ?? ''), jp_price: String(p?.jp_price ?? ''),
    size: p?.size || '', expiry: p?.expiry || '', release_date: p?.release_date || '', award: p?.award || '', cosme_score: String(p?.cosme_score ?? ''),
    description: p?.description || '', usage: p?.usage || '', ingredients: p?.ingredients || '', reviews: reviewsToText(p?.reviews || []),
    jpy: String(c?.jpy ?? ''), extra: String(c?.extra ?? ''),
  });
  const [photos, setPhotos] = useState<string[]>(p?.photos || []);
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [sure, setSure] = useState(false);
  const [imgUrl, setImgUrl] = useState('');
  const [fetching, setFetching] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  const base = num(f.price) || 0, sp = num(f.sale_price), pr = sp != null && sp < base ? sp : base;
  const cost = (num(f.jpy) || 0) * d.rate + (num(f.extra) || 0);
  const brands = [...new Set(d.products.map((x) => x.brand).filter(Boolean))];

  async function save(e: FormEvent) {
    e.preventDefault();
    const price = num(f.price);
    if (!f.name.trim() || price == null) { toast('請填寫產品名稱和售價'); return; }
    if (!photos.length && !files.length && !p?.example) { toast('請先加最少一張產品相片，沒有相片的產品不能上架'); return; }
    setBusy(true);
    const db = sb();
    try {
      const pid = p?.id || crypto.randomUUID().replace(/-/g, '').slice(0, 20);
      const all = photos.slice();
      for (const nf of files) {
        const blob = await shrink(nf.file);
        const path = `${pid}/${crypto.randomUUID()}.jpg`;
        const up = await db.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
        if (up.error) throw new Error('相片上載失敗：' + up.error.message);
        all.push(path);
      }
      const row = {
        id: pid, name: f.name.trim(), jp_name: f.jp_name.trim(), brand: f.brand.trim(), category: f.category, price,
        status: f.status, tag: f.tag, concerns: [...f.concerns], hk_price: num(f.hk_price), sale_price: num(f.sale_price),
        sale_ends: fromLocalInput(f.sale_ends), limit_qty: num(f.limit_qty), max_per_order: num(f.max_per_order), jp_price: num(f.jp_price),
        size: f.size.trim(), expiry: f.expiry.trim(), release_date: f.release_date.trim(), award: f.award.trim(), cosme_score: num(f.cosme_score),
        description: f.description.trim(), usage: f.usage.trim(), ingredients: f.ingredients.trim(), reviews: parseReviews(f.reviews),
        photos: all, example: false,
      };
      const r = p ? await db.from('products').update(row).eq('id', pid) : await db.from('products').insert(row);
      if (r.error) throw new Error(r.error.message);
      const jpy = num(f.jpy), extra = num(f.extra);
      if (jpy != null || extra != null) {
        const cr = await db.from('costs').upsert({ product_id: pid, jpy: jpy || 0, extra: extra || 0 });
        if (cr.error) throw new Error(cr.error.message);
      }
      const gone = (p?.photos || []).filter((x) => !all.includes(x) && !/^https?:/.test(x));
      if (gone.length) await db.storage.from('photos').remove(gone);
      await refreshStore();
      await reload();
      close(); toast(p ? '產品已更新' : '產品已上架');
    } catch (err) {
      setBusy(false);
      toast(err instanceof Error ? err.message : '未能儲存，請稍後再試');
    }
  }
  async function del() {
    if (!p) return;
    if (!sure) { setSure(true); return; }
    const db = sb();
    const r = await db.from('products').delete().eq('id', p.id);
    if (r.error) { toast('未能刪除：' + r.error.message); return; }
    const own = p.photos.filter((x) => !/^https?:/.test(x));
    if (own.length) await db.storage.from('photos').remove(own);
    for (const ft of d.features) {
      if (ft.product_ids.includes(p.id)) await db.from('features').update({ product_ids: ft.product_ids.filter((x) => x !== p.id) }).eq('id', ft.id);
    }
    await refreshStore(); await reload(); close(); toast('產品已刪除');
  }
  const total = photos.length + files.length;

  return (
    <>
      <SheetHead title={p ? '編輯產品' : '上架新產品'} close={close} />
      <form className="f" onSubmit={save}>
        <div className="fld"><span className="lbl">產品相片（最多 5 張，第一張為封面）</span>
          <div className="photos">
            {photos.map((x, i) => (
              <div className="pv" key={x}>
                {/* 管理介面的預覽圖用原圖即可，不經圖片優化 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(x)} alt="" />{i === 0 && <span className="cv">封面</span>}
                <button type="button" aria-label="移除相片" onClick={() => setPhotos(photos.filter((y) => y !== x))}>×</button>
              </div>))}
            {files.map((x, i) => (
              <div className="pv" key={x.url}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.url} alt="" />{photos.length + i === 0 && <span className="cv">封面</span>}
                <button type="button" aria-label="移除相片" onClick={() => setFiles(files.filter((y) => y !== x))}>×</button>
              </div>))}
            {total < 5 && (
              <label className="addph">＋ 加相
                <input type="file" accept="image/*" multiple onChange={(e) => {
                  const room = 5 - total;
                  setFiles([...files, ...[...(e.target.files || [])].slice(0, room).map((file) => ({ file, url: URL.createObjectURL(file) }))]);
                  e.target.value = '';
                }} />
              </label>)}
          </div>
          {total < 5 && (
            <div className="urlimp">
              <input type="url" inputMode="url" placeholder="或貼上相片網址" value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} aria-label="相片網址" />
              <button className="btn sm" type="button" disabled={!imgUrl.trim() || fetching} onClick={async () => {
                setFetching(true);
                try { const file = await fileFromUrl(imgUrl.trim()); setFiles([...files, { file, url: URL.createObjectURL(file) }]); setImgUrl(''); }
                catch (err) { toast(err instanceof Error ? err.message : '未能下載相片'); }
                setFetching(false);
              }}>{fetching ? '下載中…' : '加入'}</button>
            </div>)}
          <p className="hint">最少一張，第一張做封面。手機上按「加相」可以即場影相；相片會自動壓縮並放入白色正方形底，貨架上大小一致。</p>
        </div>
        <fieldset className="grp"><legend>基本資料</legend>
          <div className="fld"><label htmlFor="p-name">產品名稱（中文）</label><input id="p-name" required value={f.name} onChange={set('name')} placeholder="肌研極潤玻尿酸化妝水" /></div>
          <div className="fld"><label htmlFor="p-jp">日文名稱</label><input id="p-jp" value={f.jp_name} onChange={set('jp_name')} placeholder="肌ラボ 極潤ヒアルロン液" /></div>
          <div className="two">
            <div className="fld"><label htmlFor="p-brand">品牌</label><input id="p-brand" list="brandList" value={f.brand} onChange={set('brand')} />
              <datalist id="brandList">{brands.map((b) => <option key={b} value={b} />)}</datalist></div>
            <div className="fld"><label htmlFor="p-cat">分類</label><select id="p-cat" value={f.category} onChange={set('category')}>{CATS.map((x) => <option key={x}>{x}</option>)}</select></div>
          </div>
          <div className="two">
            <div className="fld"><label htmlFor="p-status">狀態</label><select id="p-status" value={f.status} onChange={set('status')}>{Object.entries(STATUS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
            <div className="fld"><label htmlFor="p-tag">標籤</label><select id="p-tag" value={f.tag} onChange={set('tag')}>{Object.entries(TAGS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
          </div>
          <div className="fld"><span className="lbl">適合需要（客人可按這些篩選）</span>
            <div className="checks">{CONCERNS.map((x) => (
              <label key={x}><input type="checkbox" checked={f.concerns.has(x)} onChange={(e) => { const s = new Set(f.concerns); if (e.target.checked) s.add(x); else s.delete(x); setF({ ...f, concerns: s }); }} /> {x}</label>))}</div></div>
        </fieldset>
        <fieldset className="grp"><legend>價錢及數量</legend>
          <div className="two">
            <div className="fld"><label htmlFor="p-price">售價（港元）</label><input id="p-price" required inputMode="decimal" value={f.price} onChange={set('price')} /></div>
            <div className="fld"><label htmlFor="p-hk">香港門市參考價（港元）</label><input id="p-hk" inputMode="decimal" value={f.hk_price} onChange={set('hk_price')} placeholder="顯示可慳幾多" /></div>
          </div>
          <div className="two">
            <div className="fld"><label htmlFor="p-sale">限時特價（港元）</label><input id="p-sale" inputMode="decimal" value={f.sale_price} onChange={set('sale_price')} placeholder="留空即無特價" /></div>
            <div className="fld"><label htmlFor="p-saleend">特價結束時間（香港時間）</label><input id="p-saleend" type="datetime-local" value={f.sale_ends} onChange={set('sale_ends')} /></div>
          </div>
          <div className="three">
            <div className="fld"><label htmlFor="p-limit">本輪限量</label><input id="p-limit" inputMode="numeric" value={f.limit_qty} onChange={set('limit_qty')} placeholder="不限" /></div>
            <div className="fld"><label htmlFor="p-max">每單限購</label><input id="p-max" inputMode="numeric" value={f.max_per_order} onChange={set('max_per_order')} placeholder="不限" /></div>
            <div className="fld"><label htmlFor="p-jpp">日本售價參考（円）</label><input id="p-jpp" inputMode="numeric" value={f.jp_price} onChange={set('jp_price')} placeholder="顯示給客人" /></div>
          </div>
          <p className="hint">限量件數會減去已預訂件數，賣完自動顯示售罄。</p>
        </fieldset>
        <fieldset className="grp"><legend>產品資料</legend>
          <div className="three">
            <div className="fld"><label htmlFor="p-size">容量</label><input id="p-size" value={f.size} onChange={set('size')} placeholder="170ml" /></div>
            <div className="fld"><label htmlFor="p-exp">保質期</label><input id="p-exp" value={f.expiry} onChange={set('expiry')} placeholder="開封後12個月" /></div>
            <div className="fld"><label htmlFor="p-rel">日本發售日</label><input id="p-rel" value={f.release_date} onChange={set('release_date')} placeholder="2026年11月1日" /></div>
          </div>
          <div className="two">
            <div className="fld"><label htmlFor="p-award">得獎紀錄</label><input id="p-award" value={f.award} onChange={set('award')} placeholder="@cosme 2026 上半年最佳化妝水第1位" /></div>
            <div className="fld"><label htmlFor="p-cosme">@cosme 評分（滿分 7）</label><input id="p-cosme" inputMode="decimal" value={f.cosme_score} onChange={set('cosme_score')} /></div>
          </div>
          <div className="fld"><label htmlFor="p-desc">產品介紹</label><textarea id="p-desc" value={f.description} onChange={set('description')} placeholder="用途、適合膚質、日本人氣等" /></div>
          <div className="fld"><label htmlFor="p-usage">使用方法</label><textarea id="p-usage" value={f.usage} onChange={set('usage')} /></div>
          <div className="fld"><label htmlFor="p-ing">成分</label><textarea id="p-ing" value={f.ingredients} onChange={set('ingredients')} /></div>
          <div className="fld"><label htmlFor="p-rev">客人評價（每行一則：稱呼｜星數｜內容）</label><textarea id="p-rev" value={f.reviews} onChange={set('reviews')} placeholder="陳小姐｜5｜用了兩星期，皮膚明顯沒那麼乾" />
            <p className="hint">只放真實客人的回饋，例如客人在 WhatsApp 傳來的意見。</p></div>
        </fieldset>
        <fieldset className="grp"><legend>成本（只有管理人員看到）</legend>
          <div className="two">
            <div className="fld"><label htmlFor="p-jpy">實際買入價（円）</label><input id="p-jpy" inputMode="numeric" value={f.jpy} onChange={set('jpy')} /></div>
            <div className="fld"><label htmlFor="p-extra">運費及雜費（港元／件）</label><input id="p-extra" inputMode="decimal" value={f.extra} onChange={set('extra')} /></div>
          </div>
          <div className="calc">
            {num(f.jpy) || num(f.extra) ? (
              <>
                <span>到港成本 <b>HK${money(cost)}</b></span><span>每件毛利 <b>HK${money(pr - cost)}</b></span>
                <span>毛利率 <b>{pr ? Math.round(((pr - cost) / pr) * 100) : 0}%</b></span><span>售價為成本 <b>{cost ? (pr / cost).toFixed(1) : '0'} 倍</b></span>
                {sp != null && sp < base && <span>（按特價計算）</span>}
              </>) : <span>填入實際買入價，即可看到到港成本和毛利。</span>}
          </div>
        </fieldset>
        <div className="row">
          {p ? <button className="btn danger" type="button" onClick={del}>{sure ? '再按一次確認刪除' : '刪除產品'}</button> : <span />}
          <button className="btn primary" type="submit" disabled={busy} style={{ padding: '10px 20px' }}>{busy ? '儲存中…' : p ? '儲存修改' : '上架'}</button>
        </div>
      </form>
    </>
  );
}

/* ---------- 訂單 ---------- */
function Orders({ d, costOf, reload, toast, msg }: { d: Data; costOf: (id: string) => number | null; reload: () => Promise<void>; toast: (s: string) => void; msg: (code: string) => void }) {
  const [of, setOf] = useState<'all' | OrderStatus>('all');
  const [sure, setSure] = useState('');
  const live = d.orders.filter((o) => o.status !== 'cancelled');
  const rev = live.reduce((a, o) => a + Number(o.total || 0), 0);
  const unpaid = d.orders.filter((o) => o.status === 'pending' || o.status === 'confirmed').reduce((a, o) => a + Number(o.total || 0), 0);
  let prof = 0, pk = true;
  live.forEach((o) => {
    let x = 0;
    for (const i of o.items) { const c = costOf(i.id); if (c == null) { pk = false; return; } x += (i.price - c) * i.qty; }
    prof += x - Number(o.discount || 0);
  });
  const list = d.orders.filter((o) => of === 'all' || o.status === of);
  async function setStatus(code: string, st: OrderStatus) {
    const { error } = await sb().rpc('set_order_status', { p_code: code, p_status: st });
    if (error) { toast('未能更新狀態：' + error.message); return; }
    toast(`${code} 已改為${OST[st]}`); await reload(); refreshStore();
  }
  async function del(code: string) {
    if (sure !== code) { setSure(code); setTimeout(() => setSure(''), 4000); return; }
    const { error } = await sb().rpc('delete_order', { p_code: code });
    if (error) { toast('未能刪除：' + error.message); return; }
    toast('訂單已刪除'); await reload(); refreshStore();
  }
  return (
    <>
      <div className="row"><div><h2>訂單</h2><p className="hint">客人在網店送出預訂單後會即時出現在這裏，停留在此頁時每分鐘自動更新。</p></div>
        <button className="btn" type="button" onClick={() => reload().then(() => toast('已更新'))}>重新整理</button></div>
      <div className="kpis">
        <div className="kpi"><small>有效訂單</small><b>{live.length}</b></div>
        <div className="kpi"><small>訂單總額</small><b>HK${money(rev)}</b></div>
        <div className="kpi"><small>未收款</small><b>HK${money(unpaid)}</b></div>
        <div className="kpi"><small>預計毛利</small><b>{pk ? 'HK$' + money(prof) : '部分成本未填'}</b></div>
      </div>
      <nav className="chips" aria-label="訂單狀態" style={{ paddingTop: 0 }}>
        {([['all', '全部'], ...Object.entries(OST)] as [string, string][]).map(([k, t]) => {
          const n = k === 'all' ? d.orders.length : d.orders.filter((o) => o.status === k).length;
          return <button key={k} className="chip" type="button" aria-pressed={of === k} onClick={() => setOf(k as 'all' | OrderStatus)}>{t} {n}</button>;
        })}
      </nav>
      <div className="olist">
        {list.length ? list.map((o) => (
          <div className="ocard" key={o.code}>
            <div className="top"><span className="code">{o.code}</span><span className={`pill s-${o.status}`}>{OST[o.status]}</span></div>
            <div className="meta">{o.name} · {o.phone} · {o.pickup}{o.round ? ` · ${o.round}` : ''}</div>
            <div className="items">{o.items.map((i) => `${i.name} × ${i.qty}`).join('、')}</div>
            {o.promo && <div className="meta">優惠碼 {o.promo}，減 HK${money(o.discount)}</div>}
            {o.note && <div className="meta">備註：{o.note}</div>}
            <div className="foot"><b style={{ fontVariantNumeric: 'tabular-nums' }}>HK${money(o.total)}</b>
              <span className="row" style={{ gap: 6 }}>
                <select aria-label="更改狀態" value={o.status} onChange={(e) => setStatus(o.code, e.target.value as OrderStatus)}>
                  {Object.entries(OST).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
                <button className="btn sm" type="button" onClick={() => msg(o.code)}>通知訊息</button>
                <button className="btn sm danger" type="button" onClick={() => del(o.code)}>{sure === o.code ? '確認刪除' : '刪除'}</button>
              </span></div>
          </div>)) : <div className="empty"><strong>未有訂單</strong>客人送出第一張預訂單後，訂單會出現在這裏。</div>}
      </div>
    </>
  );
}

function OrderMsg({ d, code, close, toast }: { d: Data; code: string; close: () => void; toast: (s: string) => void }) {
  const o = d.orders.find((x) => x.code === code);
  const st = d.settings;
  const pay = [st?.fps ? `轉數快（FPS）：${st.fps}` : null, st?.payme ? `PayMe：${st.payme}` : null].filter(Boolean);
  const head = o ? `${o.name}你好，這是${st?.name || '我們'}的通知。訂單編號 ${o.code}` : '';
  const init = o ? {
    pending: `${head}，我們已收到你的預訂單，正在確認貨量，稍後會再通知你。`,
    confirmed: `${head}，所有產品已確認，合計 HK$${money(o.total)}。${pay.length ? '請以下列方式付款，並傳送付款紀錄：\n' + pay.join('\n') : '請回覆以安排付款。'}`,
    paid: `${head}，已收到你的款項 HK$${money(o.total)}，謝謝！貨品到港後會再通知你。`,
    arrived: `${head}，你的貨品已經到港，我們會盡快以「${o.pickup}」安排，屆時再通知取貨詳情。`,
    done: `${head}，多謝光顧！如對產品有任何意見，歡迎回覆分享，我們會參考作為客人評價。`,
    cancelled: `${head}，你的訂單已取消，如已付款我們會盡快退回款項。`,
  }[o.status] : '';
  const [t, setT] = useState(init);
  if (!o) return <SheetHead title="找不到訂單" close={close} />;
  const wa = waNumber(o.phone);
  return (
    <>
      <SheetHead title={`通知客人：${OST[o.status]}`} close={close} />
      <textarea className="out" style={{ minHeight: 140, whiteSpace: 'pre-wrap' }} value={t} onChange={(e) => setT(e.target.value)} />
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-start' }}>
        <button className="btn primary" type="button" onClick={() => copy(t, toast)}>複製訊息</button>
        {wa && <a className="btn" href={`https://wa.me/${wa}?text=${encodeURIComponent(t)}`} target="_blank" rel="noopener noreferrer">以 WhatsApp 傳給客人</a>}
      </div>
    </>
  );
}

/* ---------- 採購清單 ---------- */
function Purchase({ d, toast }: { d: Data; toast: (s: string) => void }) {
  const [paidOnly, setPaidOnly] = useState(false);
  const rows = useMemo(() => {
    const ok = paidOnly ? ['paid'] : ['pending', 'confirmed', 'paid'];
    const map: Record<string, { id: string; name: string; jpName: string; brand: string; qty: number; orders: number }> = {};
    d.orders.filter((o) => ok.includes(o.status)).forEach((o) => o.items.forEach((i) => {
      const p = d.products.find((x) => x.id === i.id);
      map[i.id] = map[i.id] || { id: i.id, name: p?.name || i.name, jpName: p?.jp_name || i.jpName || '', brand: p?.brand || '', qty: 0, orders: 0 };
      map[i.id].qty += i.qty; map[i.id].orders++;
    }));
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [d, paidOnly]);
  let jpyTotal = 0, known = true;
  rows.forEach((r) => { const c = d.costs[r.id]; if (c && c.jpy) jpyTotal += c.jpy * r.qty; else known = false; });
  const ct = d.settings ? cutText(d.settings) : '';
  const text = [`【採購清單】${ct ? '截單輪次：' + ct : ''}`.trim(), '',
    ...rows.map((r, i) => `${i + 1}. ${r.jpName || r.name}${r.brand ? '（' + r.brand + '）' : ''}\n   中文：${r.name}\n   數量：${r.qty}`), '',
    `合共 ${rows.length} 款，${rows.reduce((a, r) => a + r.qty, 0)} 件`].join('\n');
  return (
    <>
      <div className="row"><div><h2>採購清單</h2><p className="hint">把所有未到港訂單的產品合併計算，直接複製給日本買手。</p></div>
        <button className="btn primary" type="button" disabled={!rows.length} onClick={() => copy(text, toast)}>複製給買手</button></div>
      <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={paidOnly} onChange={(e) => setPaidOnly(e.target.checked)} /> 只計算已付款訂單</label>
      <div className="kpis">
        <div className="kpi"><small>產品款數</small><b>{rows.length}</b></div>
        <div className="kpi"><small>總件數</small><b>{rows.reduce((a, r) => a + r.qty, 0)}</b></div>
        <div className="kpi"><small>預計採購金額</small><b>{yen(jpyTotal)}{known ? '' : ' 起'}</b></div>
      </div>
      <div className="tbl">
        {rows.length ? (
          <table><thead><tr><th>產品</th><th>日文名稱</th><th className="num">件數</th><th className="num">訂單數</th><th className="num">日本買入價</th></tr></thead>
            <tbody>{rows.map((r) => { const c = d.costs[r.id]; return (
              <tr key={r.id}><td>{r.name}</td><td>{r.jpName}</td><td className="num"><b>{r.qty}</b></td><td className="num">{r.orders}</td><td className="num">{c && c.jpy ? yen(c.jpy) : '未填'}</td></tr>); })}</tbody></table>
        ) : <div className="empty"><strong>未有需要採購的產品</strong>待確認、已確認和已付款訂單的產品會自動合併在這裏。</div>}
      </div>
    </>
  );
}

/* ---------- 專題 ---------- */
function Features({ d, edit }: { d: Data; edit: (id: string | null) => void }) {
  const fs = d.features.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  return (
    <>
      <div className="row"><div><h2>專題精選</h2><p className="hint">在首頁顯示的產品專題，例如「秋冬保濕」「新品速遞」「買手推介」。數字小的排在前面。</p></div>
        <button className="btn primary" type="button" onClick={() => edit(null)}>＋ 新增專題</button></div>
      <div className="flist">
        {fs.length ? fs.map((f) => (
          <div className="fcard" key={f.id}>
            <div><b>{f.title}</b><span className="hint">排序 {f.sort_order || 0} · {(f.product_ids || []).length} 件產品{f.description ? ' · ' + f.description : ''}</span></div>
            <button className="btn sm" type="button" onClick={() => edit(f.id)}>編輯</button>
          </div>)) : <div className="empty"><strong>未有專題</strong>新增專題後，會以橫向貨架顯示在首頁。</div>}
      </div>
    </>
  );
}

function FeatureEditor({ d, id, close, reload, toast }: { d: Data; id: string | null; close: () => void; reload: () => Promise<void>; toast: (s: string) => void }) {
  const f = id ? d.features.find((x) => x.id === id) : undefined;
  const [title, setTitle] = useState(f?.title || '');
  const [desc, setDesc] = useState(f?.description || '');
  const [order, setOrder] = useState(String(f?.sort_order ?? d.features.length + 1));
  const [sel, setSel] = useState(new Set(f?.product_ids || []));
  const [sure, setSure] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { toast('請填寫專題名稱'); return; }
    const row = { title: title.trim(), description: desc.trim(), sort_order: num(order) || 0, product_ids: d.products.filter((p) => sel.has(p.id)).map((p) => p.id) };
    const r = f ? await sb().from('features').update(row).eq('id', f.id) : await sb().from('features').insert(row);
    if (r.error) { toast('未能儲存：' + r.error.message); return; }
    await refreshStore(); await reload(); close(); toast('專題已儲存');
  }
  async function del() {
    if (!f) return;
    if (!sure) { setSure(true); return; }
    const r = await sb().from('features').delete().eq('id', f.id);
    if (r.error) { toast('未能刪除：' + r.error.message); return; }
    await refreshStore(); await reload(); close(); toast('專題已刪除');
  }
  return (
    <>
      <SheetHead title={f ? '編輯專題' : '新增專題'} close={close} />
      <form className="f" onSubmit={save}>
        <div className="fld"><label htmlFor="f-title">專題名稱</label><input id="f-title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="秋冬保濕特輯" /></div>
        <div className="fld"><label htmlFor="f-desc">簡介</label><input id="f-desc" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="天氣轉乾，買手精選的保濕好物" /></div>
        <div className="fld"><label htmlFor="f-order">排序</label><input id="f-order" inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} /></div>
        <div className="fld"><span className="lbl">選擇產品</span>
          <div className="picklist">{d.products.map((p) => (
            <label key={p.id}><input type="checkbox" checked={sel.has(p.id)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(p.id); else s.delete(p.id); setSel(s); }} /> {p.name}</label>))}</div></div>
        <div className="row">
          {f ? <button className="btn danger" type="button" onClick={del}>{sure ? '再按一次確認刪除' : '刪除專題'}</button> : <span />}
          <button className="btn primary" type="submit">儲存專題</button>
        </div>
      </form>
    </>
  );
}

/* ---------- 店舖設定 ---------- */
const promosToText = (ps: Promo[]) => ps.map((p) => [p.code, p.type === 'pct' ? p.value + '%' : p.value, p.min_spend ?? '', p.expires || ''].join('｜')).join('\n');
function parsePromos(t: string): Promo[] {
  return t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const [code, val, min, exp] = l.split(/[|｜]/).map((s) => (s || '').trim());
    if (!code || !val) return null;
    const pct = val.endsWith('%'); const v = num(val.replace('%', ''));
    if (v == null || v <= 0) return null;
    return { code: code.toUpperCase(), type: pct ? 'pct' : 'amt', value: v, min_spend: num(min), expires: /^\d{4}-\d{2}-\d{2}$/.test(exp || '') ? exp : null } as Promo;
  }).filter(Boolean) as Promo[];
}

function SettingsForm({ d, reload, toast }: { d: Data; reload: () => Promise<void>; toast: (s: string) => void }) {
  const st = d.settings;
  const [f, setF] = useState({
    name: st?.name || '', whatsapp: st?.whatsapp || '', tagline: st?.tagline || '', announcement: st?.announcement || '',
    cutoff_at: toLocalInput(st?.cutoff_at || null), eta: st?.eta || '', ship_fee: String(st?.ship_fee ?? ''), free_ship: String(st?.free_ship ?? ''),
    fps: st?.fps || '', payme: st?.payme || '', returns: st?.returns || DEF_RETURNS, promos: promosToText(d.promos), rate: String(d.rate),
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const db = sb();
    try {
      const s = await db.from('settings').upsert({
        id: 1, name: f.name.trim(), whatsapp: f.whatsapp.trim(), tagline: f.tagline.trim(), announcement: f.announcement.trim(),
        cutoff_at: fromLocalInput(f.cutoff_at), eta: f.eta.trim(), ship_fee: num(f.ship_fee), free_ship: num(f.free_ship),
        fps: f.fps.trim(), payme: f.payme.trim(), returns: f.returns.trim(),
      });
      if (s.error) throw new Error(s.error.message);
      const promos = parsePromos(f.promos);
      const keep = promos.map((p) => p.code);
      const old = d.promos.map((p) => p.code).filter((c) => !keep.includes(c));
      if (old.length) { const r = await db.from('promos').delete().in('code', old); if (r.error) throw new Error(r.error.message); }
      if (promos.length) { const r = await db.from('promos').upsert(promos); if (r.error) throw new Error(r.error.message); }
      const rate = num(f.rate);
      if (rate != null) { const r = await db.from('config').upsert({ id: 1, rate }); if (r.error) throw new Error(r.error.message); }
      await refreshStore(); await reload();
      toast(`設定已儲存，共 ${promos.length} 個優惠碼`);
    } catch (err) {
      toast(err instanceof Error ? '未能儲存：' + err.message : '未能儲存');
    }
    setBusy(false);
  }
  return (
    <>
      <h2>店舖設定</h2>
      <p className="hint" style={{ marginBottom: 12 }}>這些資料會顯示在網店及預訂單上。優惠碼和匯率只有管理員看得到。</p>
      <form className="f" onSubmit={save}>
        <div className="two">
          <div className="fld"><label htmlFor="s-name">店名</label><input id="s-name" value={f.name} onChange={set('name')} placeholder="日本藥妝預訂" /></div>
          <div className="fld"><label htmlFor="s-wa">WhatsApp 號碼</label><input id="s-wa" value={f.whatsapp} onChange={set('whatsapp')} placeholder="852 9123 4567" inputMode="tel" /></div>
        </div>
        <div className="fld"><label htmlFor="s-tag">簡介</label><input id="s-tag" value={f.tagline} onChange={set('tagline')} /></div>
        <div className="fld"><label htmlFor="s-ann">頂部公告（留空即不顯示）</label><input id="s-ann" value={f.announcement} onChange={set('announcement')} placeholder="例如：新客輸入 WELCOME10 即減一成" /></div>
        <div className="two">
          <div className="fld"><label htmlFor="s-cut">本輪截單時間（香港時間）</label><input id="s-cut" type="datetime-local" value={f.cutoff_at} onChange={set('cutoff_at')} /></div>
          <div className="fld"><label htmlFor="s-eta">預計到港</label><input id="s-eta" value={f.eta} onChange={set('eta')} placeholder="11月中旬" /></div>
        </div>
        <div className="two">
          <div className="fld"><label htmlFor="s-fee">每單運費（港元）</label><input id="s-fee" inputMode="decimal" value={f.ship_fee} onChange={set('ship_fee')} placeholder="留空即另計" /></div>
          <div className="fld"><label htmlFor="s-free">免運費門檻（港元）</label><input id="s-free" inputMode="decimal" value={f.free_ship} onChange={set('free_ship')} placeholder="例如 400" /></div>
        </div>
        <div className="two">
          <div className="fld"><label htmlFor="s-fps">轉數快（FPS）識別碼或電話</label><input id="s-fps" value={f.fps} onChange={set('fps')} /></div>
          <div className="fld"><label htmlFor="s-payme">PayMe 連結或名稱</label><input id="s-payme" value={f.payme} onChange={set('payme')} /></div>
        </div>
        <div className="fld"><label htmlFor="s-promo">優惠碼（每行一個：代碼｜折扣｜最低消費｜到期日）</label>
          <textarea id="s-promo" value={f.promos} onChange={set('promos')} placeholder={'WELCOME10｜10%｜300｜2026-12-31\nSAVE20｜20｜200｜'} />
          <p className="hint">折扣寫 10% 代表九折，寫 20 代表減 HK$20。最低消費和到期日可以留空。優惠碼只在客人輸入時由伺服器核對，網頁上不會公開整張清單。</p></div>
        <div className="fld"><label htmlFor="s-ret">退換政策</label><textarea id="s-ret" value={f.returns} onChange={set('returns')} /></div>
        <div className="two">
          <div className="fld"><label htmlFor="s-rate">匯率（1 円 ＝ 港元）</label><input id="s-rate" value={f.rate} onChange={set('rate')} inputMode="decimal" /></div>
          <div className="fld" style={{ alignSelf: 'end' }}><button className="btn primary" type="submit" disabled={busy} style={{ padding: 10 }}>{busy ? '儲存中…' : '儲存設定'}</button></div>
        </div>
      </form>
    </>
  );
}
