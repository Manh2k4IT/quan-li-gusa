'use client';

import { useRef, useState } from 'react';

type AvatarPickerProps = {
  userId: string;
  name: string;
  role: string;
  avatar: string | null;
  action: (formData: FormData) => Promise<void>;
};

// Avatars are stored inline in the database, so they are cropped to a small square JPEG in the browser first.
const AVATAR_SIZE = 160;

function resizeToSquare(file: File) {
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_SIZE;
      canvas.height = AVATAR_SIZE;
      canvas.getContext('2d')!.drawImage(image, (image.width - side) / 2, (image.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Không đọc được ảnh.'));
    };
    image.src = url;
  });
}

export default function AvatarPicker({ userId, name, role, avatar, action }: AvatarPickerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  async function save(value: string) {
    const formData = new FormData();
    formData.set('userId', userId);
    formData.set('avatar', value);
    setPending(true);
    try {
      await action(formData);
    } finally {
      setPending(false);
    }
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      await save(await resizeToSquare(file));
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Không đổi được ảnh đại diện.');
    }
  }

  return (
    <div className={`avatar-picker${pending ? ' is-pending' : ''}`}>
      <button type="button" className={`users-avatar users-avatar-${role.toLowerCase()}`} onClick={() => fileRef.current?.click()} disabled={pending} aria-label={`Đổi ảnh đại diện của ${name}`} title="Bấm để đổi ảnh đại diện">
        {/* eslint-disable-next-line @next/next/no-img-element -- a tiny inline data URL gains nothing from next/image */}
        {avatar ? <img src={avatar} alt="" /> : name.charAt(0).toUpperCase()}
        <span className="avatar-picker-overlay" aria-hidden="true">✎</span>
      </button>
      {avatar ? (
        <button type="button" className="avatar-picker-remove" onClick={() => save('')} disabled={pending} aria-label={`Xóa ảnh đại diện của ${name}`} title="Xóa ảnh">×</button>
      ) : null}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </div>
  );
}
