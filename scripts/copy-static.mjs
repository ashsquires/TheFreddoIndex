import { cp } from 'node:fs/promises';

// Keep root-based GitHub Pages and Vite's dist output equivalent.
for (const name of ['assets', 'data', 'robots.txt', 'sitemap.xml', 'CNAME', 'comments-config.json']) {
  await cp(new URL(`../${name}`, import.meta.url), new URL(`../dist/${name}`, import.meta.url), { recursive: true });
}
