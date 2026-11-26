# Implement `quoteBuy` and `quoteSell` for the Vorda bonding curve

## Goal

Vorda is a token launchpad on the GIWA Sepolia testnet. Tokens trade on a
bonding curve until the curve is sold out.

Implement the two stubs in `src/index.js` so that they return, off chain, the
exact result of a buy or a sell on that curve: the same integers the contract
produces, down to the last wei.

The bounty is paid through Mergit in test ETH on GIWA Sepolia when the pull
request is merged with CI green.

## Function signatures

```js
/**
 * @param {CurveState} state
 * @param {bigint} ethIn     ETH sent by the buyer, fee included, in wei
 * @returns {{ tokensOut: bigint, fee: bigint, refund: bigint }}
 */
export function quoteBuy(state, ethIn) {}

/**
 * @param {CurveState} state
 * @param {bigint} tokensIn  tokens sold back to the curve, in 1e-18 token
 * @returns {{ ethOut: bigint, fee: bigint }}
 */
export function quoteSell(state, tokensIn) {}
```

`CurveState`, all fields `bigint`:

| Field | Meaning |
| --- | --- |
| `virtualEth` | virtual ETH reserve, wei |
| `virtualToken` | virtual token reserve, 1e-18 token |
| `realEth` | ETH actually held by the curve, wei |
| `tokensSold` | tokens sold so far, `0..CURVE_SUPPLY` |
| `feeBps` | total fee in basis points, `platformFeeBps + creatorFeeBps`, `0..500` |

The constants `CURVE_SUPPLY`, `BPS` and `MAX_FEE_BPS` are already exported from
`src/index.js`. Keep them.

## Formula

All values are unsigned integers and `/` is integer division rounding down, as
in Solidity. Multiply first, then divide, in the order written. Use `BigInt`
only; no floating point.

```
CURVE_SUPPLY = 800_000_000 * 10^18
BPS          = 10_000
MAX_FEE_BPS  = 500

ceilDiv(a, b) = 0                  if a == 0
              = (a - 1) / b + 1    otherwise
```

### quoteBuy(state, ethIn)

```
if ethIn == 0 or tokensSold == CURVE_SUPPLY:
    return { tokensOut: 0, fee: 0, refund: 0 }

fee       = ethIn * feeBps / BPS
netIn     = ethIn - fee
remaining = CURVE_SUPPLY - tokensSold
tokensOut = virtualToken * netIn / (virtualEth + netIn)
refund    = 0

if tokensOut >= remaining:              # this buy sells out the curve
    tokensOut = remaining
    netIn     = ceilDiv(virtualEth * tokensOut, virtualToken - tokensOut)
    gross     = ceilDiv(netIn * BPS, BPS - feeBps)
    if gross > ethIn: gross = ethIn
    fee       = gross - netIn
    refund    = ethIn - gross

return { tokensOut, fee, refund }
```

### quoteSell(state, tokensIn)

```
if tokensIn > tokensSold:
    throw RangeError

if tokensIn == 0 or tokensSold == CURVE_SUPPLY:
    return { ethOut: 0, fee: 0 }

grossOut = virtualEth * tokensIn / (virtualToken + tokensIn)
if grossOut > realEth: grossOut = realEth
fee      = grossOut * feeBps / BPS
ethOut   = grossOut - fee

return { ethOut, fee }
```

### Input validation

- `ethIn`, `tokensIn` and every field of `state` must be a `bigint`; otherwise
  throw `TypeError`.
- Negative values, `feeBps > MAX_FEE_BPS` and `tokensSold > CURVE_SUPPLY` throw
  `RangeError`.
- Do not modify `state`.

The same spec, with more explanation, is in `README.md`. The contract is
verified on the explorer and is the reference if anything is unclear:
[`0xb36ee0ACEAe9685c3fCe5e6cB9e05D385f7bd5fB`](https://sepolia-explorer.giwa.io/address/0xb36ee0ACEAe9685c3fCe5e6cB9e05D385f7bd5fB)
(GIWA Sepolia, chain id `91342`), functions `_buy` and `sell`.

## Test vectors

[`test/vectors.json`](./test/vectors.json) contains 36 real trades from GIWA
Sepolia: 20 buys and 16 sells on 31 tokens. Each has the transaction hash, an
explorer link, the curve state at the block before the trade, the input and the
output the chain actually produced. `test/quote.test.js` requires exact equality
for every vector and adds edge cases (zero input, graduated curve, buys at and
beyond the graduation limit, selling more than was sold, input validation).

```sh
npm ci
npm test
```

## Definition of done

- All tests in `test/quote.test.js` pass in CI (Node 20 and 22).
- `test/quote.test.js` and `test/vectors.json` are not modified.
- No new runtime dependencies. `package.json` keeps zero `dependencies`.
- The implementation is in `src/index.js`, ESM, and uses `BigInt` for all math.
- The exported names and signatures stay as they are.

## Out of scope

- Reading state from the chain, RPC clients, wallet or transaction code.
- Price charts, market cap, slippage helpers, or quotes for the DEX pool after
  graduation.
- TypeScript conversion, build tooling, bundling, publishing to npm.
- Changes to CI workflows.

## Notes

- The tests and vectors were committed before this bounty was funded, so the
  target could not be adjusted afterwards.
- This runs on a testnet. The bounty is test ETH with no monetary value.
- One pull request per attempt. The first pull request that meets the
  definition of done is merged.
