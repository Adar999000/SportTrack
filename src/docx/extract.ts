/**
 * Turns WordprocessingML (word/document.xml) into a flat list of top-level
 * blocks — paragraphs and tables — in document order. Implemented as a small
 * tag scanner so it runs identically in the browser and in Node tests and
 * stays fast on large (10MB+) documents.
 */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'table'; rows: string[][] };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

const TOKEN =
  /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:(tbl|tr|tc|p)(?=[\s>/])[^>]*?(\/?)>|<\/w:(tbl|tr|tc|p)>|<w:(tab|br|cr)\b[^>]*\/>/g;

export function extractBlocks(xml: string): Block[] {
  // Alternate-content fallbacks duplicate the main content; drop them.
  xml = xml.replace(/<mc:Fallback>[\s\S]*?<\/mc:Fallback>/g, '');
  const bodyStart = xml.indexOf('<w:body');
  if (bodyStart > 0) xml = xml.slice(bodyStart);

  const blocks: Block[] = [];
  let tblDepth = 0;
  let rows: string[][] = [];
  let row: string[] | null = null;
  let cellParas: string[] | null = null;
  let para: string | null = null;
  let pDepth = 0;

  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN.exec(xml))) {
    if (m[1] !== undefined) {
      if (para !== null) para += decode(m[1]);
      continue;
    }
    const open = m[2], selfClose = m[3], close = m[4], inline = m[5];
    if (inline) {
      if (para !== null) para += inline === 'tab' ? '\t' : '\n';
    } else if (open === 'p') {
      if (selfClose) {
        if (tblDepth === 0) continue; // empty paragraph
        cellParas?.push('');
        continue;
      }
      pDepth++;
      if (pDepth === 1) para = '';
    } else if (close === 'p') {
      if (pDepth === 0) continue;
      pDepth--;
      if (pDepth === 0 && para !== null) {
        if (tblDepth === 0) blocks.push({ type: 'p', text: para });
        else if (cellParas) cellParas.push(para);
        para = null;
      }
    } else if (open === 'tbl') {
      tblDepth++;
      if (tblDepth === 1) rows = [];
    } else if (close === 'tbl') {
      tblDepth--;
      if (tblDepth === 0) blocks.push({ type: 'table', rows });
    } else if (tblDepth === 1 && open === 'tr') {
      row = [];
    } else if (tblDepth === 1 && close === 'tr') {
      if (row) rows.push(row);
      row = null;
    } else if (tblDepth === 1 && open === 'tc') {
      cellParas = selfClose ? null : [];
      if (selfClose) row?.push('');
    } else if (tblDepth === 1 && close === 'tc') {
      row?.push((cellParas ?? []).map((s) => s.trim()).filter(Boolean).join('\n'));
      cellParas = null;
    }
    // tokens of nested tables (depth > 1) fall through: their paragraphs
    // still land in the outer cell via cellParas.
  }
  return blocks;
}
