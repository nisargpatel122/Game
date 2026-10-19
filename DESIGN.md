# NEON NEBULA — Design

A neon space arcade pinball table. One self-contained `index.html`, plain JavaScript and
Canvas, no libraries, no network.

## Physical model

| Item | Value | Notes |
|---|---|---|
| Playfield | 510 x 1070 mm | 1 world unit = 1 mm |
| Slope | 6.5 degrees | tunable |
| Ball | 27 mm steel (r = 13.5) | rolling ball: 5/7 of g·sin(slope), then a feel multiplier |
| Main flippers | 3 in. (70 mm pivot to tip) | swing up in about 30 ms, drop back slower |
| Upper flipper | 55 mm | right button |
| Physics | fixed 480 Hz tick plus adaptive substeps | ball moves less than r/3 per substep |

All tuning values live in `src/core/settings.js`.

## Table layout (y grows toward the player)

```
            .-------------- top arc ---------------.
          /  ORION LANES [1][2][3]                  \
         |       (A)  (B)       DOCKING BAY  .--.     |
   LEFT  |          (C)    BLACK HOLE     (right ramp |  shooter
   ORBIT |  left ramp       (scoop)         apex)     |  lane
  spinner| (apex+wire)                   upper flip  RO|  |
         |   LEFT RAMP mouth        RIGHT RAMP mouth   |  |
         |                       drop targets (3)     |  |
         | planets (2)        planets (2)            |  |
         |                                           |  |
     kick| [sling]   mission ring / inserts   [sling] |  |
     back|in                                       in |  |
         |out    \LEFT FLIPPER   RIGHT FLIPPER/    out | plunger
         '----------------  drain  ----------------'
```

- **Left orbit** (along the left wall, with spinner) and **right orbit** (inside the
  shooter lane) join over the top arc. A completed orbit comes down the other side and
  rides a wire return into that side's inlane.
- **Left ramp** (shot from the right flipper) returns on a wire to the **left** inlane.
  **Right ramp** (shot from the left flipper) returns to the **right** inlane. Ramps sit
  on their own layer: drawn above the playfield, the ball only touches ramp walls while
  on them, and it is drawn bigger with an offset shadow.
- **Black Hole scoop** at upper centre: shot up the middle from either flipper, and the
  natural shot of the **upper flipper**. It holds the ball, plays a display moment, then
  kicks it out toward the left flipper.
- **Pop bumpers**: a cluster of three under the Orion lanes.
- **Asteroid drop targets**: bank of 3 below the upper flipper, facing the left flipper.
- **Planet stand-ups**: 4 targets, 2 left and 2 around the centre.
- **Slingshots**, inlanes and outlanes on both sides. **Kickback** in the left outlane.
- **Shooter lane** on the right with a one-way gate at the top.

## Shot map and flow

| Shot | Best flipper | Where it returns |
|---|---|---|
| Left orbit | right | right inlane (wire) -> right flipper |
| Left ramp | right | left inlane -> left flipper |
| Black Hole | either, upper | scoop kicks out to the left flipper |
| Right ramp | left | right inlane -> right flipper |
| Right orbit | left | left inlane (wire) -> left flipper |
| Drop targets | left | rebound |
| Planets | either | rebound |

Figure-8 flow: right flipper left ramp -> left flipper right ramp -> right flipper ...
Orbits loop back to the same flipper. Ramps, orbits and the Black Hole are **major
shots** that build combos.

## Rules

- **Balls**: 3 (Arcade) or 5 (Casual). Ball save for the first 8 s (Casual 15 s),
  counted from the first playfield switch. Lit SHOOT AGAIN.
- **Skill shot**: one of the three Orion lanes is lit. Flipper buttons rotate it.
  Plunge into the lit lane for a skill shot award that grows each time.
- **Orion lanes**: lighting all three raises the bonus multiplier (up to 6X).
- **Combos**: major shots within 4 s of each other chain into combos with rising chimes;
  each step adds to the combo multiplier.
- **Asteroids** (drop targets): clear the bank to light the **kickback**. During
  multiball it adds a ball once.
- **Planets** (stand-ups): complete all 4 to relight **MISSION** at the Black Hole.
- **Missions** (start at the Black Hole when MISSION is lit; flippers pick one):
  1. **COMET CHASE**: ramp frenzy. Both ramps lit, make 6 ramps.
  2. **PULSAR SPIN**: spinner rush. 50 spins.
  3. **METEOR STORM**: bumper blitz. 30 bumper hits.
  4. **ROGUE PLANET**: one lit shot moves around the table. Hit it 3 times.
  5. **CONSTELLATION**: shot sequence. Hit the 5 lit shots in order.
  6. **EVENT HORIZON**: clear the asteroids, then hit the Black Hole before the
     hurry-up value collapses.
  Each is timed. Completing all six lights **SUPERNOVA** (wizard mode) at the Black
  Hole: 4-ball multiball, every shot lit, then a SUPERNOVA jackpot at the Black Hole.
- **Nebula Multiball**: the left ramp lights LOCK. Shoot the right ramp to lock a ball in
  the Docking Bay. The second lock starts 3-ball multiball with ball save. Ramps score
  JACKPOTS. After both jackpots, the Black Hole scores the SUPER JACKPOT (slow-motion
  beat). Asteroids add a ball.
- **Extra ball**: lit at the left orbit after the 2nd mission and the first super
  jackpot. Crossing the replay score also awards one.
- **Tilt**: nudges add to a tilt bob that decays. Too much gives DANGER warnings. The
  third warning tilts: flippers die and the bonus for that ball is lost.
- **Bonus**: counts up item by item, times the multiplier. Hold both flippers to skip.

## Feel goals

- Flippers react on the very next physics tick (input events carry timestamps).
- A ball never tunnels: substeps keep motion below r/3, swept checks for flippers,
  and a speed cap.
- Pre-rendered layers and glow sprites, no per-frame blur.
- Every hit gets sound, light and floating points. Big moments get light shows,
  particles, small screen shake and a short slow-motion beat on the super jackpot.
