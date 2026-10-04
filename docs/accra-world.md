# Accra OSM world pipeline

Night Market Rider keeps OpenStreetMap out of the live gameplay request path. The game world is baked during development and served as static JSON chunks from `public/world/accra`.

## Bake the Legon → Okponglo → UPSA vertical slice

```bash
npm run world:bake:accra
```

The baker fetches roads, building footprints, and selected POIs from the Overpass API, projects WGS84 coordinates into a local metre-based Three.js coordinate system, builds a directed road graph, and writes 256 m world chunks.

Generated files:

```text
public/world/accra/
├── manifest.json
├── graph.json
├── locations.json
└── chunks/
    ├── <x>_<z>.json
    └── ...
```

The origin is the University of Ghana / Night Market area. `+X` is east and `-Z` is north. One Three.js world unit equals approximately one metre.

## Runtime

`game/world/accra-runtime.ts` loads only the chunks surrounding the player. Desktop keeps a 5×5 chunk window; mobile keeps a 3×3 window. The runtime also exposes:

- `isOnRoad(x, z)` for road-surface checks
- `nearestRoadPoint(x, z)` for snapping delivery/traffic points
- `route(from, to)` for A* routing over the baked road graph
- `getLocation(id)` for geographic Night Market landmarks

If `manifest.json` is missing or cannot be loaded, the runtime fails closed and the existing procedural world remains available as the fallback.

## Data and attribution

Map data is © OpenStreetMap contributors and is distributed under ODbL 1.0. The generated manifest preserves the source and attribution string. Any player-facing build that enables this world must keep visible OpenStreetMap attribution.

## Production rule

Do not make public OpenStreetMap or Overpass infrastructure the gameplay backend. Re-bake map content when the world needs updating, review the generated result, then deploy the static files with the game.
