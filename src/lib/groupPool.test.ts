import { describe, expect, it } from 'vitest';
import { sharedByLabel } from './groupPool';

describe('sharedByLabel', () => {
  it('counts anonymous sharers and names the ones with a nickname', () => {
    expect(sharedByLabel(1, [])).toBe('');
    expect(sharedByLabel(3, [])).toBe('shared by 3');
    expect(sharedByLabel(1, ['Ana'])).toBe('shared by Ana');
    expect(sharedByLabel(2, ['Ana', 'Bo'])).toBe('shared by Ana and Bo');
    expect(sharedByLabel(3, ['Ana'])).toBe('shared by Ana and 2 others');
    expect(sharedByLabel(4, ['Ana', 'Bo', 'Cy'])).toBe('shared by Ana, Bo and 2 others');
  });
});
