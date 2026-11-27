/**
 * vorda-sdk: off-chain quotes for the Vorda launchpad bonding curve.
 *
 * All amounts are BigInt in the smallest unit: wei for ETH, 1e-18 for tokens
 * (every Vorda token has 18 decimals). The full formula is in README.md.
 */

/** Tokens sold through the curve before a token graduates (800,000,000 * 1e18). */
export const CURVE_SUPPLY = 800_000_000n * 10n ** 18n;

/** Basis point denominator. */
export const BPS = 10_000n;

/** Highest possible total fee: 100 bps platform + 400 bps creator. */
export const MAX_FEE_BPS = 500n;

/**
 * State of one token's curve, as stored by the launchpad contract.
 *
 * Read it with `getCurve(token)` and `platformFeeBps()` at the same block:
 * the first four fields come straight from `getCurve`, and
 * `feeBps = platformFeeBps() + getCurve(token).creatorFeeBps`.
 *
 * @typedef {object} CurveState
 * @property {bigint} virtualEth   Virtual ETH reserve, in wei.
 * @property {bigint} virtualToken Virtual token reserve, in 1e-18 token.
 * @property {bigint} realEth      ETH actually held by the curve, in wei.
 * @property {bigint} tokensSold   Tokens sold so far, 0..CURVE_SUPPLY.
 *                                 The curve is closed (graduated) when this equals CURVE_SUPPLY.
 * @property {bigint} feeBps       Total trade fee in basis points, 0..MAX_FEE_BPS.
 */

/**
 * @typedef {object} BuyQuote
 * @property {bigint} tokensOut Tokens the buyer receives.
 * @property {bigint} fee       Fee taken from the ETH sent, in wei.
 * @property {bigint} refund    ETH sent back to the buyer, in wei. Non-zero only
 *                              when the buy fills the rest of the curve.
 */

/**
 * @typedef {object} SellQuote
 * @property {bigint} ethOut ETH the seller receives after the fee, in wei.
 * @property {bigint} fee    Fee taken from the gross ETH, in wei.
 */

const STATE_FIELDS = ['virtualEth', 'virtualToken', 'realEth', 'tokensSold', 'feeBps'];

/** ceilDiv(a, b) = 0 if a == 0, otherwise (a - 1) / b + 1. BigInt division floors. */
function ceilDiv(a, b) {
  return a === 0n ? 0n : (a - 1n) / b + 1n;
}

/** Every state field must be a BigInt, otherwise TypeError. */
function checkStateTypes(state) {
  for (const field of STATE_FIELDS) {
    if (typeof state[field] !== 'bigint') {
      throw new TypeError(`state.${field} must be a bigint`);
    }
  }
}

/** Negative state fields, feeBps above MAX_FEE_BPS and tokensSold above
 *  CURVE_SUPPLY throw RangeError. */
function checkStateRanges(state) {
  for (const field of STATE_FIELDS) {
    if (state[field] < 0n) {
      throw new RangeError(`state.${field} must not be negative`);
    }
  }
  if (state.feeBps > MAX_FEE_BPS) {
    throw new RangeError('state.feeBps exceeds MAX_FEE_BPS');
  }
  if (state.tokensSold > CURVE_SUPPLY) {
    throw new RangeError('state.tokensSold exceeds CURVE_SUPPLY');
  }
}

/**
 * Exact result of `buy(token, ...)` with `msg.value = ethIn` on the given state.
 *
 * @param {CurveState} state
 * @param {bigint} ethIn ETH sent by the buyer, fee included, in wei.
 * @returns {BuyQuote}
 */
export function quoteBuy(state, ethIn) {
  if (typeof ethIn !== 'bigint') {
    throw new TypeError('ethIn must be a bigint');
  }
  checkStateTypes(state);
  if (ethIn < 0n) {
    throw new RangeError('ethIn must not be negative');
  }
  checkStateRanges(state);

  const { virtualEth, virtualToken, tokensSold, feeBps } = state;

  if (ethIn === 0n || tokensSold === CURVE_SUPPLY) {
    return { tokensOut: 0n, fee: 0n, refund: 0n };
  }

  let fee = (ethIn * feeBps) / BPS;
  let netIn = ethIn - fee;
  const remaining = CURVE_SUPPLY - tokensSold;
  let tokensOut = (virtualToken * netIn) / (virtualEth + netIn);
  let refund = 0n;

  if (tokensOut >= remaining) {
    // This buy sells out the curve: fill exactly what is left, charge only
    // what those tokens cost, and refund the rest of ethIn.
    tokensOut = remaining;
    netIn = ceilDiv(virtualEth * tokensOut, virtualToken - tokensOut);
    let gross = ceilDiv(netIn * BPS, BPS - feeBps);
    if (gross > ethIn) gross = ethIn;
    fee = gross - netIn;
    refund = ethIn - gross;
  }

  return { tokensOut, fee, refund };
}

/**
 * Exact result of `sell(token, tokensIn, ...)` on the given state.
 *
 * @param {CurveState} state
 * @param {bigint} tokensIn Tokens sold back to the curve, in 1e-18 token.
 * @returns {SellQuote}
 */
export function quoteSell(state, tokensIn) {
  if (typeof tokensIn !== 'bigint') {
    throw new TypeError('tokensIn must be a bigint');
  }
  checkStateTypes(state);
  if (tokensIn < 0n) {
    throw new RangeError('tokensIn must not be negative');
  }
  checkStateRanges(state);

  const { virtualEth, virtualToken, realEth, tokensSold, feeBps } = state;

  if (tokensIn > tokensSold) {
    throw new RangeError('tokensIn exceeds tokensSold');
  }

  if (tokensIn === 0n || tokensSold === CURVE_SUPPLY) {
    return { ethOut: 0n, fee: 0n };
  }

  let grossOut = (virtualEth * tokensIn) / (virtualToken + tokensIn);
  if (grossOut > realEth) grossOut = realEth;
  const fee = (grossOut * feeBps) / BPS;
  const ethOut = grossOut - fee;

  return { ethOut, fee };
}
