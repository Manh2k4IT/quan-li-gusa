"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('ceo@gusa.io');
  const [password, setPassword] = useState('ceo123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(payload.message ?? 'Đăng nhập thất bại');
      return;
    }

    router.push('/');
    router.refresh();
  }

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <div className="brand-box auth-brand">
          <div className="brand-mark">G</div>
          <div>
            <p className="eyebrow">Enterprise Suite</p>
            <h1>GUSA</h1>
          </div>
        </div>

        <h2>Đăng nhập hệ thống</h2>

        <form onSubmit={handleSubmit} className="auth-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="ceo@gusa.io"
            />
          </label>

          <label>
            Mật khẩu
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" className="primary-btn auth-submit" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="demo-credentials">
          <p>Demo accounts:</p>
          <ul>
            <li>ceo@gusa.io / ceo123</li>
            <li>manager@gusa.io / manager123</li>
            <li>sale@gusa.io / sale123</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
