/**
 * Sample data behind the full-screen stories: what each page's queries get
 * back from the fake Supabase client (./fakeSupabase.ts). Made up, never
 * real user data.
 */
import type { User } from '@supabase/supabase-js';
import type { FakeData } from './fakeSupabase';
import type { PoolLink } from '@/lib/groupPool';
import { GROUPS, SAVES, USER_ID, daysAgo } from '../fixtures';

export const SAMPLE_USER = {
  id: USER_ID,
  email: 'sam@example.com',
  aud: 'authenticated',
  app_metadata: {},
  user_metadata: {},
  created_at: daysAgo(400),
} as User;

const CATEGORIES = [
  { id: 1, slug: 'nature', name: 'Nature' },
  { id: 2, slug: 'craft', name: 'Craft' },
  { id: 3, slug: 'food', name: 'Food' },
];

const ARTICLE = `
<p>When the tide goes out, a tidepool becomes a small, closed world. For a few hours the water warms, the oxygen drops, and everything living there has to wait.</p>
<p>Anemones fold in on themselves. Snails clamp down. Crabs find the deepest shade they can. None of it is dramatic, and that's the point: the pool survives by doing less.</p>
<h2>A pool is a clock</h2>
<p>Ecologists who study tidepools talk about them as clocks. The higher the pool sits on the shore, the longer it waits between tides, and the tougher its residents have to be.</p>
<ul><li>Low pools: almost always wet, crowded and competitive.</li><li>Middle pools: the most variety.</li><li>High pools: a few hardy specialists.</li></ul>
<p>Next time you're on a rocky beach at low tide, pick one pool and watch it for ten minutes. You'll see more than you expect.</p>
`;

/** Every save the home page might list, with its link and category joined in. */
const ALL_SAVES = Object.values(SAVES).map((s, i) => ({
  ...s,
  links: s.links && {
    ...s.links,
    category_id: CATEGORIES[i % CATEGORIES.length].id,
    full_text: s.links.status === 'archived' ? ARTICLE.replace(/<[^>]+>/g, ' ') : null,
    html_snapshot: s.links.status === 'archived' ? ARTICLE : null,
    archived_at: s.links.status === 'archived' ? s.created_at : null,
  },
}));

const PROFILES = [{ id: USER_ID, last_shared_group_id: GROUPS[0].id, shortcut_ask_note: true, display_name: 'Sam' }];

const LAYOUT_RPC = { my_group_news: () => [{ new_count: 3 }] };

export const HOME: FakeData = {
  tables: { categories: CATEGORIES, saves: ALL_SAVES, groups: GROUPS, profiles: PROFILES },
  rpc: LAYOUT_RPC,
};

export const READER_SAVE_ID = SAVES.withNote.id;
export const READER: FakeData = { tables: { saves: ALL_SAVES }, rpc: LAYOUT_RPC };

export const SETTINGS: FakeData = {
  tables: {
    profiles: PROFILES,
    api_tokens: [
      { id: 't1', label: 'iPhone Shortcut', created_at: daysAgo(90), last_used_at: daysAgo(1) },
      { id: 't2', label: 'Work laptop', created_at: daysAgo(30), last_used_at: null },
    ],
  },
  rpc: LAYOUT_RPC,
};

const GROUP_ID = GROUPS[0].id;
export const GROUP_PAGE_ID = GROUP_ID;

export const POOL: PoolLink[] = [
  {
    link_id: 'l1',
    title: 'Why paper maps still win on a hike',
    canonical_url: 'https://example.com/paper-maps',
    source: 'Trail Letters',
    image: null,
    snippet: '',
    notes: ['For Thursday.', 'The bit on contour lines finally made sense to me.'],
    readers: 2,
    names: ['Sam', 'Ana'],
    picked: true,
    own_work: false,
    saved_by: 5,
    last_shared_at: daysAgo(0.2),
  },
  {
    link_id: 'l2',
    title: 'A year of drawing the same tree',
    canonical_url: 'https://example.com/same-tree',
    source: 'The Slow Review',
    image: null,
    snippet: '',
    notes: ['Gentle and a little sad.'],
    readers: 1,
    names: ['Priya'],
    picked: false,
    own_work: false,
    saved_by: null,
    last_shared_at: daysAgo(3),
  },
  {
    link_id: 'l3',
    title: 'Notes from a first pottery class',
    canonical_url: 'https://example.com/pottery',
    source: 'priya.example',
    image: null,
    snippet: '',
    notes: ['Wrote up last weekend.'],
    readers: 1,
    names: ['Priya'],
    picked: false,
    own_work: true,
    saved_by: null,
    last_shared_at: daysAgo(2),
  },
];

export const GROUP: FakeData = {
  tables: {
    groups: [{ id: GROUP_ID, name: GROUPS[0].name, owner_id: USER_ID }],
    memberships: ['Sam', 'Ana', 'Priya', 'Jo'].map((display_name, i) => ({
      group_id: GROUP_ID,
      user_id: i === 0 ? USER_ID : `member-${i}`,
      display_name,
    })),
    lenses: [{ id: 'lens1', group_id: GROUP_ID, name: 'Outdoors', query: 'hiking', query_embedding: null, created_at: daysAgo(60) }],
    invite_links: [
      {
        id: 'inv1',
        group_id: GROUP_ID,
        token: 'sample-invite-token',
        active: true,
        weekly_cap: 10,
        uses_this_week: 1,
        week_started_at: daysAgo(2),
        paused_at: null,
      },
    ],
  },
  rpc: {
    ...LAYOUT_RPC,
    mark_group_visited: () => daysAgo(1),
    group_removed_link_count: () => 1,
    group_pool: (args) => {
      if (args.shared_before) return [];
      if (args.member_work === true) return POOL.filter((l) => l.own_work);
      if (args.member_work === false) return POOL.filter((l) => !l.own_work);
      if (args.query) return POOL.slice(0, 1);
      return POOL;
    },
  },
};
