import { build } from 'esbuild';
await build({ entryPoints: ['src/oauth-consent.js'], bundle: true, format: 'esm', outfile: 'assets/oauth-consent.js', minify: true });
