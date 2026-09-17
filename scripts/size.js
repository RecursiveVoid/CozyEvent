// Prints raw / gzip-9 / brotli (Node default, quality 11) bytes of the shipped JS files.
// dist is already minified by the build, so "min" == raw.
import { readFileSync } from 'node:fs';
import { gzipSync, brotliCompressSync } from 'node:zlib';

const files = ['dist/index.js', 'dist/index.cjs', 'dist/react.js', 'dist/react.cjs'];
const rows = files.map((f) => {
  const b = readFileSync(new URL('../' + f, import.meta.url));
  return {
    file: f,
    'min (raw)': b.length,
    gzip: gzipSync(b, { level: 9 }).length,
    brotli: brotliCompressSync(b).length,
  };
});
console.table(rows);
