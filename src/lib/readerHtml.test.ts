import { describe, expect, it } from 'vitest';
import { readingMinutes, safeUrl, sanitizeSnapshot, textToHtml } from './readerHtml';

const BASE = 'https://example.com/posts/one';

describe('sanitizeSnapshot', () => {
  it('keeps ordinary article markup', () => {
    const html = '<h2>Heading</h2><p>Some <em>text</em> and <strong>more</strong>.</p><ul><li>one</li></ul>';
    expect(sanitizeSnapshot(html, BASE)).toBe(html);
  });

  it('removes scripts, styles, iframes and forms with their contents', () => {
    const out = sanitizeSnapshot(
      '<p>a</p><script>alert(1)</script><style>p{}</style><iframe src="https://x.test"></iframe><form><input></form><p>b</p>',
      BASE
    );
    expect(out).toBe('<p>a</p><p>b</p>');
  });

  it('strips event handlers, styles, classes and ids', () => {
    const out = sanitizeSnapshot('<p onclick="x()" style="color:red" class="c" id="i">hi</p>', BASE);
    expect(out).toBe('<p>hi</p>');
  });

  it('drops javascript: and data: links but keeps the text', () => {
    const out = sanitizeSnapshot('<a href="javascript:alert(1)">x</a> <a href="data:text/html,hi">y</a>', BASE);
    expect(out).not.toContain('javascript');
    expect(out).not.toContain('data:');
    expect(out).toBe('x y');
  });

  it('makes relative links absolute and marks them noreferrer', () => {
    const out = sanitizeSnapshot('<a href="../two">next</a>', BASE);
    expect(out).toContain('href="https://example.com/two"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
  });

  it('resolves images, loads them lazily without a referrer, and drops srcset', () => {
    const out = sanitizeSnapshot('<img src="/a.png" srcset="/a2.png 2x" onerror="x()">', BASE);
    expect(out).toContain('src="https://example.com/a.png"');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('referrerpolicy="no-referrer"');
    expect(out).toContain('alt=""');
    expect(out).not.toContain('srcset');
    expect(out).not.toContain('onerror');
  });

  it('removes images without a usable source', () => {
    expect(sanitizeSnapshot('<p>a<img src="javascript:x"></p>', BASE)).toBe('<p>a</p>');
  });

  it('unwraps unknown tags, keeping their contents', () => {
    expect(sanitizeSnapshot('<font color="red"><b>bold</b></font><x-thing>t</x-thing>', BASE)).toBe('<b>bold</b>t');
  });

  it('unwraps fragment-only links, whose targets were stripped', () => {
    expect(sanitizeSnapshot('<p><a href="#part-2">Part 2</a></p>', BASE)).toBe('<p>Part 2</p>');
  });

  it('keeps the whole article when the snapshot has stray closing tags', () => {
    expect(sanitizeSnapshot('<p>a</p></div></body></html><p>rest</p>', BASE)).toBe('<p>a</p><p>rest</p>');
  });

  it('removes comments', () => {
    expect(sanitizeSnapshot('<p>a<!-- <script>x</script> --></p>', BASE)).toBe('<p>a</p>');
  });

  it('escapes text that looks like markup', () => {
    const out = sanitizeSnapshot('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>', BASE);
    expect(out).not.toContain('<script');
  });

  it('keeps attribute values quoted safely', () => {
    const out = sanitizeSnapshot('<img src="/a.png" alt="&quot; onerror=&quot;x()">', BASE);
    expect(out).toContain('alt="&quot; onerror=&quot;x()"');
    expect(out).not.toMatch(/"\s+onerror=/);
  });

  it('drops svg and math, which have their own parsing rules', () => {
    expect(sanitizeSnapshot('<svg><script>x</script></svg><math><mi>x</mi></math><p>ok</p>', BASE)).toBe('<p>ok</p>');
  });
});

describe('safeUrl', () => {
  it('accepts http and https only', () => {
    expect(safeUrl('https://a.test/x', BASE)).toBe('https://a.test/x');
    expect(safeUrl('mailto:a@b.test', BASE)).toBeNull();
    expect(safeUrl('  JaVaScRiPt:alert(1)', BASE)).toBeNull();
    expect(safeUrl('', BASE)).toBeNull();
  });
});

describe('textToHtml', () => {
  it('splits paragraphs on blank lines and escapes markup', () => {
    expect(textToHtml('one\ntwo\n\n<b>three</b>')).toBe('<p>one<br>two</p>\n<p>&lt;b&gt;three&lt;/b&gt;</p>');
  });
});

describe('readingMinutes', () => {
  it('rounds to at least a minute', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes('word '.repeat(690))).toBe(3);
  });
});
