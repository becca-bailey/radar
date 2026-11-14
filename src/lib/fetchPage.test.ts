import { describe, expect, it, vi } from 'vitest';
import { BlockedUrlError, fetchPage } from './fetchPage';
import type { LookupFn } from './publicUrl';

const DNS: Record<string, string[]> = {
  'example.com': ['93.184.216.34'],
  'other.example': ['93.184.216.35'],
  'evil.example': ['192.168.0.10'],
};

const lookup: LookupFn = async (host) => {
  const addresses = DNS[host];
  if (!addresses) throw new Error(`ENOTFOUND ${host}`);
  return addresses.map((address) => ({ address, family: 4 }));
};

const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const redirect = (location: string, status = 302) =>
  new Response(null, { status, headers: { Location: location } });

/** A fake fetch that answers each URL from a table, failing on anything else. */
function fakeFetch(routes: Record<string, () => Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.redirect).toBe('manual');
    const route = routes[String(input)];
    if (!route) throw new Error(`unexpected fetch of ${String(input)}`);
    return route();
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('fetchPage', () => {
  it('fetches a public page', async () => {
    const fetchImpl = fakeFetch({ 'https://example.com/a': () => html('<title>A</title>') });
    const page = await fetchPage('https://example.com/a', { fetchImpl, lookup });
    expect(page).toEqual({
      finalUrl: 'https://example.com/a',
      status: 200,
      contentType: 'text/html; charset=utf-8',
      html: '<title>A</title>',
    });
  });

  it('follows public redirects, including relative ones, and reports the last hop', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/a': () => redirect('https://other.example/b', 301),
      'https://other.example/b': () => redirect('/c?x=1', 307),
      'https://other.example/c?x=1': () => html('done'),
    });
    const page = await fetchPage('https://example.com/a', { fetchImpl, lookup });
    expect(page.finalUrl).toBe('https://other.example/c?x=1');
    expect(page.html).toBe('done');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('refuses a private address before fetching anything', async () => {
    const fetchImpl = fakeFetch({});
    await expect(fetchPage('http://127.0.0.1:4321/', { fetchImpl, lookup })).rejects.toBeInstanceOf(
      BlockedUrlError
    );
    await expect(fetchPage('https://evil.example/', { fetchImpl, lookup })).rejects.toBeInstanceOf(
      BlockedUrlError
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost/admin',
    'http://[::1]/',
    'https://evil.example/',
    'data:text/html,<h1>hi</h1>',
    'file:///etc/passwd',
  ])('refuses a redirect to %s without following it', async (target) => {
    const fetchImpl = fakeFetch({ 'https://example.com/a': () => redirect(target) });
    await expect(fetchPage('https://example.com/a', { fetchImpl, lookup })).rejects.toBeInstanceOf(
      BlockedUrlError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('refuses a private hop later in a redirect chain', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/a': () => redirect('https://other.example/b'),
      'https://other.example/b': () => redirect('http://10.0.0.1/'),
    });
    await expect(fetchPage('https://example.com/a', { fetchImpl, lookup })).rejects.toBeInstanceOf(
      BlockedUrlError
    );
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after too many redirects', async () => {
    const fetchImpl = fakeFetch({ 'https://example.com/loop': () => redirect('/loop') });
    await expect(fetchPage('https://example.com/loop', { fetchImpl, lookup })).rejects.toThrow(
      /Too many redirects/
    );
    expect(fetchImpl).toHaveBeenCalledTimes(6);
  });

  it('returns a 3xx without a Location as an ordinary response', async () => {
    const fetchImpl = fakeFetch({
      'https://example.com/a': () => new Response(null, { status: 304 }),
    });
    const page = await fetchPage('https://example.com/a', { fetchImpl, lookup });
    expect(page.status).toBe(304);
    expect(page.html).toBeNull();
  });

  it('returns HTTP errors without throwing', async () => {
    const fetchImpl = fakeFetch({ 'https://example.com/missing': () => html('nope', 404) });
    const page = await fetchPage('https://example.com/missing', { fetchImpl, lookup });
    expect(page.status).toBe(404);
  });
});
