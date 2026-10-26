"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

const REMEMBERED_EMAIL_KEY = 'gusa_remembered_email';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const remembered = localStorage.getItem(REMEMBERED_EMAIL_KEY);
      if (remembered) setEmail(remembered);
    } catch {}
  }, []);

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

    try {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, email.trim().toLowerCase());
    } catch {}

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

        <form onSubmit={handleSubmit} className="auth-form" autoComplete="on">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Nhập email"
              name="email"
              autoComplete="username"
              required
            />
          </label>

          <label>
            Mật khẩu
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              name="password"
              autoComplete="current-password"
              required
            />
          </label>

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" className="primary-btn auth-submit" disabled={loading}>
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

      </div>
    </main>
  );
}
