/**
 * Sample content for Storybook. Made up, never real user data. Dates are
 * relative to when Storybook was rendered, so "2 days ago" and the
 * year-old save stay true.
 */
import type { SaveRow } from '@/components/SaveCard.astro';

const DAY = 24 * 60 * 60 * 1000;
export const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

export const TIME_ZONE = 'America/New_York';

export const USER_ID = '00000000-0000-4000-8000-000000000001';

export const GROUPS = [
  { id: '00000000-0000-4000-8000-0000000000a1', name: 'Book club' },
  { id: '00000000-0000-4000-8000-0000000000a2', name: 'Design friends' },
];

function save(n: number, row: Partial<SaveRow> & { links: SaveRow['links'] }): SaveRow {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    original_url: row.links?.canonical_url ?? 'https://example.com/',
    note: null,
    created_at: daysAgo(n),
    own_work: false,
    shares: [],
    ...row,
  };
}

export const SAVES = {
  plain: save(1, {
    links: {
      title: 'How tidepools survive the tide going out',
      source: 'Field Notes',
      canonical_url: 'https://example.com/tidepools',
      status: 'archived',
    },
  }),
  withNote: save(2, {
    note: 'The bit about anemones closing up is lovely.',
    links: {
      title: 'A year of drawing the same tree',
      source: 'The Slow Review',
      canonical_url: 'https://example.com/same-tree',
      status: 'archived',
    },
  }),
  shared: save(3, {
    note: 'For Thursday.',
    shares: [
      { group_id: GROUPS[0].id, removed_at: null, picked_at: daysAgo(1) },
      { group_id: GROUPS[1].id, removed_at: daysAgo(1) },
    ],
    links: {
      title: 'Why paper maps still win on a hike',
      source: 'Trail Letters',
      canonical_url: 'https://example.com/paper-maps',
      status: 'archived',
    },
  }),
  pending: save(4, {
    created_at: new Date().toISOString(),
    links: { title: null, source: null, canonical_url: 'https://example.com/new-post', status: 'pending' },
  }),
  failed: save(5, {
    links: {
      title: 'Notes on bread hydration',
      source: 'Crumb',
      canonical_url: 'https://example.com/bread',
      status: 'failed',
    },
  }),
  blocked: save(6, {
    links: {
      title: 'Behind a bot wall',
      source: 'Walled Garden',
      canonical_url: 'https://example.com/walled',
      status: 'failed',
      fetch_blocked: 'challenge',
    },
  }),
  ownWork: save(7, {
    own_work: true,
    note: 'Wrote this one over the weekend.',
    links: {
      title: 'My notes on learning to letterpress',
      source: 'becca.example',
      canonical_url: 'https://example.com/letterpress',
      status: 'archived',
    },
  }),
  yearOld: save(370, {
    note: 'Still think about this.',
    links: {
      title: 'The case for walking slower',
      source: 'Long Reads',
      canonical_url: 'https://example.com/walking',
      status: 'archived',
    },
  }),
} satisfies Record<string, SaveRow>;
