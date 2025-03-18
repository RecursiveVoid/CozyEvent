import Benchmark from 'benchmark';
import { CozyEvent } from '../dist/index.esm.js';
import {EventEmitter as Emitix} from "emitix";
import { EventEmitter as Tseep } from 'tseep';
import EE3 from 'eventemitter3';
import EventEmitter2 from 'eventemitter2';
import BraintreeEventEmitter from '@braintree/event-emitter';
import ProtoBufEventEmitter from '@protobufjs/eventemitter';
import EventEmitter from 'event-emitter';
import { EventEmitter as NodeEventEmitter } from 'events';


// Change this value to test with different amount of emitters
const emitterAmounts = [1, 10, 100, 1000, 10_000, 100_000, 1_000_000, 10_000_000];
const callback = () => {};
const eventname = 'test';
// Event emitters to be tested
const emitters = [
  { name: 'cozyEvent: emit', constructor: CozyEvent },
  { name: 'tseep: emit', constructor: Tseep },
  { name: 'eventemitter3: emit', constructor: EE3 },
  { name: 'eventemitter2: emit', constructor: EventEmitter2 },
  { name: 'braintree-event-emitter: emit', constructor: BraintreeEventEmitter },
  { name: 'protobufjs-eventemitter: emit', constructor: ProtoBufEventEmitter },
  { name: 'event-emitter: emit', constructor: EventEmitter },
  { name: 'emitix: emit', constructor: Emitix },
  { name: 'node-event-emitter: emit', constructor: NodeEventEmitter },
];


emitterAmounts.forEach(emitterAmount => { 
const suite = new Benchmark.Suite();

emitters.forEach(emitter => { 
  if(emitter.lib) {
    if( typeof emitter.lib['removeAllListeners'] === 'function')
      {
       emitter.lib.removeAllListeners();
      }
  }
 emitter.lib = new emitter.constructor();
});


for (let i = 0; i < emitterAmount; i++) {
  emitters.forEach(emitter => {
    emitter.lib.on(eventname, callback);
  });
}


emitters.forEach(emitter => {
  suite.add(`${emitter.name}: EMIT`, function () {
    emitter.lib.emit(eventname, callback);
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
    console.log(`Bencmark results for ${emitterAmount} Listeners (fastest to slowest):\n`);
    results.forEach(result => {
      console.log(`${result}`);
    });
  })
  .run(); });

/* To test, please first remove the dist folder and run the following commands:
   - npm run build
   - npm run benchmark

    Once the tests are done, please open a new discussion from here:
     https://github.com/RecursiveVoid/CozyEvent/discussions/new?category=benchmark

    and share your test suit code and the following format as in report.txt file in the discussion:
    - CozyEvent version
    - CPU on your machine
    - Brief description of your test
    - Compared libraries

    -As title; [version] Brief explanation of the test

    Once its verified, it will be added to report.txt file in the repository with the credit as author.
  */
