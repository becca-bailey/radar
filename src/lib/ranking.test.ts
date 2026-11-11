import { describe, expect, it } from 'vitest';
import {
  completedPeriodFor,
  composeEdition,
  inverseFrequencyWeight,
  type CandidateLink,
  type RankingContext,
} from './ranking';

const windowStart = new Date('2026-11-02T00:00:00Z');
const windowEnd = new Date('2026-11-09T00:00:00Z');

function rec(userId: string, day: number, note = '', attributionOk = false) {
  return {
    userId,
    displayName: `Reader ${userId}`,
    note,
    attributionOk,
    createdAt: new Date(windowStart.getTime() + day * 24 * 60 * 60 * 1000),
  };
}

function link(id: string, source: string, recommenders: ReturnType<typeof rec>[]): CandidateLink {
  return { linkId: id, source, title: `Title ${id}`, canonicalUrl: `https://${source}/${id}`, recommenders };
}

function ctx(overrides: Partial<RankingContext> = {}): RankingContext {
  return {
    editionSize: 5,
    perSourceCap: 1,
    activeMembers: 10,
    windowStart,
    windowEnd,
    sourceCounts: new Map(),
    totalRecommendations: 1000,
    smallSourceThreshold: 2,
    seenSources: new Set(),
    ...overrides,
  };
}

describe('inverseFrequencyWeight', () => {
  it('weights rare sources higher than common ones', () => {
    const rare = inverseFrequencyWeight(0, 1000);
    const common = inverseFrequencyWeight(500, 1000);
    expect(rare).toBeGreaterThan(common);
  });

  it('caps the weight', () => {
    expect(inverseFrequencyWeight(0, 10_000_000, 4)).toBe(4);
  });
});

describe('composeEdition', () => {
  it('requires two distinct recommenders in groups of 6+ active members', () => {
    const out = composeEdition(
      [link('a', 'one.com', [rec('u1', 1)]), link('b', 'two.com', [rec('u1', 1), rec('u2', 2)])],
      ctx({ activeMembers: 10, seenSources: new Set(['one.com', 'two.com']) })
    );
    expect(out.map((e) => e.linkId)).toEqual(['b']);
  });

  it('accepts single recommendations in small groups', () => {
    const out = composeEdition(
      [link('a', 'one.com', [rec('u1', 1)])],
      ctx({ activeMembers: 4, seenSources: new Set(['one.com']) })
    );
    expect(out.map((e) => e.linkId)).toEqual(['a']);
  });

  it('counts distinct members, not repeat shares', () => {
    const out = composeEdition(
      [link('a', 'one.com', [rec('u1', 1), rec('u1', 2), rec('u1', 3)])],
      ctx({ activeMembers: 10, seenSources: new Set(['one.com']) })
    );
    expect(out).toHaveLength(0);
  });

  it('enforces the per-source cap', () => {
    const seen = new Set(['big.com', 'other.com']);
    const out = composeEdition(
      [
        link('a', 'big.com', [rec('u1', 1), rec('u2', 1), rec('u3', 1)]),
        link('b', 'big.com', [rec('u1', 2), rec('u2', 2)]),
        link('c', 'other.com', [rec('u4', 1), rec('u5', 1)]),
      ],
      ctx({ seenSources: seen })
    );
    expect(out.filter((e) => e.source === 'big.com')).toHaveLength(1);
    expect(out.map((e) => e.linkId)).toContain('c');
  });

  it('reserves a slot for the new pool even when popular links would fill K', () => {
    const seen = new Set(['a.com', 'b.com', 'c.com']);
    const popular = ['a.com', 'b.com', 'c.com'].map((s, i) =>
      link(`pop${i}`, s, [rec('u1', 1), rec('u2', 1), rec('u3', 1), rec('u4', 1)])
    );
    const newcomer = link('new1', 'tiny.blog', [rec('u5', 1), rec('u6', 1)]);
    const out = composeEdition(
      [...popular, newcomer],
      ctx({
        editionSize: 3,
        seenSources: seen,
        sourceCounts: new Map([
          ['a.com', 300],
          ['b.com', 300],
          ['c.com', 300],
          ['tiny.blog', 0],
        ]),
        smallSourceThreshold: 2,
      })
    );
    expect(out).toHaveLength(3);
    expect(out.map((e) => e.linkId)).toContain('new1');
    expect(out.find((e) => e.linkId === 'new1')!.label).toBe('first_time');
  });

  it('boosts rare sources in the score', () => {
    const seen = new Set(['common.com', 'rare.blog']);
    const out = composeEdition(
      [
        link('common', 'common.com', [rec('u1', 1), rec('u2', 1)]),
        link('rare', 'rare.blog', [rec('u3', 1), rec('u4', 1)]),
      ],
      ctx({
        seenSources: seen,
        sourceCounts: new Map([
          ['common.com', 400],
          ['rare.blog', 10],
        ]),
        smallSourceThreshold: 1, // rare.blog is NOT small-source here
      })
    );
    const rare = out.find((e) => e.linkId === 'rare')!;
    const common = out.find((e) => e.linkId === 'common')!;
    expect(rare.score).toBeGreaterThan(common.score);
    expect(rare.position).toBeLessThan(common.position);
  });

  it('gives every surfaced link exactly one label, with hot for the top by p', () => {
    const seen = new Set(['a.com', 'b.com', 'c.com']);
    const out = composeEdition(
      [
        link('top', 'a.com', [rec('u1', 1), rec('u2', 1), rec('u3', 1), rec('u4', 1)]),
        link('riser', 'b.com', [rec('u5', 6), rec('u6', 6)]), // all in last third
        link('steady', 'c.com', [rec('u7', 1), rec('u8', 2)]),
      ],
      ctx({ seenSources: seen, smallSourceThreshold: -1 })
    );
    const labels = Object.fromEntries(out.map((e) => [e.linkId, e.label]));
    expect(labels.top).toBe('hot');
    expect(labels.riser).toBe('rising');
    expect(labels.steady).toBe('hot');
    expect(out.every((e) => ['hot', 'first_time', 'small_source', 'rising'].includes(e.label))).toBe(true);
  });

  it('collects notes and attribution names from distinct recommenders', () => {
    const out = composeEdition(
      [
        link('a', 'one.com', [
          rec('u1', 1, 'Loved this.', true),
          rec('u2', 2, 'Me too.', false),
        ]),
      ],
      ctx({ activeMembers: 5, seenSources: new Set(['one.com']) })
    );
    expect(out[0].notes).toEqual(['Loved this.', 'Me too.']);
    expect(out[0].attributionNames).toEqual(['Reader u1']);
    expect(out[0].recommenderNames).toEqual(['Reader u1', 'Reader u2']);
  });

  it('down-weights concentrated accounts in the score but not the evidence', () => {
    const seen = new Set(['one.com', 'two.com']);
    const out = composeEdition(
      [
        link('a', 'one.com', [rec('u1', 1), rec('spammy', 1)]),
        link('b', 'two.com', [rec('u2', 1), rec('u3', 1)]),
      ],
      ctx({ seenSources: seen, userWeights: new Map([['spammy', 0.5]]) })
    );
    const a = out.find((e) => e.linkId === 'a')!;
    const b = out.find((e) => e.linkId === 'b')!;
    expect(a).toBeDefined(); // still eligible: two distinct humans
    expect(a.score).toBeLessThan(b.score);
  });

  it('ignores recommendations outside the window', () => {
    const out = composeEdition(
      [link('a', 'one.com', [rec('u1', -3), rec('u2', -2)])],
      ctx({ seenSources: new Set(['one.com']) })
    );
    expect(out).toHaveLength(0);
  });
});

describe('completedPeriodFor', () => {
  it('returns the previous full week for weekly (Mon–Mon UTC)', () => {
    const { start, end } = completedPeriodFor('weekly', new Date('2026-11-06T10:00:00Z')); // a Friday
    expect(start.toISOString()).toBe('2026-10-26T00:00:00.000Z'); // prior Monday
    expect(end.toISOString()).toBe('2026-11-02T00:00:00.000Z'); // this week's Monday
  });

  it('returns yesterday for daily', () => {
    const { start, end } = completedPeriodFor('daily', new Date('2026-11-06T10:00:00Z'));
    expect(start.toISOString()).toBe('2026-11-05T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-06T00:00:00.000Z');
  });

  it('returns a 14-day window for biweekly', () => {
    const { start, end } = completedPeriodFor('biweekly', new Date('2026-11-06T10:00:00Z'));
    expect(end.getTime() - start.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
    expect(end.getTime()).toBeLessThanOrEqual(Date.UTC(2026, 10, 2));
  });
});
