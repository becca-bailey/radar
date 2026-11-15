/**
 * Loading state for every form submit (RAD-44). Loaded once by Layout.astro.
 *
 * Marks the form data-submitting and aria-busy and the button aria-disabled;
 * CSS keyed on those does the rest (button pulse, top bar, skeletons).
 * Bubble phase on document, so inline `onsubmit="return confirm(…)"` runs first.
 */
document.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  if (event.defaultPrevented) return; // e.g. "Leave group" confirm declined
  if (form.dataset.submitting !== undefined) return event.preventDefault(); // already waiting
  form.dataset.submitting = '';
  form.setAttribute('aria-busy', 'true');
  event.submitter?.setAttribute('aria-disabled', 'true');
});

// Back can restore a page mid-submit from cache; reload it fresh.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) location.reload();
});
