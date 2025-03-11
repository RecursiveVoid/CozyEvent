import Benchmark from 'benchmark';
import { CozyEvent } from '../dist/index.esm.js';

const suite = new Benchmark.Suite();

const cozyEvent = new CozyEvent();

// Change this value to test with different amount of emitters
const emitterAmount = 10;

const callback = () => {};
const eventname = 'test';

// For comparing other emitters, add them here;
const emitters = [cozyEvent];

for(let i = 0; i < emitterAmount; i++) {  
    emitters.forEach(emitter => {
        emitter.on(eventname, callback);
    });
}

suite
// Example benchmark cases:
  .add('CozyEvent: Emit', function () {
    cozyEvent.emit('test', {});
  })
  .on('start', function (event) {
    console.log(`${emitterAmount} Listeners:`);
  })
  .on('cycle', function (event) {
    console.log(String(event.target));
  })
  .on('complete', function () {
    console.log('Fastest is ' + this.filter('fastest').map('name'));
  })
  .run({ async: true});


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
