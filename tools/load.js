// Load the headless core (physics, table, rules) into Node for tests and simulations.
const path = require('path');
const manifest = require('./manifest');
for (const f of manifest.core) require(path.join(__dirname, '..', f));
module.exports = globalThis.NN;
