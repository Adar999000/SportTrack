// Packs the "artifact" build into one self-contained HTML body (CSS + JS inlined)
// for hosting as a preview page. Usage: npm run build:artifact
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-artifact';
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const css = [...html.matchAll(/<link rel="stylesheet"[^>]*href="\.?\/?([^"]+)"/g)].map((m) => readFileSync(join(dir, m[1]), 'utf8')).join('\n');
const js = [...html.matchAll(/<script type="module"[^>]*src="\.?\/?([^"]+)"/g)].map((m) => readFileSync(join(dir, m[1]), 'utf8')).join('\n');
if (!js) throw new Error('no script found in build');
const out = `<title>משמעת אישית</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${css.replace(/<\/style/gi, '<\\/style')}
</style>
<div id="app"></div>
<script type="module">
${js.replace(/<\/script/gi, '<\\/script')}
</script>
`;
writeFileSync(join(dir, 'mishmaat-ishit.html'), out);
console.log(`wrote ${join(dir, 'mishmaat-ishit.html')} (${(out.length / 1024).toFixed(0)} KB)`);
