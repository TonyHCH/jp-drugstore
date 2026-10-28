import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Storefront from '@/components/Storefront';
import { getShopData } from '@/lib/data';
import { money, photoUrl, priceOf } from '@/lib/shop';

export const revalidate = 60;

/* 產品頁在第一次被打開時產生，之後每分鐘最多更新一次 */
export async function generateStaticParams() {
  return [];
}

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const d = await getShopData();
  const p = d.products.find((x) => x.id === decodeURIComponent(id));
  if (!p) return { title: '找不到產品' };
  const desc = `HK$${money(priceOf(p))}・${(p.description || p.jp_name || '').split('\n')[0]}`.slice(0, 160);
  return {
    title: p.name,
    description: desc,
    openGraph: { title: p.name, description: desc, images: p.photos[0] ? [photoUrl(p.photos[0])] : undefined },
    alternates: { canonical: `/p/${encodeURIComponent(p.id)}` },
  };
}

export default async function ProductPage({ params }: Params) {
  const { id } = await params;
  const d = await getShopData();
  const pid = decodeURIComponent(id);
  if (!d.error && !d.products.some((x) => x.id === pid)) notFound();
  return <Storefront products={d.products} features={d.features} settings={d.settings} openId={pid} error={d.error} />;
}
