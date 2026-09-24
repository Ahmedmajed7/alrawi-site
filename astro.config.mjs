import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://alrawioman.com',
  output: 'static',
  trailingSlash: 'always',
  i18n: {
    defaultLocale: 'ar',
    locales: ['ar', 'en'],
    routing: { prefixDefaultLocale: true, redirectToDefaultLocale: false },
  },
  integrations: [
    sitemap({
      i18n: { defaultLocale: 'ar', locales: { ar: 'ar-OM', en: 'en' } },
      filter: (page) => !page.endsWith('/404/'),
    }),
  ],
  build: { inlineStylesheets: 'auto' },
  vite: {
    build: { chunkSizeWarningLimit: 900 },
  },
});
