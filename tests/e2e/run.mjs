// End-to-end suite runner: builds the app against the mock backend, starts both servers, runs the tests, stops them.
// Usage: npm run e2e   (skip the build with E2E_NO_BUILD=1)
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const API_PORT = 8787, WEB_PORT = 4173;
const sh = (cmd, args, env = {}) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

if (!process.env.E2E_NO_BUILD) {
  const r = sh('npx', ['vite', 'build', '--outDir', 'dist-e2e', '--emptyOutDir'], { VITE_API_URL: `http://localhost:${API_PORT}` });
  if (r.status) process.exit(r.status);
}
let mock, web;
const start = async () => {
  mock = spawn('node', ['scripts/mock-server.mjs', String(API_PORT)], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60; i++) { if (await fetch(`http://localhost:${API_PORT}/`).then(() => true, () => false)) return; await new Promise((r) => setTimeout(r, 250)); }
  throw new Error('mock server did not start');
};
const stop = () => { mock?.kill(); web?.kill(); };
process.on('exit', stop);
web = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(WEB_PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
for (let i = 0; i < 60; i++) { if (await fetch(`http://localhost:${WEB_PORT}/`).then(() => true, () => false)) break; await new Promise((r) => setTimeout(r, 500)); }
// Each spec file gets a fresh in-memory backend, so nothing leaks between them (and "first user" is really first).
// `--trace off` is accepted for parity with Playwright runners; this suite never records traces.
let failed = 0;
for (const file of ['newuser.e2e.mjs', 'app.e2e.mjs']) {
  await start();
  const res = sh('node', ['--test', '--test-concurrency=1', `tests/e2e/${file}`], {
    E2E_BASE: `http://localhost:${WEB_PORT}`, E2E_API: `http://localhost:${API_PORT}`,
    NODE_PATH: [process.env.NODE_PATH, '/opt/node-tools/node_modules'].filter(Boolean).join(':'),
  });
  failed += res.status ? 1 : 0;
  mock.kill(); await new Promise((r) => setTimeout(r, 500));
}
stop();
process.exit(failed ? 1 : 0);
