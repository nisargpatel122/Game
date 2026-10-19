# Brick Blitz

A brick breaker in the style of Arkanoid and DX-Ball, built as an installable web app (PWA). After the first load it runs **fully offline** on your Android phone, full-screen and upright, like a normal app.

100 levels across 5 worlds, each ending in a boss fight. Each world adds new bricks and tricks, and the difficulty climbs steadily. Even level 1 asks you to keep your eye on the ball.

## Worlds

| World | Levels | What's new |
|---|---|---|
| **Neon Arcade** | 1–20 | Armoured and metal bricks, TNT, ball cages, gold. Boss: **Block Golem** |
| **Crystal Caves** | 21–40 | Invisible ghost bricks and steel. Boss: **Crystal Eye**, guarded by orbiting crystals |
| **Lava Forge** | 41–60 | Sliding rows, and turrets that shoot at your paddle. Boss: **Magma Heart** |
| **Deep Space** | 61–80 | Walls that sink a row every few seconds. Boss: **Void Mothership** |
| **Cyber Core** | 81–100 | Everything at once, faster. Final boss: **The Overlord** |

Beat a world's boss to open the next world.

## Bricks

| Brick | What it does |
|---|---|
| Coloured | One hit |
| Armoured (white frame) | Two hits |
| Metal | 2–5 hits; the dots show how many are left |
| Steel | Six hits. Lasers and fireballs make short work of it |
| Gold | Can't be broken. Bounce the ball around it |
| TNT | Blows up everything around it, and sets off other TNT |
| **?** | Always drops a power-up |
| Ball cage | Frees an extra ball |
| Ghost | Invisible until you hit it once (watch for a faint shimmer), then needs one more |
| Turret | Shoots at your paddle. A hit stuns the paddle for a moment |

## Power-ups

Broken bricks sometimes drop a capsule. Catch the good ones and dodge the red ones.

| Capsule | Effect |
|---|---|
| Wide Paddle | Bigger paddle for 15 s |
| Multiball | Every ball splits into three |
| Lasers | The paddle fires lasers on its own for 10 s |
| Slow Ball | Balls slow down for 12 s |
| Magnet | The ball sticks to the paddle. Let go (or tap) to fire it |
| Safety Net | Saves one ball that falls past the paddle |
| Fireball | Balls burn straight through bricks for 8 s |
| Lightning | Strikes five bricks at once |
| Extra Ball | One more ball in reserve |
| Tiny Paddle (red) | Smaller paddle for a while |
| Speed Up (red) | Faster balls for a while |

If only a few bricks are left and nothing has been hit for a while, a Lightning capsule falls from the top to help out, and any hidden ghost bricks show themselves.

## Scoring and stars

- Bricks broken in a row, without the ball touching the paddle, build a combo. Every 4 bricks raise the score multiplier (up to x8), and each brick in a combo plays a higher note.
- Clearing a level adds 1,000 per ball left, a speed bonus, and 5,000 for a perfect clear.
- **Stars:** 3 for losing no balls, 2 for losing one, 1 for any other clear. Each level gives you 3 balls (4 for bosses).
- Stars unlock new paddle and ball-trail **Styles** (palette button on the title screen).

## Controls

- **Phone:** drag anywhere to move the paddle (it follows your finger's movement, so you never cover the ball). Let go, or tap, to launch.
- **Steering:** the further from the paddle's centre the ball lands, the sharper it flies off. The ends of the paddle send it out at a steep angle.
- **Computer:** move the mouse, or use the arrow keys / A and D. Click or press Space to launch, and P or Esc to pause.

## Installing it on your Android phone

The game has to be served over HTTPS once. After that it is cached on the phone and needs no internet.

1. **Host it.** The simplest option is GitHub Pages:
   1. Pages on a private repository needs a paid GitHub plan, so the repository has to stay public on a free plan.
   2. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, pick the branch with the game (for example `main`, after merging), choose the `/ (root)` folder, and click **Save**.
   3. Wait about a minute. The game will be at `https://<your-username>.github.io/<repo-name>/brick-blitz/`.
2. **Install it.** Open that link in **Chrome** on your phone, tap the **⋮** menu, then **Add to Home screen → Install**.
3. **Play offline.** Open *Brick Blitz* from your home screen. It now works in airplane mode.

## Development

There is no build step. It is plain HTML, CSS and JavaScript.

```bash
cd brick-blitz
python3 -m http.server 8000           # then open http://localhost:8000
node tools/check-levels.js            # every map is valid, every brick can be reached, and a skilled bot clears every level
node tools/check-levels.js 12 40      # check just a few levels
node tools/difficulty.js 1-20         # difficulty score (0-100) from an average simulated player
node tools/tune.js 61-80              # suggest ball-speed trims that put levels on the difficulty curve (slow)
python3 tools/make-icons.py           # redraw the app icons
```

Add `?level=37` to the URL to jump straight to a level, and `?unlock` to open every level and style.

**How the difficulty was set.** `js/bot.js` is a simulated player that reacts a beat late, misjudges fast balls, sometimes loses track of one, and steers with the paddle's edges. `tools/difficulty.js` has it play each level many times with the real number of balls, and scores the level from how often it fails, how often it gets 3 stars, and how many balls it loses. Levels in each world are ordered from easiest to hardest (`ORDER` in `js/levels.js`), and `tools/tune.js` sets a small per-level ball-speed trim (`SPEED_TRIM`) so the scores follow a steady climb, with a breather at the start of each world and a spike for each boss. If you change a level, re-run `tools/tune.js` on it and paste in the new trim.

| File | Contents |
|---|---|
| `js/sim.js` | Physics and game rules: ball, paddle, bricks, power-ups, lasers, turrets, sliding rows, sinking walls, bosses, scoring and stars. Deterministic, so it runs the same in Node for the tools. |
| `js/bot.js` | The simulated player, used by the tools and by the demo behind the menus. |
| `js/levels.js` | All 100 levels, drawn as text maps (legend in `js/sim.js`), plus the difficulty curve and speed trims. |
| `js/render.js` | All the art, drawn in code with no image files: glossy bricks, themed backgrounds, bosses, particles, screen shake and the HUD. |
| `js/audio.js` | Sound effects and a music loop for each world, synthesized with WebAudio. |
| `js/main.js` | Screens, touch/mouse/keyboard input, tips, save data and styles. |
| `sw.js` | The offline cache. **Bump `VERSION` whenever you change any file**, or installed copies will keep the old version. |

Credits: the *Lilita One* font is under the SIL Open Font License (see `fonts/OFL.txt`). This is a personal fan-made game, not affiliated with Taito (Arkanoid) or any other brick-breaker.
