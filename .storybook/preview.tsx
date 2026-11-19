import '../src/styles/global.css';
import type { Decorator, Preview } from '@storybook/react-vite';
import { DEFAULT_MODE, DEFAULT_THEME, MODES, THEMES, THEME_FONTS, resolveMode, resolveTheme } from '../src/lib/theme';
import { title } from '../src/stories/title';

/**
 * Puts the toolbar's theme and mode on <html> the same way Layout.astro
 * does (data-theme, data-mode), so global.css styles stories exactly like
 * the app. "system" leaves light/dark to the OS setting, as in the app.
 * Also links the active theme's fonts, and only those.
 */
const withTheme: Decorator = (Story, context) => {
  const theme = resolveTheme(context.globals.theme);
  const mode = resolveMode(context.globals.mode);
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.dataset.mode = mode;

  let fonts = document.getElementById('theme-fonts') as HTMLLinkElement | null;
  if (!fonts) {
    fonts = document.createElement('link');
    fonts.id = 'theme-fonts';
    fonts.rel = 'stylesheet';
    document.head.append(fonts);
  }
  // Compare the attribute, not .href (normalized), so it's only set on a real change.
  if (fonts.getAttribute('href') !== THEME_FONTS[theme]) fonts.setAttribute('href', THEME_FONTS[theme]);

  return <Story />;
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Theme',
      toolbar: {
        title: 'Theme',
        icon: 'paintbrush',
        items: THEMES.map((t) => ({ value: t, title: title(t) })),
        dynamicTitle: true,
      },
    },
    mode: {
      description: 'Light or dark',
      toolbar: {
        title: 'Mode',
        icon: 'mirror',
        items: MODES.map((m) => ({ value: m, title: title(m) })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: DEFAULT_THEME, mode: DEFAULT_MODE },
  parameters: {
    layout: 'padded',
    controls: { expanded: true },
    a11y: {
      // Report axe violations in the Accessibility panel on every story.
      test: 'todo',
    },
    options: {
      storySort: { order: ['Introduction', 'Tokens', 'Components', 'Radar', 'Screens', 'Gallery'] },
    },
  },
};

export default preview;
