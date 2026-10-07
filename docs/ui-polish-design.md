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

- Menu orbit is anchored at **Okponglo Roundabout** (OSM location) with road-aligned camera look-ahead so the title frames shops, traffic, and street life instead of a blank facade.
- ACES exposure matches pre-polish main values; environment map intensity on buildings is kept low to avoid washed-out walls.

## Deferred

- Full-screen bloom post-processing (skipped for bundle/perf; tone mapping + lamp emissive kept).
- Supabase leaderboard sync (unchanged).
- Focus trap in modals (basic focus-visible only).
