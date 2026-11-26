// Local stand-in for the Apps Script web app, running the real apps-script/server.js
// against in-memory Sheets/Drive. Usage: node scripts/mock-server.mjs [port]
//   then: VITE_API_URL=http://localhost:8787 npm run dev
import { createServer } from 'node:http';
import { createBackend } from '../tests/gas/mock.mjs';

// Simulated OpenAI: "תסמן" asks for an action; "פנייה" contacts the admin; anything else gets a canned reply.
const today = () => new Date().toISOString().slice(0, 10);
const be = createBackend({
  openaiReply: (p) => {
    const last = [...p.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
    if (p.tools && /תסמן|mark/i.test(last)) {
      return { content: '', tool_calls: [{ id: 't1', type: 'function', function: { name: 'mark_meal', arguments: JSON.stringify({ date: today(), meal: 'lunch', mark: 'V' }) } }] };
    }
    if (p.tools && /פנייה למנהל|admin/i.test(last)) {
      return { content: '', tool_calls: [{ id: 't2', type: 'function', function: { name: 'contact_admin', arguments: JSON.stringify({ subject: 'מהעוזר', message: last }) } }] };
    }
    if (p.messages.some((m) => m.role === 'tool')) return { content: 'בוצע.' };
    return { content: 'זו תשובה מהשרת המדומה. בשרת האמיתי כאן תופיע תשובת OpenAI.' };
  },
});
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
