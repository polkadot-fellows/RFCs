# RFC-0167: Snowbridge Circuit Breakers

|                 |                                                                                                                                                       |
| --------------- |-------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Start Date**  | 2026-05-28                                                                                                                                            |
| **Description** | Per-asset velocity caps on the Ethereum Gateway (P→E) and Asset Hub (E→P) that automatically throttle irregular Snowbridge flows in both directions. |
| **Authors**     | Snowbridge team                                                                                                                                       |

## Summary

Snowbridge does not currently have any proactive on-chain security measures in place, in case of irregular activity. This proposal suggests adding on-chain rate limiting, with the main goal being reducing artificial latency in case of an exploit, which gives the team time to halt the bridge. This RFC goes hand in hand with the reactive security measure that is introduced in [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md).

## Motivation

At the moment, there is no way to halt Snowbridge besides a Fellowship-driven whitelisted caller proposal to halt Snowbridge. A permissionless halt is proposed in [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md). A reactive halt might not be enough in the case of an exploit that already occurred, and saw millions of dollars flow out of the bridge. Consequently, this proposal adds a proactive security measure - delaying unusual large net transfers in either direction (funds leaving the bridge on Ethereum, or bridged assets minted on Polkadot), to give the community time to inspect the transfer, and halt the bridge via the permissionless halt, if illegitimate.

The need for such a feature is supported by other popular bridges, e.g. (Wormhole's [Governor](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0007_governor.md), Axelar's [transfer-rate limits](https://www.axelar.network/blog/axelar-governance-explained) and LayerZero OFT's [`RateLimiter`](https://github.com/LayerZero-Labs/devtools/blob/main/packages/oapp-evm/contracts/oapp/utils/RateLimiter.sol)). Bridges that did not implement rate limiting, have seen exploits that might have been prevented with rate limiting (Nomad's [$190M exploit](https://cloud.google.com/blog/topics/threat-intelligence/dissecting-nomad-bridge-hack), Multichain, Ronin, Wormhole's own pre-Governor Solana exploit). This RFC adopts the best practices that other bridges have set: per-asset, rolling-window, governance-set, auto-lifting.

The downside with circuit breakers is that legitimate transactions might be delayed from time to time. The circuit breaker settings will be calibrated to minimize this as much as possible. Even if larger transactions might be delayed, this is an acceptable tradeoff for protection against exploits.

## Stakeholders

- **Snowbridge maintainers**, who implement this proposal and suggest initial caps.
- **Polkadot Fellowship and OpenGov**, who vote on per-asset caps via governance.
- **Snowbridge users and integrators**, who experience a tripped cap as a temporary lockdown of one asset+direction. Main stakeholder here is Hydration.
- **Asset issuers** whose tokens are listed on Snowbridge and would have caps set against them.
- **Relayers and the existing relayer-operated monitoring stack**, which becomes the alerting backbone for cap events.

## Explanation

### Gateway Circuit Breaker

Snowbridge's honey pot is primarily on Ethereum - all locked funds bridged from Ethereum to Polkadot are located in the Snowbridge gateway contract. For this reason, it makes sense to protect these assets from irregular activity, in the gateway contract. Additionally, Polkadot Native Assets (PNAs) like DOT are minted on Ethereum, backed by assets on Asset Hub, which also need protection against irregular minting.

If one considers the possible exploit shapes, they would all be protected by a circuit breaker, given the circuit breaker catches the outflow pattern:

- Forged BEEFY commitment
- MMR proof bug
- Gateway message decode bug
- PNA minting bug

The implementation should track per-asset, net outflow over a rolling 24 hour window, both ERC-20s and Ether, and PNAs (Polkadot native assets, like DOT). This part of the circuit breaker is specifically for P->E transfers For each asset and each class, net movement (outflow - inflow) is tracked over the window. Net flow is tracked so two-way arbitrage and market-maker activity doesn't trigger the cap and unnecessarily delay transactions. This is borrowed from Hydration's `pallet-circuit-breaker` net-volume pattern. 

A 24 hour window is suggested, as the delay needs to be long enough for bridge operators to notice. The window matches bridges like Wormhole and LayerZero's behaviour. Assets should be tracked by denomination, not USD, so that it doesn't create reliance on oracles. Assets without a cap ignore the circuit breaker pattern, so that the tracking is opt-in by way of governance vote.

The suggested cap formula is `cap = max(5x trailing-7-day-median hourly net flow, configured floor per asset)`.

- The 5x multiplier is high enough to not trip on legitimate spikes.
- The floor prevents low-volume-but-high-value assets from having too low a cap relative to their total locked value.
- Both factors are governance-settable per asset; no automatic defaults at asset registration (new assets start uncapped).

If the cap is tripped, asset movement is locked for a certain set time (proposed 24 hours). Other asset transfers continue as normal. Once the locked time elapses, the asset transfer continues as normal. 

Specific implementation details:

- E→P: Tracks inflow.
- P→E: Tracks outflow, and checks cap. Asset transfers that would breach the cap are deferred, and the nonce is not processed. Relayers should watch and respect this lock, and resubmit the transaction when the lock lifts.

The reason why the asset lock auto-lifts is that this mechanism is a buy-us-time defense, not a defense in and of itself. The inverse also adds unnecessary burden on governance - not auto-resuming would require the Fellowship/OpenGov to submit unlock referendums, which is added admin for little gain.

The increased gas cost to add the circuit breaker is estimated to be around ~10-15k extra (read and write the per-asset counter and check the cap).

It is worth noting that the gateway circuit breaker only covers P->E transfers because in the case of E->P transfers, where an exploit bypasses Ethereum and submits fraudulent transactions to Bridge Hub, the circuit breaker on Ethereum won't help. This is why a separate circuit breaker on Asset Hub is also required.

### Asset Hub Circuit Breaker

A circuit breaker on AssetHub is also required. It caps the net amount of each bridged asset minted over a rolling window:

- Ethereum assets: net mint = minted (E→P) − burned (P→E).
- PNAs: net release = released from the reserve (E→P) − locked (P→E).

 When an incoming transfer breaches the cap, Asset Hub holds it rather than completing the mint, and then retries once the lock lifts, so a tripped cap delays the transfer. This would be implemented in a new circuit breaker pallet on Asset Hub that wraps the mint and burn path bridged assets already go through. It checks the cap, then lets `pallet-assets` do the minting (or holds the transfer if the cap is tripped). Only Snowbridge's bridged assets are routed through it, so nothing else minting on Asset Hub is affected. The resumed transactions are driven by the pallet's `on_initialize` hook: each block it checks whether any held transfers can now go through and completes as many as fit, re-checking the cap as it goes. So a backlog that built up during a lockdown drains gradually rather than all at once and immediately re-tripping. When nothing is held (the normal case) the hook is just a cheap storage read.

Everything else matches the Gateway breaker: per-asset, tracked by denomination (no oracle), net flow, a governance-set cap with a floor, and a 24h auto-lift. These caps are set locally on Asset Hub. The same trip and lift events page on-call so the bridge can be halted if the spike turns out to be a real exploit.

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
- E→P Asset Hub circuit breaker unit tests: net-mint tracking, cap reached and auto-lift, holding and retry of an over-cap mint, for both foreign assets and PNAs.
- Ethereum System Frontend pallet unit tests for setting both the Gateway and Asset Hub `set_cap` governance entry.
- Polkadot SDK integration tests: Testing the governance command from Asset Hub, is sent to Bridge Hub and the outbound message to Ethereum is queued correctly.
- No privacy concerns with this proposal - all events are public.

## Performance, Ergonomics, and Compatibility

### Performance

- **Gateway:** ~10-15k extra gas per ERC20 release and PNA mint of a capped asset. Uncapped assets pay no extra gas.
- **Asset Hub:** a per-asset counter read and write per E→P mint of a capped asset, negligible. Uncapped assets are untouched.

### Ergonomics

User-facing: under normal operation, invisible. On a trip, the user sees a delayed transaction.

Operator-facing: cap configuration is a governance-driven workflow. Bridge monitoring should surface "current net flow vs cap" per asset so maintainers can spot a trip becoming likely before it happens.

### Compatibility

- **Ethereum Gateway (P→E breaker):** This is a major Ethereum contract change and requires a gateway upgrade. Adds the per-asset caps, a command to set cap values, inflow and outflow tracking and checking each transfer against the cap.
- **Asset Hub (E→P breaker):** Adds the E→P circuit breaker" net-mint tracking per bridged asset, the cap check, and holding over-cap transfers until the lock lifts, with its caps set on Asset Hub. The Ethereum System Frontend pallet also needs a `set_cap` extrinsic (root origin), the governance entry point for the *Gateway* cap, which it proxies to Bridge Hub.
- **Bridge Hub:** Adds a `set_cap` extrinsic (in the Ethereum System V2 pallet) that relays the Gateway cap command on to Ethereum.

## Prior Art and References

- Hydration's [`pallet-circuit-breaker`](https://github.com/galacticcouncil/hydration-node/tree/master/pallets/circuit-breaker), the net-volume limit pattern this design borrows (per-block in Hydration; this RFC applies it over a rolling window).
- Wormhole's [Governor](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0007_governor.md) and [Global Accountant](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0011_accountant.md): rolling-24h USD-denominated per-chain cap (Governor) layered with a cumulative balance check (Accountant). Their later [flow-cancelling extension](https://wormhole.com/blog/understanding-the-flow-canceling-governor-in-wormhole) addressed stablecoin caps routinely hitting 100% utilization; informed the net-flow choice in this RFC.
- LayerZero OFT [`RateLimiter`](https://github.com/LayerZero-Labs/devtools/blob/main/packages/oapp-evm/contracts/oapp/utils/RateLimiter.sol): per-pathway `(limit, window)` with linear refill, raw token denomination, inbound transfers crediting against outbound (net-flow). A second precedent for the net-flow choice.
- Axelar's [governance-controlled transfer-rate limits](https://www.axelar.network/blog/axelar-governance-explained): a multisig sets per-token flow limits on-chain. Comparable to a Polkadot-governance-controlled bridge.
- The [Nomad bridge exploit post-mortem](https://cloud.google.com/blog/topics/threat-intelligence/dissecting-nomad-bridge-hack) ($190M drained within hours, no velocity cap), illustrative of the failure mode this RFC's primary cap is designed to prevent.

## Unresolved Questions

None at this time.

## Future Directions and Related Material
- **Asset-class default caps at registration.** Add an "asset class" field to the asset registry (stablecoin, ETH-LST, long-tail, etc.) with a per-class default cap multiplier so new asset listings auto-cap at a sensible starting value pending governance refinement.
- **Companion RFC:** the [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md) (PR #166) specifies the reactive layer that this preventive layer composes with.
