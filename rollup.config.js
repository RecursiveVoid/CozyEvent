import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import dts from 'rollup-plugin-dts';

const input = { index: 'src/index.ts', react: 'src/react/index.ts' };
const external = ['react', /^react\//];

// Rollup appends "\n" after terser runs. Dropping it saves 1 byte raw and ~2 bytes gzip per file
// (measured). ESM also drops the final ";" after "export{...}" (ASI at end of module; ESM files are
// never concatenated). CJS keeps its final ";" so naive file concatenation stays safe.
const trimTail = {
  name: 'trim-tail',
  generateBundle(o, bundle) {
    for (const f of Object.values(bundle))
      if (f.type === 'chunk') {
        let c = f.code.trimEnd();
        if (o.format === 'es') {
          c = c.replace(/\}\s*;?$/, '}');
          // `class X{...}export{X}` -> `export class X{...}` and `const X=...;export{X}` ->
          // `export const X=...` (measured: -6 gzip bytes on index.js, -8 on react.js).
          const m = /;?export\{(\w+)\}$/.exec(c);
          const decl = m && [`class ${m[1]}{`, `const ${m[1]}=`].find((d) => c.split(d).length === 2);
          if (decl) c = c.slice(0, m.index).replace(decl, 'export ' + decl);
        }
        f.code = c;
      }
  },
};

// TypeScript < 4.5 cannot parse inline `type` modifiers in export lists (`export { A, type B }`).
// Split them into `export { A }; export type { B };` (TS 3.8+). Types only, no runtime bytes.
const splitTypeExports = {
  name: 'split-type-exports',
  generateBundle(o, bundle) {
    for (const f of Object.values(bundle))
      if (f.type === 'chunk')
        f.code = f.code.replace(/^export \{([^}]*)\};$/m, (all, list) => {
          const names = list.split(',').map((s) => s.trim()).filter(Boolean);
          const types = names.filter((n) => n.startsWith('type ')).map((n) => n.slice(5));
          const values = names.filter((n) => !n.startsWith('type '));
          if (!types.length) return all;
          return (values.length ? `export { ${values.join(', ')} };\n` : '') + `export type { ${types.join(', ')} };`;
        });
  },
};

export default [
  {
    input,
    external,
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        include: ['src/**/*.ts'],
        declaration: false,
        declarationMap: false,
        sourceMap: false,
        outDir: undefined,
        noEmitOnError: true,
      }),
      terser({
        module: true,
        ecma: 2020,
        keep_classnames: true,
        // Public export names stay unmangled so trim-tail can inline `export` into the declaration.
        mangle: { reserved: ['CozyEvent', 'useCozyEvent'] },
        compress: { passes: 3, pure_getters: true, unsafe_arrows: false },
        format: { comments: false, wrap_func_args: false },
      }),
      trimTail,
    ],
    output: [
      { dir: 'dist', format: 'es', entryFileNames: '[name].js', sourcemap: false },
      {
        dir: 'dist',
        format: 'cjs',
        entryFileNames: '[name].cjs',
        sourcemap: false,
        exports: 'named',
        esModule: false,
        strict: false,
        // es2015 syntax, but no Symbol.toStringTag defineProperty (symbols: false)
        generatedCode: { arrowFunctions: true, constBindings: true, objectShorthand: true, symbols: false },
      },
    ],
  },
  {
    input,
    external,
    plugins: [
      {
        // react.d.(c)ts must import core types from the sibling core declaration file (not
        // re-inline them). Explicit extension: required under moduleResolution node16/nodenext.
        name: 'core-types-external',
        resolveId: (id, importer) =>
          id === '../index' && importer && /[\\/]react[\\/]/.test(importer)
            ? { id: './index.js', external: 'absolute' }
            : null,
      },
      dts(),
      splitTypeExports,
    ],
    output: [
      // ESM types (package is "type":"module", so .d.ts = ESM) for the "import" condition.
      { dir: 'dist', format: 'es', entryFileNames: '[name].d.ts' },
      // CJS types for the "require" condition. Without them TypeScript (node16/nodenext) sees the
      // .d.ts as ESM and rejects require-style imports with TS1479 ("masquerading as ESM").
      { dir: 'dist', format: 'es', entryFileNames: '[name].d.cts', paths: { './index.js': './index.cjs' } },
    ],
  },
];
