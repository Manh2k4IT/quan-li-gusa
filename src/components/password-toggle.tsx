'use client';

import { useState } from 'react';

type PasswordToggleProps = {
  password: string;
  userName: string;
};

export default function PasswordToggle({ password, userName }: PasswordToggleProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-toggle">
      <span className="password-value">{visible ? password : '••••••••'}</span>
      <button
        type="button"
        className="ghost-btn password-toggle-button"
        onClick={() => setVisible((current) => !current)}
        aria-label={`${visible ? 'Ẩn' : 'Xem'} mật khẩu của ${userName}`}
      >
        {visible ? 'Ẩn' : 'Xem'}
      </button>
    </div>
  );
}
