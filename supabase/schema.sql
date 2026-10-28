-- 日本藥妝網店：Supabase 資料庫結構
-- 公開資料（產品、專題、店舖設定）任何人可讀；成本、訂單、優惠碼、匯率只限管理員。
-- 客人落單經 place_order 函數在伺服器端重新計價，不信任瀏覽器傳來的價錢。

create extension if not exists pgcrypto;

-- 管理員名單：以登入電郵識別
create table if not exists admins (
  email text primary key
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;

create table if not exists products (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  name text not null,
  jp_name text not null default '',
  brand text not null default '',
  category text not null default '護膚',
  price numeric not null check (price >= 0),
  status text not null default 'preorder' check (status in ('preorder','instock','soldout')),
  tag text not null default '',
  concerns text[] not null default '{}',
  hk_price numeric,
  sale_price numeric,
  sale_ends timestamptz,
  limit_qty int,
  max_per_order int,
  jp_price int,
  size text not null default '',
  expiry text not null default '',
  release_date text not null default '',
  award text not null default '',
  cosme_score numeric,
  description text not null default '',
  usage text not null default '',
  ingredients text not null default '',
  reviews jsonb not null default '[]',
  photos text[] not null default '{}',
  sold int not null default 0,
  example boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists features (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  sort_order int not null default 0,
  product_ids text[] not null default '{}'
);

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  name text not null default '日本藥妝預訂',
  tagline text not null default '',
  announcement text not null default '',
  whatsapp text not null default '',
  cutoff_at timestamptz,
  eta text not null default '',
  ship_fee numeric,
  free_ship numeric,
  fps text not null default '',
  payme text not null default '',
  returns text not null default ''
);

create table if not exists promos (
  code text primary key,
  type text not null check (type in ('pct','amt')),
  value numeric not null check (value > 0),
  min_spend numeric,
  expires date
);

create table if not exists costs (
  product_id text primary key references products(id) on delete cascade,
  jpy numeric not null default 0,
  extra numeric not null default 0
);

create table if not exists config (
  id int primary key default 1 check (id = 1),
  rate numeric not null default 0.052
);

create table if not exists orders (
  code text primary key,
  round text not null default '',
  name text not null,
  phone text not null,
  pickup text not null default '',
  note text not null default '',
  items jsonb not null,
  subtotal numeric not null,
  promo text not null default '',
  discount numeric not null default 0,
  ship numeric not null default 0,
  total numeric not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','paid','arrived','done','cancelled')),
  created_at timestamptz not null default now()
);

-- 權限規則
alter table admins enable row level security;
alter table products enable row level security;
alter table features enable row level security;
alter table settings enable row level security;
alter table promos enable row level security;
alter table costs enable row level security;
alter table config enable row level security;
alter table orders enable row level security;

drop policy if exists "admins read self" on admins;
create policy "admins read self" on admins for select to authenticated using (is_admin());

drop policy if exists "products public read" on products;
create policy "products public read" on products for select using (true);
drop policy if exists "products admin write" on products;
create policy "products admin write" on products for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "features public read" on features;
create policy "features public read" on features for select using (true);
drop policy if exists "features admin write" on features;
create policy "features admin write" on features for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "settings public read" on settings;
create policy "settings public read" on settings for select using (true);
drop policy if exists "settings admin write" on settings;
create policy "settings admin write" on settings for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "promos admin" on promos;
create policy "promos admin" on promos for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "costs admin" on costs;
create policy "costs admin" on costs for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "config admin" on config;
create policy "config admin" on config for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "orders admin" on orders;
create policy "orders admin" on orders for all to authenticated using (is_admin()) with check (is_admin());

insert into settings (id) values (1) on conflict do nothing;
insert into config (id) values (1) on conflict do nothing;

-- 現時售價（特價有效時用特價）
create or replace function current_price(p products) returns numeric
language sql stable as $$
  select case
    when p.sale_price is not null and p.sale_price < p.price
         and (p.sale_ends is null or p.sale_ends > now())
    then p.sale_price else p.price end;
$$;

-- 優惠碼折扣（只在伺服器端計算，客人看不到優惠碼清單）
create or replace function promo_discount(p_code text, p_subtotal numeric)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r promos; d numeric;
begin
  if coalesce(trim(p_code), '') = '' then return jsonb_build_object('discount', 0); end if;
  select * into r from promos where upper(code) = upper(trim(p_code));
  if not found then return jsonb_build_object('discount', 0, 'error', '優惠碼無效'); end if;
  if r.expires is not null and r.expires < (now() at time zone 'Asia/Hong_Kong')::date then
    return jsonb_build_object('discount', 0, 'error', '優惠碼已過期');
  end if;
  if r.min_spend is not null and p_subtotal < r.min_spend then
    return jsonb_build_object('discount', 0, 'error', '需滿 HK$' || trim(to_char(r.min_spend, 'FM999999990.##')) || ' 才可使用');
  end if;
  if r.type = 'pct' then d := round(p_subtotal * r.value / 100);
  else d := least(p_subtotal, r.value); end if;
  return jsonb_build_object('discount', d, 'code', upper(r.code),
    'label', case when r.type = 'pct' then trim(to_char(r.value, 'FM990.##')) || '% 折扣'
                  else '減 HK$' || trim(to_char(r.value, 'FM999990.##')) end);
end $$;

create or replace function check_promo(p_code text, p_subtotal numeric)
returns jsonb language sql stable security definer set search_path = public as $$
  select promo_discount(p_code, p_subtotal);
$$;

-- 截單輪次文字，例如「11月2日 23:00」
create or replace function round_text() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(to_char(cutoff_at at time zone 'Asia/Hong_Kong', 'FMMM"月"FMDD"日" HH24:MI'), '')
  from settings where id = 1;
$$;

-- 客人落單：重新計價、檢查限量、寫入訂單及更新已預訂件數
create or replace function place_order(
  p_items jsonb, p_name text, p_phone text, p_pickup text, p_note text, p_promo text
) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  it jsonb; p products; q int; cap int; price numeric;
  items jsonb := '[]'; sub numeric := 0; pr jsonb; disc numeric := 0;
  s settings; fee numeric := 0; v_code text; tries int := 0;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_phone), '') = '' then
    raise exception '請填寫稱呼和聯絡電話';
  end if;
  if length(p_name) > 60 or length(p_phone) > 30 or length(coalesce(p_note, '')) > 500 then
    raise exception '資料太長';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception '預訂清單是空的';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id = it ->> 'id' for update;
    if not found or p.status = 'soldout' then continue; end if;
    q := greatest(0, least(99, coalesce((it ->> 'qty')::int, 0)));
    if p.max_per_order is not null then q := least(q, p.max_per_order); end if;
    if p.limit_qty is not null then
      cap := greatest(0, p.limit_qty - p.sold);
      q := least(q, cap);
    end if;
    if q <= 0 then continue; end if;
    price := current_price(p);
    items := items || jsonb_build_object('id', p.id, 'name', p.name, 'jpName', p.jp_name, 'price', price, 'qty', q);
    sub := sub + price * q;
    update products set sold = sold + q where id = p.id;
  end loop;

  if jsonb_array_length(items) = 0 then
    raise exception '清單內的產品已售罄或已下架';
  end if;

  pr := promo_discount(p_promo, sub);
  disc := coalesce((pr ->> 'discount')::numeric, 0);

  select * into s from settings where id = 1;
  if coalesce(s.ship_fee, 0) > 0 and not (s.free_ship is not null and sub - disc >= s.free_ship) then
    fee := s.ship_fee;
  end if;

  loop
    v_code := 'JD' || to_char(now() at time zone 'Asia/Hong_Kong', 'YYMMDD') || '-' ||
      (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
         from generate_series(1, 4));
    exit when not exists (select 1 from orders o2 where o2.code = v_code);
    tries := tries + 1;
    if tries > 10 then raise exception '未能產生訂單編號'; end if;
  end loop;

  insert into orders (code, round, name, phone, pickup, note, items, subtotal, promo, discount, ship, total)
  values (v_code, round_text(), trim(p_name), trim(p_phone), coalesce(p_pickup, ''), coalesce(trim(p_note), ''),
          items, sub, case when disc > 0 then pr ->> 'code' else '' end, disc, fee, sub - disc + fee);

  return jsonb_build_object('code', v_code, 'round', round_text(), 'items', items, 'subtotal', sub,
    'promo', case when disc > 0 then pr ->> 'code' else '' end, 'discount', disc, 'ship', fee,
    'total', sub - disc + fee, 'promoError', pr ->> 'error');
end $$;

-- 管理員更改訂單狀態；取消或恢復訂單時同步已預訂件數
create or replace function set_order_status(p_code text, p_status text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare o orders; it jsonb; sign int := 0;
begin
  if not is_admin() then raise exception '沒有權限'; end if;
  select * into o from orders where code = p_code for update;
  if not found then raise exception '找不到訂單'; end if;
  if o.status <> 'cancelled' and p_status = 'cancelled' then sign := -1; end if;
  if o.status = 'cancelled' and p_status <> 'cancelled' then sign := 1; end if;
  update orders set status = p_status where code = p_code;
  if sign <> 0 then
    for it in select * from jsonb_array_elements(o.items) loop
      update products set sold = greatest(0, sold + sign * (it ->> 'qty')::int) where id = it ->> 'id';
    end loop;
  end if;
end $$;

create or replace function delete_order(p_code text)
returns void language plpgsql volatile security definer set search_path = public as $$
declare o orders; it jsonb;
begin
  if not is_admin() then raise exception '沒有權限'; end if;
  select * into o from orders where code = p_code for update;
  if not found then return; end if;
  if o.status <> 'cancelled' then
    for it in select * from jsonb_array_elements(o.items) loop
      update products set sold = greatest(0, sold - (it ->> 'qty')::int) where id = it ->> 'id';
    end loop;
  end if;
  delete from orders where code = p_code;
end $$;

revoke all on function place_order(jsonb, text, text, text, text, text) from public;
grant execute on function place_order(jsonb, text, text, text, text, text) to anon, authenticated;
grant execute on function check_promo(text, numeric) to anon, authenticated;
revoke all on function promo_discount(text, numeric) from public, anon, authenticated;
revoke all on function set_order_status(text, text) from public, anon;
grant execute on function set_order_status(text, text) to authenticated;
revoke all on function delete_order(text) from public, anon;
grant execute on function delete_order(text) to authenticated;
grant execute on function is_admin() to anon, authenticated;

-- 相片空間：公開讀取，只限管理員上載及刪除
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "photos admin insert" on storage.objects;
create policy "photos admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'photos' and public.is_admin());
drop policy if exists "photos admin update" on storage.objects;
create policy "photos admin update" on storage.objects for update to authenticated
  using (bucket_id = 'photos' and public.is_admin());
drop policy if exists "photos admin delete" on storage.objects;
create policy "photos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'photos' and public.is_admin());

-- 內部輔助函數不對外開放（只供 place_order 內部使用）
alter function current_price(products) set search_path = public;
revoke all on function current_price(products) from public, anon, authenticated;
revoke all on function round_text() from public, anon, authenticated;
