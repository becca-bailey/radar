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
