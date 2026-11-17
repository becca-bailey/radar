import { describe, expect, it } from 'vitest';
import { madeByLabel, poolLabel, savedByLabel, sharedByLabel, splitMemberWork } from './groupPool';

describe('pool labels', () => {
  it('names sharers who set a nickname, and nobody else', () => {
    expect(sharedByLabel([])).toBe('');
    expect(sharedByLabel(['Ana'])).toBe('shared by Ana');
    expect(sharedByLabel(['Ana', 'Bo'])).toBe('shared by Ana and Bo');
    expect(sharedByLabel(['Ana', 'Bo', 'Cy'])).toBe('shared by Ana, Bo and others');
  });

  it('counts everyone on Radar who saved the link, once there is more than one', () => {
    expect(savedByLabel(1)).toBe('');
    expect(savedByLabel(5)).toBe('saved by 5');
    expect(poolLabel({ member_made: false, made_by: [], names: [], savers: 1 })).toBe('');
    expect(poolLabel({ member_made: false, made_by: [], names: ['Ana'], savers: 4 })).toBe('shared by Ana · saved by 4');
    expect(poolLabel({ member_made: true, made_by: [], names: ['Ana'], savers: 3 })).toBe('made by a member · saved by 3');
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
