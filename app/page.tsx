import Storefront from '@/components/Storefront';
import { getShopData } from '@/lib/data';

export const revalidate = 60;

export default async function Home() {
  const d = await getShopData();
  return <Storefront products={d.products} features={d.features} settings={d.settings} error={d.error} />;
}
