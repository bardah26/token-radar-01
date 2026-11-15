// Token Launch Radar — main.ts
// Scores pre-token protocols from a public snapshot and builds a static dashboard.
// Node 22 standard library only. Deterministic: no clock, no randomness, no locale.

import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { farmStepsFor } from './dashboard/steps.js';
import { buildDossier } from './vendor/makefun-board.ts';

interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

interface Snapshot {
  as_of: string;
  floor_usd: number;
  watchlist: string[];
  protocols: Protocol[];
}

interface BoardRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  tvl_usd: number;
  change_7d: number | null;
  category: string | null;
  chains: string[];
  listed_at: string | null;
  age_days: number;
  category_multiple: number;
  watchlist: boolean;
  farm_steps: string[];
}

interface Scored {
  protocol: Protocol;
  multiple: number;
  growth: number;
  ageDays: number;
  ageFactor: number;
  implied: number;
}

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = '/input/snapshot.json';
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input' && i + 1 < argv.length) input = argv[++i];
    else if (arg === '--output' && i + 1 < argv.length) output = argv[++i];
    else if (arg.startsWith('--input=')) input = arg.slice('--input='.length);
    else if (arg.startsWith('--output=')) output = arg.slice('--output='.length);
  }
  return { input, output };
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function dateToDays(s: string): number {
  const parts = s.split('-').map(Number);
  return Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000;
}

function compareScored(a: Scored, b: Scored): number {
  if (b.implied !== a.implied) return b.implied - a.implied;
  const aTvl = a.protocol.tvl_usd ?? 0;
  const bTvl = b.protocol.tvl_usd ?? 0;
  if (bTvl !== aTvl) return bTvl - aTvl;
  return a.protocol.slug < b.protocol.slug ? -1 : a.protocol.slug > b.protocol.slug ? 1 : 0;
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2));
  const outDir = resolve(output);
  const repoRoot = dirname(fileURLToPath(import.meta.url));

  const snapshot = JSON.parse(readFileSync(input, 'utf8')) as Snapshot;
  const protocols = snapshot.protocols ?? [];
  const watchlist = new Set(snapshot.watchlist ?? []);
  const asOfDays = dateToDays(snapshot.as_of);

  const isPreToken = (p: Protocol): boolean => p.gecko_id === null && p.symbol === null;

  // Eligibility follows the watchlist rule in the field guide: the board ranks
  // farmable protocols only — no wrapped, staked or bridged product of a token
  // that already trades, no CEX, no versioned re-release. It reads only the
  // snapshot's own category and name fields, never a list of protocol names.
  const INELIGIBLE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
  const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
  const isEligible = (p: Protocol): boolean => {
    if (INELIGIBLE_CATEGORIES.has(p.category ?? '')) return false;
    const name = p.name ?? '';
    if (/\s(v\d+|\d+\.\d+(\.\d+)?)$/i.test(name)) return false;
    if (/\b(wrapped|staked|staking)\b/i.test(name)) return false;
    const lower = name.toLowerCase();
    return !EXCHANGE_PREFIXES.some((e) => lower.startsWith(e.toLowerCase()));
  };
  const listed = protocols.filter((p) => !isPreToken(p));

  const ratiosByCategory = new Map<string, number[]>();
  const globalRatios: number[] = [];
  for (const p of listed) {
    if (p.mcap_usd === null || p.mcap_usd === undefined) continue;
    if (!(p.tvl_usd > 0)) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    globalRatios.push(ratio);
    const key = p.category ?? '';
    const arr = ratiosByCategory.get(key);
    if (arr) arr.push(ratio);
    else ratiosByCategory.set(key, [ratio]);
  }
  const globalMultiple = clamp(median(globalRatios), 0.05, 3.0);
  const multipleFor = (category: string | null): number => {
    const arr = ratiosByCategory.get(category ?? '') ?? [];
    if (arr.length >= 3) return clamp(median(arr), 0.05, 3.0);
    return globalMultiple;
  };

  const scored: Scored[] = protocols.filter(isPreToken).map((p) => {
    const multiple = multipleFor(p.category);
    const growth = 1 + 0.5 * clamp(p.change_7d ?? 0, -50, 100) / 100;
    const ageDays = p.listed_at === null ? 0 : Math.max(0, Math.round(asOfDays - dateToDays(p.listed_at)));
    const ageFactor = 1 + 0.04 * Math.min(ageDays / 365.25, 5);
    const tvl = p.tvl_usd ?? 0;
    const implied = Math.round(clamp(tvl * multiple * growth * ageFactor, 1, 100000000000000));
    return { protocol: p, multiple, growth, ageDays, ageFactor, implied };
  });

  scored.sort(compareScored);
  const watchRows = scored.filter((s) => watchlist.has(s.protocol.slug));
  const rest = scored.filter((s) => !watchlist.has(s.protocol.slug) && isEligible(s.protocol));
  const board = [...watchRows, ...rest.slice(0, 160)];
  board.sort(compareScored);

  const rows: BoardRow[] = board.map((s, index) => {
    const p = s.protocol;
    const steps = farmStepsFor({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd });
    if (steps.length !== 5) throw new Error(`farm steps for ${p.slug}: expected 5, got ${steps.length}`);
    for (const step of steps) {
      const len = step.trim().length;
      if (len < 20 || len > 600) throw new Error(`farm step for ${p.slug} has ${len} chars (need 20-600)`);
    }
    return {
      slug: p.slug,
      name: p.name,
      rank: index + 1,
      implied_value_usd: s.implied,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      category: p.category,
      chains: p.chains,
      listed_at: p.listed_at,
      age_days: s.ageDays,
      category_multiple: s.multiple,
      watchlist: watchlist.has(p.slug),
      farm_steps: steps,
    };
  });

  for (let i = 1; i < rows.length; i++) {
    if (rows[i].implied_value_usd >= rows[i - 1].implied_value_usd) {
      rows[i].implied_value_usd = Math.max(1, rows[i - 1].implied_value_usd - 1);
    }
  }

  // Fail fast instead of writing a board the gate would refuse: at least 100
  // rows, and every watchlist protocol covered.
  if (rows.length < 100) throw new Error(`board has only ${rows.length} rows (need at least 100)`);
  const covered = new Set(rows.filter((r) => r.watchlist).map((r) => r.slug));
  for (const slug of watchlist) {
    if (!covered.has(slug)) throw new Error(`watchlist protocol ${slug} is missing from the board`);
  }
  for (const s of scored) {
    if (watchlist.has(s.protocol.slug) && !isEligible(s.protocol)) {
      throw new Error(`watchlist protocol ${s.protocol.slug} fails eligibility`);
    }
  }

  mkdirSync(outDir, { recursive: true });
  mkdirSync(join(outDir, 'dashboard'), { recursive: true });
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });

  writeFileSync(join(outDir, 'board.json'), JSON.stringify({ rows }, null, 2) + '\n');

  cpSync(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'), { recursive: true });
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

  const compact = rows.map((r) => [
    r.slug,
    r.name,
    r.rank,
    r.implied_value_usd,
    r.tvl_usd,
    r.change_7d === null ? null : Math.round(r.change_7d * 100) / 100,
    r.category,
    r.chains.join('|'),
    r.age_days,
    Math.round(r.category_multiple * 10000) / 10000,
    r.watchlist ? 1 : 0,
  ]);
  const dataJs =
    `window.BOARD_META=${JSON.stringify({ as_of: snapshot.as_of, rows: rows.length })};\n` +
    `window.BOARD=${JSON.stringify(compact)};\n`;
  writeFileSync(join(outDir, 'dashboard', 'data.js'), dataJs);

  writeFileSync(join(outDir, 'dossier.json'), buildDossier(outDir, { text_max_bytes: 65536 }));

  console.log(`Token Launch Radar: ${protocols.length} protocols, ${scored.length} pre-token, ${rest.length} eligible non-watchlist, ${watchRows.length} watchlist, ${rows.length} board rows`);
  console.log(`Wrote ${join(outDir, 'board.json')}, ${join(outDir, 'dashboard', 'data.js')}, ${join(outDir, 'dossier.json')}`);
}

main();
