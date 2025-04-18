import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';
import strip from 'rollup-plugin-strip';
import terser from '@rollup/plugin-terser';
import { visualizer } from 'rollup-plugin-visualizer';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: 'dist/index.cjs',
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: 'dist/index.esm.js',
        format: 'esm',
        sourcemap: true,
      },
    ],
    external: ['react',
    'react-dom',
    'react/jsx-runtime',
    'react/jsx-dev-runtime'],
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        tsconfig: './tsconfig.json',
        declaration: true,
        declarationMap: false,
        noEmitOnError: true,
        jsx: 'react-jsx',
      }),
      terser({
        compress: {
          drop_console: true,
          pure_getters: true,
          passes: 2,
        },
      }),
      strip({
        functions: ['console.*', 'assert.*'],
      }),
      visualizer({ open: true }),
    ],
  },
  {
    input: 'dist/index.d.ts',
    output: [{ file: 'dist/index.d.ts', format: 'es' }],
    plugins: [dts()],
  },
];
