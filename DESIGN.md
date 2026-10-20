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
          /   ORION LANES [1][2][3]                  \
         |      (A)       (B)            inner arc     |
   LEFT  |           (C)                   COMET LANE  |  shooter
   ORBIT |  left ramp    BLACK HOLE        right ramp  |  lane
  spinner|  (apex+wire)  (scoop, funnel)  (apex+wire) RO  |
    funnel\                                upper flip /  |
   planets |  LEFT RAMP mouth    RIGHT RAMP mouth     | drops
           |                                          |  |
     kick  | [sling]   mission ring / inserts   [sling] |  |
     back  |in                                     in |  |
           |out   \LEFT FLIPPER   RIGHT FLIPPER/   out | plunger
           '----------------  drain  ----------------'
```

The geometry was shaped by the headless harness (`tests/table.test.js`), which
fires thousands of balls and sweeps cradle shots from every flipper.

- **Orbits.** Left orbit along the cabinet wall (with spinner), right orbit inside
  the shooter lane. Both have funnel mouths: the outer wall leans out and the inner
  wall flares the other way, so cross-court shots between about 117 and 132 degrees
  are guided up the lane. A completed orbit comes down the other side and rides a
  wire return into that side's inlane. Failed orbits roll back out toward the centre.
- **Ramps.** Mirror images on their own layers (drawn above the playfield; the ball
  only touches ramp walls while on them, and is drawn bigger with an offset shadow).
  Each mouth sits above its own flipper, so the strong "late" shot from that flipper
  goes up its ramp; the opposite flipper makes it cross-court. Left ramp returns to
  the left inlane, right ramp to the right inlane.
- **Black Hole scoop** on the centre line with a funnel mouth: the centre shot from
  either flipper. Holds the ball, plays a display moment, kicks out to the left
  flipper.
- **Comet Lane.** A short lane straight above the **upper flipper** (right side,
  under the right ramp). The upper flipper's own shot: the ball rises into the inner
  arc and is thrown back over the Orion lanes into the bumpers.
- **Pop bumpers**: three under the Orion lanes, offset so a ball never drops straight
  back into a lane.
- **Asteroid drop targets**: bank of three on the wall face below the right orbit
  funnel, facing the left flipper (shots a little too wide for the right orbit).
- **Planet stand-ups**: two on the wall face below the left orbit funnel (mirror of
  the drops), two at the tips of the Black Hole's funnel.
- **Slingshots**, inlanes and outlanes on both sides. **Kickback** in the left outlane.
- **Shooter lane** on the right with a one-way gate at the top.

## Shot map and flow

| Shot | Natural flipper | Where it returns |
|---|---|---|
| Left ramp | left (late), right (cross) | left inlane -> left flipper |
| Right ramp | right (late), left (cross) | right inlane -> right flipper |
| Left orbit | right (cross), left (backhand) | right inlane (wire) -> right flipper |
| Right orbit | left (cross), right (backhand) | left inlane (wire) -> left flipper |
| Black Hole | either (centre) | kicks out to the left flipper |
| Comet Lane | upper flipper | over the lanes into the bumpers |
| Drops | left (wide cross) | rebound |
| Planets | right (wide cross), centre | rebound |

Each flipper has an easy repeatable shot (its own ramp) and a figure-8 (cross-court
to the other ramp, which feeds the other flipper). Ramps, orbits, the Black Hole and
the Comet Lane are **major shots** that build combos.

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
- **Comet Lane** (upper flipper): each shot scores a growing comet value and spots an
  Orion lane.
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
