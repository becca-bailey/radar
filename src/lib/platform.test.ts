import { describe, expect, it } from 'vitest';
import { detectPlatform, methodOrder } from './platform';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1',
  ipadMobileUa:
    'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadDesktopUa:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macChrome:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  chromebook:
    'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
};

describe('detectPlatform', () => {
  it.each([
    ['iphoneSafari', 'ios'],
    ['iphoneChrome', 'ios'],
    ['ipadMobileUa', 'ios'],
    // iPadOS Safari's default UA is indistinguishable from a Mac's.
    ['ipadDesktopUa', 'mac'],
    ['macChrome', 'mac'],
    ['windowsChrome', 'desktop'],
    ['linuxFirefox', 'desktop'],
    ['chromebook', 'desktop'],
    ['androidChrome', 'android'],
  ] as const)('%s → %s', (key, expected) => {
    expect(detectPlatform(UA[key])).toBe(expected);
  });

  it('treats a missing or unrecognised UA as unknown', () => {
    expect(detectPlatform(null)).toBe('unknown');
    expect(detectPlatform(undefined)).toBe('unknown');
    expect(detectPlatform('')).toBe('unknown');
    expect(detectPlatform('curl/8.7.1')).toBe('unknown');
  });
});

describe('methodOrder', () => {
  it('puts the bookmarklet first on desktops', () => {
    expect(methodOrder('mac')).toEqual(['bookmarklet', 'shortcut']);
    expect(methodOrder('desktop')).toEqual(['bookmarklet', 'shortcut']);
  });

  it('puts the Shortcut first everywhere else', () => {
    expect(methodOrder('ios')).toEqual(['shortcut', 'bookmarklet']);
    expect(methodOrder('android')).toEqual(['shortcut', 'bookmarklet']);
    expect(methodOrder('unknown')).toEqual(['shortcut', 'bookmarklet']);
  });

  it('always includes every method', () => {
    for (const p of ['ios', 'android', 'mac', 'desktop', 'unknown'] as const) {
      expect([...methodOrder(p)].sort()).toEqual(['bookmarklet', 'shortcut']);
    }
  });
});
