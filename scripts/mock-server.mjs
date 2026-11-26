// Local stand-in for the Apps Script web app, running the real apps-script/Code.gs
// against in-memory Sheets/Drive. Usage: node scripts/mock-server.mjs [port]
//   then: VITE_API_URL=http://localhost:8787 npm run dev
import { createServer } from 'node:http';
import { createBackend } from '../tests/gas/mock.mjs';

const be = createBackend({ openaiReply: 'זו תשובה מהשרת המדומה. בשרת האמיתי כאן תופיע תשובת OpenAI.' });
be.properties.set('OPENAI_API_KEY', 'sk-mock');
const port = Number(process.argv[2]) || 8787;
createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // test helper: emails the backend would have sent (password reset codes)
  if (req.method === 'GET' && req.url === '/__mails') return res.end(JSON.stringify(be.mails));
  if (req.method !== 'POST') return res.end(JSON.stringify({ ok: true }));
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    let out;
    try { out = be.post(JSON.parse(body || '{}')); } catch (e) { out = { error: String(e.message) }; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(out));
  });
}).listen(port, () => console.log(`mock backend on http://localhost:${port}`));
