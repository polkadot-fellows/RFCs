# RFC-0167: Snowbridge Circuit Breakers

|                 |                                                                                                                                                       |
| --------------- |-------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Start Date**  | 2026-05-28                                                                                                                                            |
| **Description** | Per-asset velocity caps on the Ethereum Gateway (P→E) and Asset Hub (E→P) that automatically throttle irregular Snowbridge flows in both directions. |
| **Authors**     | Snowbridge team                                                                                                                                       |

## Summary

Snowbridge does not currently have any proactive on-chain security measures in place, in case of irregular activity. This proposal suggests adding on-chain rate limiting, with the main goal being introducing artificial latency in case of an exploit, which gives the team time to halt the bridge. This RFC goes hand in hand with the reactive security measure that is introduced in [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md).

## Motivation

At the moment, there is no way to halt Snowbridge besides a Fellowship-driven whitelisted caller proposal to halt Snowbridge. A permissionless halt is proposed in [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md). A reactive halt might not be enough in the case of an exploit that already occurred, and saw millions of dollars flow out of the bridge. Consequently, this proposal adds a proactive security measure - delaying unusually large transfers in either direction (funds leaving the bridge on Ethereum, or bridged assets minted on Polkadot), to give the community time to inspect the transfer, and halt the bridge via the permissionless halt, if illegitimate.

The need for such a feature is supported by other popular bridges, e.g. (Wormhole's [Governor](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0007_governor.md), Axelar's [transfer-rate limits](https://www.axelar.network/blog/axelar-governance-explained) and LayerZero OFT's [`RateLimiter`](https://github.com/LayerZero-Labs/devtools/blob/main/packages/oapp-evm/contracts/oapp/utils/RateLimiter.sol)). Bridges that did not implement rate limiting, have seen exploits that might have been prevented with rate limiting (Nomad's [$190M exploit](https://cloud.google.com/blog/topics/threat-intelligence/dissecting-nomad-bridge-hack), Multichain, Ronin, Wormhole's own pre-Governor Solana exploit). This RFC adopts the best practices that other bridges have set: per-asset, refilling, governance-set.

The downside with circuit breakers is that legitimate transactions might be delayed from time to time. The circuit breaker settings will be calibrated to minimize this as much as possible. Even if larger transactions might be delayed, this is an acceptable tradeoff for protection against exploits.

## Stakeholders

- **Snowbridge maintainers**, who implement this proposal and suggest initial caps.
- **OpenGov**, who vote on per-asset caps via governance.
- **Snowbridge users and integrators**, who see a delay when an asset's cap is full in one direction. Main stakeholder here is Hydration.
- **Asset issuers** whose tokens are listed on Snowbridge and would have caps set against them.
- **Relayers and the existing relayer-operated monitoring stack**, which becomes the alerting backbone for cap events.

## Explanation

### Design

Each breaker limits, per asset, the gross amount leaving the bridge in the direction it protects: releases from the Gateway for P→E, mints on Asset Hub for E→P. Inflow in the other direction does not offset it (see "Why gross flow, not net flow"). ERC-20s, Ether and Polkadot native assets (PNAs, like DOT) are all covered.

The limit works like a leaky bucket. Each asset has a bucket that holds one cap. A transfer adds its amount to the bucket and goes through if it fits. The bucket leaks at a steady rate and empties in 24 hours. The leak is continuous and not tied to any transfer. A transfer that has gone through is done. The bucket level is only a record of how much has gone through recently. If a transfer does not fit, only that transfer is held. The asset is not locked as a whole. Other transfers of the same asset keep going through as long as they fit. A held transfer goes through once enough has leaked out for it to fit.

For example, with a cap of 5 per 24 hours: a transfer of 3 goes through (bucket at 3), a transfer of 1 goes through (bucket at 4), and a further transfer of 3 does not fit and is held. The bucket leaks 5 per 24 hours, about 1 every 5 hours. If nothing else goes through, after about 10 hours the bucket is down to 2 and the held 3 fits. The same leak sets the worst case: starting from an empty bucket, an attacker can send 5 at once and another 5 over the next 24 hours as the bucket leaks, so 10 in the first day. After that only what leaks out can be added, 5 per day.

The 24 hour period gives bridge operators time to notice, and matches Wormhole and LayerZero.

**Transfers larger than the cap.** A transfer of the cap or more can never fit in the bucket. It is not rejected, since a rejection would have to happen at the source before funds move, and a transfer from another parachain that fails on Asset Hub would leave the user's funds out of sync. Instead it is delayed at the destination for `amount / cap × 24 hours` and then goes through without counting against the bucket. Large transfers of the same asset are queued: each one's release time is fixed when it enters the queue as the later of now and the previous large transfer's release time, plus its own delay. So with a cap of 5, transfers of 15, 10 and 6 arriving on the same day are released on day 3, day 5 and day 6.2, which is 5 per day. Without the queue, many transfers of just over the cap could all be released after about 24 hours. A single release is still the whole transfer, so the worst case for an asset is one cap at once and one cap per 24 hours through the bucket, plus through the queue any amount that has been visible on-chain for at least one day per cap of its size. This is intended: the breaker delays large transfers, and the emergency pause stops fraudulent ones. A large transfer does not affect ordinary transfers of the same asset, but it does delay large transfers queued behind it. A griefer can queue one very large transfer to make honest large transfers wait, but the griefer's own funds are stuck for the same time.

**Held transfers.** A transfer that does not fit is held at the destination and goes through once it fits. Held transfers do not reserve capacity: capacity that frees up goes to the next transfer that fits, held or new. A large held transfer can therefore wait a long time while smaller ones keep taking capacity, however long it has waited. A user who expects this can send several smaller transfers instead. See "Why a refilling limit, not a lock" for why reservation was not adopted.

**Emergency pause and governance.** While the bridge is halted through the emergency pause ([RFC-0166](./0166-snowbridge-emergency-pause-pallet.md)), the breakers release nothing. Held and queued transfers stay where they are on both sides, even if there is capacity or their release time has come. RFC-0166 stops new transfers and holds in-flight messages on Bridge Hub, but a transfer already held by a breaker is past Bridge Hub, so the breakers observe the halt themselves. The halt reaches Ethereum asynchronously, so there is a short window before the Gateway breaker stops releasing. Governance can release or drop a held or queued transfer at any time, including during a halt. A released transfer goes through without counting against the bucket or the queue. A dropped transfer is cancelled and cannot be retried. Its funds stay at the source, and returning them, if the transfer turns out to be legitimate, is a separate governance action outside this RFC.

**Caps.** Each asset's cap is a fixed value set by governance through the Snowbridge System Frontend pallet on Asset Hub, which sets the Asset Hub cap and forwards the Gateway cap through Bridge Hub to Ethereum. The two directions have independent values, each in the asset's own units, so no oracle is needed. Values are proposed from historical flow data, for example the 99th percentile of daily gross outflow over the last 90 days plus a margin, and reviewed as traffic changes. Concrete values are out of scope of this RFC. Caps apply as soon as the upgrade is live. Assets start uncapped, and an uncapped asset has no protection (see "Future Directions" for default caps at registration).

When a cap changes, the amount of capacity already used is kept as is, so lowering a cap does not free up capacity and raising one does not take it away. Held transfers stay held and are checked against the new cap. A held transfer that is now at or above the new cap moves to the large-transfer queue, with its delay computed from the new cap from the time of the change. Queued large transfers keep the time they have already waited, and the remaining delay is recomputed with the new cap. A cap of zero holds every transfer of that asset until the cap is raised, which gives governance a per-asset pause. Removing an asset's cap releases its held and queued transfers.

### Gateway breaker (P→E)

Snowbridge's honey pot is primarily on Ethereum - all locked funds bridged from Ethereum to Polkadot are located in the Snowbridge gateway contract. For this reason, it makes sense to protect these assets from irregular activity, in the gateway contract. Additionally, Polkadot Native Assets (PNAs) like DOT are minted on Ethereum, backed by assets on Asset Hub, which also need protection against irregular minting.

If one considers the possible exploit types, they would all be protected by a circuit breaker, given the circuit breaker catches the outflow pattern:

- Forged BEEFY commitment
- MMR proof bug
- Gateway message decode bug
- PNA minting bug

The Gateway counts ERC-20 and Ether releases and PNA mints. Held transfers are not processed. Relayers retry them once there is capacity, and since relayers pick the transfer that pays them the most, the fee a user attaches decides the order among held transfers, the same as for ordinary relaying.

The Gateway breaker only covers P→E transfers. An exploit that bypasses Ethereum and submits fraudulent transactions to Bridge Hub is not seen by it, which is why a separate breaker on Asset Hub is required.

### Asset Hub breaker (E→P)

Asset Hub counts mints of Ethereum assets and releases of PNAs from the reserve, only when the transfer comes from Ethereum. Transfers of the same asset between Asset Hub and other parachains are not counted. Held transfers are held on-chain and released automatically, oldest first among those that fit. Until release, the funds are not credited to the beneficiary. The exact mechanism is left to the implementation.

### Gross flow

Each breaker counts only the flow in the direction it protects, and the two breakers operate independently. Net flow (outflow minus inflow) was considered, as used by Hydration's `pallet-circuit-breaker` and LayerZero's `RateLimiter`, so that two-way arbitrage and market-maker activity would not use up the cap. It was not adopted, for two reasons.

First, netting lets an attacker raise the cap. An attacker who has compromised one direction can create their own inflow to offset their fraudulent outflow. For example, with P→E compromised, the attacker deposits X tokens into the Gateway on Ethereum. This is a valid E→P transfer, so it reduces the Gateway's net counter by X, and the attacker receives X on Asset Hub. They then forge a release of `cap + X` from the Gateway. They keep the X on Asset Hub, so the deposit costs them nothing, and the amount they can drain grows with their capital. The Asset Hub breaker limits this, since the deposit counts against the Asset Hub cap, but the worst case then depends on available liquidity instead of being a fixed amount. Limiting the credit (never letting the counter go below zero, and allowing at most one cap of credit per 24 hours) makes the worst case 2× the net cap.

Second, Snowbridge traffic is mostly one-way, so netting would not allow much lower caps. We compared daily net flow with daily gross flow per asset across all 28,213 Snowbridge V2 transfers from June 2024 to September 2026. On busy days (95th percentile, last 90 days), net outflow was 0.9 to 1.0 of gross outflow for most assets (tBTC, wstETH, LINK, sUSDe and others), so netting would not allow a lower cap for them. The most two-way assets were USDT (0.33), USDC (0.39) and ETH (0.49). Even for these, the 2× worst case of limited netting is only 0 to 35% below a gross cap. Few addresses use the bridge in both directions, and the share of flow that cancels out has dropped (57% for ETH over the full history, 28% in the last 90 days).

With a gross cap, the worst case depends only on the cap, not on the other breaker or the attacker's capital, and it is simpler to implement and audit. If an asset's two-way volume grows enough that its gross cap fills up on legitimate traffic, limited netting can be enabled for that asset in a later upgrade (see "Future Directions").

### Refilling

A refilling limit was chosen over locking the asset for a set time once the cap is reached. Locking makes griefing cheap: one transfer that fills the cap blocks the asset for everyone for the whole period, and with gross limits a griefer can fill both directions by moving the same funds back and forth. With a refilling limit nothing is blocked outright. A griefer has to keep using up capacity as it leaks out, paying a fee on every transfer, and honest users compete for each unit that frees up, on fees on Ethereum and in arrival order on Asset Hub.

For the same reason, held transfers do not reserve capacity. If a held transfer counted as used the moment it was held, nothing else could pass until it drained. That guarantees it goes through within 24 hours, but brings the lock back: one transfer that does not fit would block the asset for up to 24 hours for a single fee, repeatable every day with the same funds. Caps are set well above normal daily volume, so a transfer that needs most of the cap at once is rare, and it is the kind of transfer the breaker is meant to slow down.

### Observability and alerting

The contract emits events when a transfer is held, when a transfer larger than the cap is queued, and when either is released, so the existing relayer infrastructure (which already indexes Gateway and AH/BH chain events) can watch for them and page on-call. A queued large transfer should page immediately, since it looks like an exploit.

## Drawbacks

- **Gas overhead**: Adding cap checks increases gas cost. Given the protection the circuit breaker gives bridge users, we believe this is an acceptable tradeoff.
- **Config tuning**: Setting the initial caps is tricky to decide and requires a balance between potential false positives, and missing legitimate exploits.
- **False positives:** There is the possibility of false positives and users' transactions being delayed.

## Testing, Security, and Privacy

- P→E cap Gateway tests: Solidity unit tests covering capacity used and refilled, holding and retry of a transfer that does not fit, delay and release of transfers larger than the cap including several queued at once, and behaviour while the bridge is halted.
- E→P Asset Hub circuit breaker unit tests: gross inflow tracking (mints of Ethereum assets, releases of PNAs), capacity used and refilled, holding and release of a mint that does not fit, delay and release of transfers larger than the cap, for both foreign assets and PNAs.
- Snowbridge System Frontend pallet unit tests for setting both the Gateway and Asset Hub `set_cap` governance entry.
- Polkadot SDK integration tests: Testing the governance command from Asset Hub, is sent to Bridge Hub and the outbound message to Ethereum is queued correctly.
- No privacy concerns with this proposal - all events are public.

## Performance, Ergonomics, and Compatibility

### Performance

- **Gateway:** ~10-15k extra gas per ERC20 release and PNA mint of a capped asset. A transfer larger than the cap also records its release time, which costs more, but such transfers are rare. Uncapped assets pay no extra gas.
- **Asset Hub:** a per-asset counter read and write per E→P mint of a capped asset, negligible. Uncapped assets are untouched.

### Ergonomics

User-facing: under normal operation, invisible. When the cap is full, the user sees a delayed transaction. A transfer larger than the cap is delayed in proportion to its size, and longer if other large transfers of the same asset are queued ahead of it.

Operator-facing: cap configuration is a governance-driven workflow. Bridge monitoring should surface each asset's bucket level against its cap, so maintainers can spot the bucket filling up before transfers are held.

### Compatibility

- **Ethereum Gateway (P→E breaker):** This is a major Ethereum contract change and requires a gateway upgrade. Adds the per-asset caps, a command to set cap values, outflow tracking, checking each transfer against the cap, and a per-asset queue for transfers larger than the cap, with each one's release time fixed on entry.
- **Asset Hub (E→P breaker):** Adds a circuit-breaker pallet that meters E→P inflow per asset, holds transfers that do not fit, and delays transfers larger than the cap. Ordinary transfers between Asset Hub and other parachains are not counted. The Snowbridge System Frontend pallet gains a root-origin `set_cap` extrinsic (mirroring its `set_operating_mode`) that sets the local cap and proxies the *Gateway* cap command to Bridge Hub.
- **Bridge Hub:** Adds a `set_cap` extrinsic (in the Ethereum System V2 pallet) that relays the Gateway cap command on to Ethereum.

## Prior Art and References

- Hydration's [`pallet-circuit-breaker`](https://github.com/galacticcouncil/hydration-node/tree/master/pallets/circuit-breaker), a per-block net-volume limit. Considered and not adopted for this RFC (see "Why gross flow, not net flow").
- Wormhole's [Governor](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0007_governor.md) and [Global Accountant](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0011_accountant.md): rolling-24h USD-denominated per-chain cap (Governor) layered with a cumulative balance check (Accountant). The Governor originally tracked only outbound transfers (gross flow). Its later [flow-cancelling extension](https://wormhole.com/blog/understanding-the-flow-canceling-governor-in-wormhole) lets inbound transfers offset outbound ones, but only for allow-listed tokens (some stablecoins) on allow-listed chain pairs. It was added because round-trip arbitrage and settlement traffic kept several chains near 100% of their limits. Snowbridge could add netting per asset in the same way later. The Governor also delays transactions above a size threshold by a flat 24 hours instead of counting them against the daily limit. This RFC borrows that idea, with the delay proportional to size and large transfers queued one after another.
- LayerZero OFT [`RateLimiter`](https://github.com/LayerZero-Labs/devtools/blob/main/packages/oapp-evm/contracts/oapp/utils/RateLimiter.sol): per-pathway `(limit, window)` with linear refill, raw token denomination, inbound transfers crediting against outbound (net-flow). This RFC uses the same refilling limit, without the netting.
- Axelar's [governance-controlled transfer-rate limits](https://www.axelar.network/blog/axelar-governance-explained): a multisig sets per-token flow limits on-chain. Comparable to a Polkadot-governance-controlled bridge.
- The [Nomad bridge exploit post-mortem](https://cloud.google.com/blog/topics/threat-intelligence/dissecting-nomad-bridge-hack) ($190M drained within hours, no velocity cap), illustrative of the failure mode this RFC's primary cap is designed to prevent.

## Unresolved Questions

None at this time.

## Future Directions and Related Material
- **Asset-class default caps at registration.** Add an "asset class" field to the asset registry (stablecoin, ETH-LST, long-tail, etc.) with a per-class default cap so new assets get a starting cap until governance sets one.
- **Per-asset capacity reservation.** If large transfers of a specific asset are regularly starved by smaller ones, reservation could be added for that asset, so held transfers count as used and go through within 24 hours (see "Why a refilling limit, not a lock" for the trade-off). This is a Gateway upgrade, not a setting: the Gateway would need to record held messages and their amounts, plus a per-asset flag. The per-message release time already recorded for transfers larger than the cap could be reused.
- **Per-asset limited netting.** If an asset's two-way volume grows enough that its gross cap fills up on legitimate traffic, governance could enable netting for that asset. The counter would never go below zero and credit from the other direction would be limited to one cap per 24 hours, so the worst case is 2× the cap.
- **Companion RFC:** [RFC-0166, Snowbridge Emergency Pause Pallet](./0166-snowbridge-emergency-pause-pallet.md), specifies the reactive layer that this preventive layer composes with.
