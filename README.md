# Night Market Rider

A browser-based night delivery game set on real Accra streets. Ride a motorbike through OpenStreetMap road data around Legon, Okponglo, and UPSA, pick up chop orders, dodge traffic and potholes, and deliver before the timer runs out.

**Play:** [night-market-rider.vercel.app](https://night-market-rider.vercel.app)

## Screenshots

Before/after UI polish comparisons live in [`docs/screenshots/`](docs/screenshots/) (`before/` = production prior to polish PR, `after/` = polished build). Capture locally with `node scripts/capture-screens.mjs http://localhost:3000 ./out`.

## Controls

| Input | Action |
| --- | --- |
| **W / ↑** | Accelerate |
| **S / ↓** | Brake; from a standstill, reverse (works at a slow creep even when out of fuel) |
| **A / D** or **← / →** | Steer |
| **Space** | Boost (uses extra fuel) |
| **F** | Dismount / remount the bike when parked nearby |
| **Phone HUD** (right side) | Accept orders, see pickup and drop-off; tap the top bar to tuck the phone while riding |
| **Touch** | On-screen joystick, gas, brake, and boost |

Pause from the menu bar. Three strikes (crashes or late deliveries) end your shift early, or ride until the 12-minute night shift timer runs out.

## Features

- Real Accra OSM roads (Legon, Okponglo, UPSA) with traffic, walkers, fuel stops, and hazards
- Chop orders from many Accra-style vendors (waakye, kelewele, jollof, banku, indomie, and more) with drop-offs spread along the map
- Dynamic night events: order surge pay, police checkpoints, rain showers (shown on the delivery phone)
- End-of-shift results: earnings, tips, on-time rate, distance, crashes, streak, star rating, leaderboard
- Debug events in the browser: add `?events=order_surge,police_checkpoint,rain_shower` or set `localStorage.nm_debug_events` to the same list
- Demo a shorter shift with `?shift=90` (seconds, 30–720)

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use a WebGL-capable browser with hardware acceleration enabled.

```bash
npm test      # unit tests
npm run build # production build
```

## Rebuild Accra map data

The live game loads baked JSON from `public/world/accra`, not Overpass at runtime. To refresh the world after OSM changes:

```bash
npm run world:bake:accra
```

See [docs/accra-world.md](docs/accra-world.md) for the pipeline, chunk layout, and attribution requirements.

## Credits

- **Map data:** [© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) (ODbL 1.0)
- **Stack:** Next.js, React, Three.js, TypeScript
- Night Market Rider by [stunner100](https://github.com/stunner100/night-market-rider)
