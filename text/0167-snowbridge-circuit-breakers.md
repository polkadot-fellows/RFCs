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

The need for such a feature is supported by other popular bridges, e.g. (Wormhole's [Governor](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0007_governor.md), Axelar's [transfer-rate limits](https://www.axelar.network/blog/axelar-governance-explained) and LayerZero OFT's [`RateLimiter`](https://github.com/LayerZero-Labs/devtools/blob/main/packages/oapp-evm/contracts/oapp/utils/RateLimiter.sol)). Bridges that did not implement rate limiting, have seen exploits that might have been prevented with rate limiting (Nomad's [$190M exploit](https://cloud.google.com/blog/topics/threat-intelligence/dissecting-nomad-bridge-hack), Multichain, Ronin, Wormhole's own pre-Governor Solana exploit). This RFC adopts the best practices that other bridges have set: per-asset, rolling-window, governance-set, auto-lifting.

The downside with circuit breakers is that legitimate transactions might be delayed from time to time. The circuit breaker settings will be calibrated to minimize this as much as possible. Even if larger transactions might be delayed, this is an acceptable tradeoff for protection against exploits.

## Stakeholders

- **Snowbridge maintainers**, who implement this proposal and suggest initial caps.
- **OpenGov**, who vote on per-asset caps via governance.
- **Snowbridge users and integrators**, who experience a tripped cap as a temporary lockdown of one asset+direction. Main stakeholder here is Hydration.
- **Asset issuers** whose tokens are listed on Snowbridge and would have caps set against them.
- **Relayers and the existing relayer-operated monitoring stack**, which becomes the alerting backbone for cap events.

## Explanation

### Gateway (Ethereum contract) Circuit Breaker

Snowbridge's honey pot is primarily on Ethereum - all locked funds bridged from Ethereum to Polkadot are located in the Snowbridge gateway contract. For this reason, it makes sense to protect these assets from irregular activity, in the gateway contract. Additionally, Polkadot Native Assets (PNAs) like DOT are minted on Ethereum, backed by assets on Asset Hub, which also need protection against irregular minting.

If one considers the possible exploit shapes, they would all be protected by a circuit breaker, given the circuit breaker catches the outflow pattern:

- Forged BEEFY commitment
- MMR proof bug
- Gateway message decode bug
- PNA minting bug

The implementation should track per-asset, gross outflow over a rolling 24 hour window, both ERC-20s and Ether, and PNAs (Polkadot native assets, like DOT). This part of the circuit breaker is specifically for P->E transfers. For each asset, only the outflow (ERC-20 and Ether releases, PNA mints) is tracked over the window. Inflow in the opposite direction does not offset it.

A 24 hour window is suggested, as the delay needs to be long enough for bridge operators to notice. The window matches bridges like Wormhole and LayerZero's behaviour. Assets should be tracked by denomination, not USD, so that it doesn't create reliance on oracles. Assets without a cap ignore the circuit breaker pattern, so that the tracking is opt-in by way of governance vote.

The suggested cap formula is `cap = max(5x trailing-7-day-median hourly gross outflow, configured floor per asset)`.

- The 5x multiplier is high enough to not trip on legitimate spikes.
- The floor prevents low-volume-but-high-value assets from having too low a cap relative to their total locked value.
- Both factors are governance-settable per asset; no automatic defaults at asset registration (new assets start uncapped).

If the cap is tripped, asset movement is locked for a certain set time (proposed 24 hours). Other asset transfers continue as normal. Once the locked time elapses, the asset transfer continues as normal. 

P→E transfers that would exceed the cap are not processed. Relayers retry them once capacity is available.

The reason why the asset lock auto-lifts is that this mechanism is a buy-us-time defense, not a defense in and of itself. The inverse also adds unnecessary burden on governance - not auto-resuming would require the Fellowship/OpenGov to submit unlock referendums, which is added admin for little gain.

The increased gas cost to add the circuit breaker is estimated to be around ~10-15k extra (read and write the per-asset counter and check the cap).

It is worth noting that the gateway circuit breaker only covers P->E transfers because in the case of E->P transfers, where an exploit bypasses Ethereum and submits fraudulent transactions to Bridge Hub, the circuit breaker on Ethereum won't help. This is why a separate circuit breaker on Asset Hub is also required.

### Asset Hub Circuit Breaker

The Asset Hub breaker caps the gross amount of each bridged asset that arrives from Ethereum over a rolling window:

- Ethereum assets: mint = minted (E→P).
- PNAs: release = released from the reserve (E→P).

P→E transfers (burns of Ethereum assets, locks of PNAs) do not offset the meter.

The cap works exactly like the Gateway breaker: per-asset, tracked by denomination (no oracle), gross flow, a governance-set cap with a floor, and a 24h auto-lift.

The breaker keeps a gross meter per asset: value arriving from Ethereum (E→P). Transfers of the same asset between Asset Hub and other parachains are not counted. A flow only counts when it comes from Ethereum.

When an inbound (E→P) transfer would breach the cap, it is not delivered. It is held, and completed automatically once the cap is no longer breached. A backlog drains gradually rather than all at once, so releasing held transfers cannot immediately re-trip the cap. Until release, the funds are not credited to the beneficiary, so a transfer later judged malicious can simply be dropped. Unlike the Gateway, where relayers retry held transfers, Asset Hub holds them on-chain. The exact mechanism is left to the implementation.

Caps are set through a root-gated `set_cap` extrinsic on the Snowbridge System Frontend pallet on Asset Hub, the same pallet the Gateway cap is routed through (see "Caps set by Governance"), so both caps share one governance surface. Trip and lift events are emitted so the existing relayer monitoring can watch for them and page on-call, and halt the bridge via the emergency pause if the spike turns out to be real.

### Gross flow

Each breaker counts only the flow in the direction it protects, and the two breakers operate independently. Net flow (outflow minus inflow) was considered, as used by Hydration's `pallet-circuit-breaker` and LayerZero's `RateLimiter`, so that two-way arbitrage and market-maker activity would not use up the cap. It was not adopted, for two reasons.

First, netting lets an attacker raise the cap. An attacker who has compromised one direction can create their own inflow to offset their fraudulent outflow. For example, with P→E compromised, the attacker deposits X tokens into the Gateway on Ethereum. This is a valid E→P transfer, so it reduces the Gateway's net counter by X, and the attacker receives X on Asset Hub. They then forge a release of `cap + X` from the Gateway. They keep the X on Asset Hub, so the deposit costs them nothing, and the amount they can drain grows with their capital. The Asset Hub breaker limits this, since the deposit counts against the Asset Hub cap, but the worst case then depends on available liquidity instead of being a fixed amount. Limiting the credit (never letting the counter go below zero, and capping credit at the cap) makes the worst case 2× the net cap.

Second, Snowbridge traffic is mostly one-way, so netting would not allow much lower caps. We compared daily net flow with daily gross flow per asset across all 28,213 Snowbridge V2 transfers from June 2024 to September 2026. On busy days (95th percentile, last 90 days), net outflow was 0.9 to 1.0 of gross outflow for most assets (tBTC, wstETH, LINK, sUSDe and others), so netting would not allow a lower cap for them. The most two-way assets were USDT (0.33), USDC (0.39) and ETH (0.49). Even for these, the 2× worst case of limited netting is only 0 to 35% below a gross cap. Few addresses use the bridge in both directions, and the share of flow that cancels out has dropped (57% for ETH over the full history, 28% in the last 90 days).

With a gross cap, the worst case is the cap itself, regardless of the other breaker or the attacker's capital, and it is simpler to implement and audit. If an asset's two-way volume grows enough that its gross cap trips on legitimate traffic, limited netting can be enabled for that asset in a later upgrade (see "Future Directions").

### Caps set by Governance

Caps are set via governance, through the usual method of using the Ethereum Frontend pallet on Asset Hub, which sets the Asset Hub circuit breaker cap, as well as sends a message to the Ethereum System V2 pallet on Bridge Hub, which in turn sends the message to Ethereum. Concrete cap values per asset are deliberately out of scope of this RFC, which specifies the cap mechanism's shape and the framework for choosing values, not the values themselves. Token-denominated cap values are decided and ratified by community vote at deployment and at re-vote, if necessary.

For the initial contract upgrade, the 24h asset flow will not be accurate (since it needs 24 hours to build up a true view of flows), but the governance-decided floor cap will be used (as part of the cap calculation).

### Observability and alerting

The contract emits events at trip and lift so the existing relayer infrastructure (which already indexes Gateway and AH/BH chain events) can watch for them and page on-call.

## Drawbacks

- **Gas overhead**: Adding cap checks increases gas cost. Given the protection the circuit breaker gives bridge users, we believe this is an acceptable tradeoff.
- **Config tuning**: Setting the initial caps is tricky to decide and requires a balance between potential false positives, and missing legitimate exploits.
- **False positives:** There is the possibility of false positives and users' transactions being delayed.

## Testing, Security, and Privacy

- P→E cap Gateway tests: Solidity unit tests, covering all the possible scenarios.
- E→P Asset Hub circuit breaker unit tests: gross-mint tracking, cap reached and auto-lift, holding and retry of an over-cap mint, for both foreign assets and PNAs.
- Ethereum System Frontend pallet unit tests for setting both the Gateway and Asset Hub `set_cap` governance entry.
- Polkadot SDK integration tests: Testing the governance command from Asset Hub, is sent to Bridge Hub and the outbound message to Ethereum is queued correctly.
- No privacy concerns with this proposal - all events are public.

## Performance, Ergonomics, and Compatibility

### Performance

- **Gateway:** ~10-15k extra gas per ERC20 release and PNA mint of a capped asset. Uncapped assets pay no extra gas.
- **Asset Hub:** a per-asset counter read and write per E→P mint of a capped asset, negligible. Uncapped assets are untouched.

### Ergonomics

User-facing: under normal operation, invisible. On a trip, the user sees a delayed transaction.

Operator-facing: cap configuration is a governance-driven workflow. Bridge monitoring should surface "current flow vs cap" per asset so maintainers can spot a trip becoming likely before it happens.

### Compatibility

- **Ethereum Gateway (P→E breaker):** This is a major Ethereum contract change and requires a gateway upgrade. Adds the per-asset caps, a command to set cap values, outflow tracking and checking each transfer against the cap.
- **Asset Hub (E→P breaker):** Adds a circuit-breaker pallet that meters E→P inflow per asset and holds over-cap transfers. Ordinary transfers between Asset Hub and other parachains are not counted. The Snowbridge System Frontend pallet gains a root-origin `set_cap` extrinsic (mirroring its `set_operating_mode`) that sets the local cap and proxies the *Gateway* cap command to Bridge Hub.
- **Bridge Hub:** Adds a `set_cap` extrinsic (in the Ethereum System V2 pallet) that relays the Gateway cap command on to Ethereum.

## Prior Art and References

- Hydration's [`pallet-circuit-breaker`](https://github.com/galacticcouncil/hydration-node/tree/master/pallets/circuit-breaker), a per-block net-volume limit. Considered and not adopted for this RFC (see "Gross flow, not net flow").
- Wormhole's [Governor](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0007_governor.md) and [Global Accountant](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0011_accountant.md): rolling-24h USD-denominated per-chain cap (Governor) layered with a cumulative balance check (Accountant). The Governor originally tracked only outbound transfers (gross flow). Its later [flow-cancelling extension](https://wormhole.com/blog/understanding-the-flow-canceling-governor-in-wormhole) lets inbound transfers offset outbound ones, but only for allow-listed tokens (some stablecoins) on allow-listed chain pairs. It was added because round-trip arbitrage and settlement traffic kept several chains near 100% of their limits. Snowbridge could add netting per asset in the same way later.
- LayerZero OFT [`RateLimiter`](https://github.com/LayerZero-Labs/devtools/blob/main/packages/oapp-evm/contracts/oapp/utils/RateLimiter.sol): per-pathway `(limit, window)` with linear refill, raw token denomination, inbound transfers crediting against outbound (net-flow).
- Axelar's [governance-controlled transfer-rate limits](https://www.axelar.network/blog/axelar-governance-explained): a multisig sets per-token flow limits on-chain. Comparable to a Polkadot-governance-controlled bridge.
- The [Nomad bridge exploit post-mortem](https://cloud.google.com/blog/topics/threat-intelligence/dissecting-nomad-bridge-hack) ($190M drained within hours, no velocity cap), illustrative of the failure mode this RFC's primary cap is designed to prevent.

## Unresolved Questions

None at this time.

## Future Directions and Related Material
- **Asset-class default caps at registration.** Add an "asset class" field to the asset registry (stablecoin, ETH-LST, long-tail, etc.) with a per-class default cap multiplier so new asset listings auto-cap at a sensible starting value pending governance refinement.
- **Per-asset limited netting.** If an asset's two-way volume grows enough that its gross cap trips on legitimate traffic, governance could enable netting for that asset. The counter would never go below zero and credit from the other direction would be capped at the cap, so the worst case is 2× the cap.
- **Companion RFC:** the [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md) (PR #166) specifies the reactive layer that this preventive layer composes with.
