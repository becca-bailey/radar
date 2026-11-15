/**
 * Where a form post to POST /api/saves lands afterwards. Two form callers:
 * the home page's paste box and the bookmarklet's popup at /save.
 */
export type SaveFormOrigin = 'home' | 'popup';

export function saveFormOrigin(returnTo: FormDataEntryValue | null): SaveFormOrigin {
  return returnTo === 'save' ? 'popup' : 'home';
}

export function saveSuccessPath(
  origin: SaveFormOrigin,
  result: { saveId: string; alreadySaved: boolean }
): string {
  if (origin === 'popup') {
    return result.alreadySaved ? '/save?done=1&already=1' : '/save?done=1';
  }
  // A brand-new save can be undone from the home page's "Saved." notice.
  return result.alreadySaved ? '/?saved=1' : `/?saved=1&undo_save=${encodeURIComponent(result.saveId)}`;
}

/**
 * The popup gets its url and title back so the person can fix the link and
 * try again without re-running the bookmarklet.
 */
export function saveErrorPath(
  origin: SaveFormOrigin,
  message: string,
  submitted: { url: string; title: string | null }
): string {
  if (origin === 'home') return `/?${new URLSearchParams({ error: message })}`;
  const params = new URLSearchParams();
  if (submitted.url) params.set('url', submitted.url);
  if (submitted.title) params.set('title', submitted.title);
  params.set('error', message);
  return `/save?${params}`;
}
