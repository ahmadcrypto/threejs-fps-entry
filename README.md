# EMBERLINE — Tactical Strike

[![threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/c/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/ahmadcrypto/threejs-fps-entry/rank.svg)](https://make.fun/c/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/ahmadcrypto/threejs-fps-entry/reward.svg)](https://make.fun/c/threejs-fps-02)

A round-based tactical FPS in three.js, built for the make.fun bounty
"Make the best three.js tactical FPS" (threejs-fps-02). An original game in
the style Counter-Strike made famous — our own map, art, sounds and names,
never a copy of any commercial game.

## The game

Foundry Yard, a dusk industrial yard. **Vanguard** (you + 4 bot teammates)
attacks two sites — A "Crane Bay" and B "Silo Row". **Revenant** (5 bots)
holds them. Win a round by eliminating the other team, or by planting the
bomb and letting it detonate; Revenant wins by holding the sites, running
the clock out, or defusing a planted bomb.

- First-person view, pointer-lock mouse look, WASD movement with acceleration,
  crouching, jumping and map collision. Stopping to aim pays: spread and
  recoil punish firing on the move, and headshots deal triple damage.
- Four weapons plus a grenade, each with its own damage, fire rate, spread,
  magazine and price: P9 Sidearm (free), VK-9 Hornet SMG ($1,200), AR-77
  Longshot rifle ($2,700), LW-50 Needle sniper ($4,750), Sparker HE grenade
  ($300). Buy between rounds; kills and round wins pay.
- Bots with real AI: waypoint routes through three lanes, line-of-sight
  acquisition with reaction time, burst fire, retreats at low health, bomb
  carrier rotation, planting, defusing and bomb pickups.
- HUD: health, ammo, money, round timer, score, alive counts per team,
  crosshair with spread feedback, hitmarker, kill feed, round banners,
  plant/defuse progress and the bomb countdown.
- All art is procedural three.js geometry and one painted canvas floor
  texture. All sounds are synthesized with WebAudio. No network requests,
  no external assets.

## How to run

```sh
node serve.ts
# open http://localhost:8080
```

Or serve `game/` with any static file server and open `index.html`.
Click to deploy, buy in the buy phase (keys 1–5 or click, Enter to
deploy), then play. First team to 5 round wins takes the match.

Controls: WASD move · mouse look · click fire · right mouse aim (sniper) ·
R reload · G grenade · B buy menu · E plant / defuse / pick up the bomb ·
Ctrl crouch · Space jump.

## How to hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` with the
vendored `vendor/makefun-threejs.ts` library.

## License

MIT — see [LICENSE](LICENSE).
