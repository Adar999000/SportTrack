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
const procs = [
  spawn('node', ['scripts/mock-server.mjs', String(API_PORT)], { cwd: root, stdio: 'ignore' }),
  spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(WEB_PORT), '--strictPort'], { cwd: root, stdio: 'ignore' }),
];
const stop = () => procs.forEach((p) => p.kill());
process.on('exit', stop);
for (const url of [`http://localhost:${API_PORT}/`, `http://localhost:${WEB_PORT}/`]) {
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) { ok = await fetch(url).then(() => true, () => false); if (!ok) await new Promise((r) => setTimeout(r, 500)); }
  if (!ok) { console.error('server did not start:', url); stop(); process.exit(1); }
}
// `--trace off` is accepted for parity with Playwright runners; this suite never records traces.
const res = sh('node', ['--test', '--test-concurrency=1', 'tests/e2e/app.e2e.mjs'], {
  E2E_BASE: `http://localhost:${WEB_PORT}`, E2E_API: `http://localhost:${API_PORT}`,
  NODE_PATH: [process.env.NODE_PATH, '/opt/node-tools/node_modules'].filter(Boolean).join(':'),
});
stop();
process.exit(res.status ?? 1);
