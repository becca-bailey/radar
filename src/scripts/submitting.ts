/**
 * Loading state for every form submit (RAD-44). Loaded once by Layout.astro.
 *
 * While the server works: the form gets aria-busy and data-submitting, its
 * submit button is marked aria-disabled and pulses, the bar at the top of the page
 * in Layout.astro shows, and any `[data-skeleton-for="<form id>"]`
 * placeholder is revealed where the new content will appear.
 *
 * Listens in the bubble phase on document so inline `onsubmit` handlers
 * (like the confirm() on "Leave group") run first and can cancel.
 */
import { submitDecision } from '@/lib/submitting';

const status = () => document.getElementById('submit-status');

function start(form: HTMLFormElement, submitter: HTMLElement | null) {
  form.dataset.submitting = '';
  form.setAttribute('aria-busy', 'true');
  document.documentElement.dataset.submitting = '';

  const button =
    submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement
      ? submitter
      : form.querySelector<HTMLButtonElement>('button[type="submit"], button:not([type])');
  // aria-disabled rather than the disabled property: a disabled submitter
  // would drop out of the form data (built after this event), and Firefox
  // restores the disabled property on reload, leaving a dead button. Extra
  // clicks are stopped by the double-submit guard below.
  if (button && !button.disabled) {
    button.dataset.submitting = '';
    button.setAttribute('aria-disabled', 'true');
  }

  if (form.id) {
    document
      .querySelectorAll<HTMLElement>(`[data-skeleton-for="${CSS.escape(form.id)}"]`)
      .forEach((el) => (el.hidden = false));
  }

  const live = status();
  if (live) live.textContent = 'Loading…';
}

/** Undo everything start() did. Runs when Back restores the page from cache. */
function resetAll() {
  delete document.documentElement.dataset.submitting;
  document.querySelectorAll<HTMLFormElement>('form[data-submitting]').forEach((form) => {
    delete form.dataset.submitting;
    form.removeAttribute('aria-busy');
  });
  document.querySelectorAll<HTMLButtonElement>('button[data-submitting], input[data-submitting]').forEach((b) => {
    delete b.dataset.submitting;
    b.removeAttribute('aria-disabled');
  });
  document.querySelectorAll<HTMLElement>('[data-skeleton-for]').forEach((el) => (el.hidden = true));
  const live = status();
  if (live) live.textContent = '';
}

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  const submitter = event.submitter;

  const decision = submitDecision({
    defaultPrevented: event.defaultPrevented,
    method: submitter?.getAttribute('formmethod') ?? form.getAttribute('method') ?? 'get',
    target: submitter?.getAttribute('formtarget') ?? form.getAttribute('target') ?? '',
    alreadySubmitting: form.dataset.submitting !== undefined,
  });

  if (decision === 'block') event.preventDefault();
  else if (decision === 'track') start(form, submitter);
});

window.addEventListener('pageshow', (event) => {
  if (event.persisted) resetAll();
});
