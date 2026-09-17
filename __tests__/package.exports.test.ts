/**
 * Packaging checks against package.json and the BUILT dist (run `npm run build` first).
 * @jest-environment node
 */
import { execFileSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const dist = (f: string) => join(root, 'dist', f);
const hasDist = existsSync(dist('index.js'));
const itDist = hasDist ? it : it.skip;

const node = (args: string[]) =>
  execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8' }).trim();

describe('package.json', () => {
  it('is v2.0.0 with react as an optional peer and no runtime dependencies', () => {
    expect(pkg.version).toBe('2.0.0');
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies?.react).toBeDefined();
    expect(pkg.peerDependenciesMeta?.react?.optional).toBe(true);
    expect(pkg.sideEffects).toBe(false);
  });

  it('exports map: ".", "./react"; every condition lists "types" first', () => {
    expect(Object.keys(pkg.exports)).toEqual(['.', './react', './package.json']);
    for (const sub of ['.', './react']) {
      const entry = pkg.exports[sub];
      expect(Object.keys(entry)).toEqual(['import', 'require']);
      for (const cond of ['import', 'require']) {
        expect(Object.keys(entry[cond])[0]).toBe('types');
        expect(Object.keys(entry[cond])).toEqual(['types', 'default']);
      }
    }
    expect(pkg.exports['.'].import.default).toBe('./dist/index.js');
    expect(pkg.exports['.'].require.default).toBe('./dist/index.cjs');
    expect(pkg.exports['./react'].import.default).toBe('./dist/react.js');
    expect(pkg.exports['./react'].require.default).toBe('./dist/react.cjs');
  });

  it('files ships only dist entry files (no src, tests, wasm, sourcemaps)', () => {
    for (const f of pkg.files as string[]) {
      expect(f).toMatch(/^dist\/(index|react)\.(js|cjs|d\.ts|d\.cts)$/);
    }
  });
});

describe('built dist', () => {
  if (!hasDist) it.todo('dist/ missing: run `npm run build` to enable dist checks');

  itDist('every file referenced by package.json exists', () => {
    const targets = [pkg.main, pkg.module, pkg.types, ...(pkg.files as string[])];
    for (const sub of ['.', './react'])
      for (const cond of ['import', 'require'])
        targets.push(pkg.exports[sub][cond].types, pkg.exports[sub][cond].default);
    for (const t of targets) expect(existsSync(join(root, t))).toBe(true);
  });

  itDist('core outputs contain no reference to react', () => {
    for (const f of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts'])
      expect(readFileSync(dist(f), 'utf8')).not.toMatch(/react/i);
  });

  itDist('react outputs import only react at runtime (not cozyevent) and no sourcemap comments', () => {
    const esm = readFileSync(dist('react.js'), 'utf8');
    const cjs = readFileSync(dist('react.cjs'), 'utf8');
    expect(esm.match(/from\s*"([^"]+)"/g)).toEqual(['from"react"']);
    expect(cjs.match(/require\("([^"]+)"\)/g)).toEqual(['require("react")']);
    for (const f of ['index.js', 'index.cjs', 'react.js', 'react.cjs'])
      expect(readFileSync(dist(f), 'utf8')).not.toContain('sourceMappingURL');
  });

  itDist('require() of the CJS builds works', () => {
    const out = node([
      '-e',
      `const m=require(${JSON.stringify(dist('index.cjs'))});` +
        `const e=new m.CozyEvent();let n=0;e.on('constructor',()=>n++)();e.once('toString',()=>n++);e.emit('toString');e.emit('toString');` +
        `console.log(JSON.stringify([Object.keys(m),n,m.CozyEvent.name]))`,
    ]);
    expect(JSON.parse(out)).toEqual([['CozyEvent'], 1, 'CozyEvent']);
  });

  itDist('import() of the ESM builds works', () => {
    const out = node([
      '--input-type=module',
      '-e',
      `const m=await import(${JSON.stringify('file://' + dist('index.js'))});` +
        `class S extends m.CozyEvent{};const s=new S();let n=0;s.on('__proto__',p=>n+=p);s.emit('__proto__',2);` +
        `console.log(JSON.stringify([Object.keys(m),n,s instanceof m.CozyEvent]))`,
    ]);
    expect(JSON.parse(out)).toEqual([['CozyEvent'], 2, true]);
  });

  itDist('react.d.ts / react.d.cts reference the matching core declaration file', () => {
    expect(readFileSync(dist('react.d.ts'), 'utf8')).toContain("from './index.js'");
    expect(readFileSync(dist('react.d.cts'), 'utf8')).toContain("from './index.cjs'");
  });
});
