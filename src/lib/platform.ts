/**
 * Rough platform detection for /setup, so each visitor sees the save method
 * that fits their device first. Every method is always shown; this only
 * decides the order.
 */
export type Platform = 'ios' | 'android' | 'mac' | 'desktop' | 'unknown';

export type SaveMethod = 'shortcut' | 'bookmarklet';

export function detectPlatform(userAgent: string | null | undefined): Platform {
  const ua = userAgent ?? '';
  // iPhone UAs contain "like Mac OS X" and Android UAs contain "Linux", so
  // the mobile checks have to run before the desktop ones.
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  // iPadOS Safari sends a Mac UA by default; the server can't tell it apart.
  // /setup corrects for that on the client with navigator.maxTouchPoints.
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac';
  if (/Windows|X11|Linux|CrOS/.test(ua)) return 'desktop';
  return 'unknown';
}

/**
 * Desktops get the bookmarklet first. Phones and unknown clients keep the
 * Shortcut first: there's no Android method yet, and the Shortcut is the
 * one that works without a desktop browser.
 */
export function methodOrder(platform: Platform): SaveMethod[] {
  return platform === 'mac' || platform === 'desktop'
    ? ['bookmarklet', 'shortcut']
    : ['shortcut', 'bookmarklet'];
}
