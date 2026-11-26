import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quoteBuy, quoteSell, CURVE_SUPPLY, BPS, MAX_FEE_BPS } from '../src/index.js';

const file = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));

const toState = (s) => ({
  virtualEth: BigInt(s.virtualEth),
  virtualToken: BigInt(s.virtualToken),
  realEth: BigInt(s.realEth),
  tokensSold: BigInt(s.tokensSold),
  feeBps: BigInt(s.feeBps),
});

const E18 = 10n ** 18n;

/** A curve nobody has traded on yet, with the launchpad's initial virtual reserves. */
const fresh = (feeBps) => ({
  virtualEth: 5n * 10n ** 17n,
  virtualToken: 1_073_000_000n * E18,
  realEth: 0n,
  tokensSold: 0n,
  feeBps,
});

/** Half of the virtual token reserve sold; virtualEth * virtualToken equals the initial product. */
const mid = () => ({
  virtualEth: 1n * E18,
  virtualToken: 536_500_000n * E18,
  realEth: 5n * 10n ** 17n,
  tokensSold: 536_500_000n * E18,
  feeBps: 300n,
});

const graduated = () => ({
  virtualEth: 1_965_201_465_201_465_202n,
  virtualToken: 273_000_000n * E18,
  realEth: 1_465_201_465_201_465_202n,
  tokensSold: CURVE_SUPPLY,
  feeBps: 200n,
});

test('constants', () => {
  assert.equal(CURVE_SUPPLY, 800_000_000n * E18);
  assert.equal(BPS, 10_000n);
  assert.equal(MAX_FEE_BPS, 500n);
});

test('vector file is intact', () => {
  assert.equal(file.vectors.length, 36);
  assert.equal(file.vectors.filter((v) => v.kind === 'buy').length, 20);
  assert.equal(file.vectors.filter((v) => v.kind === 'sell').length, 16);
});

// ───────────── real on-chain trades ─────────────

for (const v of file.vectors) {
  test(`${v.id} ${v.label} (${v.txHash})`, () => {
    const state = toState(v.state);
    if (v.kind === 'buy') {
      assert.deepEqual(quoteBuy(state, BigInt(v.ethIn)), {
        tokensOut: BigInt(v.expected.tokensOut),
        fee: BigInt(v.expected.fee),
        refund: BigInt(v.expected.refund),
      });
    } else {
      assert.deepEqual(quoteSell(state, BigInt(v.tokensIn)), {
        ethOut: BigInt(v.expected.ethOut),
        fee: BigInt(v.expected.fee),
      });
    }
  });
}

// ───────────── edge cases: buy ─────────────

test('buy: zero input quotes zero', () => {
  assert.deepEqual(quoteBuy(fresh(200n), 0n), { tokensOut: 0n, fee: 0n, refund: 0n });
});

test('buy: graduated curve quotes zero', () => {
  assert.deepEqual(quoteBuy(graduated(), E18), { tokensOut: 0n, fee: 0n, refund: 0n });
});

test('buy: 1 wei, fee rounds down to zero', () => {
  assert.deepEqual(quoteBuy(fresh(200n), 1n), { tokensOut: 2_145_999_999n, fee: 0n, refund: 0n });
});

test('buy: far beyond the graduation limit, fresh curve, 2% fee', () => {
  assert.deepEqual(quoteBuy(fresh(200n), 100n * E18), {
    tokensOut: CURVE_SUPPLY,
    fee: 29_902_070_718_397_250n,
    refund: 98_504_896_464_080_137_548n,
  });
});

test('buy: far beyond the graduation limit, fresh curve, no fee', () => {
  assert.deepEqual(quoteBuy(fresh(0n), 100n * E18), {
    tokensOut: CURVE_SUPPLY,
    fee: 0n,
    refund: 98_534_798_534_798_534_798n,
  });
});

test('buy: beyond the graduation limit from the middle of the curve', () => {
  assert.deepEqual(quoteBuy(mid(), 10n * E18), {
    tokensOut: 263_500_000n * E18,
    fee: 29_851_591_707_261_811n,
    refund: 9_004_946_943_091_272_987n,
  });
});

test('buy: middle of the curve, no graduation', () => {
  assert.deepEqual(quoteBuy(mid(), 10n ** 17n), {
    tokensOut: 47_438_924_339_106_654_512_306_289n,
    fee: 3_000_000_000_000_000n,
    refund: 0n,
  });
});

// Around the smallest ethIn that fills a fresh curve: [feeBps, ethIn, fee at ethIn - 1, fee at ethIn, fee and refund at ethIn + 1].
const boundary = [
  [0n, 1_465_201_465_201_465_202n, 0n, 0n, 0n, 1n],
  [100n, 1_480_001_480_001_480_002n, 14_800_014_800_014_800n, 14_800_014_800_014_800n, 14_800_014_800_014_801n, 0n],
  [200n, 1_495_103_535_919_862_451n, 29_902_070_718_397_249n, 29_902_070_718_397_249n, 29_902_070_718_397_250n, 0n],
  [500n, 1_542_317_331_791_016_002n, 77_115_866_589_550_800n, 77_115_866_589_550_800n, 77_115_866_589_550_801n, 0n],
];
for (const [feeBps, ethIn, feeBelow, feeAt, feeAbove, refundAbove] of boundary) {
  test(`buy: graduation boundary on a fresh curve, fee ${feeBps} bps`, () => {
    assert.deepEqual(quoteBuy(fresh(feeBps), ethIn - 1n), {
      tokensOut: 799_999_999_999_999_999_935_375_582n,
      fee: feeBelow,
      refund: 0n,
    });
    assert.deepEqual(quoteBuy(fresh(feeBps), ethIn), { tokensOut: CURVE_SUPPLY, fee: feeAt, refund: 0n });
    assert.deepEqual(quoteBuy(fresh(feeBps), ethIn + 1n), {
      tokensOut: CURVE_SUPPLY,
      fee: feeAbove,
      refund: refundAbove,
    });
  });
}

// ───────────── edge cases: sell ─────────────

test('sell: zero input quotes zero', () => {
  assert.deepEqual(quoteSell(mid(), 0n), { ethOut: 0n, fee: 0n });
});

test('sell: graduated curve quotes zero', () => {
  assert.deepEqual(quoteSell(graduated(), E18), { ethOut: 0n, fee: 0n });
});

test('sell: dust rounds down to zero', () => {
  assert.deepEqual(quoteSell(mid(), 1n), { ethOut: 0n, fee: 0n });
});

test('sell: one whole token', () => {
  assert.deepEqual(quoteSell(mid(), E18), { ethOut: 1_808_014_908n, fee: 55_917_986n });
});

test('sell: everything that was sold', () => {
  assert.deepEqual(quoteSell(mid(), mid().tokensSold), {
    ethOut: 485_000_000_000_000_000n,
    fee: 15_000_000_000_000_000n,
  });
});

test('sell: more than tokensSold throws RangeError', () => {
  assert.throws(() => quoteSell(mid(), mid().tokensSold + 1n), RangeError);
  assert.throws(() => quoteSell(fresh(200n), 1n), RangeError);
});

test('sell: gross ETH is capped at realEth (synthetic state)', () => {
  const state = { ...mid(), realEth: 10n ** 15n };
  assert.deepEqual(quoteSell(state, 100_000_000n * E18), {
    ethOut: 970_000_000_000_000n,
    fee: 30_000_000_000_000n,
  });
});

// ───────────── input validation ─────────────

test('amounts must be bigint', () => {
  assert.throws(() => quoteBuy(fresh(200n), 1), TypeError);
  assert.throws(() => quoteBuy(fresh(200n), '1'), TypeError);
  assert.throws(() => quoteSell(mid(), 1), TypeError);
  assert.throws(() => quoteSell(mid(), '1'), TypeError);
});

test('negative amounts throw RangeError', () => {
  assert.throws(() => quoteBuy(fresh(200n), -1n), RangeError);
  assert.throws(() => quoteSell(mid(), -1n), RangeError);
});

test('state fields must be bigint', () => {
  for (const key of ['virtualEth', 'virtualToken', 'realEth', 'tokensSold', 'feeBps']) {
    const bad = { ...mid(), [key]: Number(mid()[key]) };
    assert.throws(() => quoteBuy(bad, E18), TypeError, key);
    assert.throws(() => quoteSell(bad, E18), TypeError, key);
  }
});

test('feeBps above MAX_FEE_BPS throws RangeError', () => {
  assert.throws(() => quoteBuy({ ...mid(), feeBps: 501n }, E18), RangeError);
  assert.throws(() => quoteSell({ ...mid(), feeBps: 501n }, E18), RangeError);
});

test('state is not mutated', () => {
  const state = Object.freeze(mid());
  quoteBuy(state, E18);
  quoteSell(state, E18);
  assert.deepEqual(state, mid());
});
