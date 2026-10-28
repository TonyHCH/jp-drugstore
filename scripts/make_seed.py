"""把舊版網店（claude.ai 資料庫）的備份轉成 Supabase 匯入用的 seed.sql。

用法：python3 scripts/make_seed.py <備份資料夾或 backup.json> > supabase/seed.sql
備份資料夾即舊版的「資料備份」，結構為 products/*.json、features/*.json、shop/settings.json、data/admin/...
"""
import json
import os
import sys
from datetime import datetime, timezone


def load(src):
    if src.endswith('.json'):
        return json.load(open(src, encoding='utf-8'))
    out = {}
    for root, _, files in os.walk(src):
        for f in files:
            if f.endswith('.json'):
                p = os.path.join(root, f)
                out[os.path.relpath(p, src)] = json.load(open(p, encoding='utf-8'))
    return out


def q(v):
    if v is None or v == '':
        return 'null'
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def s(v):
    return "'" + str(v or '').replace("'", "''") + "'"


def arr(v):
    return 'array[' + ','.join(s(x) for x in (v or [])) + ']::text[]'


def js(v):
    return s(json.dumps(v or [], ensure_ascii=False)) + '::jsonb'


def hk(local):
    """舊版用 datetime-local 字串（香港時間，無時區），轉成帶時區時間。"""
    return q(local + ':00+08:00') if local else 'null'


def ms(t):
    return q(datetime.fromtimestamp(t / 1000, timezone.utc).isoformat()) if t else 'now()'


def main():
    data = load(sys.argv[1])
    out = ['-- 由 scripts/make_seed.py 產生：舊版網店資料（目前全部是示範資料）', 'begin;']
    for k, p in data.items():
        if not k.startswith('products/'):
            continue
        pid = os.path.basename(k)[:-5]
        out.append(
            'insert into products (id,name,jp_name,brand,category,price,status,tag,concerns,hk_price,sale_price,sale_ends,'
            'limit_qty,max_per_order,jp_price,size,expiry,release_date,award,cosme_score,description,usage,ingredients,'
            'reviews,photos,sold,example,created_at) values ('
            + ','.join([
                s(pid), s(p.get('name')), s(p.get('jpName')), s(p.get('brand')), s(p.get('category') or '護膚'),
                q(p.get('price')), s(p.get('status') or 'preorder'), s(p.get('tag')), arr(p.get('concerns')),
                q(p.get('hkPrice')), q(p.get('salePrice')), hk(p.get('saleEnds')), q(p.get('limitQty')),
                q(p.get('maxPerOrder')), q(p.get('jpPrice')), s(p.get('size')), s(p.get('expiry')),
                s(p.get('releaseDate')), s(p.get('award')), q(p.get('cosmeScore')), s(p.get('desc')),
                s(p.get('usage')), s(p.get('ingredients')), js(p.get('reviews')), arr([]),
                q(p.get('sold') or 0), q(bool(p.get('example'))), ms(p.get('createdAt')),
            ]) + ') on conflict (id) do nothing;')
    for k, f in data.items():
        if k.startswith('features/'):
            out.append('insert into features (title,description,sort_order,product_ids) values ('
                       + ','.join([s(f.get('title')), s(f.get('desc')), q(f.get('order') or 0), arr(f.get('productIds'))])
                       + ');')
    st = data.get('shop/settings.json', {})
    if st:
        out.append(
            'update settings set ' + ', '.join([
                f"name={s(st.get('name') or '日本藥妝預訂')}", f"tagline={s(st.get('tagline'))}",
                f"announcement={s(st.get('announcement'))}", f"whatsapp={s(st.get('whatsapp'))}",
                f"cutoff_at={hk(st.get('cutoffAt'))}", f"eta={s(st.get('eta'))}",
                f"ship_fee={q(st.get('shipFee'))}", f"free_ship={q(st.get('freeShip'))}",
                f"fps={s(st.get('fps'))}", f"payme={s(st.get('payme'))}", f"returns={s(st.get('returns'))}",
            ]) + ' where id=1;')
        for p in st.get('promos') or []:
            out.append('insert into promos (code,type,value,min_spend,expires) values ('
                       + ','.join([s(p['code'].upper()), s(p['type']), q(p['value']), q(p.get('min')), q(p.get('expires'))])
                       + ') on conflict (code) do nothing;')
    for k, c in data.items():
        if k.startswith('data/admin/costs/'):
            out.append(f"insert into costs (product_id,jpy,extra) values ({s(os.path.basename(k)[:-5])},{q(c.get('jpy') or 0)},{q(c.get('extra') or 0)}) on conflict do nothing;")
    cfg = data.get('data/admin/config/main.json')
    if cfg:
        out.append(f"update config set rate={q(cfg.get('rate') or 0.052)} where id=1;")
    for k, o in data.items():
        if k.startswith('data/admin/orders/'):
            out.append(
                'insert into orders (code,round,name,phone,pickup,note,items,subtotal,promo,discount,ship,total,status,created_at) values ('
                + ','.join([
                    s(o.get('code') or os.path.basename(k)[:-5]), s(o.get('round')), s(o.get('name')), s(o.get('phone')),
                    s(o.get('pickup')), s(o.get('note')), js(o.get('items')), q(o.get('subtotal') or 0),
                    s(o.get('promo')), q(o.get('discount') or 0), q(o.get('ship') or 0), q(o.get('total') or 0),
                    s(o.get('status') or 'pending'), ms(o.get('createdAt')),
                ]) + ') on conflict (code) do nothing;')
    out.append('commit;')
    print('\n'.join(out))


if __name__ == '__main__':
    main()
