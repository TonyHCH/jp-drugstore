'use client';

import Image from 'next/image';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactElement, type ReactNode } from 'react';
import { sb } from '@/lib/supabase-browser';
import {
  CATS, CONCERNS, DEF_NAME, DEF_RETURNS, DEF_TAG, PICKUPS, STATUS,
  cutText, isSoldout, left, maxOf, money, num, offPct, photoUrl, priceOf, remaining, saleOn, savePct, shipping, waNumber, yen,
} from '@/lib/shop';
import type { Feature, PlacedOrder, Product, Settings } from '@/lib/types';

/* ---------- 瀏覽器內的個人資料（購物清單、收藏、最近瀏覽） ---------- */
function lsGet<T>(k: string, d: T): T {
  try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return (v ?? d) as T; } catch { return d; }
}
function lsSet(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 私密模式等情況 */ } }

type Sheet =
  | { kind: 'product'; id: string }
  | { kind: 'cart' }
  | { kind: 'done'; order: PlacedOrder; text: string }
  | { kind: 'share'; id: string }
  | { kind: 'ask'; id: string }
  | null;

interface Props { products: Product[]; features: Feature[]; settings: Settings; openId?: string; error?: string }

const phChar = (p: Product) => ((p.jp_name || p.name || '?').trim()[0]) || '?';

function Photo({ p, i = 0, sizes }: { p: Product; i?: number; sizes: string }) {
  const [bad, setBad] = useState(false);
  const src = p.photos?.[i];
  if (!src || bad) return <div className="ph">{phChar(p)}</div>;
  return <Image src={photoUrl(src)} alt={p.name} fill sizes={sizes} onError={() => setBad(true)} />;
}

function Badges({ p, now }: { p: Product; now: number }) {
  const b: ReactNode[] = [];
  if (p.example) b.push(<span key="eg" className="badge eg">示例</span>);
  if (saleOn(p, now)) b.push(<span key="s" className="badge sale">-{offPct(p, now)}%</span>);
  if (p.award) b.push(<span key="a" className="badge award">得獎</span>);
  if (p.tag === '熱賣') b.push(<span key="h" className="badge hot">熱賣</span>);
  if (p.tag === '新品') b.push(<span key="n" className="badge new">新品</span>);
  if (p.tag === '限定') b.push(<span key="l" className="badge ltd">限定</span>);
  return b.length ? <div className="badges">{b}</div> : null;
}

function PriceBlock({ p, now }: { p: Product; now: number }) {
  const on = saleOn(p, now);
  return (
    <span>
      <span className={`pop ${on ? 'on-sale' : ''}`}><small>HK$</small><span className="n">{money(priceOf(p, now))}</span></span>
      {on && <span className="was">HK${money(p.price)}</span>}
    </span>
  );
}
const stText = (p: Product) => (isSoldout(p) ? '售罄' : STATUS[p.status] || '');
const stCls = (p: Product) => (isSoldout(p) ? 'soldout' : p.status);

export default function Storefront({ products, features, settings: st, openId, error }: Props) {
  /* 伺服器渲染時以發佈時間計價；載入後每分鐘更新一次，倒數才會準確 */
  const [now, setNow] = useState<number>(() => Date.now());
  const [mounted, setMounted] = useState(false);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [fav, setFav] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [filter, setFilter] = useState('全部');
  const [brand, setBrand] = useState('');
  const [concern, setConcern] = useState('');
  const [qIn, setQIn] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('new');
  const [sheet, setSheet] = useState<Sheet>(openId ? { kind: 'product', id: openId } : null);
  const [toastMsg, setToastMsg] = useState('');
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    setCart(lsGet('cart_v1', {}));
    setFav(lsGet('fav_v1', []));
    setRecent(lsGet('recent_v1', []));
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { const t = setTimeout(() => setQ(qIn), 120); return () => clearTimeout(t); }, [qIn]);

  const toast = useCallback((t: string) => {
    setToastMsg(t);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastMsg(''), 2800);
  }, []);
  const saveCart = (c: Record<string, number>) => { setCart(c); lsSet('cart_v1', c); };

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /* 打開產品時同步網址，方便分享；關閉時返回首頁網址 */
  const open = useCallback((s: Sheet) => {
    setSheet(s);
    if (s?.kind === 'product') {
      window.history.replaceState(null, '', `/p/${encodeURIComponent(s.id)}`);
      setRecent((r) => { const n = [s.id, ...r.filter((x) => x !== s.id)].slice(0, 12); lsSet('recent_v1', n); return n; });
    } else if (!s && window.location.pathname !== '/') {
      window.history.replaceState(null, '', '/');
    }
  }, []);
  const close = useCallback(() => open(null), [open]);

  useEffect(() => {
    document.body.style.overflow = sheet ? 'hidden' : '';
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && sheet) close(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [sheet, close]);
  useEffect(() => {
    if (openId) setRecent((r) => { const n = [openId, ...r.filter((x) => x !== openId)].slice(0, 12); lsSet('recent_v1', n); return n; });
  }, [openId]);

  /* ---------- 篩選 ---------- */
  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hant')), [products]);
  const usedConcerns = useMemo(() => CONCERNS.filter((c) => products.some((p) => (p.concerns || []).includes(c))), [products]);
  const filtering = Boolean(q || filter !== '全部' || brand || concern);
  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let l = products.filter((p) => {
      if (filter === '我的收藏') { if (!fav.includes(p.id)) return false; }
      else if (filter !== '全部' && p.category !== filter) return false;
      if (brand && p.brand !== brand) return false;
      if (concern && !(p.concerns || []).includes(concern)) return false;
      if (!qq) return true;
      return [p.name, p.jp_name, p.brand, p.description, p.category, p.size, (p.concerns || []).join(' ')]
        .some((v) => String(v || '').toLowerCase().includes(qq));
    });
    l = l.slice();
    if (sort === 'hot') l.sort((a, b) => (b.sold || 0) - (a.sold || 0));
    else if (sort === 'low') l.sort((a, b) => priceOf(a, now) - priceOf(b, now));
    else if (sort === 'high') l.sort((a, b) => priceOf(b, now) - priceOf(a, now));
    else if (sort === 'sale') l.sort((a, b) => offPct(b, now) - offPct(a, now));
    if (sort !== 'new') l.sort((a, b) => Number(isSoldout(a)) - Number(isSoldout(b)));
    return l;
  }, [products, q, filter, brand, concern, sort, fav, now]);

  const cartCount = Object.entries(cart).reduce((a, [id, n]) => (byId.get(id) && !isSoldout(byId.get(id)!) ? a + n : a), 0);

  const toStore = () => storeRef.current?.scrollIntoView({ block: 'start' });
  const pickConcern = (c: string, fromSheet = false) => {
    setConcern((cur) => (cur === c && !fromSheet ? '' : c));
    if (fromSheet) { close(); setTimeout(toStore, 0); }
  };
  const pickBrand = (b: string) => { setBrand(b); close(); setTimeout(toStore, 0); };

  /* ---------- 卡片 ---------- */
  const Card = ({ p }: { p: Product }) => {
    const r = remaining(p), sv = savePct(p, now);
    return (
      <a className={`card ${isSoldout(p) ? 'soldout' : ''}`} href={`/p/${encodeURIComponent(p.id)}`}
        onClick={(e) => { e.preventDefault(); open({ kind: 'product', id: p.id }); }}>
        <div className="thumb">
          <Photo p={p} sizes="(max-width:600px) 50vw, 220px" />
          <Badges p={p} now={now} />
          {fav.includes(p.id) && <span className="favmark" aria-label="已收藏">♥</span>}
        </div>
        <div className="cbody">
          {p.brand && <span className="cbrand">{p.brand}</span>}
          <span className="cname">{p.name}</span>
          {p.jp_name && <span className="cjp">{p.jp_name}</span>}
          {(r != null && r > 0 && r <= 20) || sv > 0 || p.sold > 0 ? (
            <span className="cmeta">
              {r != null && r > 0 && r <= 20 && <span className="left">尚餘 {r} 件</span>}
              {sv > 0 && <span className="save">比香港平 {sv}%</span>}
              {p.sold > 0 && <span>已預訂 {p.sold}</span>}
            </span>
          ) : null}
          <div className="crow"><PriceBlock p={p} now={now} /><span className={`st ${stCls(p)}`}>{stText(p)}</span></div>
        </div>
      </a>
    );
  };

  /* ---------- 首頁貨架 ---------- */
  const shelves = () => {
    if (filtering) return null;
    const out: ReactNode[] = [];
    const top = products.filter((p) => p.sold > 0 && !isSoldout(p)).sort((a, b) => b.sold - a.sold).slice(0, 5);
    if (top.length >= 2) {
      out.push(
        <section className="shelf" key="rank"><h2>人氣排行 <small>按已預訂件數</small></h2>
          <div className="rank-list">{top.map((p, i) => (
            <a className="rk" key={p.id} href={`/p/${encodeURIComponent(p.id)}`} onClick={(e) => { e.preventDefault(); open({ kind: 'product', id: p.id }); }}>
              <span className="no">{i + 1}</span><span className="mini"><Photo p={p} sizes="56px" /></span>
              <span className="t"><span>{p.name}</span><small>已預訂 {p.sold} 件 · HK${money(priceOf(p, now))}</small></span>
            </a>))}</div>
        </section>);
    }
    const sales = products.filter((p) => saleOn(p, now) && !isSoldout(p));
    if (sales.length) {
      const ends = sales.map((p) => (p.sale_ends ? new Date(p.sale_ends).getTime() : NaN)).filter((d) => !Number.isNaN(d)).sort((a, b) => a - b)[0];
      out.push(
        <section className="shelf" key="sale"><h2>限時特價 {ends && mounted ? <small>最快 {left(ends - now)} 後結束</small> : null}</h2>
          <div className="rail">{sales.map((p) => <Card key={p.id} p={p} />)}</div></section>);
    }
    features.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).forEach((f) => {
      const ps = (f.product_ids || []).map((id) => byId.get(id)).filter(Boolean) as Product[];
      if (!ps.length) return;
      out.push(
        <section className="shelf" key={f.id}><h2>{f.title}</h2>{f.description && <p className="sd">{f.description}</p>}
          <div className="rail">{ps.map((p) => <Card key={p.id} p={p} />)}</div></section>);
    });
    const rec = recent.map((id) => byId.get(id)).filter(Boolean).slice(0, 10) as Product[];
    if (rec.length) out.push(<section className="shelf" key="recent"><h2>最近瀏覽</h2><div className="rail">{rec.map((p) => <Card key={p.id} p={p} />)}</div></section>);
    if (out.length) out.push(<h2 key="all" style={{ fontFamily: 'var(--f-display)', fontSize: '1.05rem', margin: '0 0 10px' }}>全部產品</h2>);
    return out;
  };

  /* ---------- 頂部資料 ---------- */
  const ct = cutText(st);
  const cutMs = st.cutoff_at ? new Date(st.cutoff_at).getTime() : NaN;
  const free = num(st.free_ship);
  const avail = products.filter((p) => !isSoldout(p)).length;
  const pay = [st.fps ? `轉數快（FPS）：${st.fps}` : null, st.payme ? `PayMe：${st.payme}` : null].filter(Boolean).join('\n') || '我們確認訂單後，會以 WhatsApp 通知付款方式。';
  const fee = num(st.ship_fee);
  const shipQa = fee ? `每張訂單運費 HK$${money(fee)}${free ? `，滿 HK$${money(free)} 免運費` : ''}。可選擇順豐站或智能櫃自取、送貨上門或約定地點面交。` : '運費按取貨方式另計，可選擇順豐站或智能櫃自取、送貨上門或約定地點面交。';
  const faq: [string, string][] = [
    ['怎樣付款？', pay],
    ['幾時會收到貨？', (st.eta ? `本輪預計 ${st.eta} 到港。` : '') + '每輪截單後由日本買手集中採購，一般約兩至三星期到港，到港後我們會逐一通知取貨。'],
    ['運費怎樣計算？', shipQa],
    ['有沒有優惠碼？', '有推廣時我們會在網頁頂部公佈優惠碼，在預訂清單輸入即可使用，每張預訂單限用一個。'],
    ['產品是否正貨？', '所有產品均由日本買手於日本藥妝店或官方渠道購入，可要求提供購買單據相片。'],
    ['有甚麼產品不能代購？', '噴霧、含大量酒精或易燃的產品，以及在香港須註冊的藥品，我們都不會代購。如有疑問，歡迎先以 WhatsApp 查詢。'],
    ['可以退換嗎？', st.returns || DEF_RETURNS],
    ['買不到怎麼辦？', '如日本當地缺貨，我們會盡快通知你，並全數退回該產品的款項。'],
  ];

  let emptyMsg: [string, string] | null = null;
  if (!list.length) {
    if (error) emptyMsg = ['暫時未能顯示產品', error];
    else if (!products.length) emptyMsg = ['貨架暫時是空的', '產品正在準備中，稍後再來看看。'];
    else if (q) emptyMsg = ['找不到相關產品', `沒有產品符合「${q}」，可試試品牌名稱或日文名稱。`];
    else if (filter === '我的收藏') emptyMsg = ['未有收藏產品', '在產品頁按 ♥，產品就會收藏在這裏。'];
    else emptyMsg = ['沒有符合篩選的產品', '可以清除篩選，或看看其他分類。'];
  }

  return (
    <>
      {st.announcement && <div className="announce"><div className="wrap">{st.announcement}</div></div>}
      <header className="top">
        <div className="wrap">
          <div className="brand"><h1>{st.name || DEF_NAME}</h1><small>JAPAN DRUGSTORE · 日本直送香港</small></div>
          <button className="btn primary" type="button" onClick={() => open({ kind: 'cart' })}>預訂清單 <span className="count">{mounted ? cartCount : 0}</span></button>
        </div>
      </header>

      <main className="wrap">
        <section className="hero">
          <p className="tag">{st.tagline || DEF_TAG}</p>
          <div className="round">
            {ct && <span>本輪截單 <b>{ct}</b></span>}
            {mounted && !Number.isNaN(cutMs) && (cutMs <= now
              ? <span className="closed">本輪已截單，新預訂將撥入下一輪</span>
              : <span className="cd">距離截單 <b>{left(cutMs - now)}</b></span>)}
            {st.eta && <span>預計到港 <b>{st.eta}</b></span>}
            {free ? <span>滿 <b>HK${money(free)}</b> 免運費</span> : null}
            {!ct && !st.eta && !free && <span>預訂制：每輪集中截單，由日本採購後寄港。</span>}
          </div>
          <div className="trust">
            {[['日本實體店購入', '可應要求提供購買單據'], ['每輪集中寄運', '拼箱運送，運費更相宜'], ['香港本地取貨', '順豐站、智能櫃或面交'],
              ['廣東話客服', avail ? `WhatsApp 跟進，現有 ${avail} 款產品` : 'WhatsApp 跟進每張訂單']].map(([a, b]) => <div key={a}><b>{a}</b>{b}</div>)}
          </div>
        </section>

        <div ref={storeRef}>
          <div className="tools">
            <label className="search" htmlFor="q">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input id="q" type="search" placeholder="搜尋產品、品牌或日文名稱" autoComplete="off" value={qIn} onChange={(e) => setQIn(e.target.value)} />
            </label>
            <select className="sel" aria-label="品牌" value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">所有品牌</option>{brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
            <select className="sel" aria-label="排序" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="new">最新上架</option><option value="hot">人氣</option><option value="sale">特價優先</option>
              <option value="low">價錢由低至高</option><option value="high">價錢由高至低</option>
            </select>
          </div>
          <nav className="chips" aria-label="產品分類">
            {['全部', ...CATS, '我的收藏'].map((c) => (
              <button key={c} className="chip" type="button" aria-pressed={filter === c} onClick={() => setFilter(c)}>{c === '我的收藏' ? '♥ 我的收藏' : c}</button>))}
          </nav>
          {usedConcerns.length > 0 && (
            <nav className="chips sub" aria-label="按需要揀選"><span className="lbl2">按需要：</span>
              {usedConcerns.map((c) => <button key={c} className="chip" type="button" aria-pressed={concern === c} onClick={() => pickConcern(c)}>{c}</button>)}
            </nav>)}
          {(brand || concern) && (
            <div className="active-filters">
              <span>篩選中：{[brand && `品牌：${brand}`, concern && `需要：${concern}`].filter(Boolean).join('，')}</span>
              <button className="btn sm" type="button" onClick={() => { setBrand(''); setConcern(''); }}>清除篩選</button>
            </div>)}
          {shelves()}
          <div className="grid">
            {emptyMsg ? <div className="empty"><strong>{emptyMsg[0]}</strong>{emptyMsg[1]}</div> : list.map((p) => <Card key={p.id} p={p} />)}
          </div>
        </div>

        <section className="info">
          <div>
            <h2>預訂流程</h2>
            <ol className="steps">
              <li><span><b>揀選產品</b>將想要的產品加入預訂清單，截單前都可以修改。</span></li>
              <li><span><b>送出預訂單</b>填寫聯絡資料送出，系統即時記錄，再以 WhatsApp 通知我們。</span></li>
              <li><span><b>確認及付款</b>我們確認貨量及金額後通知付款，貨品到港即安排取貨。</span></li>
            </ol>
          </div>
          <div className="faq"><h2>常見問題</h2>{faq.map(([a, b]) => <details key={a}><summary>{a}</summary><p>{b}</p></details>)}</div>
        </section>
      </main>

      {sheet && (
        <div className="overlay" onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="sheet" role="dialog" aria-modal="true">
            {sheet.kind === 'product' && byId.get(sheet.id) && (
              <ProductSheet key={sheet.id} p={byId.get(sheet.id)!} now={now} products={products} inCart={cart[sheet.id] || 0}
                fav={fav.includes(sheet.id)} Card={Card} close={close}
                onFav={() => { const n = fav.includes(sheet.id) ? fav.filter((x) => x !== sheet.id) : [...fav, sheet.id]; setFav(n); lsSet('fav_v1', n); toast(n.includes(sheet.id) ? '已加入收藏' : '已取消收藏'); }}
                onAdd={(n) => { const p = byId.get(sheet.id)!; const mx = maxOf(p); const v = Math.min(mx, (cart[p.id] || 0) + n);
                  if (v === (cart[p.id] || 0)) { toast(`此產品每單最多 ${mx} 件`); return; }
                  saveCart({ ...cart, [p.id]: v }); close(); toast(`已加入預訂清單：${p.name}`); }}
                onShare={() => open({ kind: 'share', id: sheet.id })} onAsk={() => open({ kind: 'ask', id: sheet.id })}
                onBrand={pickBrand} onConcern={(c) => pickConcern(c, true)} toast={toast} />)}
            {sheet.kind === 'product' && !byId.get(sheet.id) && (
              <><SheetHead title="找不到產品" close={close} /><div className="empty"><strong>這件產品已經下架</strong>可以回到首頁看看其他產品。</div></>)}
            {sheet.kind === 'cart' && (
              <CartSheet st={st} now={now} cart={cart} byId={byId} close={close} toast={toast} setCart={saveCart}
                onPlaced={(order, text) => { saveCart({}); setSheet({ kind: 'done', order, text }); }} />)}
            {sheet.kind === 'done' && <DoneSheet st={st} order={sheet.order} text={sheet.text} close={close} toast={toast} />}
            {sheet.kind === 'share' && byId.get(sheet.id) && <ShareSheet p={byId.get(sheet.id)!} st={st} now={now} close={close} toast={toast} back={() => open({ kind: 'product', id: sheet.id })} />}
            {sheet.kind === 'ask' && byId.get(sheet.id) && <AskSheet p={byId.get(sheet.id)!} st={st} close={close} toast={toast} />}
          </div>
        </div>
      )}
      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </>
  );
}

function SheetHead({ title, close }: { title: string; close: () => void }) {
  return <div className="sheet-head"><h3>{title}</h3><button className="x" type="button" onClick={close} aria-label="關閉">×</button></div>;
}

async function copyText(t: string, toast: (s: string) => void, el?: HTMLTextAreaElement | null) {
  try { await navigator.clipboard.writeText(t); toast('已複製'); }
  catch { el?.focus(); el?.select(); toast('請長按或按 Ctrl+C 複製'); }
}
const stars = (n: number) => { const v = Math.max(1, Math.min(5, Math.round(num(n) || 5))); return '★'.repeat(v) + '☆'.repeat(5 - v); };

function ProductSheet(props: {
  p: Product; now: number; products: Product[]; inCart: number; fav: boolean; Card: (x: { p: Product }) => ReactElement;
  close: () => void; onFav: () => void; onAdd: (n: number) => void; onShare: () => void; onAsk: () => void;
  onBrand: (b: string) => void; onConcern: (c: string) => void; toast: (s: string) => void;
}) {
  const { p, now, products, inCart, Card, close, toast } = props;
  const [gi, setGi] = useState(0);
  const [qty, setQty] = useState(1);
  const max = maxOf(p), r = remaining(p), sv = savePct(p, now), sold = isSoldout(p);
  const specs: [string, string][] = ([
    p.size ? ['容量', p.size] : null,
    p.expiry ? ['保質期', p.expiry] : null,
    p.release_date ? ['日本發售日', p.release_date] : null,
    num(p.jp_price) ? ['日本售價參考', `${yen(p.jp_price)}（未計運費及稅）`] : null,
    num(p.max_per_order) ? ['每單限購', `${p.max_per_order} 件`] : null,
    r != null ? ['本輪限量', `${p.limit_qty} 件，尚餘 ${r} 件`] : null,
    p.sold > 0 ? ['已預訂', `${p.sold} 件`] : null,
  ].filter(Boolean)) as [string, string][];
  const rel = products.filter((x) => x.id !== p.id && !isSoldout(x) && p.brand && x.brand === p.brand).slice(0, 6);
  const relCat = rel.length < 3 ? products.filter((x) => x.id !== p.id && !isSoldout(x) && x.category === p.category && !rel.includes(x)).slice(0, 6 - rel.length) : [];
  const related = [...rel, ...relCat];
  const reviews = Array.isArray(p.reviews) ? p.reviews : [];
  return (
    <>
      <SheetHead title={p.name} close={close} />
      <div className="gal-main"><Photo key={gi} p={p} i={gi} sizes="(max-width:600px) 100vw, 560px" /><Badges p={p} now={now} /></div>
      {p.photos.length > 1 && (
        <div className="gal-thumbs">{p.photos.map((x, i) => (
          <button key={x} type="button" aria-pressed={i === gi} aria-label={`第${i + 1}張相片`} onClick={() => setGi(i)} style={{ position: 'relative' }}>
            <Image src={photoUrl(x)} alt="" fill sizes="56px" />
          </button>))}</div>)}
      <div style={{ marginTop: 12 }}>
        {p.brand && <button type="button" className="cbrand" onClick={() => props.onBrand(p.brand)} style={{ border: 0, background: 'none', padding: 0, textDecoration: 'underline' }}>{p.brand}</button>}
        {p.jp_name && <div className="cjp" style={{ whiteSpace: 'normal' }}>{p.jp_name}</div>}
      </div>
      {(p.award || num(p.cosme_score)) ? (
        <div className="awardline">{p.award && <span>{p.award}</span>}{num(p.cosme_score) ? <span>@cosme 評分 {(num(p.cosme_score) as number).toFixed(1)}</span> : null}</div>) : null}
      {saleOn(p, now) && <div className="salebox">限時特價 {offPct(p, now)}% 折扣{p.sale_ends ? `，餘 ${left(new Date(p.sale_ends).getTime() - now)} 結束` : ''}</div>}
      {sv > 0 && <div className="savebox">香港門市參考價 HK${money(p.hk_price)}，在這裏預訂可慳約 {sv}%</div>}
      {specs.length > 0 && <dl className="specs">{specs.map(([a, b]) => <Fragment key={a}><dt>{a}</dt><dd>{b}</dd></Fragment>)}</dl>}
      {(p.concerns || []).length > 0 && <div className="tagrow">{p.concerns.map((c) => <button key={c} type="button" onClick={() => props.onConcern(c)}>{c}</button>)}</div>}
      {p.description && <p className="desc">{p.description}</p>}
      <div className="more">
        {p.usage && <details><summary>使用方法</summary><p>{p.usage}</p></details>}
        {p.ingredients && <details><summary>成分</summary><p>{p.ingredients}</p></details>}
        {reviews.length > 0 && (
          <details open><summary>客人評價（{reviews.length}）</summary>
            {reviews.map((v, i) => <div className="rev" key={i}><span className="stars" aria-label={`${num(v.stars) || 5} 星`}>{stars(v.stars)}</span> <b>{v.name || '客人'}</b><p>{v.text}</p></div>)}
          </details>)}
      </div>
      <div className="row" style={{ marginTop: 14 }}>
        <div><PriceBlock p={p} now={now} /> <span className={`st ${stCls(p)}`} style={{ marginLeft: 8 }}>{stText(p)}</span></div>
        {!sold && (
          <div className="qty">
            <button type="button" aria-label="減少" onClick={() => setQty((v) => Math.max(1, v - 1))}>−</button>
            <span>{qty}</span>
            <button type="button" aria-label="增加" onClick={() => { if (qty + inCart >= max) { toast(`此產品每單最多 ${max} 件`); return; } setQty((v) => v + 1); }}>+</button>
          </div>)}
      </div>
      {inCart > 0 && <p className="hint" style={{ marginTop: 6 }}>預訂清單內已有 {inCart} 件</p>}
      <div className="row" style={{ marginTop: 14, flexWrap: 'nowrap' }}>
        <button className="favbtn" type="button" aria-pressed={props.fav} aria-label={props.fav ? '取消收藏' : '收藏'} onClick={props.onFav}>♥</button>
        <button className="btn" type="button" style={{ padding: '9px 14px' }} onClick={props.onShare}>分享</button>
        {sold
          ? <button className="btn" type="button" style={{ flex: 1, padding: 11 }} onClick={props.onAsk}>查詢補貨</button>
          : <button className="btn primary" type="button" style={{ flex: 1, padding: 11 }} onClick={() => props.onAdd(qty)}>加入預訂清單</button>}
      </div>
      {related.length > 0 && <div className="related"><h4>{rel.length ? '同品牌產品' : '同類產品'}</h4><div className="rail">{related.map((x) => <Card key={x.id} p={x} />)}</div></div>}
    </>
  );
}

function CartSheet({ st, now, cart, byId, close, toast, setCart, onPlaced }: {
  st: Settings; now: number; cart: Record<string, number>; byId: Map<string, Product>; close: () => void; toast: (s: string) => void;
  setCart: (c: Record<string, number>) => void; onPlaced: (o: PlacedOrder, text: string) => void;
}) {
  const lines = Object.entries(cart).map(([id, q]) => ({ p: byId.get(id), q })).filter((l) => l.p && l.q > 0 && !isSoldout(l.p))
    .map((l) => ({ p: l.p as Product, q: Math.min(l.q, maxOf(l.p as Product)) }));
  const sub = lines.reduce((a, l) => a + priceOf(l.p, now) * l.q, 0);
  const [promoIn, setPromoIn] = useState('');
  const [promo, setPromo] = useState<{ code: string; discount: number; label?: string; error?: string } | null>(null);
  const [form, setForm] = useState({ n: '', p: '', k: PICKUPS[0], note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { const d = lsGet<{ n?: string; p?: string; k?: string }>('buyer_v1', {}); setForm((f) => ({ ...f, n: d.n || '', p: d.p || '', k: d.k || PICKUPS[0] })); }, []);

  /* 小計改變時重新核對優惠碼（例如未達最低消費） */
  const checkPromo = useCallback(async (code: string, subtotal: number) => {
    if (!code) { setPromo(null); return; }
    const { data, error } = await sb().rpc('check_promo', { p_code: code, p_subtotal: subtotal });
    if (error) { setPromo({ code, discount: 0, error: '未能核對優惠碼，請稍後再試' }); return; }
    setPromo({ code, ...(data as { discount: number; label?: string; error?: string }) });
  }, []);
  useEffect(() => { if (promo?.code) checkPromo(promo.code, sub); }, [sub]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!lines.length) {
    return <><SheetHead title="預訂清單" close={close} /><div className="empty" style={{ padding: '28px 16px' }}><strong>清單暫時是空的</strong>在產品頁按「加入預訂清單」，產品就會出現在這裏。</div></>;
  }
  const disc = promo && !promo.error ? promo.discount : 0;
  const sh = shipping(st, sub - disc);
  const total = sub - disc + sh.fee;
  const closed = st.cutoff_at && new Date(st.cutoff_at).getTime() < now;
  const step = (id: string, d: number) => {
    const p = byId.get(id)!; const mx = maxOf(p); const v = (cart[id] || 0) + d;
    if (d > 0 && (cart[id] || 0) >= mx) { toast(`此產品每單最多 ${mx} 件`); return; }
    const n = { ...cart }; if (v <= 0) delete n[id]; else n[id] = v; setCart(n);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    lsSet('buyer_v1', { n: form.n, p: form.p, k: form.k });
    const { data, error } = await sb().rpc('place_order', {
      p_items: lines.map((l) => ({ id: l.p.id, qty: l.q })), p_name: form.n, p_phone: form.p, p_pickup: form.k, p_note: form.note,
      p_promo: disc ? promo!.code : '',
    });
    setBusy(false);
    if (error) { setErr(error.message || '未能送出預訂單，請稍後再試'); return; }
    const o = data as PlacedOrder;
    const text = [
      `【${st.name || DEF_NAME}・預訂單】`, `訂單編號：${o.code}`, o.round ? `截單輪次：${o.round}` : null, '',
      ...o.items.map((it, i) => `${i + 1}. ${it.name} × ${it.qty}　HK$${money(it.price * it.qty)}`), '',
      `小計：HK$${money(o.subtotal)}`, o.discount ? `優惠碼：${o.promo}（-HK$${money(o.discount)}）` : null,
      `運費：${o.ship ? 'HK$' + money(o.ship) : num(st.ship_fee) ? '免運費' : '另計'}`, `合計：HK$${money(o.total)}`, '',
      `稱呼：${form.n}`, `電話：${form.p}`, `取貨：${form.k}`, form.note ? `備註：${form.note.replace(/\n/g, ' ')}` : null,
    ].filter((x) => x !== null).join('\n');
    onPlaced(o, text);
  }

  return (
    <>
      <SheetHead title="預訂清單" close={close} />
      <div>{lines.map((l) => (
        <div className="citem" key={l.p.id}>
          <div className="mini"><Photo p={l.p} sizes="52px" /></div>
          <div className="nm">{l.p.name}<small>HK${money(priceOf(l.p, now))} × {l.q} ＝ HK${money(priceOf(l.p, now) * l.q)}{saleOn(l.p, now) ? ' · 特價' : ''}</small></div>
          <div className="qty"><button type="button" aria-label="減少" onClick={() => step(l.p.id, -1)}>−</button><span>{l.q}</span><button type="button" aria-label="增加" onClick={() => step(l.p.id, 1)}>+</button></div>
        </div>))}</div>
      <div className="sum">
        <div><span>小計</span><span>HK${money(sub)}</span></div>
        {disc > 0 && <div className="disc"><span>優惠碼 {promo!.code}（{promo!.label}）</span><span>−HK${money(disc)}</span></div>}
        <div><span>運費</span><span>{sh.fee ? 'HK$' + money(sh.fee) : num(st.ship_fee) ? '免運費' : '另計'}</span></div>
        {sh.label && <p className="hint">{sh.label}</p>}
        <div className="tot"><span>合計</span><span>HK${money(total)}</span></div>
      </div>
      <form className="promo" onSubmit={async (e) => { e.preventDefault(); const c = promoIn.trim().toUpperCase(); await checkPromo(c, sub); }}>
        <input placeholder="輸入優惠碼" value={promoIn} onChange={(e) => setPromoIn(e.target.value)} aria-label="優惠碼" />
        <button className="btn" type="submit">套用</button>
        {promo && <button className="btn" type="button" onClick={() => { setPromo(null); setPromoIn(''); }}>移除</button>}
      </form>
      {promo?.error && <p className="hint" style={{ color: 'var(--bad)', marginTop: 4 }}>{promo.error}</p>}
      {closed && <p className="notice" style={{ margin: '12px 0' }}>本輪已截單，這張預訂單會撥入下一輪採購。</p>}
      <form className="f" style={{ marginTop: 14 }} onSubmit={submit}>
        <div className="two">
          <div className="fld"><label htmlFor="o-name">稱呼</label><input id="o-name" required autoComplete="name" maxLength={60} value={form.n} onChange={(e) => setForm({ ...form, n: e.target.value })} /></div>
          <div className="fld"><label htmlFor="o-phone">聯絡電話</label><input id="o-phone" required inputMode="tel" autoComplete="tel" maxLength={30} value={form.p} onChange={(e) => setForm({ ...form, p: e.target.value })} /></div>
        </div>
        <div className="fld"><label htmlFor="o-pick">取貨方式</label>
          <select id="o-pick" value={form.k} onChange={(e) => setForm({ ...form, k: e.target.value })}>{PICKUPS.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div className="fld"><label htmlFor="o-note">備註</label><textarea id="o-note" maxLength={500} placeholder="例如：智能櫃編號、如缺貨可否代替同系列產品" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></div>
        <button className="btn primary" type="submit" style={{ padding: 11 }} disabled={busy}>{busy ? '送出中…' : '送出預訂單'}</button>
        {err && <p className="err">{err}</p>}
        <p className="hint">送出後系統會即時記錄訂單，再請你以 WhatsApp 通知我們。確認貨量後才需要付款。</p>
      </form>
    </>
  );
}

function DoneSheet({ st, order, text, close, toast }: { st: Settings; order: PlacedOrder; text: string; close: () => void; toast: (s: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wa = waNumber(st.whatsapp);
  const pay = [st.fps ? ['轉數快（FPS）', st.fps] : null, st.payme ? ['PayMe', st.payme] : null].filter(Boolean) as [string, string][];
  return (
    <>
      <SheetHead title="預訂單已送出" close={close} />
      <p className="hint" style={{ marginBottom: 10 }}>訂單編號 {order.code} 已經記錄。請把以下內容以 WhatsApp 傳給我們{st.whatsapp ? `（${st.whatsapp}）` : ''}，我們確認貨量後會通知付款。</p>
      {order.promoError && <p className="notice">優惠碼未能使用：{order.promoError}</p>}
      <textarea className="out" ref={ref} readOnly value={text} />
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-start' }}>
        <button className="btn primary" type="button" onClick={() => copyText(text, toast, ref.current)}>複製預訂單</button>
        {wa && <a className="btn" href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">開啟 WhatsApp 傳送</a>}
      </div>
      {pay.length > 0 && (
        <div className="pay"><p className="hint" style={{ marginBottom: 6 }}>收到確認通知後，可用以下方式付款：</p>
          {pay.map(([a, b]) => <div key={a}><span>{a}：<b>{b}</b></span><button className="btn sm" type="button" onClick={() => copyText(b, toast)}>複製</button></div>)}</div>)}
      <button className="btn" type="button" style={{ width: '100%', marginTop: 14 }} onClick={close}>完成</button>
    </>
  );
}

function ShareSheet({ p, st, now, close, toast, back }: { p: Product; st: Settings; now: number; close: () => void; toast: (s: string) => void; back: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const url = typeof window !== 'undefined' ? `${window.location.origin}/p/${encodeURIComponent(p.id)}` : '';
  const sv = savePct(p, now);
  const text = [`【${st.name || DEF_NAME}】${p.name}`, p.jp_name || null,
    `預訂價：HK$${money(priceOf(p, now))}${saleOn(p, now) ? `（原價 HK$${money(p.price)}，限時 ${offPct(p, now)}% 折扣）` : ''}`,
    sv > 0 ? `香港門市參考價 HK$${money(p.hk_price)}，慳約 ${sv}%` : null,
    p.size ? `容量：${p.size}` : null, p.description ? p.description.split('\n')[0] : null,
    cutText(st) ? `本輪截單：${cutText(st)}` : null, url ? `產品頁：${url}` : null].filter(Boolean).join('\n');
  return (
    <>
      <SheetHead title="分享產品" close={close} />
      <p className="hint" style={{ marginBottom: 10 }}>複製以下介紹，貼到 WhatsApp 群組或社交平台。</p>
      <textarea className="out" ref={ref} readOnly value={text} style={{ minHeight: 160, whiteSpace: 'pre-wrap' }} />
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-start' }}>
        <button className="btn primary" type="button" onClick={() => copyText(text, toast, ref.current)}>複製介紹</button>
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">以 WhatsApp 分享</a>
        <button className="btn" type="button" onClick={back}>返回產品</button>
      </div>
    </>
  );
}

function AskSheet({ p, st, close, toast }: { p: Product; st: Settings; close: () => void; toast: (s: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const wa = waNumber(st.whatsapp);
  const text = `你好，想查詢「${p.name}」幾時會補貨，有貨時請通知我，謝謝。`;
  return (
    <>
      <SheetHead title="查詢補貨" close={close} />
      <p className="hint" style={{ marginBottom: 10 }}>複製以下訊息，以 WhatsApp 傳給我們{st.whatsapp ? `（${st.whatsapp}）` : ''}，補貨時我們會通知你。</p>
      <textarea className="out" ref={ref} readOnly value={text} style={{ minHeight: 90, whiteSpace: 'pre-wrap' }} />
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-start' }}>
        <button className="btn primary" type="button" onClick={() => copyText(text, toast, ref.current)}>複製訊息</button>
        {wa && <a className="btn" href={`https://wa.me/${wa}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">開啟 WhatsApp</a>}
      </div>
    </>
  );
}
