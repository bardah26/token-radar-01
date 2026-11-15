# Token Launch Radar

A static dashboard that ranks pre-token DeFi protocols by implied launch value, from a public snapshot. Every protocol listed records no token.

## Value model

For each pre-token protocol:

- `category_multiple` — median market-cap / TVL of listed protocols in the same category (at least 3 samples, otherwise the global median), clamped to [0.05, 3.0].
- `growth` — `1 + 0.5 * clamp(change_7d, -50, 100) / 100`.
- `age` — `1 + 0.04 * min(age_days / 365.25, 5)`.
- `implied_value_usd` — `round(tvl_usd * category_multiple * growth * age)`, clamped to [1, 1e14].

The board holds the 40 watchlist protocols plus the highest-implied other eligible protocols (158 of them, 198 rows), ranked by implied value, then TVL, then slug. Implied values are forced strictly decreasing down the ranks.

Eligibility follows the watchlist rule in the field guide: the board ranks farmable protocols only — no wrapped, staked or bridged product of a token that already trades, no CEX, no versioned re-release. It is read from the snapshot's own category and name fields, never from a list of protocol names, so the same program would find the next farmable protocol on a future snapshot.

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input /home/hatch/workspace/token-radar-kit/token-radar-01-kit/input/snapshot.json
```

Or: `node main.ts --input <snapshot.json> --output <dir>`. The program writes `board.json`, `dashboard/data.js`, copies `dashboard/` and `screenshots/` into the output directory, and writes `dossier.json`. It is deterministic: two runs write byte-identical files.

## Files

- `main.ts` — the scorer and builder (Node 22 standard library only).
- `dashboard/` — static dashboard: `index.html`, `app.css`, `app.js`, `steps.js` (farm steps, shared by the builder and the dashboard), `data.js` (generated).
- `vendor/makefun-board.ts` — vendored dossier builder, copied byte-for-byte from the competition kit.
- `screenshots/` — dashboard screenshots (board, detail, filtered).
