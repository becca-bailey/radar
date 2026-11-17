import { describe, expect, it } from 'vitest';
import { nameList, poolLabel, savedByLabel, splitMemberWork } from './groupPool';

describe('pool labels', () => {
  it('lists up to two names, then counts the rest', () => {
    expect(nameList(['Ana'])).toBe('Ana');
    expect(nameList(['Ana', 'Bo'])).toBe('Ana and Bo');
    expect(nameList(['Ana', 'Bo', 'Cy'])).toBe('Ana, Bo and 1 other');
    expect(nameList(['Ana', 'Bo', 'Cy', 'Di'])).toBe('Ana, Bo and 2 others');
  });

  it('counts everyone on Radar who saved the link, once there is more than one', () => {
    expect(savedByLabel(1)).toBe('');
    expect(savedByLabel(5)).toBe('saved by 5');
  });

  it('says who shared a link', () => {
    expect(poolLabel({ member_made: false, made_by: [], names: ['Ana'], savers: 1 })).toBe('shared by Ana');
    expect(poolLabel({ member_made: false, made_by: [], names: ['Ana', 'Bo'], savers: 4 })).toBe(
      'shared by Ana and Bo · saved by 4'
    );
  });

  it("says who made a member's own work, and who else shared it", () => {
    expect(poolLabel({ member_made: true, made_by: ['Ana'], names: ['Ana'], savers: 3 })).toBe('made by Ana · saved by 3');
    expect(poolLabel({ member_made: true, made_by: ['Ana'], names: ['Bo', 'Ana'], savers: 2 })).toBe(
      'made by Ana · also shared by Bo · saved by 2'
    );
    // Two members with the same name: only the maker is taken out.
    expect(poolLabel({ member_made: true, made_by: ['Ana'], names: ['Ana', 'Ana'], savers: 2 })).toBe(
      'made by Ana · also shared by Ana · saved by 2'
    );
  });
});

describe('member work', () => {
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
