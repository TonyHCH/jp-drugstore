import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="wrap">
      <div className="login">
        <h1>找不到這一頁</h1>
        <p className="hint">產品可能已經下架，或網址有誤。</p>
        <p style={{ marginTop: 14 }}><Link className="btn primary" href="/">返回網店首頁</Link></p>
      </div>
    </main>
  );
}
