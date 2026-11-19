import type { Meta } from '@storybook/react-vite';
import { astroStory } from '../astro/AstroStory';

/**
 * Whole pages, rendered from the real page files with sample data in place
 * of Supabase (src/stories/astro/screens.ts). Themes are easiest to judge
 * here. Menus and other islands are server HTML only.
 */
const meta = {
  title: 'Screens',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;

export const Home = astroStory('screen/home');
export const HomeEmpty = astroStory('screen/home-empty', { name: 'Home, empty archive' });
export const Reader = astroStory('screen/reader', { name: 'Reader view' });
export const Group = astroStory('screen/group', { name: 'Group page' });
export const Settings = astroStory('screen/settings');
