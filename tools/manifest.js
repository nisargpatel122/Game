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
    'src/table/upper.js',
    'src/game/missions.js',
    'src/table/inserts.js',
    'src/game/rules.js',
    'src/game/game.js',
    'src/game/bot.js',
    'src/game/dmd.js',
    'src/game/achievements.js',
  ],
  browser: [
    'src/browser/storage.js',
    'src/browser/audio.js',
    'src/browser/music.js',
    'src/browser/art.js',
    'src/browser/fx.js',
    'src/browser/render.js',
    'src/browser/input.js',
    'src/browser/ui.js',
    'src/browser/main.js',
  ],
};
