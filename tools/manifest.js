// Source files in load order. "core" runs headless in Node and in the browser;
// "browser" is only bundled into index.html.
module.exports = {
  core: [
    'src/core/settings.js',
    'src/core/util.js',
    'src/physics/shapes.js',
    'src/physics/flipper.js',
    'src/physics/world.js',
    'src/table/layout.js',
  ],
  browser: [],
};
