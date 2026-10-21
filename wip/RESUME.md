# Paused work: less predictable launches (resume notes)

Paused on 2026-10-21 at the player's request, to save usage. This folder is
temporary: delete `wip/` once the launch change has shipped. Nothing in it is
part of the game or the published site.

## State when paused

Done and pushed on branch `ccr-8f9a6df2-hda50f`:
- Longer flippers (78 mm, drain gap kept at 44.8 mm), bot aiming table regenerated.
- Plunger fix: instant launches (touch tap, auto-launch, bots) now move the
  resting ball with the tip, so their speed matches the pull.
- Bigger table on phones: full-screen retry on finger release, pause-menu
  FULL SCREEN button, tighter portrait layout.
- `tools/plunge-map.js` measures where launches go by player style.
- Angry Flock fix pushed to its own branch (`claude/android-physics-game-brainstorm-hcnwyr`).

NOT yet published to the phone site: the `neon-nebula` repo (`main`) still runs
commit 0c2f215 (install button version). Publish with
`git push nebula ccr-8f9a6df2-hda50f:main` from /home/user/Game after the launch
change lands (the `nebula` remote is https://github.com/nisargpatel122/neon-nebula;
re-add it and re-attach the repo with add_repo if the container was reset).

## The problem being fixed

Player feedback: "every time I launch the ball, it comes directly on the left
flipper after making the whole circle on the top". Measured with
`node tools/plunge-map.js 40`: full, strong, medium pulls and taps all go 100%
round the arch -> left orbit -> wireLO -> left flipper; skill shot 0%.

The player also said their favourite part is the ball bouncing around the three
pop bumpers while points rack up, and that slingshots and ball contacts feel
great: prefer a design that feeds the bumpers, and do not change bumper,
slingshot or contact feel.

## Candidate designs (patch files here, excluding generated index.html/sw.js)

1. `plunge-diverter.patch` - COMPLETE, verified (git am this; applies cleanly on
   the branch tip e6b4966). A 4 mm rubber pop-up post at the top of the arch
   (234, 17.5) is up while a ball waits/launches and drops at the ball's first
   playfield switch (or 3 s), so flipper orbit shots still loop. Plus +-3 %
   plunger spring variance, per-game physics seed, plungerMinLaunch 500 -> 800.
   Holding the left flipper keeps the post down (super skill plunge round the top).
   Verified plunge-map: top outcome 33-45% per style, lanes 57-78%, skill
   15-33%, both flippers about even, no fall-backs. Balance (40 games):
   novice 1.5 / solid 7.3 / good 8.7 min. Bumper hits per game about 4x
   (solid 24 -> ~95). Tests pass on its branch. Risk: outcome is sensitive to
   sub-millimetre post position; re-check plunge-map after geometry changes.
2. `plunge-geometry-partial.patch` - UNFINISHED (static geometry approach:
   upper.js + game.js, ~30 lines, no measurements yet).
3. `plunge-spring-partial.patch` - UNFINISHED (spring variance + left-orbit-exit
   diverter; 16 files touched, not yet measured or tested).

Patches 2 and 3 apply on e6b4966 with `git apply`.

## To resume

1. Likely winner is the diverter (meets every target and feeds the bumpers the
   player loves). Either ship it directly, or finish designs 2/3 and judge
   (the workflow script was `plunge-variety-design`, three designers in
   worktrees + a judge; re-create it if the session files are gone).
2. Apply: `git am -3 wip/plunge-diverter.patch`, then `node tools/build.js`.
3. Verify: `node tests/run-all.js`, `node tools/plunge-map.js 40`,
   `node tests/balance.js 40 arcade novice,solid,good`, `node tests/browser-smoke.js`,
   `node tests/pwa-test.js`; screenshot the post (title/attract and a launch).
4. Adversarial review of the diff, then commit, push the branch, publish to
   neon-nebula main, and explain the change to the player in plain words.
5. Delete `wip/` in the same change.
