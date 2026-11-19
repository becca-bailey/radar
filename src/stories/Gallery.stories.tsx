import type { Meta, StoryObj } from '@storybook/react-vite';
import { THEMES } from '@/lib/theme';
import { title } from './title';

/**
 * One screen in every theme, light and dark, side by side, at phone width:
 * for demos and for spotting a theme that drifts. Each frame is the
 * screen's own story loaded with its theme and mode set, so it renders
 * exactly as it does on its own. ("System" is always one of these two.)
 */
const SCREENS = {
  Home: 'screens--home',
  'Home, empty archive': 'screens--home-empty',
  'Reader view': 'screens--reader',
  'Group page': 'screens--group',
  Settings: 'screens--settings',
} as const;

type Args = { screen: keyof typeof SCREENS };

const meta: Meta<Args> = {
  title: 'Gallery',
  parameters: { layout: 'padded', a11y: { test: 'off' } },
  argTypes: { screen: { control: 'select', options: Object.keys(SCREENS) } },
  args: { screen: 'Home' },
};

export default meta;

export const AllThemes: StoryObj<Args> = {
  name: 'All themes',
  render: ({ screen }) => (
    <div className="flex flex-wrap gap-6">
      {THEMES.flatMap((theme) =>
        (['light', 'dark'] as const).map((mode) => {
          const src = `iframe.html?viewMode=story&id=${SCREENS[screen]}&globals=theme:${theme};mode:${mode}`;
          const label = `${title(theme)}, ${mode}`;
          return (
            <figure key={`${theme}-${mode}`} className="m-0 grid gap-2">
              <figcaption className="text-sm font-semibold">{label}</figcaption>
              <iframe
                title={`${screen}: ${label}`}
                src={src}
                loading="lazy"
                className="h-[760px] w-[390px] max-w-full rounded-lg border-2 border-border shadow-hard"
              />
            </figure>
          );
        })
      )}
    </div>
  ),
};
