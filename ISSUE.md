Implement quoteBuy and quoteSell for the Vorda bonding curve

Vorda is a token launchpad on the GIWA Sepolia testnet. Tokens trade on a bonding curve until the curve sells out. This task is to implement the two stubs in src/index.js so they return, off chain, exactly what the contract produces for a buy or a sell, down to the last wei.

The bounty is paid in test ETH on GIWA Sepolia through Mergit once the pull request is merged with CI green.

Function signatures:

```js
// ethIn: ETH sent by the buyer in wei, fee included
export function quoteBuy(state, ethIn) // returns { tokensOut, fee, refund }

// tokensIn: tokens sold back to the curve, 18 decimals
export function quoteSell(state, tokensIn) // returns { ethOut, fee }
```

All values are BigInt. The state object has five fields: virtualEth and virtualToken are the virtual reserves, realEth is the ETH the curve actually holds, tokensSold is how much has been sold so far (0 to CURVE_SUPPLY), and feeBps is the total fee in basis points (platform plus creator, 0 to 500). CURVE_SUPPLY, BPS and MAX_FEE_BPS are already exported from src/index.js, please keep them.

Formula

Everything is unsigned integer math and division rounds down, like Solidity. Multiply first, then divide, in the order shown. No floating point.

```
CURVE_SUPPLY = 800_000_000 * 10^18
BPS          = 10_000
MAX_FEE_BPS  = 500

ceilDiv(a, b) = 0 if a == 0, otherwise (a - 1) / b + 1
```

quoteBuy(state, ethIn):

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

quoteSell(state, tokensIn):

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

Input checks: if the input or any state field is not a BigInt, throw TypeError. Negative values, feeBps above MAX_FEE_BPS and tokensSold above CURVE_SUPPLY throw RangeError. Do not modify state.

README.md has the same spec with a bit more explanation. If anything is unclear, the contract is the reference. It is verified on the explorer, see the _buy and sell functions:
https://sepolia-explorer.giwa.io/address/0xb36ee0ACEAe9685c3fCe5e6cB9e05D385f7bd5fB (GIWA Sepolia, chain id 91342)

Test vectors

test/vectors.json has 36 real trades from GIWA Sepolia, 20 buys and 16 sells across 31 tokens. Each one has the transaction hash, an explorer link, the curve state at the block before the trade, the input, and the output the chain actually produced. test/quote.test.js checks every vector for exact equality and adds edge cases: zero input, a graduated curve, buys at and past the graduation limit, selling more than was sold, and input validation.

To run them: npm ci, then npm test.

Done means

All tests in test/quote.test.js pass in CI on Node 20 and 22. The test files and vectors are not changed, package.json still has no runtime dependencies, the code lives in src/index.js as ESM with BigInt math, and the exported names and signatures stay as they are.

Not part of this task: reading state from the chain, RPC or wallet code, price charts or slippage helpers, quotes for the DEX pool after graduation, TypeScript, build tooling, npm publishing, and CI changes.

The tests and vectors were committed before the bounty was funded, so the target can't move afterwards. This is a testnet, the bounty is test ETH with no monetary value. The first pull request that meets the above gets merged.
