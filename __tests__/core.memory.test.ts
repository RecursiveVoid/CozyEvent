/**
 * Bounded memory under event-name churn (SPEC S11, "delayed cleanup" variant).
 *
 * An emitter may keep an emptied event's entry for a while, but a long-lived emitter that churns
 * many distinct event names (each added, then removed by off / unsubscribe / once firing) must not
 * retain memory proportional to the number of names ever used. Records of removed registrations on
 * a single event must not accumulate either.
 *
 * Measured by heap, not by reading storage: test-types/memory-child.cjs runs each churn scenario
 * N = 1e6 times in a separate `node --expose-gc` process (so it works with plain `npx jest`) and
 * reports the heap growth after full GCs. An implementation that never deletes empty entries retains
 * ~113 B per churned name (~110 MB); the current delete-immediately core retains < 0.1 MB.
 * Bound: 8 MiB per scenario (i.e. up to ~70k retained empty entries at any time are tolerated).
 *
 * Env overrides: COZY_MEMORY_IMPL=path[,path...] (modules exporting CozyEvent, .ts or built .cjs),
 * COZY_MEMORY_N=iterations.
 * @jest-environment node
 */
import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { join, relative } from 'path';

const root = join(__dirname, '..');
const child = join(root, 'test-types', 'memory-child.cjs');
const N = Number(process.env.COZY_MEMORY_N ?? 1e6);
const MAX_RETAINED = 8 * 1024 * 1024;

const impls = process.env.COZY_MEMORY_IMPL
  ? process.env.COZY_MEMORY_IMPL.split(',')
  : [join(root, 'src', 'index.ts'), join(root, 'dist', 'index.cjs')].filter((f) => existsSync(f));

type Result = { name: string; retained: number; perIteration: number; liveOk: boolean };

describe.each(impls.map((f) => [relative(root, f) || f, f]))('bounded retention under churn: %s', (_label, impl) => {
  let results: Result[] = [];

  beforeAll(() => {
    const r = spawnSync(process.execPath, ['--expose-gc', child, impl, String(N)], {
      cwd: root,
      encoding: 'utf8',
      timeout: 240_000,
      maxBuffer: 1 << 20,
    });
    if (r.status !== 0) throw new Error(`memory child failed (${r.status} ${r.signal}): ${r.stderr}`);
    results = JSON.parse(r.stdout.trim().split('\n').pop()!).results;
  }, 250_000);

  test.each([
    'unique names: on + off',
    'unique names: on + unsubscribe',
    'unique names: once + emit',
    'unique names: once + off',
    'unique names: mixed on/once, emitAsync-free',
    'one event: once + emit',
    'one event: on + off',
    'one event: on + unsubscribe',
  ])(`%s x ${N}: retained heap stays under 8 MiB and live listeners still work`, (name) => {
    const res = results.find((x) => x.name === name);
    expect(res).toBeDefined();
    expect(res!.liveOk).toBe(true);
    expect({ name, retained: res!.retained, underBound: res!.retained < MAX_RETAINED }).toEqual({
      name,
      retained: res!.retained,
      underBound: true,
    });
  });
});
