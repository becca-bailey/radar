import { describe, expect, it } from 'vitest';
import { madeByLabel, sharedByLabel, splitMemberWork } from './groupPool';

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

describe('member work', () => {
  it('names makers who set a nickname, and nobody else', () => {
    expect(madeByLabel([])).toBe('made by a member');
    expect(madeByLabel(['Ana'])).toBe('made by Ana');
    expect(madeByLabel(['Ana', 'Bo', 'Cy'])).toBe('made by Ana, Bo and Cy');
  });

  it('keeps member work apart from recommendations, in order', () => {
    const links = [
      { id: 'a', member_made: false },
      { id: 'b', member_made: true },
      { id: 'c', member_made: false },
      { id: 'd', member_made: true },
    ];
    const { memberWork, shared } = splitMemberWork(links);
    expect(memberWork.map((l) => l.id)).toEqual(['b', 'd']);
    expect(shared.map((l) => l.id)).toEqual(['a', 'c']);
  });
});
