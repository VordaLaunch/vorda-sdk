# vorda-sdk

Vorda is a token launchpad on the GIWA Sepolia testnet. Each token starts on a
bonding curve and moves to a DEX pool once the curve is sold out.

`vorda-sdk` is a small JavaScript library that computes, off chain, exactly what
a trade on that curve returns. It has no runtime dependencies and uses `BigInt`
for every amount.

Status: `quoteBuy` and `quoteSell` are stubs. Implementing them is an open
bounty, see [ISSUE.md](./ISSUE.md).

## Run the tests

Node 20 or newer.

```sh
npm ci
npm test
```

The tests replay real trades from GIWA Sepolia
([test/vectors.json](./test/vectors.json)) and require the exact on-chain result.
Until the functions are implemented, the tests fail.

## API

```js
import { quoteBuy, quoteSell } from 'vorda-sdk';

const state = {
  virtualEth,   // bigint, wei
  virtualToken, // bigint, 1e-18 token
  realEth,      // bigint, wei
  tokensSold,   // bigint, 1e-18 token
  feeBps,       // bigint, platformFeeBps + creatorFeeBps
};

quoteBuy(state, ethIn);     // => { tokensOut, fee, refund }
quoteSell(state, tokensIn); // => { ethOut, fee }
```

Reading `state` from the chain, both calls at the same block:

- `getCurve(token)` on the launchpad returns `virtualEth`, `virtualToken`,
  `realEth`, `tokensSold` and `creatorFeeBps`.
- `platformFeeBps()` on the launchpad returns the platform fee.
- `feeBps = platformFeeBps + creatorFeeBps`.

The library does not talk to the chain; the caller supplies `state`.

## Contract

| | |
| --- | --- |
| Network | GIWA Sepolia (testnet), chain id `91342` |
| Launchpad | [`0xb36ee0ACEAe9685c3fCe5e6cB9e05D385f7bd5fB`](https://sepolia-explorer.giwa.io/address/0xb36ee0ACEAe9685c3fCe5e6cB9e05D385f7bd5fB) |
| RPC | `https://sepolia-rpc.giwa.io` |

The contract source is verified on the explorer. The spec below is complete on
its own; the contract's `_buy` and `sell` functions are the reference if anything
here is unclear.

## Formula

The curve is a constant product (`x * y = k`) with virtual reserves. All values
are unsigned integers and `/` is integer division rounding down, exactly as in
Solidity. Multiply first, then divide, in the order written.

Constants:

```
CURVE_SUPPLY = 800_000_000 * 10^18   tokens sold through the curve
BPS          = 10_000
MAX_FEE_BPS  = 500                   100 platform + 400 creator, at most

ceilDiv(a, b) = 0                  if a == 0
              = (a - 1) / b + 1    otherwise
```

A new curve starts at `virtualEth = 0.5 * 10^18`,
`virtualToken = 1_073_000_000 * 10^18`, `realEth = 0`, `tokensSold = 0`. Do not
hardcode these; use the `state` you are given.

### quoteBuy(state, ethIn)

`ethIn` is the ETH the buyer sends, fee included.

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

So the fee is taken from the input first, and the remainder goes into the
curve. A buy that would take more than what is left on the curve is filled
partially: the buyer gets exactly the remaining tokens, pays only what they
cost, and the rest of `ethIn` is refunded.

### quoteSell(state, tokensIn)

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

The fee is taken from the output. `ethOut` is what the seller receives.

### Input validation

- `ethIn`, `tokensIn` and every field of `state` must be a `bigint`, otherwise
  `TypeError`.
- Negative values, `feeBps > MAX_FEE_BPS` and `tokensSold > CURVE_SUPPLY` throw
  `RangeError`.
- `state` must not be modified.

### Differences from sending the transaction

A quote of zero means the trade cannot be executed. On chain, `buy` and `sell`
revert when the input is zero, when the curve has graduated, or when the output
rounds down to zero. The quote functions return zeros in those cases, like the
contract's own `quoteBuy` and `quoteSell` views. The one exception is selling
more than `tokensSold`, which throws.

### After a trade

Not needed for the quotes, but useful for chaining them:

```
buy:   virtualEth += netIn      virtualToken -= tokensOut
       realEth    += netIn      tokensSold   += tokensOut

sell:  virtualEth -= grossOut   virtualToken += tokensIn
       realEth    -= grossOut   tokensSold   -= tokensIn
```

## Test vectors

`test/vectors.json` holds 36 real trades (20 buys, 16 sells) on 31 tokens: fresh
curves, small and large sizes, every part of the curve, buys that sell out the
curve with a refund, and total fees from 100 to 500 bps. Each vector has the
transaction hash, an explorer link, the block, the token, the curve state at the
block before the trade, the input and the expected output.

How a vector maps to the chain:

- `state` is `getCurve(token)` and `platformFeeBps()` read at `stateBlock`
  (the block before the trade).
- Buy: `ethIn` is `msg.value`. `tokensOut` and `fee` are the `tokenAmount` and
  `fee` fields of the `Trade` event. `refund = ethIn - Trade.ethAmount - Trade.fee`
  (for buys, `Trade.ethAmount` is the net amount that entered the curve).
- Sell: `tokensIn` and `fee` are the `tokenAmount` and `fee` fields of the
  `Trade` event. `ethOut = Trade.ethAmount - Trade.fee` (for sells,
  `Trade.ethAmount` is the gross amount that left the curve).
- A vector with `"method": "createToken"` is the first buy made in the same
  transaction that created the token. Its state is the initial curve from the
  `TokenCreated` event.

Anyone can re-check a vector against the public RPC.

## Contributing / bounty

The first task is posted as a GitHub issue with a bounty paid through Mergit on
GIWA Sepolia, in test ETH. The issue text is in [ISSUE.md](./ISSUE.md). The task
is done when every test passes in CI without changes to the test files or the
vectors. The tests and vectors were committed before the bounty was funded.

Pull requests outside the bounty are welcome too. Keep the library free of
runtime dependencies.

## License

MIT
