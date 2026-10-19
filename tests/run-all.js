// Runs every headless test file in sequence. Usage: node tests/run-all.js
const path = require('path');
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['physics.test.js', 'table.test.js', 'rules.test.js'];
const fs = require('fs');
(async () => {
  let failed = 0;
  for (const f of files) {
    const p = path.join(__dirname, f);
    if (!fs.existsSync(p)) continue;
    console.log(`\n# ${f}`);
    // each file registers tests on a fresh copy of the test list
    delete require.cache[require.resolve('./lib')];
    const lib = require('./lib');
    require(p);
    failed += await lib.run();
    for (const k of Object.keys(require.cache)) if (k.includes(path.sep + 'tests' + path.sep)) delete require.cache[k];
  }
  process.exit(failed ? 1 : 0);
})();
