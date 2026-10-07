# UI polish design system (2026)

## Typography

- **Display:** [Syne](https://fonts.google.com/specimen/Syne) — titles, hero, modal headings, phone place names.
- **UI:** [DM Sans](https://fonts.google.com/specimen/DM+Sans) — HUD, buttons, body copy.
- Loaded via `next/font/google` (self-hosted at build time).

## Color

| Token | Use |
| --- | --- |
| `--nm-night-950` / `--nm-night-800` | Backgrounds, HUD pills |
| `--nm-market-gold` | Primary CTA, route/minimap accents |
| `--nm-money` | Cash / payout emphasis |
| `--nm-urgency` | Low timer, strikes, low fuel |
| `--nm-accent-sky` | Night events, boost meter |
| `--nm-gh-red` / `--nm-gh-green` | Phone frame (subtle Ghana stripe) |

## Components

- **Cards / modals:** glass gradient, gold hairline border, 22px radius.
- **Buttons:** pill shape; primary gold gradient; ghost for secondary actions; Lucide icons at 14–18px.
- **HUD:** three-column top bar with safe-area insets; touch layer only on coarse pointers / narrow viewports.
- **Loading:** staged copy + percent + gradient progress bar.

## Motion

- `pop` entrance on overlays; `floaty` on logo (disabled under `prefers-reduced-motion`).

## Title backdrop

- Menu anchor prefers **Legon Traffic Light**, then Okponglo, then Night Market — snapped to the nearest road with a road-aligned cinematic orbit (wider/slower on desktop).
- Before the menu opens, the client waits on `engine.menuReady`: OSM chunks are primed in a ring around the anchor, then `warmMenuScene()` simulates traffic and pedestrians so palms, shop fronts, vehicles, and walkers are visible at 1440×900 and 1920×1080.
- Gameplay spawn on “Start riding” is unchanged (`0, -18` snap).
- ACES exposure matches pre-polish main values; building env maps stay subdued.

## Footer / OSM credit

- Small-type footer uses ~`#e8edf5` on `rgba(8,12,22,0.88)` (WCAG AA for normal small text). In-game on touch viewports it sits above touch controls (`nm-footer--in-game`).

## Deferred

- Full-screen bloom post-processing (skipped for bundle/perf; tone mapping + lamp emissive kept).
- Supabase leaderboard sync (unchanged).
- Focus trap in modals (basic focus-visible only).
