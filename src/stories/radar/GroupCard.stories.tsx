import type { Meta } from '@storybook/react-vite';
import { astroStory } from '../astro/AstroStory';

/** Links shared to a group (PoolCard.astro), prerendered; see src/stories/astro/renders.ts. */
const meta = {
  title: 'Radar/Group card',
  decorators: [(Story) => <div className="mx-auto max-w-[628px]">{Story()}</div>],
} satisfies Meta;

export default meta;

export const Shared = astroStory('group-card/shared');
/** The owner sees Remove on each link. */
export const AsOwner = astroStory('group-card/owner');
export const MemberWork = astroStory('group-card/member-work');
