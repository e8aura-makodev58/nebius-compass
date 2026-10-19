# Nebius palette (2026-10-19)

By user direction, ResponseCompass for the Nebius x NVIDIA entry follows the color scheme of
the Nebius website. Colors were sampled from a screenshot of nebius.com. The screenshot is
kept outside the repo, and no Nebius logo, wordmark or artwork is used: only colors.

| Role | Token | Value | Source |
|---|---|---|---|
| Text, primary actions, selection border | `--ink`, `--accent`, `--accent-ink` | `#0F2B43` | Nebius navy (wordmark, "Log in" and "Start building now" buttons) |
| Brand highlight fill | `--brand-lime` | `#E1FE3C` | Nebius lime (logo background) |
| Deeper lime (focus ring, chart) | `--brand-lime-deep` | `#B7E218` | Hero artwork |
| Selection wash | `--accent-wash` | `#F2FAD0` | Pale lime |
| Page / sunk surfaces | `--paper`, `--paper-sunk` | `#EEF2F7`, `#E4EAF1` | Pale blue-grey hero background |

Rules:
- Lime is a **fill only**, always with navy text (12.8:1). It is never text on light surfaces
  (lime on white is about 1.2:1).
- The page uses three lime fills: the brand mark ("Compass"), the active top-level tab
  (with a navy underline for a non-color cue), and selection washes.
- The structure, spacing, radii and type stay as in [modern-light.md](modern-light.md); only
  colors changed.
- `backend/tests/design-tokens-contrast.test.mjs` keeps every text token at WCAG AA (≥ 4.5:1)
  on every surface. The lowest margin is `--muted` on `--paper-sunk` at 5.1:1.
