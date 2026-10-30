# Nisarg's Games

Menu page: https://nisargpatel122.github.io/Game/

Every game has its own link and installs as its own app. No game shares an app
identity, an offline cache or saved data with another, so installing, updating or
resetting one never affects the others.

| Game | Link | Where the code lives |
|---|---|---|
| Color Commute | https://nisargpatel122.github.io/color-commute/ | its own repo, `color-commute` |
| Neon Nebula Pinball | https://nisargpatel122.github.io/neon-nebula/ | its own repo, `neon-nebula` |
| Brick Blitz | https://nisargpatel122.github.io/Game/brick-blitz/ | `brick-blitz/` in this repo |
| Angry Flock | https://nisargpatel122.github.io/Game/angry-flock/ | `angry-flock/` in this repo |

GitHub Pages for this repo publishes the `main` branch, `/ (root)` folder.

`backup.html` backs up and restores all four games' saved progress (they share one site, so one page can see it).

`sw.js` at the top level is not a game. It removes an old offline copy of Angry
Flock that phones may still have from when it lived directly at `/Game/`.
