import { strFromU8, unzipSync } from 'fflate';
import { extractBlocks } from './extract';
import { parseBlocks, type ParseResult } from './parse';

export function parseDocx(buf: ArrayBuffer | Uint8Array): ParseResult {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let files;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
  } catch {
    throw new Error('הקובץ אינו קובץ Word תקין (.docx)');
  }
  const xml = files['word/document.xml'];
  if (!xml) throw new Error('לא נמצא תוכן מסמך בקובץ');
  return parseBlocks(extractBlocks(strFromU8(xml)));
}

export type { ParseResult, ParsedWeek } from './parse';
