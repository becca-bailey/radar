/**
 * A same-site path that's safe to redirect to, or the fallback. Rejects
 * protocol-relative URLs ("//host"), and backslashes and control characters,
 * since browsers read "/\host" and "/\t/host" as "//host" too.
 */
export function safeLocalPath(raw: string | null | undefined, fallback = '/'): string {
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  if (/[\\\x00-\x1f\x7f]/.test(raw)) return fallback;
  return raw;
}

/**
 * A redirect `Location` that keeps Netlify from copying the request's query
 * string onto it. Netlify appends the original query to a `Location` that has
 * none (`/setup?foo=1` → `Location: /login` arrives as `/login?foo=1`), which
 * carried `?error=…` from the sign-in page onto the archive and `?code=…` from
 * the auth callback into history. It does this for absolute URLs and for a
 * bare `?` too (both checked on a deploy preview), so the target gets a
 * placeholder query of its own, `?_`, which nothing reads. External URLs and
 * locations that already have a query are unchanged.
 */
export function withOwnQuery(location: string, origin: string): string {
  let url: URL;
  try {
    url = new URL(location, origin);
  } catch {
    return location;
  }
  if (url.origin !== new URL(origin).origin || url.search) return location;
  const hashAt = location.indexOf('#');
  const beforeHash = hashAt === -1 ? location : location.slice(0, hashAt);
  return beforeHash.replace(/\?$/, '') + '?_' + (hashAt === -1 ? '' : location.slice(hashAt));
}
