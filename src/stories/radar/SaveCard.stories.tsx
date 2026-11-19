import type { Meta } from '@storybook/react-vite';
import { astroStory } from '../astro/AstroStory';

/**
 * One save in the archive list (SaveCard.astro), prerendered; see
 * src/stories/astro/renders.ts. The ⋯ menu is server HTML here; it's live
 * under Radar/Menus and panels.
 */
const meta = {
  title: 'Radar/Save card',
  decorators: [(Story) => <div className="mx-auto max-w-[628px]">{Story()}</div>],
} satisfies Meta;

export default meta;

export const Plain = astroStory('save-card/plain');
export const WithNote = astroStory('save-card/with-note');
export const SharedToGroups = astroStory('save-card/shared');
export const Archiving = astroStory('save-card/archiving');
export const CouldNotArchive = astroStory('save-card/failed');
export const SiteBlocksArchiving = astroStory('save-card/blocked');
export const MadeByYou = astroStory('save-card/own-work');
/** "From a year ago" on the home page shows one of these. */
export const YearOld = astroStory('save-card/year-old', { name: 'Year-old save' });
export const List = astroStory('save-card/list');
