import type { NextConfig } from 'next';

/* 本機測試時資料庫在 localhost，Next.js 不會優化本機圖片，所以直接用原圖 */
const local = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').includes('localhost');

const nextConfig: NextConfig = {
  images: {
    unoptimized: local,
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co', pathname: '/storage/v1/object/public/**' }],
  },
};

export default nextConfig;
