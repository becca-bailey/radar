import type { Meta } from '@storybook/react-vite';
import { astroStory } from '../astro/AstroStory';

/** The line shown for an empty list (Empty.astro). A whole empty home page is under Screens. */
const meta = {
  title: 'Radar/Empty state',
  decorators: [(Story) => <div className="mx-auto max-w-[628px]">{Story()}</div>],
} satisfies Meta;

export default meta;

export const Archive = astroStory('empty/archive');
export const Topic = astroStory('empty/topic');
