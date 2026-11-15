/**
 * Loading state for form submits (RAD-44). Every form in Radar is a plain
 * HTML form that navigates, so one document-level submit listener
 * (src/scripts/submitting.ts) covers them all. This is the decision part.
 */

export interface SubmitInfo {
  /** Another handler (e.g. `onsubmit="return confirm(…)"`) cancelled it. */
  defaultPrevented: boolean;
  /** The effective method, after any `formmethod` on the submitter. */
  method: string;
  /** The effective target, after any `formtarget` on the submitter. */
  target: string;
  /** The form is already waiting on a response. */
  alreadySubmitting: boolean;
}

/**
 * - `track`: show the loading state; the page will navigate away.
 * - `block`: a second submit while the first is in flight; cancel it.
 * - `ignore`: leave it alone (cancelled, a dialog form, or a new tab).
 */
export type SubmitDecision = 'track' | 'block' | 'ignore';

export function submitDecision(info: SubmitInfo): SubmitDecision {
  if (info.defaultPrevented) return 'ignore';
  if (info.method.toLowerCase() === 'dialog') return 'ignore';
  const target = info.target.trim().toLowerCase();
  if (target !== '' && target !== '_self') return 'ignore';
  if (info.alreadySubmitting) return 'block';
  return 'track';
}
