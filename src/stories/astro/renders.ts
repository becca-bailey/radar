/**
 * The .astro components and pages Storybook shows. Storybook can't run
 * .astro files (there's no Storybook framework for Astro 7), so
 * scripts/storybook/render-astro.ts renders each entry here to HTML with
 * Astro's Container API, once per theme, and stories show that HTML through
 * astroStory('<id>').
 *
 * React islands inside these render to their server HTML only: they show,
 * but don't respond to clicks. Their own .tsx stories are interactive.
 */
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import Empty from '@/components/Empty.astro';
import Home from '@/pages/index.astro';
import Reader from '@/pages/saves/[id].astro';
import GroupPage from '@/pages/groups/[id]/index.astro';
import Settings from '@/pages/settings.astro';
import SaveCards from './SaveCards.astro';
import PoolCards from './PoolCards.astro';
import type { FakeData } from './fakeSupabase';
import { GROUP, GROUP_PAGE_ID, HOME, READER, READER_SAVE_ID, SETTINGS } from './screens';
import { GROUPS, SAVES } from '../fixtures';

export interface AstroRender {
  component: AstroComponentFactory;
  props?: Record<string, unknown>;
  /** Default-slot HTML. */
  slot?: string;
  /** A whole page, rendered signed in with sample data instead of Supabase. */
  page?: { path: string; params?: Record<string, string>; data: FakeData };
}

const groups = GROUPS;
const defaultGroupId = GROUPS[0].id;
const saveCard = (...rows: (typeof SAVES)[keyof typeof SAVES][]) => ({
  component: SaveCards,
  props: { rows, groups, defaultGroupId },
});

export const RENDERS = {
  'save-card/plain': saveCard(SAVES.plain),
  'save-card/with-note': saveCard(SAVES.withNote),
  'save-card/shared': saveCard(SAVES.shared),
  'save-card/archiving': saveCard(SAVES.pending),
  'save-card/failed': saveCard(SAVES.failed),
  'save-card/blocked': saveCard(SAVES.blocked),
  'save-card/own-work': saveCard(SAVES.ownWork),
  'save-card/year-old': saveCard(SAVES.yearOld),
  'save-card/list': saveCard(SAVES.withNote, SAVES.shared, SAVES.plain, SAVES.pending),

  'group-card/shared': { component: PoolCards, props: { which: 'shared', isOwner: false } },
  'group-card/owner': { component: PoolCards, props: { which: 'shared', isOwner: true } },
  'group-card/member-work': { component: PoolCards, props: { which: 'own', isOwner: false } },

  'empty/archive': { component: Empty, slot: 'Links you save to read later show up here.' },
  'empty/topic': { component: Empty, slot: 'Nothing saved under Craft yet.' },

  'screen/home': { component: Home, page: { path: '/', data: HOME } },
  'screen/home-empty': {
    component: Home,
    page: { path: '/', data: { ...HOME, tables: { ...HOME.tables, saves: [] } } },
  },
  'screen/reader': {
    component: Reader,
    page: { path: `/saves/${READER_SAVE_ID}`, params: { id: READER_SAVE_ID }, data: READER },
  },
  'screen/group': {
    component: GroupPage,
    page: { path: `/groups/${GROUP_PAGE_ID}`, params: { id: GROUP_PAGE_ID }, data: GROUP },
  },
  'screen/settings': { component: Settings, page: { path: '/settings', data: SETTINGS } },
} satisfies Record<string, AstroRender>;

export type RenderId = keyof typeof RENDERS;
