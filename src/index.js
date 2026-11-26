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

/**
 * Exact result of `buy(token, ...)` with `msg.value = ethIn` on the given state.
 *
 * @param {CurveState} state
 * @param {bigint} ethIn ETH sent by the buyer, fee included, in wei.
 * @returns {BuyQuote}
 */
export function quoteBuy(state, ethIn) {
  throw new Error('not implemented');
}

/**
 * Exact result of `sell(token, tokensIn, ...)` on the given state.
 *
 * @param {CurveState} state
 * @param {bigint} tokensIn Tokens sold back to the curve, in 1e-18 token.
 * @returns {SellQuote}
 */
export function quoteSell(state, tokensIn) {
  throw new Error('not implemented');
}
