/**
 * Rough platform detection for /setup, so each visitor sees the save method
 * that fits their device first. Every method is always shown; this only
 * decides the order.
 */
export type Platform = 'ios' | 'android' | 'mac' | 'desktop' | 'unknown';

export type SaveMethod = 'shortcut' | 'bookmarklet' | 'android';

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
 * Each platform's own method first: the bookmarklet on desktops, the
 * installed app's share target on Android, the Shortcut on iPhone and iPad.
 * Unknown clients keep the Shortcut first, then Android, since both work
 * without a desktop browser.
 */
export function methodOrder(platform: Platform): SaveMethod[] {
  switch (platform) {
    case 'mac':
    case 'desktop':
      return ['bookmarklet', 'shortcut', 'android'];
    case 'android':
      return ['android', 'shortcut', 'bookmarklet'];
    case 'ios':
      return ['shortcut', 'bookmarklet', 'android'];
    default:
      return ['shortcut', 'android', 'bookmarklet'];
  }
}
