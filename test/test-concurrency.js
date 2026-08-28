const path = require('path');
const fs = require('fs');
const { loadCache, saveCache, clearCache } = require('../src/cache-manager');

const CACHE_FILE = path.join(__dirname, 'test-cache-concurrency.json');
clearCache(CACHE_FILE);

const initialCache = {
  version: 4,
  sessions: {
    "session1": { models: ["model-a"], turns: [] },
    "session2": { models: ["model-b", "model-c"], turns: [] }
  }
};

saveCache(initialCache, CACHE_FILE);

async function runTest() {
  let errors = 0;
  let emptyReads = 0;
  let corruptedReads = 0;

  const cycles = 50;

  const promises = [];

  for (let i = 0; i < cycles; i++) {
    // Simulate reader
    promises.push(new Promise((resolve) => {
      setTimeout(() => {
        try {
          const cache = loadCache(CACHE_FILE);
          if (!cache || !cache.sessions) {
            corruptedReads++;
          } else if (Object.keys(cache.sessions).length === 0) {
            emptyReads++;
          } else if (!cache.sessions.session1 || !cache.sessions.session2) {
            corruptedReads++;
          }
        } catch (e) {
          errors++;
        }
        resolve();
      }, Math.random() * 50);
    }));

    // Simulate writer
    promises.push(new Promise((resolve) => {
      setTimeout(() => {
        try {
          // Mutate slightly just to ensure we're saving
          const cache = loadCache(CACHE_FILE);
          if (cache && cache.sessions) {
             saveCache(cache, CACHE_FILE);
          }
        } catch (e) {
          errors++;
        }
        resolve();
      }, Math.random() * 50);
    }));
  }

  await Promise.all(promises);

  console.log(`Cycles: ${cycles}`);
  console.log(`Errors: ${errors}`);
  console.log(`Empty Reads: ${emptyReads}`);
  console.log(`Corrupted Reads: ${corruptedReads}`);

  if (errors === 0 && emptyReads === 0 && corruptedReads === 0) {
    console.log("PASS");
  } else {
    console.log("FAIL");
  }
  clearCache(CACHE_FILE);
}

runTest().catch(console.error);
