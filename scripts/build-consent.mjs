import { build } from 'esbuild';
await build({ entryPoints: ['src/oauth-consent.js'], bundle: true, format: 'esm', outfile: 'assets/oauth-consent.js', minify: true });

await build({ entryPoints: ['src/monitor.js'], bundle: true, format: 'esm', outfile: 'assets/monitor.js', minify: true });
