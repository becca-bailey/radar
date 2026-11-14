import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * SSRF guard for server-side fetches of user-supplied URLs: only http(s) URLs
 * whose host is, or resolves only to, public unicast addresses get through.
 */

export class BlockedUrlError extends Error {
  constructor(url: string, reason: string) {
    super(`Refusing to fetch ${url}: ${reason}`);
    this.name = 'BlockedUrlError';
  }
}

export interface LookupAddress {
  address: string;
  family: number;
}

/** Resolves a hostname to every address it has (like `dns.lookup` with `all: true`). */
export type LookupFn = (hostname: string) => Promise<LookupAddress[]>;

export const defaultLookup: LookupFn = (hostname) =>
  dnsLookup(hostname, { all: true, verbatim: true });

// [network, prefix length]
const BLOCKED_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. cloud metadata 169.254.169.254
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // TEST-NET-1
  ['192.88.99.0', 24], // 6to4 relay anycast
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. broadcast
];

const BLOCKED_V4_RANGES = BLOCKED_V4.map(([net, bits]) => {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return { base: (parseV4(net)! & mask) >>> 0, mask };
});

/** True when the address is anything other than public unicast. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const kind = isIP(ip);
  if (kind === 4) return isBlockedV4(parseV4(ip)!);
  if (kind === 6) return isBlockedV6(parseV6(ip));
  return true; // not an IP at all: refuse rather than guess
}

function isBlockedV4(n: number): boolean {
  return BLOCKED_V4_RANGES.some(({ base, mask }) => ((n & mask) >>> 0) === base);
}

function isBlockedV6(h: number[] | null): boolean {
  if (!h) return true;
  const v4At = (i: number) => ((h[i] << 16) | h[i + 1]) >>> 0;
  const zeros = (from: number, to: number) => h.slice(from, to).every((x) => x === 0);

  if (zeros(0, 8)) return true; // :: unspecified
  if (zeros(0, 7) && h[7] === 1) return true; // ::1 loopback
  // IPv4-mapped ::ffff:a.b.c.d and IPv4-compatible ::a.b.c.d (deprecated)
  if (zeros(0, 5) && h[5] === 0xffff) return isBlockedV4(v4At(6));
  if (zeros(0, 6)) return isBlockedV4(v4At(6));
  // NAT64 64:ff9b::/96 and local-use 64:ff9b:1::/48
  if (h[0] === 0x64 && h[1] === 0xff9b) return h[2] === 1 || isBlockedV4(v4At(6));
  if (h[0] === 0x2002) return isBlockedV4(v4At(1)); // 6to4 embeds a v4 address
  if (h[0] === 0x2001 && h[1] === 0) return true; // Teredo
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // documentation
  if ((h[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((h[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((h[0] & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

function parseV4(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n >>> 0;
}

/** Expand an IPv6 address (already validated by `isIP`) to eight 16-bit groups. */
function parseV6(ip: string): number[] | null {
  let text = ip.toLowerCase();
  // A trailing dotted quad (::ffff:1.2.3.4) becomes two hex groups.
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = parseV4(dotted[2]);
    if (v4 === null) return null;
    text = `${dotted[1]}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const [head, tail] = text.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail !== undefined && tail !== '' ? tail.split(':') : [];
  const fill = text.includes('::') ? 8 - headParts.length - tailParts.length : 0;
  const groups = [...headParts, ...Array(fill).fill('0'), ...tailParts].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

/**
 * Throw `BlockedUrlError` unless `raw` is an http(s) URL whose host is a public
 * address, or a name that resolves only to public addresses.
 *
 * This checks DNS before the request, and fetch resolves the name again when
 * it connects, so a name that changes answers in between (DNS rebinding) can
 * still slip through. Closing that needs connect-time pinning.
 */
export async function assertPublicUrl(raw: string | URL, lookup: LookupFn = defaultLookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError(String(raw), 'not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BlockedUrlError(url.href, `scheme ${url.protocol} is not allowed`);
  }

  // WHATWG URL has already normalized numeric hosts (2130706433, 0x7f.1, 127.1
  // all become 127.0.0.1); IPv6 hosts keep their brackets.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) {
    if (isBlockedAddress(host)) throw new BlockedUrlError(url.href, `${host} is not a public address`);
    return url;
  }

  const name = host.replace(/\.+$/, '').toLowerCase();
  if (name === '' || name === 'localhost' || name.endsWith('.localhost')) {
    throw new BlockedUrlError(url.href, `${host} is a local name`);
  }

  // A lookup failure propagates as-is: it is usually transient, not a block.
  const addresses = await lookup(name);
  if (addresses.length === 0) throw new BlockedUrlError(url.href, `${host} has no addresses`);
  const bad = addresses.find((a) => isBlockedAddress(a.address));
  if (bad) throw new BlockedUrlError(url.href, `${host} resolves to ${bad.address}, which is not public`);
  return url;
}
