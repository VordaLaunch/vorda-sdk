Vorda is a token launchpad on the GIWA Sepolia testnet. Each token starts on a bonding curve and moves to a DEX pool once the curve is sold out.

vorda-sdk is a small JavaScript library that computes, off chain, exactly what a trade on that curve returns. It has no runtime dependencies and uses BigInt for every amount.

Right now quoteBuy and quoteSell are stubs. Implementing them is an open bounty: https://github.com/VordaLaunch/vorda-sdk/issues/1

Running the tests

You need Node 20 or newer.

```sh
npm ci
npm test
```

The tests replay real trades from GIWA Sepolia (test/vectors.json) and expect the exact on-chain result. They fail until the two functions are implemented.

API

```js
import { quoteBuy, quoteSell } from 'vorda-sdk';

const state = {
  virtualEth,   // bigint, wei
  virtualToken, // bigint, 18 decimals
  realEth,      // bigint, wei
  tokensSold,   // bigint, 18 decimals
  feeBps,       // bigint, platformFeeBps + creatorFeeBps
};

quoteBuy(state, ethIn);     // => { tokensOut, fee, refund }
quoteSell(state, tokensIn); // => { ethOut, fee }
```

To read the state from the chain, call getCurve(token) and platformFeeBps() on the launchpad at the same block. getCurve gives virtualEth, virtualToken, realEth, tokensSold and creatorFeeBps, and feeBps is platformFeeBps plus creatorFeeBps. The library itself never talks to the chain, the caller passes the state in.

Contract

The launchpad runs on GIWA Sepolia (testnet, chain id 91342) at 0xb36ee0ACEAe9685c3fCe5e6cB9e05D385f7bd5fB. The source is verified on the explorer:
https://sepolia-explorer.giwa.io/address/0xb36ee0ACEAe9685c3fCe5e6cB9e05D385f7bd5fB

Public RPC: https://sepolia-rpc.giwa.io

The spec below is complete on its own. If anything is unclear, the contract's _buy and sell functions are the reference.

Formula

The curve is a constant product (x * y = k) with virtual reserves. All values are unsigned integers and division rounds down, exactly as in Solidity. Multiply first, then divide, in the order written.

```
CURVE_SUPPLY = 800_000_000 * 10^18   tokens sold through the curve
BPS          = 10_000
MAX_FEE_BPS  = 500                   100 platform + 400 creator, at most

ceilDiv(a, b) = 0 if a == 0, otherwise (a - 1) / b + 1
```

A new curve starts with virtualEth at 0.5 ETH, virtualToken at 1,073,000,000 tokens, and realEth and tokensSold at zero. Don't hardcode these, use the state you are given.

quoteBuy(state, ethIn), where ethIn is the ETH the buyer sends, fee included:

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

The fee comes off the input first and the rest goes into the curve. A buy that asks for more than what is left on the curve is filled partially: the buyer gets exactly the remaining tokens, pays only what they cost, and gets the rest of ethIn back.

quoteSell(state, tokensIn):

```
if tokensIn > tokensSold:
    throw RangeError                    # the contract reverts

if tokensIn == 0 or tokensSold == CURVE_SUPPLY:
    return { ethOut: 0, fee: 0 }

grossOut = virtualEth * tokensIn / (virtualToken + tokensIn)
if grossOut > realEth: grossOut = realEth
fee      = grossOut * feeBps / BPS
ethOut   = grossOut - fee

return { ethOut, fee }
```

Here the fee comes off the output, and ethOut is what the seller receives.

Input checks: the input and every state field must be a BigInt, otherwise throw TypeError. Negative values, feeBps above MAX_FEE_BPS and tokensSold above CURVE_SUPPLY throw RangeError. The state object must not be modified.

A quote of zero means the trade can't go through. On chain, buy and sell revert when the input is zero, when the curve has graduated, or when the output rounds down to zero. The quote functions return zeros in those cases, the same way the contract's own quoteBuy and quoteSell views do. The one exception is selling more than tokensSold, which throws.

If you want to chain quotes, this is how the state changes after a trade:

```
buy:   virtualEth += netIn      virtualToken -= tokensOut
       realEth    += netIn      tokensSold   += tokensOut

sell:  virtualEth -= grossOut   virtualToken += tokensIn
       realEth    -= grossOut   tokensSold   -= tokensIn
```

Test vectors

test/vectors.json holds 36 real trades, 20 buys and 16 sells, on 31 tokens. They cover fresh curves, small and large sizes, every part of the curve, buys that sell out the curve with a refund, and total fees from 100 to 500 bps. Each vector has the transaction hash, an explorer link, the block, the token, the curve state at the block before the trade, the input and the expected output.

The state in each vector is what getCurve(token) and platformFeeBps() returned at stateBlock, the block right before the trade. For a buy, ethIn is msg.value, tokensOut and fee come from the Trade event, and refund is ethIn minus Trade.ethAmount minus Trade.fee (for buys, Trade.ethAmount is the net amount that went into the curve). For a sell, tokensIn and fee come from the Trade event and ethOut is Trade.ethAmount minus Trade.fee (for sells, Trade.ethAmount is the gross amount that left the curve). A vector marked "method": "createToken" is the first buy made in the same transaction that created the token, so its state is the initial curve from the TokenCreated event.

Anyone can re-check a vector against the public RPC.

Contributing

The first task is a GitHub issue with a bounty paid in test ETH on GIWA Sepolia through Mergit. It's done when every test passes in CI without touching the test files or the vectors. The tests and vectors were committed before the bounty was funded.

Other pull requests are welcome too, just keep the library free of runtime dependencies.

License: MIT
