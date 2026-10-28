'use client';

import { useEffect, useState } from 'react';

type AvatarMap = Record<string, string>;

// One request per page load, shared by every avatar on the page.
let avatarsRequest: Promise<AvatarMap> | null = null;

function loadAvatars() {
  avatarsRequest ??= fetch('/api/user-avatars', { cache: 'no-store' })
    .then((response) => (response.ok ? response.json() : { avatars: {} }))
    .then((payload: { avatars?: AvatarMap }) => payload.avatars ?? {})
    .catch(() => ({}));
  return avatarsRequest;
}

type UserAvatarProps = {
  name: string;
  // Looked up from /api/user-avatars when no avatar is passed directly.
  userId?: string;
  avatar?: string | null;
  className?: string;
};

export default function UserAvatar({ name, userId, avatar, className = 'users-avatar' }: UserAvatarProps) {
  const [loaded, setLoaded] = useState<string | null>(null);

  useEffect(() => {
    if (avatar !== undefined || !userId) return;
    let cancelled = false;
    void loadAvatars().then((avatars) => {
      if (!cancelled) setLoaded(avatars[userId] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [avatar, userId]);

  const src = avatar ?? loaded;
  return (
    <span className={`${className} user-avatar`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a tiny inline data URL gains nothing from next/image */}
      {src ? <img src={src} alt="" /> : name.charAt(0).toUpperCase()}
    </span>
  );
}
