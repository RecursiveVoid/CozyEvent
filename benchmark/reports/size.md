# Bundle size

Node v22.14.0. Consumer entry per library (instantiate, on, emit, off), bundled with rollup 4.34.8 + node-resolve (browser field) + commonjs + terser (compress.passes 2), ESM output. gzip = zlib level 9, brotli = Node default (quality 11). Bytes; smaller is better. The consumer entry itself (shipped dist/index.js alone is 430 gzip bytes) is included in every row; CJS-only packages also carry rollup's interop helper. Feature sets differ: nanoevents, mitt, @braintree/event-emitter and @protobufjs/eventemitter have no once and no emitAsync, and of those only nanoevents returns an unsubscribe function from on. mitt and nanoevents are optional (not in devDependencies) and are skipped when not installed.

| # | library | min | gzip | brotli | gzip vs smallest |
|---|---|--:|--:|--:|--:|
| 1 | nanoevents | 249 | 184 | 158 | 1.00x |
| 2 | mitt | 339 | 203 | 180 | 1.10x |
| 3 | cozyevent v1.4.2 (core class only) | 515 | 269 | 245 | 1.46x |
| 4 | @braintree/event-emitter | 637 | 332 | 282 | 1.80x |
| 5 | @protobufjs/eventemitter | 753 | 391 | 335 | 2.13x |
| 6 | cozyevent v2 | 1241 | 456 | 411 | 2.48x |
| 7 | emitix | 2253 | 951 | 853 | 5.17x |
| 8 | eventemitter3 | 2958 | 1112 | 1004 | 6.04x |
| 9 | event-emitter | 4819 | 1920 | 1733 | 10.43x |
| 10 | tseep | 18381 | 3514 | 3214 | 19.10x |
| 11 | eventemitter2 | 18670 | 5691 | 5131 | 30.93x |

cozyevent/react (react external): 150 min / 136 gzip / 117 brotli (hook + entry, excluding React itself).

## Shipped dist files (already minified, as published)

| file | min | gzip | brotli |
|---|--:|--:|--:|
| dist/index.js | 1191 | 430 | 378 |
| dist/index.cjs | 1203 | 434 | 382 |
| dist/react.js | 153 | 136 | 119 |
| dist/react.cjs | 155 | 134 | 112 |

node:events is not listed: it is a Node built-in and needs a separate polyfill package in browsers.
