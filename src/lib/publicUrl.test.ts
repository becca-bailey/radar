import { describe, expect, it } from 'vitest';
import { assertPublicUrl, BlockedUrlError, isBlockedAddress, type LookupFn } from './publicUrl';

const resolvesTo =
  (...addresses: string[]): LookupFn =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));

const noDns: LookupFn = async (host) => {
  throw new Error(`unexpected lookup of ${host}`);
};

describe('isBlockedAddress', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '100.64.0.1',
    '100.127.255.255',
    '127.0.0.1',
    '127.255.255.254',
    '169.254.169.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.0.0.8',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.7',
    '203.0.113.9',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    '[::1]',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '::127.0.0.1',
    '64:ff9b::a00:1',
    '2002:c0a8:101::1',
    '2001:db8::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'fe80::1%en0',
    'fec0::1',
    'ff02::1',
    'not-an-ip',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '100.63.255.255',
    '100.128.0.0',
    '172.15.255.255',
    '172.32.0.0',
    '93.184.216.34',
    '2606:4700:4700::1111',
    '2a00:1450:4001::200e',
    '::ffff:8.8.8.8',
    '64:ff9b::808:808',
  ])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  it('allows a public hostname', async () => {
    const url = await assertPublicUrl('https://example.com/a', resolvesTo('93.184.216.34'));
    expect(url.href).toBe('https://example.com/a');
  });

  it.each([
    'http://127.0.0.1/',
    'http://2130706433/', // decimal 127.0.0.1
    'http://0x7f.1/', // hex shorthand
    'http://127.1/',
    'http://[::1]:8080/',
    'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/latest/meta-data/',
    'http://10.0.0.5/',
    'http://localhost:4321/',
    'http://LOCALHOST./',
    'http://api.localhost/',
  ])('blocks %s without a DNS lookup', async (url) => {
    await expect(assertPublicUrl(url, noDns)).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it.each(['file:///etc/passwd', 'data:text/html,hi', 'ftp://example.com/', 'not a url'])(
    'blocks %s',
    async (url) => {
      await expect(assertPublicUrl(url, noDns)).rejects.toBeInstanceOf(BlockedUrlError);
    }
  );

  it('blocks a hostname that resolves to a private address', async () => {
    await expect(assertPublicUrl('https://internal.example/', resolvesTo('10.0.0.7'))).rejects.toThrow(
      /resolves to 10\.0\.0\.7/
    );
  });

  it('blocks a hostname when any of its addresses is private', async () => {
    await expect(
      assertPublicUrl('https://mixed.example/', resolvesTo('93.184.216.34', '::1'))
    ).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it('blocks a hostname with no addresses', async () => {
    await expect(assertPublicUrl('https://empty.example/', resolvesTo())).rejects.toBeInstanceOf(
      BlockedUrlError
    );
  });

  it('passes DNS failures through as ordinary errors', async () => {
    const failing: LookupFn = async () => {
      throw new Error('ENOTFOUND');
    };
    const err = await assertPublicUrl('https://gone.example/', failing).catch((e) => e);
    expect(err).not.toBeInstanceOf(BlockedUrlError);
    expect(err.message).toBe('ENOTFOUND');
  });
});
