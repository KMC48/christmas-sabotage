// アプリ同梱用に game/ から必要なファイルだけを www/ へコピーする（tests・tools・*.md は除外）
import { cpSync, rmSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'game');
const out = join(root, 'www');
const SKIP_DIRS = new Set(['tests', 'tools']);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(src, out, {
  recursive: true,
  filter: (p) => {
    const rel = relative(src, p);
    if (!rel) return true;
    if (SKIP_DIRS.has(rel.split(/[\\/]/)[0])) return false;
    if (statSync(p).isFile() && (extname(p) === '.md' || /_orig\.png$/.test(p))) return false;
    return true;
  },
});

let n = 0, bytes = 0;
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f), s = statSync(p);
    if (s.isDirectory()) walk(p); else { n++; bytes += s.size; }
  }
})(out);
console.log(`www/: ${n} files, ${(bytes / 1048576).toFixed(1)} MB`);
