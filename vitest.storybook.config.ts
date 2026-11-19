/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

// Prerenders .astro components for Storybook (scripts/storybook/render-astro.ts).
// Kept apart from vitest.config.ts so `npm test` never runs it.
export default getViteConfig({
  test: {
    include: ['scripts/storybook/render-astro.ts'],
  },
});
