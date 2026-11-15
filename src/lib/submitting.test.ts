import { describe, expect, it } from 'vitest';
import { submitDecision, type SubmitInfo } from './submitting';

const base: SubmitInfo = { defaultPrevented: false, method: 'post', target: '', alreadySubmitting: false };

describe('submitDecision', () => {
  it('tracks ordinary posts and gets', () => {
    expect(submitDecision(base)).toBe('track');
    expect(submitDecision({ ...base, method: 'get' })).toBe('track');
    expect(submitDecision({ ...base, target: '_self' })).toBe('track');
  });

  it('blocks a second submit while the first is in flight', () => {
    expect(submitDecision({ ...base, alreadySubmitting: true })).toBe('block');
  });

  it('ignores submits another handler cancelled, like a declined confirm()', () => {
    expect(submitDecision({ ...base, defaultPrevented: true })).toBe('ignore');
    expect(submitDecision({ ...base, defaultPrevented: true, alreadySubmitting: true })).toBe('ignore');
  });

  it('ignores dialog forms and forms that open elsewhere', () => {
    expect(submitDecision({ ...base, method: 'DIALOG' })).toBe('ignore');
    expect(submitDecision({ ...base, target: '_blank' })).toBe('ignore');
  });
});
