import Benchmark from 'benchmark';
import { CozyEvent } from '../dist/index.esm.js';
import { EventEmitter as Emitix } from 'emitix';
import { EventEmitter as Tseep } from 'tseep';
import EE3 from 'eventemitter3';
import EventEmitter2 from 'eventemitter2';
import BraintreeEventEmitter from '@braintree/event-emitter';
import ProtoBufEventEmitter from '@protobufjs/eventemitter';
import EventEmitter from 'event-emitter';
import { EventEmitter as NodeEventEmitter } from 'events';
import Backbone from 'backbone';

const emitterAmounts = [1];
const callback = () => {};
const eventname = 'test';

const emitters = [
  {
    name: 'cozyEvent: emit',
    constructor: () => new CozyEvent(),
    addListener: 'on',
    emitMethod: 'emit',
  },
  {
    name: 'tseep: emit',
    constructor: () => new Tseep(),
    addListener: 'on',
    emitMethod: 'emit',
  },
  {
    name: 'eventemitter3: emit',
    constructor: () => new EE3(),
    addListener: 'on',
    emitMethod: 'emit',
  },
  {
    name: 'eventemitter2: emit',
    constructor: () => new EventEmitter2(),
    addListener: 'on',
    emitMethod: 'emit',
  },
  {
    name: 'braintree-event-emitter: emit',
    constructor: () => new BraintreeEventEmitter(),
    addListener: 'on',
    emitMethod: 'emit',
  },
  {
    name: 'protobufjs-eventemitter: emit',
    constructor: () => new ProtoBufEventEmitter(),
    addListener: 'on',
    emitMethod: 'emit',
  },
  {
    name: 'event-emitter: emit',
    constructor: () => new EventEmitter(),
    addListener: 'on',
    emitMethod: 'emit',
  },
  {
    name: 'emitix: emit',
    constructor: () => new Emitix(),
    addListener: 'on',
    emitMethod: 'emit',
  },
  {
    name: 'node-event-emitter: emit',
    constructor: () => new NodeEventEmitter(),
    addListener: 'on',
    emitMethod: 'emit',
  },
  {
    name: 'eventtarget: emit',
    constructor: () => new EventTarget(),
    addListener: 'addEventListener',
    emitMethod: 'dispatchEvent',
  },
  {
    name: 'backbone: emit',
    constructor: () => Object.assign({}, Backbone.Events),
    addListener: 'on',
    emitMethod: 'trigger',
  },
];

emitterAmounts.forEach((emitterAmount) => {
  const suite = new Benchmark.Suite();

  emitters.forEach((emitter) => {
    emitter.lib = emitter.constructor();
  });

  for (let i = 0; i < emitterAmount; i++) {
    emitters.forEach((emitter) => {
      emitter.lib[emitter.addListener](eventname, callback);
    });
  }

  emitters.forEach((emitter) => {
    suite.add(`${emitter.name}: EMIT`, function () {
      if (emitter.emitMethod === 'dispatchEvent') {
        emitter.lib.dispatchEvent(new Event(eventname));
      } else {
        emitter.lib[emitter.emitMethod](eventname, callback);
      }
    });
  });

  suite
    .on('start', function () {
      console.log(`\n${emitterAmount} Listeners:\n`);
    })
    .on('cycle', function (event) {
      console.log(String(event.target.name + '✅'));
    })
    .on('complete', function () {
      console.log('\n');
      const results = this.sort((a, b) => a.stats.mean - b.stats.mean);
      console.log(
        `Benchmark results for ${emitterAmount} Listeners (fastest to slowest):\n`
      );
      results.forEach((result) => {
        console.log(`${result}`);
      });
    })
    .run();
});

/* To test, please first remove the dist folder and run the following commands:
   - npm run build
   - npm run benchmark

    Once the tests are done, please open a new discussion from here:
     https://github.com/RecursiveVoid/CozyEvent/discussions/new?category=benchmark

    and share your test suite code and the following format as in report.txt file in the discussion:
    - CozyEvent version
    - CPU on your machine
    - Brief description of your test
    - Compared libraries

    -As title; [version] Brief explanation of the test

    Once it's verified, it will be added to report.txt file in the repository with the credit as author.
*/
