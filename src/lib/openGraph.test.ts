import { describe, expect, it } from 'vitest';
import { extractOpenGraph } from './openGraph';

describe('extractOpenGraph', () => {
  it('defaults to article when nothing says otherwise', () => {
    const og = extractOpenGraph('<html><head><title>Hi</title></head><body></body></html>');
    expect(og.kind).toBe('article');
  });

  it('classifies og:type video', () => {
    const og = extractOpenGraph(
      '<html><head><meta property="og:type" content="video.other"></head></html>'
    );
    expect(og.kind).toBe('video');
  });

  it('finds og tags deep in a huge head (YouTube-style)', () => {
    // YouTube's og tags sit ~850KB into the page, after giant inline scripts.
    const padding = '<script>/*' + 'x'.repeat(800_000) + '*/</script>';
    const html = `<html><head>${padding}<meta property="og:type" content="video.other"><meta property="og:title" content="A video"></head><body></body></html>`;
    const og = extractOpenGraph(html);
    expect(og.kind).toBe('video');
    expect(og.title).toBe('A video');
  });

  it('classifies product from price metadata', () => {
    const og = extractOpenGraph(
      '<html><head><meta property="product:price:amount" content="19.99"></head></html>'
    );
    expect(og.kind).toBe('product');
    expect(og.price).toBe('19.99');
  });

  it('decodes numeric entities in meta content (Threads-style &#064;)', () => {
    const html =
      '<head><meta property="og:title" content="Someone (&#064;someone) on Threads"><meta property="og:description" content="Tom &amp;amp; Jerry &#x2014; ok"></head>';
    const og = extractOpenGraph(html);
    expect(og.title).toBe('Someone (@someone) on Threads');
    expect(og.description).toBe('Tom &amp; Jerry \u2014 ok');
  });
});
