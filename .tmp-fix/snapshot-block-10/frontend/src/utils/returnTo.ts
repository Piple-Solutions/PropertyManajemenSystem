/**
 * FE-003: `returnTo` carries the page a user was on when the session ended.
 * Only same-origin application paths are honoured (open-redirect safe):
 * must start with a single `/`, never `//`, and never point back at the
 * public auth screens.
 */
const BLOCKED_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password'];

export function safeReturnTo(search: string): string | null {
  const raw = new URLSearchParams(search).get('returnTo');
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  if (BLOCKED_PREFIXES.some((p) => raw === p || raw.startsWith(`${p}/`) || raw.startsWith(`${p}?`))) return null;
  return raw;
}

export function loginPathFor(current: { pathname: string; search: string; hash?: string }, loginPath = '/login'): string {
  const target = `${current.pathname}${current.search}${current.hash ?? ''}`;
  if (target === '/' || target === '' || BLOCKED_PREFIXES.some((p) => current.pathname.startsWith(p))) return loginPath;
  return `${loginPath}?returnTo=${encodeURIComponent(target)}`;
}
