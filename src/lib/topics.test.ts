import { describe, expect, it } from 'vitest';
import {
  clusterVectors,
  countNew,
  needsRefresh,
  overlapShare,
  parseVector,
  quantile,
  selectSuggestions,
  suggestionKey,
  themeWords,
  type Candidate,
} from './topics';

// Unit vectors near an axis, with a little noise toward a shared direction so
// everything is somewhat similar (a focused group).
function near(axis: number, wobble: number, dims = 6): number[] {
  const v = new Array<number>(dims).fill(0.3);
  v[axis] = 1;
  v[(axis + 1) % dims] += wobble;
  return v;
}

const cand = (key: string, ids: string[]): Candidate => ({ key, name: key, query: key, link_ids: ids });
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

describe('parseVector', () => {
  it('reads pgvector text and passes arrays through', () => {
    expect(parseVector('[0.1,0.2]')).toEqual([0.1, 0.2]);
    expect(parseVector([1, 2])).toEqual([1, 2]);
    expect(parseVector(null)).toBeNull();
    expect(parseVector('nope')).toBeNull();
  });
});

describe('quantile', () => {
  it('picks the nearest-rank value', () => {
    expect(quantile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(quantile([5, 1, 3, 2, 4], 0)).toBe(1);
    expect(quantile([], 0.5)).toBe(0);
  });
});

describe('clusterVectors', () => {
  it('splits a focused pool into its subtopics', () => {
    const vectors = [near(0, 0), near(0, 0.1), near(0, 0.2), near(2, 0), near(2, 0.1), near(2, 0.15), near(4, 0)];
    const clusters = clusterVectors(vectors).map((c) => [...c].sort((a, b) => a - b));
    expect(clusters).toContainEqual([0, 1, 2]);
    expect(clusters).toContainEqual([3, 4, 5]);
    expect(clusters.flat().sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('handles empty and single inputs', () => {
    expect(clusterVectors([])).toEqual([]);
    expect(clusterVectors([[1, 0]])).toEqual([[0]]);
  });
});

describe('themeWords', () => {
  it('finds words most titles share, folding plurals', () => {
    const titles = [
      'Stage fright before auditions',
      'Beta blockers for stage fright',
      'Breathing through stage fright',
      'How to prepare for an audition',
      'Mock auditions help',
      'Yoga for musicians',
    ];
    const words = themeWords(titles, 0.4);
    expect(words).toContain('stage');
    expect(words).toContain('fright');
    expect(words).toContain('audition');
    expect(words).not.toContain('yoga');
    expect(words).not.toContain('for');
  });
});

describe('overlapShare', () => {
  it('measures how much of a is in b', () => {
    expect(overlapShare(['a', 'b', 'c', 'd'], ['a', 'b', 'x'])).toBe(0.5);
    expect(overlapShare([], ['a'])).toBe(0);
  });
});

describe('suggestionKey', () => {
  it('normalizes case and spacing', () => {
    expect(suggestionKey('  Beta   Blockers ')).toBe('beta blockers');
  });
});

describe('selectSuggestions', () => {
  const pool = 40;

  it('drops topics too small or as big as the whole theme', () => {
    const out = selectSuggestions([cand('tiny', ids('t', 2)), cand('theme', ids('x', 25)), cand('ok', ids('o', 5))], {
      poolSize: pool,
    });
    expect(out.map((c) => c.key)).toEqual(['ok']);
  });

  it('drops what a lens already covers, and what was dismissed or pinned', () => {
    const out = selectSuggestions(
      [cand('covered', ['a', 'b', 'c', 'd']), cand('gone', ['e', 'f', 'g']), cand('again', ['h', 'i', 'j', 'k']), cand('ok', ids('o', 3))],
      {
        poolSize: pool,
        lensLinkIds: [['a', 'b', 'c', 'z']],
        dismissed: [
          { key: 'gone', query: 'gone', link_ids: [] },
          { key: 'renamed', query: 'renamed', link_ids: ['h', 'i', 'j'] },
        ],
      }
    );
    expect(out.map((c) => c.key)).toEqual(['ok']);
  });

  it('keeps the larger of two overlapping candidates and caps the count', () => {
    const out = selectSuggestions([cand('small', ['a', 'b', 'c']), cand('big', ['a', 'b', 'c', 'd', 'e'])], { poolSize: pool });
    expect(out.map((c) => c.key)).toEqual(['big']);
    const many = Array.from({ length: 9 }, (_, i) => cand(`c${i}`, ids(`p${i}-`, 3)));
    expect(selectSuggestions(many, { poolSize: pool, max: 6 })).toHaveLength(6);
  });
});

describe('needsRefresh', () => {
  const now = Date.parse('2026-11-18T12:00:00Z');
  const cache = { computed_at: '2026-11-18T00:00:00Z', pool_size: 20 };
  const old = (n: number) => Array.from({ length: n }, () => ({ last_shared_at: '2026-11-10T00:00:00Z' }));
  const fresh = (n: number) => Array.from({ length: n }, () => ({ last_shared_at: '2026-11-18T06:00:00Z' }));

  it('refreshes with no cache, a week-old cache, or a few new shares', () => {
    expect(needsRefresh(null, old(20), now)).toBe(true);
    expect(needsRefresh({ ...cache, computed_at: '2026-11-10T00:00:00Z' }, old(20), now)).toBe(true);
    expect(needsRefresh(cache, [...old(20), ...fresh(3)], now)).toBe(true);
  });

  it('refreshes when several links were removed, otherwise keeps the cache', () => {
    expect(needsRefresh(cache, old(17), now)).toBe(true);
    expect(needsRefresh(cache, [...old(20), ...fresh(2)], now)).toBe(false);
  });
});

describe('countNew', () => {
  it('counts links last shared since a time', () => {
    const last = new Map([
      ['a', '2026-11-17T00:00:00Z'],
      ['b', '2026-11-01T00:00:00Z'],
    ]);
    expect(countNew(['a', 'b', 'c'], last, Date.parse('2026-11-11T00:00:00Z'))).toBe(1);
  });
});
