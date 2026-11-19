import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vite';

/**
 * Storybook for building, checking and demoing themes (RAD-82). React
 * components render directly; .astro components are prerendered to HTML by
 * scripts/storybook/render-astro.ts first (see CONTRIBUTING.md).
 */
const config: StorybookConfig = {
  framework: '@storybook/react-vite',
  stories: ['../src/stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  // The page colour comes from the theme's --background, not a picker.
  features: { backgrounds: false },
  core: { disableTelemetry: true },
  async viteFinal(config) {
    return mergeConfig(config, {
      plugins: [tailwindcss()],
      resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    });
  },
};

export default config;
