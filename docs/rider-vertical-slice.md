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

## Street life and Accra systems, 12 October 2026

- `game/world/accra-signs.ts`: invented shopfront names ("God Is Able Enterprise", "Sweet Mother Chop Bar", "Psalm 23 Vulcanizing"…), kiosk signs, street-food boards, billboards (crusade, land for sale, road safety, funeral), trotro slogans and destination calls. Sign text now shrinks to fit.
- Street dressing adds double-sided billboards on main roads and kenkey/kelewele/coconut stands (table, basins, umbrella, night lantern), kept off roads and building footprints. Trotros carry a rear slogan and a destination board; when one stops near the rider the mate shouts its route in a speech bubble.
- Night lighting: about half of OSM and frontage windows light up after dark, one in ten runs a generator, streetlight heads glow and stall lanterns flicker.
- `game/world/city-power.ts`: dumsor. After dark an outage (~300–420 m radius, 70–110 s) cuts grid windows and streetlights around the rider; generator windows stay on, ambient dims and a generator hum plays. ECG and Bra Yaw text about it.
- `game/weather.ts`: showers every few minutes (45–85 s): rain streaks around the camera, grey sky and denser fog, rain audio, top speed −18%. Maame and Dede text.
- `game/checkpoint.ts`: from the second order, ~45% of routes have a police checkpoint 150–230 m ahead. Warned at 70 m; stop within 9 m to show licence (4 s) or "settle am" (GH₵5). Riding through or leaving mid-check is a GH₵20 fine, −0.2 rating and a call from Dede.
- `game/radio.ts`: Akwaaba FM 101.3 (highlife with guitar plucks), Okponglo Hiplife 96.5 (faster beat) and Legon Talk 88.7 (traffic and talk), all fictional. R or the radio pill cycles stations; captions alternate songs and DJ lines, and the DJ reacts to rain and dumsor.
- Validation: TypeScript and 37 tests pass (5 new for dumsor, rain, checkpoint and radio). Browser at 534 px and 1000 px: night windows, rain with HUD chip and DJ reaction, dumsor chip, checkpoint warn → stop → licence → cleared, trotro destination board and mate bubble. The in-app browser throttled the hidden page, so checkpoint and shout steps were advanced through `window.__nm.engine.update` rather than ridden live.

## Night shift mood and rider identity, 12 October 2026

- Night: the shift starts at 17:30 golden hour and is fully dark about 1.5 minutes in. The sky horizon carries a sodium-orange city glow, while ambient, hemisphere, moonlight, image-based light and night exposure are all lower, so lamps, windows and the stronger headlight do the work. Streetlights cast additive orange pools on the road (they go out in dumsor), stall lanterns cast flickering pools, and streetlight heads glow sodium orange.
- `game/archetypes.ts` and `components/Onboarding.tsx`: first-time players enter a name, answer four Pidgin questions (Saturday morning, how you move, favourite chop, police stop) and get a rider type with a home, an upside and a wahala:
  - Okada Boy: top speed +8%, more checkpoints.
  - Campus Hustler: tips +15%, food damage +15%.
  - Burger (returnee): GH₵100 once, food damage +25%.
  - Chop Bar Pikin: vendors cook twice as fast, Maame calls more.
  
  Dede's intro call reacts to the type. The choice saves with progress. The welcome screen greets returning riders and offers "Change who you be" (the head start is not paid twice). The phone profile shows the type. Game keys ignore typing in text fields.
- Validation: TypeScript and 40 tests pass (3 new). Browser: night street with sodium sky and headlight; full onboarding by keyboard (name → 2,2,2,1 → Campus Hustler reveal → shift starts at 17:30, Dede's campus line, save written). Test identity removed from local storage afterwards.

## Real Ghanaian music on the bike, 12 October 2026

- The default radio station is "Ghana Top 2025": the public 21charts playlist on SoundCloud, streamed through SoundCloud's official embedded mini player and Widget API (`components/SoundCloudRadio.tsx`). No audio is downloaded or bundled. The player and a link to the playlist stay visible for attribution.
- It plays only while the rider is on the bike. Dismounting, pausing, muting or changing station pauses it, and remounting resumes the same track. Each shift starts at a random track, region-blocked tracks are skipped on error, the volume ducks while the phone rings, and the radio caption shows the current title and artist.
- Browsers block audio until the player has interacted with the page, so a blocked start retries on the next key press or tap. If SoundCloud cannot load (offline or blocked), the caption says so and R switches to the synth stations, which now also play only while mounted.
- Validation: TypeScript and 40 tests pass. Browser: the playlist loaded and shuffled ("Effiakuma Broken Heart — Kofi Kinaata"), played after user input, paused on dismount and resumed on mount, paused on station change. The test identity was removed afterwards.

## Live Ghanaian radio, 12 October 2026

- The radio now opens on real Ghanaian stations, using each station's public live stream in a plain `<audio>` element (`components/LiveRadio.tsx`): Hitz FM 103.9 (default), Joy FM 99.7, Citi FM 97.3, Ghana Music Radio, Adom FM 106.3 and Peace FM 104.3. R cycles through them, then the SoundCloud playlist, the fictional stations and off.
- Same rules as before: it plays only while the rider is on the bike, pauses on dismount, pause, mute or station change, ducks while the phone rings, and rejoins the live edge after a long pause. If a stream fails, it looks up the station's current stream in the open Radio Browser directory once, then tells the rider to press R.
- Stream URLs were checked (HTTP 200, audio/mpeg or audio/aac) on 12 Oct 2026. Streams with tokens can rotate, which the directory lookup covers.
- Validation: TypeScript and 40 tests pass. Browser, with a normal click on ENTER ACCRA: Hitz FM played straight away; dismounting paused and remounting resumed it; all six live stations played on switching; switching to SoundCloud stopped the live stream. Test identity removed afterwards.
