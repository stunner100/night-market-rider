# Night Market Rider: first delivery slice

## Architecture assessment

The game retains Next.js 14 / React 18 for its shell, Three.js 0.169 for imperative rendering, and Zustand for UI state. `game/engine.ts` owns the frame loop, lightweight vehicle movement, camera, and system integration. The baked Accra OSM road graph supplies streamed 256 m chunks, buildings, routing and collision footprints. Existing articulated humans, branded motorcycle, pooled traffic/pedestrians, audio, fuel stations and navigation were reused.

The main gameplay limitation was automatic proximity-based pickup and delivery while seated. There was no explicit offline shift, vendor collection, walking or customer contact. Visual limitations included sparse roadside detail, missing mobile facades, inward-facing facade placement, block-shaped static crowds and expensive individual meshes.

## Implemented

- `game/delivery/machine.ts`: guarded, pure delivery state machine. Offline → waiting → timed offer → vendor navigation → dismount/confirm → preparation → collect → return bike → customer navigation → call → find customer → on-foot handoff → payout → waiting. Declining, expiry and going offline have explicit transitions. Leaving an arrival zone restores navigation.
- `components/UI.tsx`, `components/RiderPhone.tsx`, `app/globals.css`: branded offer and current-task HUD, eight phone sections, simulated call/message, progression displays, first-shift guidance and responsive controls.
- `game/engine.ts`, `game/rider-controls.ts`, `game/store.ts`: walking and parking, bike proximity checks, continuous reverse, input guards, payout protection, persistent earnings/XP/deliveries/rating/distance/on-time progress, base service and empty-tank assistance.
- Existing GPS now follows mission stages, supports base/fuel destinations, names nearby roads, and uses smaller markers. Minimap retains crossing road segments and avoids route-filter shortcuts.
- `game/world/delivery-place.ts`, `accra-block.ts`: reusable shopfronts, food stands, yellow mobile-money kiosk, compound details, verandas, roof tanks, signage, chairs, crates and vendor/customer destinations.
- Building, road and street dressing renderers: exterior facade correction, roof footprints, varied mixed-use frontage, asphalt, drains, dusty shoulders, sidewalks and utility cables. Static people use proportioned capsule limbs and clothing variation.
- Traffic brakes behind nearby riders/vehicles. Existing mixed fleet, lane following, hazards and fuel remain. Bike/rider meshes and animation systems are reused, with static bike pieces batched.
- Gradual lighting/time progression, reduced fog, shop lighting and camera obstruction checks. Mesh batching, distance-based detail visibility and lower-frequency distant animation updates constrain added costs. Streaming retries failed chunks and discards late chunks outside the requested neighborhood.

## Verification, 8 October 2026

- TypeScript: passed.
- Production build: passed (219 kB route, 306 kB first-load JavaScript).
- Automated tests: 18 passed, including the complete state path, invalid interactions, cancellation, expiry/decline, reverse/brake behavior, navigation, spawn constraints and minimap clipping.
- Browser: exercised offline → offer → acceptance → vendor confirm/wait/collect → remount → call → on-foot customer handoff → earnings, rating, XP and persisted progress. Long road legs used development-only position fixtures; walking and interaction actions used normal UI/keyboard controls. This does not establish a fully ridden end-to-end route.
- Browser: checked 1280 × 800 and 390 × 844 layouts, phone display, held accelerator input and keyboard riding. Small viewport testing is not physical mobile hardware testing.
- A moving-camera check found a sprite-raycast error; assigning the active camera fixed it, and the subsequent riding check produced no new errors.
- A short 120-frame browser callback sample after roadside density changes was about 120 Hz with 806 draw calls / 218,320 triangles at the observed position. This is a local diagnostic, not a guaranteed game frame rate or mobile benchmark.

## Boundaries and next work

This is the first single-order slice, not the entire requested long-term simulation. The city remains stylized procedural geometry. District-specific authored art, richer vegetation and interiors need further work to reach the reference-quality ambition. New frontage is decorative; mapped OSM building collision remains authoritative.

Mount/dismount switches between existing rigs rather than using bespoke transitions. Customer calls use subtitles and a short timer; substitutions, alternate gates, multi-bag and multi-stop orders are not implemented. Missed-call recovery and bounded customer approach were added in the follow-up below. Phone Map selects routes and presents directions; the HUD minimap remains the live graphical map. Traffic signals, rush-hour schedules, vendor hours, customization, spatial voice ambience, weather and advanced delivery types remain future work. Most economy/time-of-day variation remains the existing order generator.

## Run and inspect

`npm run dev` starts the game on port 3000. `npm run typecheck`, `npm test`, and `npm run build` validate source/tests/production compilation. `npm start` serves a completed production build. Development builds expose `window.__nm` for local QA; production does not.

Controls: W/S accelerate, brake/reverse; A/D steer; E dismount/mount; F interact; N phone; H horn; Escape pause. Small screens provide held steering/pedals and action buttons.

## Customer interaction follow-up, 10 October 2026

- Every fifth order after the first can miss its first call. A five-second retry cooldown prevents repeated calling; the second call connects. The rider may instead send an arrival text to confirm the meeting point.
- Messages are delivery-state events, require the rider to stop, cannot skip pickup, and reset for each order. The phone opens to Calls when a call starts and shows recovery actions on both the phone and current-task HUD.
- Customer clothing and delivery notes share deterministic order details. Selected customers walk toward a stopped, dismounted rider within 12 m, stop 2 m away, and remain within 6 m of their original destination. Each short movement step rejects roads and mapped buildings; if blocked, the customer waits for the rider.
- Nearby world labels hide inside 8 m to avoid obscuring the interaction view.
- Validation: 23 tests pass, TypeScript passes, production build passes (220 kB route / 307 kB first-load JS). Browser QA used local scenario and position fixtures, exercised vendor pickup/remount, a missed call recovered by text, and observed customer movement from 5 m to 2 m followed by handoff payout and a subsequent offer. No runtime errors were logged in this check. The QA payout was removed before leaving the browser. Retry-call completion is covered by the reducer test; it was not separately clicked through in the browser.

## Graphics and handling follow-up, 12 October 2026

- `game/sky.ts`: shader sky replaces the tinted canvas dome — zenith/horizon gradient, sun glow, drifting fbm clouds and night stars, keyed to the shift clock. Fog, sun and hemisphere colours follow its horizon/sun palette; ambient and image-based lighting now dim after dark.
- Ground uses a laterite/dry-grass texture with world-space macro variation instead of uniform green grass. Asphalt tar patches are softer. Exhaust/dust puffs expand, slow and fade.
- Instanced roadside people rendered black because their material requested vertex colours the geometry lacked; they now show instance colours.
- Steering input is eased, so heading, lean and camera roll ramp smoothly. The chase camera follows a smoothed heading but stays anchored to the bike (it no longer drifts ~19 m behind at speed). Camera occlusion ignores transient traffic and rises over the rider when walls pull it in.
- Food condition: after collection the bag starts at 100%; potholes, hard landings, crashes, pedestrian hits, harsh braking and sharp high-speed turns reduce it. Condition sets the customer tip (up to 40% of the fare, reduced when late) and lowers the rating. Shown on the task HUD and completion card.
- Validation: TypeScript, 23 tests and production build pass. Browser checks covered day, sunset and night skies, riding at speed with steering, the food meter and tip calculation (stages forced with dev fixtures, not a fully ridden order).

## Street life and wayfinding follow-up, 12 October 2026

- Traffic keeps right in lane-offset positions (by road class; centred on one-way roads), turns corners smoothly, and only brakes for the rider when the rider is in its lane. Pool raised to 22 vehicles on desktop (10 mobile) and now includes okadas — motorbike taxis that weave in lane, lean through turns and sometimes carry a passenger. Held-up drivers honk (distance-attenuated).
- Rider/vehicle collision is an oriented footprint test per vehicle type, so traffic passing in its own lane is no longer a crash; slow contact eases the rider aside instead of pinning them.
- Walkers: pool raised to 20 (8 mobile), about a third carry head-load basins, and they now spawn on major roads too. Spawning samples roads within ~70 m of the rider — previously most spawns landed beyond the 78 m despawn radius, and sidewalk paths failed on the baked two-point road pieces, so only 1–2 walkers were ever active. Low-detail walkers skip the shadow pass. Static instanced crowds are denser with small roadside groups.
- `game/world/route-ribbon.ts`: flowing chevron ribbon painted on the road along the GPS route (yellow to vendor, blue back to the bike, green to customer), plus a light-column beacon over the destination. Replaces the floating cones on OSM roads.
- Navigation cues report a maneuver (left/right/straight/U-turn/arrive) and distance to it; riding away from the route asks for a U-turn. A top-centre turn-by-turn banner shows the maneuver, distance, road name, remaining distance/ETA and compass heading; with no route it shows a compass + current road pill. On phones it sits under the task card.
- Validation: TypeScript, 24 tests and production build pass. Browser: 20 walkers and 22 vehicles active near the base at ~104 fps (≈1,580 draw calls; local Mac, not a mobile benchmark). Checked U-turn → reroute → turn cues while riding, ribbon on the road, and 1280×800 and 375×812 layouts. Test progress written during QA was removed from local storage.

## Accra voice and phone people, 12 October 2026

- `game/voice.ts`: all rider-facing lines in Ghanaian Pidgin with Twi (Chale, Medaase, Agoo, Ɛyɛ). State-machine messages, objectives, toasts, HUD, ticket, cash and phone copy draw from it; crash/pothole/horn lines vary per event. Customers have four personas (polite, hungry, student, joker) that keep their outfit and MoMo-kiosk meeting point consistent. More Ghanaian customer names and vendors.
- `game/calls.ts`: a cast that calls and texts the rider — Auntie Dede (dispatch), Kofi Mechanic (Abossey Okai), Maame, Bra Yaw, plus MoMo payout receipts, an ECG outage notice and late-order texts from the customer. Game events raise triggers; texts land at once, calls queue and never ring during an offer, customer call, bag check or cash payment, with a 20 s gap. Declined or missed calls (14 s) leave a text.
- `components/PhoneCall.tsx`: incoming call card (Enter answers/advances, Backspace declines). Phone Messages shows the inbox with an unread badge; Calls shows the call log.
- Validation: TypeScript and 32 tests pass (4 new for call pacing). Browser: welcome copy, intro call auto-missed into a text, a Kofi call answered and stepped through, inbox and unread clearing, going online and the offer card, at a 534 px wide viewport. No console errors.
