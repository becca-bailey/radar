// TEMPORARY (RAD-41): an on-screen log of touch, pointer, click and focus
// events, plus every open/close of a dropdown, so we can see on a real
// iPhone why tapping a menu does nothing. Only active with ?debugtaps in the
// URL (remembered for the tab). Never merge this.

const KEY = 'radar-debugtaps';
const MAX_LINES = 40;

let enabled: boolean | null = null;
let panel: HTMLPreElement | null = null;
const lines: string[] = [];
const start = typeof performance !== 'undefined' ? performance.now() : 0;

export function debugTapsEnabled(): boolean {
  if (enabled !== null) return enabled;
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('debugtaps')) sessionStorage.setItem(KEY, params.get('debugtaps') === 'off' ? '' : '1');
    enabled = sessionStorage.getItem(KEY) === '1';
  } catch {
    enabled = new URLSearchParams(window.location.search).has('debugtaps');
  }
  return enabled;
}

function describe(node: EventTarget | null): string {
  if (!(node instanceof Element)) return node === document ? 'document' : node === window ? 'window' : String(node);
  const label = node.getAttribute('aria-label') ?? node.getAttribute('data-slot') ?? '';
  const cls = typeof node.className === 'string' ? node.className.split(/\s+/).slice(0, 2).join('.') : '';
  return `${node.tagName.toLowerCase()}${node.id ? '#' + node.id : ''}${cls ? '.' + cls : ''}${label ? `[${label.slice(0, 30)}]` : ''}`;
}

function render() {
  if (!panel) {
    panel = document.createElement('pre');
    panel.setAttribute('aria-hidden', 'true');
    Object.assign(panel.style, {
      position: 'fixed',
      left: '0',
      right: '0',
      bottom: '0',
      maxHeight: '45vh',
      overflow: 'hidden',
      margin: '0',
      padding: '6px 8px',
      font: '10px/1.35 ui-monospace, Menlo, monospace',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      background: 'rgba(0,0,0,0.85)',
      color: '#7CFC9A',
      zIndex: '2147483647',
      // Never take part in hit-testing, so the log can't cause what it measures.
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(panel);
  }
  panel.textContent = lines.join('\n');
}

export function debugTap(message: string) {
  if (!debugTapsEnabled()) return;
  const t = ((performance.now() - start) / 1000).toFixed(3);
  lines.push(`${t} ${message}`);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  if (document.body) render();
  else document.addEventListener('DOMContentLoaded', render, { once: true });
}

let installed = false;

// Document-level listeners in the capture phase see every event before React
// or Radix can stop it.
export function installDebugTaps() {
  if (installed || !debugTapsEnabled()) return;
  installed = true;

  const ua = navigator.userAgent.match(/OS [\d_]+|Version\/[\d.]+|CriOS\/[\d.]+|FxiOS\/[\d.]+/g)?.join(' ') ?? '';
  debugTap(`debugtaps on · ${ua} · touch=${navigator.maxTouchPoints}`);

  const opts = { capture: true, passive: true } as const;

  for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) {
    document.addEventListener(
      type,
      (e) => {
        const touch = e.changedTouches[0];
        const hit = touch ? describe(document.elementFromPoint(touch.clientX, touch.clientY)) : '-';
        debugTap(`${type} target=${describe(e.target)} hit=${hit} cancelable=${e.cancelable}`);
      },
      opts
    );
  }

  for (const type of ['pointerdown', 'pointerup', 'pointercancel'] as const) {
    document.addEventListener(
      type,
      (e) => {
        const hit = describe(document.elementFromPoint(e.clientX, e.clientY));
        debugTap(`${type} ${e.pointerType} btn=${e.button} target=${describe(e.target)} hit=${hit}`);
      },
      opts
    );
  }

  document.addEventListener(
    'click',
    (e) => debugTap(`click detail=${e.detail} target=${describe(e.target)} prevented=${e.defaultPrevented}`),
    opts
  );
  document.addEventListener('focusin', (e) => debugTap(`focusin ${describe(e.target)}`), opts);
  document.addEventListener('focusout', (e) => debugTap(`focusout ${describe(e.target)}`), opts);

  window.addEventListener('error', (e) => debugTap(`ERROR ${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener('unhandledrejection', (e) => debugTap(`REJECTION ${String(e.reason)}`));
}
