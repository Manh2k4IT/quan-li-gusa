export const SESSION_COOKIE = 'gusa_session';

// Browsers cap cookie lifetime at 400 days; proxy.ts re-issues the cookie on every visit so it never expires while in use.
export const SESSION_MAX_AGE = 60 * 60 * 24 * 400;

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_MAX_AGE,
} as const;
