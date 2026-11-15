// Farm steps for the Token Launch Radar.
// Pure JavaScript, no DOM. Single source of truth: main.ts (board.json) and the
// dashboard (app.js) both call farmStepsFor for the same protocol.
// p = { slug, name, category, chains, tvl_usd }. Returns exactly 5 strings,
// each 20-600 characters after trimming.

function mainChain(p) {
  return Array.isArray(p.chains) && p.chains.length > 0 ? p.chains[0] : 'Ethereum';
}

function depositTier(tvl) {
  if (tvl >= 1000000000) return '$500 or more';
  if (tvl >= 100000000) return '$100 to $500';
  return '$25 to $100';
}

var CORE_ACTIONS = {
  Dexs: 'swap tokens and add liquidity',
  Lending: 'supply assets and keep the position open',
  Yield: 'deposit into a vault and let it earn',
  Derivatives: 'open a small position and manage it',
  CDP: 'open a small collateralised position and manage it',
  Bridge: 'bridge volume on a regular schedule',
};

function coreAction(category) {
  return CORE_ACTIONS[category] || 'use the core product on a regular schedule';
}

function farmStepsFor(p) {
  var name = p.name || p.slug;
  var chain = mainChain(p);
  var gas = chain === 'Ethereum' ? 'about $30 to $80 for gas' : 'about $2 to $10 for gas';
  var deposit = depositTier(p.tvl_usd || 0);
  var action = coreAction(p.category);
  var cat = p.category || 'DeFi';
  return [
    'Set up a fresh wallet on ' + chain + ' just for ' + name + '; fund it with ' + gas + ' and a deposit of ' + deposit + ' matched to its size. Keep it separate from your main wallet and never share its seed phrase with anyone.',
    'On ' + name + ' (' + chain + ', ' + cat + '), ' + action + ' every week: start small, confirm each transaction on-chain, and keep receipts of the amounts and dates so you can prove activity later.',
    'Repeat the core action at least once a week until ' + name + ' launches its token; a gap of a month or more usually resets an activity streak, so keep the cadence steady.',
    "Check " + name + "'s official points or quest page and its official announcements on X and Discord for snapshot news; only trust links published by the official accounts.",
    'Stay safe: never click links sent by DM, verify every link before signing, and withdraw your funds if ' + name + ' stops deposits or changes its terms. Nothing here guarantees an airdrop if it launches.',
  ];
}

// Node (CommonJS): expose the function for `import { farmStepsFor } from './steps.js'`.
// Browsers load this file as a classic script and use window.farmStepsFor.
if (typeof module !== 'undefined' && module.exports) module.exports = { farmStepsFor };
if (typeof window !== 'undefined') window.farmStepsFor = farmStepsFor;
