// Bundle-size comparison: `node benchmark/size.js`
//
// For every library, bundles the same tiny consumer entry (import the emitter, instantiate, call
// on / emit / off) with rollup + @rollup/plugin-node-resolve + @rollup/plugin-commonjs +
// @rollup/plugin-terser, ESM output, then reports minified, gzip (zlib level 9) and brotli
// (Node default, quality 11) bytes. The entry's own code is identical for every library, so the
// differences are the library (plus any CJS interop helper rollup must add for CJS-only packages).
// Also reports cozyevent/react (react kept external) and the shipped dist files as-is.
// Writes benchmark/reports/size.md and benchmark/reports/size.json.
//
// Each bundle runs in its own child process with a timeout, so one unreadable package cannot hang
// the whole report. SIZE_TOOLS_DIR=<dir> loads rollup and the plugins from <dir> instead of this
// repo (only needed when the local node_modules is broken; it does not change what is measured).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const use = (imp, make) => `${imp}
const e = ${make};
const f = (p) => console.log(p);
e.on('a', f);
e.emit('a', 1);
e.off('a', f);
`;

export const entries = {
  'cozyevent v2': use(`import { CozyEvent } from '../dist/index.js';`, 'new CozyEvent()'),
  'cozyevent v1.4.2 (core class only)': use(`import { CozyEvent } from './baseline/cozyevent-v1.js';`, 'new CozyEvent()'),
  tseep: use(`import { EventEmitter } from 'tseep';`, 'new EventEmitter()'),
  eventemitter3: use(`import EventEmitter from 'eventemitter3';`, 'new EventEmitter()'),
  eventemitter2: use(`import EventEmitter2 from 'eventemitter2';`, 'new EventEmitter2()'),
  emitix: use(`import { EventEmitter } from 'emitix';`, 'new EventEmitter()'),
  '@braintree/event-emitter': use(`import EventEmitter from '@braintree/event-emitter';`, 'new EventEmitter()'),
  '@protobufjs/eventemitter': use(`import EventEmitter from '@protobufjs/eventemitter';`, 'new EventEmitter()'),
  'event-emitter': use(`import ee from 'event-emitter';`, 'ee()'),
  mitt: use(`import mitt from 'mitt';`, 'mitt()'),
  nanoevents: `import { createNanoEvents } from 'nanoevents';\nconst e = createNanoEvents();\nconst u = e.on('a', (p) => console.log(p));\ne.emit('a', 1);\nu();\n`,
  'cozyevent/react (react external)': `import { useCozyEvent } from '../dist/react.js';\nconsole.log(useCozyEvent);\n`,
};
const optional = new Set(['mitt', 'nanoevents']);

const measure = (buf) => ({
  min: buf.length,
  gzip: gzipSync(buf, { level: 9 }).length,
  brotli: brotliCompressSync(buf).length,
});

async function bundleOne(name) {
  const req = createRequire(process.env.SIZE_TOOLS_DIR ? join(process.env.SIZE_TOOLS_DIR, 'x.js') : import.meta.url);
  const { rollup } = req('rollup');
  const resolve = req('@rollup/plugin-node-resolve');
  const commonjs = req('@rollup/plugin-commonjs');
  const terser = req('@rollup/plugin-terser');
  // eventemitter3's "import" condition points at index.mjs, a 3-line ESM re-export of the CJS
  // index.js. We bundle index.js directly (same library code, and it avoids index.mjs being unreadable in iCloud-evicted checkouts).
  const libReq = createRequire(import.meta.url);
  const entryId = join(here, '__size_entry__.js'); // virtual file; imports resolve from benchmark/
  const bundle = await rollup({
    input: entryId,
    external: ['react', /^react\//],
    onwarn: () => {},
    plugins: [
      {
        name: 'entry',
        resolveId: (id) => (id === entryId ? id : id === 'eventemitter3' ? libReq.resolve('eventemitter3') : null),
        load: (id) => (id === entryId ? entries[name] : null),
      },
      (resolve.default ?? resolve)({ browser: true, preferBuiltins: false }),
      (commonjs.default ?? commonjs)(),
    ],
  });
  const { output } = await bundle.generate({
    format: 'es',
    plugins: [(terser.default ?? terser)({ compress: { passes: 2 }, format: { comments: false } })],
  });
  return Buffer.from(output[0].code);
}

const oneArg = process.argv.find((a) => a.startsWith('--one='));
if (oneArg) {
  const name = oneArg.slice(6);
  bundleOne(name).then(
    (buf) => process.stdout.write(JSON.stringify({ name, ...measure(buf) })),
    (e) => process.stdout.write(JSON.stringify({ name, error: String(e.message).split('\n')[0] })),
  );
} else {
  const rows = [];
  const req = createRequire(import.meta.url);
  for (const name of Object.keys(entries)) {
    if (optional.has(name)) {
      try {
        req.resolve(name);
      } catch {
        continue; // not installed; not measured (by rule, nothing is installed for benchmarks)
      }
    }
    const p = spawnSync(process.execPath, ['--preserve-symlinks', fileURLToPath(import.meta.url), `--one=${name}`], {
      encoding: 'utf8',
      timeout: 90_000,
    });
    let r;
    try {
      r = JSON.parse(p.stdout);
    } catch {
      r = { name, error: p.error?.code === 'ETIMEDOUT' ? 'timed out (unreadable files in node_modules?)' : (p.stderr || 'no output').split('\n')[0] };
    }
    console.error(name, r.error ?? `${r.min} / ${r.gzip} / ${r.brotli}`);
    rows.push(r);
  }
  const lib = rows.filter((r) => !r.error && !r.name.startsWith('cozyevent/react')).sort((a, b) => a.gzip - b.gzip);
  const react = rows.filter((r) => r.name.startsWith('cozyevent/react'));
  const failed = rows.filter((r) => r.error);

  const dist = ['dist/index.js', 'dist/index.cjs', 'dist/react.js', 'dist/react.cjs']
    .filter((f) => existsSync(join(root, f)))
    .map((f) => ({ name: f, ...measure(readFileSync(join(root, f))) }));

  const best = lib[0]?.gzip;
  let md = `# Bundle size\n\nNode ${process.version}. Consumer entry per library (instantiate, on, emit, off), bundled with rollup ${req('rollup').VERSION} + node-resolve (browser field) + commonjs + terser (compress.passes 2), ESM output. gzip = zlib level 9, brotli = Node default (quality 11). Bytes; smaller is better. The consumer entry itself (shipped dist/index.js alone is ${dist.find((d) => d.name === 'dist/index.js')?.gzip ?? '?'} gzip bytes) is included in every row; CJS-only packages also carry rollup's interop helper. Feature sets differ: nanoevents, mitt, @braintree/event-emitter and @protobufjs/eventemitter have no once and no emitAsync, and of those only nanoevents returns an unsubscribe function from on. mitt and nanoevents are optional (not in devDependencies) and are skipped when not installed.\n\n`;
  md += `| # | library | min | gzip | brotli | gzip vs smallest |\n|---|---|--:|--:|--:|--:|\n`;
  lib.forEach((r, i) => (md += `| ${i + 1} | ${r.name} | ${r.min} | ${r.gzip} | ${r.brotli} | ${(r.gzip / best).toFixed(2)}x |\n`));
  for (const r of react) md += `\n${r.name}: ${r.min} min / ${r.gzip} gzip / ${r.brotli} brotli (hook + entry, excluding React itself).\n`;
  if (failed.length) md += `\nNot measured: ${failed.map((r) => `${r.name} (${r.error})`).join('; ')}.\n`;
  md += `\n## Shipped dist files (already minified, as published)\n\n| file | min | gzip | brotli |\n|---|--:|--:|--:|\n`;
  for (const d of dist) md += `| ${d.name} | ${d.min} | ${d.gzip} | ${d.brotli} |\n`;
  md += `\nnode:events is not listed: it is a Node built-in and needs a separate polyfill package in browsers.\n`;

  mkdirSync(join(here, 'reports'), { recursive: true });
  writeFileSync(join(here, 'reports/size.md'), md);
  writeFileSync(join(here, 'reports/size.json'), JSON.stringify({ node: process.version, rows, dist }, null, 2));
  console.log(md);
}
