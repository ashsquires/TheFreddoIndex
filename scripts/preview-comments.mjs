// Loopback-only, disposable integration preview. Never deploy this server.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { handleComments } from '../supabase/functions/comments/handler.js';

const db = new PGlite();
await db.exec('create role anon; create role authenticated; create role service_role bypassrls; grant usage on schema public to service_role;');
await db.exec(await readFile(new URL('../supabase/migrations/20260916101352_add_freddo_comments.sql', import.meta.url), 'utf8'));
await db.query("insert into freddo_comments(display_name,body,status) values($1,$2,'approved')", ['Preview reader', 'This is a local preview comment. Submitted comments wait for approval.']);
await db.exec('set role service_role');
const origin = 'http://127.0.0.1:4174';
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, origin);
    if (url.pathname === '/api/comments') {
      const request = new Request(url, { method: req.method, headers: req.headers, ...(req.method === 'POST' ? { body: req, duplex: 'half' } : {}) });
      const response = await handleComments(request, {
        allowedOrigins: [origin], fingerprint: async () => 'a'.repeat(64),
        rpc: async (name, args) => {
          try {
            const result = name === 'freddo_list_comments'
              ? await db.query('select * from freddo_list_comments()')
              : await db.query('select freddo_submit_comment($1,$2,$3)', [args.p_display_name, args.p_body, args.p_fingerprint]);
            return { data: result.rows, error: null };
          } catch (error) { return { data: null, error: { code: error.code } }; }
        },
      });
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    if (url.pathname === '/comments-config.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ endpoint: `${origin}/api/comments` }));
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const filename = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!filename.startsWith(root) || !(await stat(filename)).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(filename));
  } catch { res.writeHead(404); res.end(); }
}).listen(4174, '127.0.0.1', () => console.log(`Disposable comments preview: ${origin}`));
