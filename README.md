[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/aldy007x/neon-shores-v2/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/aldy007x/neon-shores-v2/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Neon Shores

An original open-world crime game in **Port Azura**, a neon coastal city of
avenues, parks, car parks, a beach and a pier. You are **Jax Marlowe**, fresh
in town with $250; fixer **Dario Venn** has six jobs that will make the city
yours. Steal cars, run the jobs, outrun the law.

Everything is original: the city, the names, the art and the sound (all
synthesized live with WebAudio — there are no audio files). The game is
plain static files under `game/` with no build step and no network calls.

## Play it

```sh
node serve.ts        # then open http://localhost:8080
```

Press **ENTER** on the title screen. Your progress saves to `localStorage`
automatically after every job.

## Controls

| Keys | Action |
| --- | --- |
| WASD / arrow keys | Walk, drive, steer |
| Shift | Sprint on foot |
| Space | Handbrake (drift) |
| E | Enter / exit a car (steal it) |
| F | Punch |
| P / Esc | Pause (save with S, reset save with R) |
| M | Mute |

## The city

A seeded, deterministic 3600×3600 city: a road grid with lane markings and
right-hand traffic, 180+ buildings with lit windows, parks, car parks full
of stealable cars, a beach, the sea, and the walkable/drivable Neon Pier
ending at Lighthouse Point. Twelve named landmarks carry signs — Tower One,
the Azura Grand Hotel, the Coral Casino, Marina Mall, Palm Court, Sunset
Garage, St. Marina Hospital, Port Azura Police HQ, the Fish Market, the
Harbour Warehouse, the Neon Pier and Lighthouse Point. A full day–night
cycle rolls over the city: streetlights pool at intersections, windows
glow, and cars switch on headlight cones after dark.

Three vehicle classes handle differently — compact, sedan and sports — plus
the police Interceptor. Traffic keeps its lanes, brakes for the car ahead
and never stacks; pedestrians stroll the sidewalks, flee trouble, and go
down if you clip them.

## Crime and the law

Heat is priced in points, 100 to a star, five stars maximum:

| Crime | Heat |
| --- | --- |
| Stealing a car | 40 |
| Assault (witnessed) | 30 |
| Hit-and-run | 85 |
| Ramming a police car | 110 |
| Ramming a civilian car | 18 |

Police field 1/2/3/5/6 interceptors at 1–5 stars and hunt your last known
position; break line of sight and the heat cools. Get cornered and stopped
beside an officer and the bust meter fills: **BUSTED** costs a fine and a
release at Police HQ. Wreck your body and it's **WASTED** — a hospital bill
and a discharge at St. Marina. An officer ramming *you* is never your
crime; only your own closing speed prices a ram.

## The six jobs

1. **Hot Package** — lift a package at the Fish Market, deliver it to
   Marina Mall against the clock. **$400**
2. **Fare Play** — pick up the passenger waiting at Palm Court and drive
   her, gently, to the Azura Grand Hotel. **$260 + up to $90 tip**
3. **Cool Down** — you start at three stars. Lose every point of heat.
   **$500**
4. **Grand Tour** — Tower One, the Coral Casino and Lighthouse Point,
   one clock. **$600**
5. **Harbour Run** — three crates from the pier, the beach and the Fish
   Market to the Harbour Warehouse, never below two stars. **$750**
6. **Neon Finale** — six checkpoints across the whole city while the heat
   floor climbs from one star to three. **$1,200**

Finish all six for the **CITY CLEARED** panel: $250 + $3,800 of rewards =
**$4,050**. Side money keeps flowing afterwards: flatten the rampage cones
in the car park (40 seconds, $15 a cone, $80 clear bonus) and collect the
fare tips passengers leave at landmark taxi stands ($25).

## Layout

- `main.ts` — the entry program: audits `game/` and `screenshots/` against
  the bounty caps, copies them to the output directory and writes
  `dossier.json` with the kit's `buildDossier`.
- `serve.ts` — a small static server for local play.
- `game/src/` — the game, one job per file: `config` (tuning), `rng`
  (seeded randomness), `city` (Port Azura's generation), `entities` (cars,
  pedestrians, police, physics), `world` (state, crime, wanted system),
  `missions` (the six jobs), `render` (canvas + HUD + minimap), `audio`
  (WebAudio synthesis), `input`, `shots` (screenshot staging), `main`.
- `sim/sim.mjs` — a headless harness that plays the whole game with
  synthetic inputs and verifies the mechanics and the exact cash math.
- `tools/capture.mjs` — captures the screenshots from the staged scenes
  with headless Chrome.
- `vendor/makefun-game.ts` — the kit's dossier library, unchanged.

MIT licensed — see `LICENSE`.
