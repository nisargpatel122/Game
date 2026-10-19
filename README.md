# Angry Flock

A slingshot physics game in the style of Angry Birds, built as an installable web app (PWA). After the first load it runs **fully offline** on your Android phone, full-screen and in landscape, like a normal app.

## Worlds

| World | Levels | Goal |
|---|---|---|
| **Pig Island** | 40 | The classic: knock down wood, glass and stone forts and pop every pig. Later levels add castles, bunkers, cliffs, floating rock ledges, rolling boulders and TNT stores. |
| **Space Hogs** | 6 | Each planet pulls on anything inside its dashed circle. Curve your shots around planets. |
| **Demolition Crew** | 26 | No pigs. Wreck at least the goal % of the building. |

## Birds

| Bird | Power (tap the screen while the bird is flying) |
|---|---|
| Red | None. A solid all-rounder. |
| Blues | Splits into three. Great against glass. |
| Chuck | Speed burst. Smashes wood. |
| Bomb | Explodes. He also blows up on his own a moment after a hit. |
| Matilda | Drops an exploding egg straight down. |
| Terence | None. Big and heavy, so aim at the base. |

A bird that touches a pig pops it instantly, however gently. TNT crates explode when hit. Helmet pigs and King Pig take more hits. Every bird you don't use is worth a 10,000-point bonus. Stars and best scores are saved on your phone.

## Controls

- **Aim and shoot:** drag the bird in the slingshot back and let go. The dotted line shows where it will go.
- **Bird power:** tap anywhere while the bird is in the air.
- **Look around:** drag with one finger on an empty area, or pinch to zoom. The camera goes back to normal on your next shot.

## Installing it on your Android phone

The game has to be served over HTTPS once. After that it is cached on the phone and needs no internet.

1. **Host it.** The simplest option is GitHub Pages:
   1. Pages on a private repository needs a paid GitHub plan. On a free plan, make the repository public first: **Settings → General → Danger Zone → Change visibility**.
   2. Go to **Settings → Pages**. Under *Build and deployment*, choose **Deploy from a branch**, pick the branch with the game (for example `main`, after merging), choose the `/ (root)` folder, and click **Save**.
   3. Wait about a minute. The game will be at `https://<your-username>.github.io/<repo-name>/`.
2. **Install it.** Open that link in **Chrome** on your phone, tap the **⋮** menu, then **Add to Home screen → Install**.
3. **Play offline.** Open *Angry Flock* from your home screen. It now works in airplane mode.

## Development

There is no build step. It is plain HTML, CSS and JavaScript.

```bash
python3 -m http.server 8000         # then open http://localhost:8000
node tools/check-levels.js          # no overlapping pieces, every level stays still when idle, and a bot can beat it
node tools/check-levels.js 1-3 2-4  # check just a few levels
node tools/difficulty.js 1-11 3-7   # difficulty score (0-100) from a simulated player who gets a few tries per bird
```

Pig Island levels 11–40 and Demolition levels 7–26 are listed in `js/levels.js` as designs plus an order (`ISLAND_BIRDS`, `DEMO_ORDER`) that sets how many birds each level gets (and the goal % for Demolition). The numbers were tuned with `tools/difficulty.js` so each world gets steadily harder.

Add `?level=2-3` to the URL to jump straight to a level.

| File | Contents |
|---|---|
| `js/sim.js` | Physics and game rules: materials, damage, bird powers, explosions, scoring and planet gravity. It runs in Node too, and can snapshot and restore a game between shots. |
| `js/levels.js` | All the levels, built with small stacking helpers. |
| `js/render.js` | All the art, drawn in code with no image files, plus destruction effects: debris, dust, screen shake and combo banners. |
| `js/audio.js` | Sound effects and music, synthesized with WebAudio. |
| `js/main.js` | Screens, touch input, the camera and save data. |
| `sw.js` | The offline cache. **Bump `VERSION` whenever you change any file**, or installed copies will keep the old version. |

Credits: physics by [Planck.js](https://github.com/piqnt/planck.js) (MIT, see `js/vendor/planck-LICENSE.txt`). The *Lilita One* font is under the SIL Open Font License (see `fonts/OFL.txt`). This is a personal fan-made game and is not affiliated with Rovio.
