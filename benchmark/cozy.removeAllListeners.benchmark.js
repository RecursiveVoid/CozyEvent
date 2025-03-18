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

const eventname = 'test';
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



const suite = new Benchmark.Suite();

emitters.forEach(emitter => { 
 emitter.lib = new emitter.constructor();
});


emitters.forEach(emitter => {
  suite.add(`${emitter.name}: RemoveAllListeners:`, function () {
    emitter.lib.removeAllListeners();
  }).on('cycle', function (event) {
    console.log(String(event.target.name + '✅'));
    emitter.lib = new emitter.constructor();
  });;
});

suite
  .on('cycle', function (event) {
    console.log(String(event.target.name + '✅'));
  })
  .on('complete', function () {
    console.log('\n');
    const results = this.sort((a, b) => a.stats.mean - b.stats.mean);
    console.log(`Bencmark results for RemoveAllListeners  (fastest to slowest):\n`);
    results.forEach(result => {
      console.log(`${result}`);
    });
  })
  .run();

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
