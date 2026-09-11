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

### Gateway (Ethereum contract) Circuit Breaker

Snowbridge's honey pot is primarily on Ethereum - all locked funds bridged from Ethereum to Polkadot are located in the Snowbridge gateway contract. For this reason, it makes sense to protect these assets from irregular activity, in the gateway contract. Additionally, Polkadot Native Assets (PNAs) like DOT are minted on Ethereum, backed by assets on Asset Hub, which also need protection against irregular minting.

If one considers the possible exploit shapes, they would all be protected by a circuit breaker, given the circuit breaker catches the outflow pattern:

- Forged BEEFY commitment
- MMR proof bug
- Gateway message decode bug
- PNA minting bug

The implementation should limit per-asset, gross outflow to a cap per 24 hours, both ERC-20s and Ether, and PNAs (Polkadot native assets, like DOT). This part of the circuit breaker is specifically for P->E transfers. For each asset, only the outflow (ERC-20 and Ether releases, PNA mints) is counted. Inflow in the opposite direction does not offset it.

The limit refills continuously. Each transfer uses up capacity equal to its amount. Used capacity frees up again gradually, at a steady rate that clears a full cap in 24 hours. A transfer goes through if it fits in the remaining capacity. If it does not fit, only that transfer is held. The asset is not locked as a whole. Other transfers of the same asset keep going through as long as they fit. A held transfer goes through once enough capacity has come back.

For example, with a cap of 5 per 24 hours: a transfer of 3 goes through (used = 3), a transfer of 1 goes through (used = 4), and a further transfer of 3 does not fit and is held. Used capacity drains back at 5 per 24 hours, so after about 10 hours it has dropped to 2 and the held 3 fits.

This limits the rate, not the amount in a calendar day. Starting from full capacity, one cap can go through at once and another cap refills over the following 24 hours, so up to 2× cap can pass in the first 24 hours after a quiet period. After that it is one cap per 24 hours.

A 24 hour refill period is suggested, as the delay needs to be long enough for bridge operators to notice. Assets should be tracked by denomination, not USD, so that it doesn't create reliance on oracles. Assets without a cap ignore the circuit breaker pattern, so that the tracking is opt-in by way of governance vote.

Each asset's cap is a fixed value set by governance. Values are proposed from historical flow data, for example the 99th percentile of daily gross outflow over the last 90 days plus a margin, and reviewed periodically as traffic changes. New assets start uncapped until governance sets a cap. The bounds in this RFC apply only to capped assets. An uncapped asset has no protection, including a newly registered asset before governance has set its cap (see "Future Directions" for default caps at registration).

A formula that adjusts the cap on-chain from recent volume was considered and not adopted:

- Snowbridge traffic comes in bursts. For every asset, 81 to 100% of hours in a recent 7-day window had no outflow at all, so hourly statistics like the median are 0, and statistics like mean plus standard deviation swing widely depending on whether a single large transfer happened that week.
- An attacker can raise an adaptive cap ahead of an exploit by bridging their own funds in the preceding days.
- A fixed value is simpler to implement and gives governance a single number to vote on.

Held P→E transfers are not processed by the Gateway. Relayers retry them once there is capacity. When several held transfers are waiting for the same capacity, whichever one a relayer submits first goes first. Relayers pick the transfer that pays them the most, so the fee a user attaches decides the order, the same as for ordinary relaying.

While the bridge is halted through the emergency pause ([RFC-0166](./0166-snowbridge-emergency-pause-pallet.md)), the breakers release nothing. Held transfers and queued large transfers stay where they are on both sides, even if there is capacity or their release time has come. RFC-0166 stops new transfers on Asset Hub and the Gateway and holds in-flight messages on Bridge Hub, but a transfer already held by a breaker is past Bridge Hub, so the breakers have to observe the halt themselves. The halt reaches Ethereum asynchronously, so there is a short window before the Gateway breaker stops releasing. While halted, capacity does not refill and large-transfer delays do not advance, so resuming does not release a backlog all at once. Governance can still release or drop individual transfers during a halt. This way the community can check held transfers before any of them go through.

A transfer released early by governance bypasses the limits: it uses no capacity and does not change the timing of other queued transfers. It is an explicit exception to the bounds in this RFC. A transfer dropped by governance is cancelled for good and cannot be retried. The funds at the source stay where they are, locked in the Gateway or burned on Asset Hub. Returning them, if the transfer turns out to be legitimate, is a separate governance action outside this RFC.

Capacity refills automatically because this mechanism is a buy-us-time defence, not a defence in and of itself. A refilling limit was chosen over locking the asset for a set time once the cap is reached. Locking makes griefing cheap: one transfer that fills the cap blocks the asset for everyone for the whole period, and with gross limits a griefer can fill both directions by moving the same funds back and forth. With a refilling limit nothing is ever blocked outright. A griefer has to keep using up capacity as it comes back, paying fees on every transfer, and honest users can still get through by attaching higher relay fees.

The increased gas cost to add the circuit breaker is estimated to be around ~10-15k extra (read and write the per-asset counter and check the cap). A transfer larger than the cap also records its release time, which costs more, but such transfers are rare.

It is worth noting that the gateway circuit breaker only covers P->E transfers because in the case of E->P transfers, where an exploit bypasses Ethereum and submits fraudulent transactions to Bridge Hub, the circuit breaker on Ethereum won't help. This is why a separate circuit breaker on Asset Hub is also required.

#### Transfers larger than the cap

A transfer larger than the cap can never fit in the refilling limit. A transfer of exactly the cap counts as larger than the cap too, since it could only fit after 24 hours with no other traffic. Such a transfer is not rejected. Instead it is delayed at the destination and then goes through without counting against the cap. This is the same approach as Wormhole's delay for large transactions, with two differences: the delay is proportional to size, `amount / cap × 24 hours`, and large transfers of the same asset are queued one behind another.

Each large transfer's release time is fixed when it enters the queue: the later of now and the previous large transfer's release time, plus its own delay. Whether the previous transfer has actually been relayed by then does not matter, so an unrelayed transfer cannot hold up the ones behind it.

For example, with a cap of 5, three large transfers of 15, 10 and 6 arrive on the same day. The 15 is released after 3 days, the 10 after 2 more days (day 5), and the 6 after 1.2 more days (day 6.2). That is 31 tokens over 6.2 days, or 5 per day.

The queue is what bounds the rate. If each large transfer waited only its own delay, an attacker could send many transfers of just over the cap in parallel and have all of them released after about 24 hours. With the queue, the large transfers of an asset average at most one cap per 24 hours, however many are queued.

That is an average. A single release is the whole transfer: a transfer of 20× cap is released in full after 20 days. So the worst case for an asset has two parts. Through the refilling limit: one cap at once, then one cap per 24 hours. Through the queue: any amount, as long as it has been visible on-chain for at least one day per cap of its size. This is intended. The breaker is there to delay large transfers, not to stop them, and the defence against a fraudulent large transfer is the emergency pause. A queued large transfer is rare and looks exactly like an exploit, so monitoring should alert on it immediately.

While it waits, a large transfer does not use any capacity in the refilling limit, so ordinary transfers of the same asset are not affected. It does delay other large transfers of the same asset queued behind it. A griefer can queue one very large transfer and make honest large transfers wait a long time, but the griefer's own funds are stuck for the same time, and governance can release an honest transfer early.

Rejecting such transfers was considered and not adopted. A rejection has to happen at the source before funds move, otherwise funds get stuck at the destination. For P→E this means Asset Hub would have to check every outgoing transfer against the Gateway cap, and a transfer from another parachain that fails on Asset Hub leaves the user's funds out of sync between the parachain and Asset Hub. Delaying instead means nothing is rejected and no funds are stuck. If governance lowers a cap while a transfer is in flight, that transfer is simply delayed.

On Ethereum, relayers resubmit a large transfer once its release time has passed. On Asset Hub, it is released automatically. Governance can release or drop a queued transfer early on both sides.

#### Ordering of held transfers

Capacity that frees up goes to whichever transfer is submitted first. This has a downside: a large held transfer needs a large amount of free capacity at once, and a steady stream of small transfers can keep taking capacity as it frees up, so the large transfer may wait a long time no matter what fee it attaches.

The alternative is that a held transfer counts its amount as used the moment it is held, so nothing else can pass until enough capacity has drained for it to go through. This guarantees a held transfer goes through within 24 hours. We did not adopt it because it brings back the blocking that the refilling limit is meant to remove. One transfer that does not fit would block all transfers of that asset until it drains, for up to 24 hours, at the cost of a single fee, and a griefer could repeat this every day with the same funds.

Without reservation, nothing is ever blocked outright. During a sustained griefing attack, honest users compete with the griefer on fees for each unit of capacity that frees up, and the griefer pays a fee on every unit they take. A user who expects a transfer to be held can send several smaller transfers instead. A held transfer close to the cap can wait a long time under sustained heavy traffic, and governance can release it if that happens. Caps are set well above normal daily volume, so a transfer that needs most of the cap at once is rare. It is also the kind of transfer the breaker is meant to slow down.

### Asset Hub Circuit Breaker

The Asset Hub breaker caps the gross amount of each bridged asset that arrives from Ethereum per 24 hours:

- Ethereum assets: mint = minted (E→P).
- PNAs: release = released from the reserve (E→P).

P→E transfers (burns of Ethereum assets, locks of PNAs) do not offset the meter. Transfers of the same asset between Asset Hub and other parachains are not counted either. A flow only counts when it comes from Ethereum.

The cap works exactly like the Gateway breaker: per-asset, tracked by denomination (no oracle), gross flow, a governance-set cap, and a limit that refills over 24 hours.

When an inbound (E→P) transfer does not fit in the remaining capacity, it is not delivered. It is held on-chain and goes through automatically once there is capacity. On Ethereum, relayers resubmit held transfers instead. Since relayers do not decide the order on Asset Hub, the oldest held transfer that fits is released first. A held transfer that does not fit yet is skipped, not waited for, so it does not block smaller ones behind it (see "Ordering of held transfers"). A backlog drains as capacity comes back rather than all at once, so releasing held transfers cannot exceed the cap. A transfer larger than the cap is delayed in proportion to its size and queued behind other large transfers of the same asset, as on Ethereum (see "Transfers larger than the cap"). Until release, the funds are not credited to the beneficiary, so governance can drop a transfer judged malicious. As on Ethereum, held transfers are not released while the bridge is halted. The exact mechanism is left to the implementation.

Caps are set through a root-gated `set_cap` extrinsic on the Snowbridge System Frontend pallet on Asset Hub, the same pallet the Gateway cap is routed through (see "Caps set by Governance"), so both caps share one governance surface. Events are emitted when a transfer is held and when it is released, so the existing relayer monitoring can watch for them and page on-call, and halt the bridge via the emergency pause if the spike turns out to be real.

### Gross flow

Each breaker counts only the flow in the direction it protects, and the two breakers operate independently. Net flow (outflow minus inflow) was considered, as used by Hydration's `pallet-circuit-breaker` and LayerZero's `RateLimiter`, so that two-way arbitrage and market-maker activity would not use up the cap. It was not adopted, for two reasons.

First, netting lets an attacker raise the cap. An attacker who has compromised one direction can create their own inflow to offset their fraudulent outflow. For example, with P→E compromised, the attacker deposits X tokens into the Gateway on Ethereum. This is a valid E→P transfer, so it reduces the Gateway's net counter by X, and the attacker receives X on Asset Hub. They then forge a release of `cap + X` from the Gateway. They keep the X on Asset Hub, so the deposit costs them nothing, and the amount they can drain grows with their capital. The Asset Hub breaker limits this, since the deposit counts against the Asset Hub cap, but the worst case then depends on available liquidity instead of being a fixed amount. Limiting the credit (never letting the counter go below zero, and allowing at most one cap of credit per 24 hours) makes the worst case 2× the net cap.

Second, Snowbridge traffic is mostly one-way, so netting would not allow much lower caps. We compared daily net flow with daily gross flow per asset across all 28,213 Snowbridge V2 transfers from June 2024 to September 2026. On busy days (95th percentile, last 90 days), net outflow was 0.9 to 1.0 of gross outflow for most assets (tBTC, wstETH, LINK, sUSDe and others), so netting would not allow a lower cap for them. The most two-way assets were USDT (0.33), USDC (0.39) and ETH (0.49). Even for these, the 2× worst case of limited netting is only 0 to 35% below a gross cap. Few addresses use the bridge in both directions, and the share of flow that cancels out has dropped (57% for ETH over the full history, 28% in the last 90 days).

With a gross cap, the worst case depends only on the cap, not on the other breaker or the attacker's capital, and it is simpler to implement and audit. If an asset's two-way volume grows enough that its gross cap fills up on legitimate traffic, limited netting can be enabled for that asset in a later upgrade (see "Future Directions").

### Caps set by Governance

Caps are set via governance, through the usual method of using the Snowbridge System Frontend pallet on Asset Hub, which sets the Asset Hub circuit breaker cap, as well as sends a message to the Ethereum System V2 pallet on Bridge Hub, which in turn sends the message to Ethereum. Concrete cap values per asset are deliberately out of scope of this RFC, which specifies the cap mechanism's shape and the framework for choosing values, not the values themselves. Token-denominated cap values are decided and ratified by community vote at deployment and at re-vote, if necessary.

The two directions have independent cap values, each in the asset's own units.

Since caps are fixed values, they apply as soon as the upgrade is live, without a warm-up period.

When a cap changes, the amount of capacity already used is kept as is, so lowering a cap does not free up capacity and raising one does not take it away. Held transfers stay held and are checked against the new cap. A held transfer that is now at or above the new cap moves to the large-transfer queue, with its delay computed from the new cap from the time of the change. Queued large transfers keep the time they have already waited, and the remaining delay is recomputed with the new cap. A cap of zero holds every transfer of that asset until the cap is raised, which gives governance a per-asset pause. Removing an asset's cap releases its held and queued transfers.

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

- **Gateway:** ~10-15k extra gas per ERC20 release and PNA mint of a capped asset. Uncapped assets pay no extra gas.
- **Asset Hub:** a per-asset counter read and write per E→P mint of a capped asset, negligible. Uncapped assets are untouched.

### Ergonomics

User-facing: under normal operation, invisible. When the cap is full, the user sees a delayed transaction. A transfer larger than the cap is delayed in proportion to its size, and longer if other large transfers of the same asset are queued ahead of it.

Operator-facing: cap configuration is a governance-driven workflow. Bridge monitoring should surface "used capacity vs cap" per asset so maintainers can spot the cap filling up before transfers are held.

### Compatibility

- **Ethereum Gateway (P→E breaker):** This is a major Ethereum contract change and requires a gateway upgrade. Adds the per-asset caps, a command to set cap values, outflow tracking, checking each transfer against the cap, and a per-asset queue for transfers larger than the cap, with each one's release time fixed on entry.
- **Asset Hub (E→P breaker):** Adds a circuit-breaker pallet that meters E→P inflow per asset, holds transfers that do not fit, and delays transfers larger than the cap. Ordinary transfers between Asset Hub and other parachains are not counted. The Snowbridge System Frontend pallet gains a root-origin `set_cap` extrinsic (mirroring its `set_operating_mode`) that sets the local cap and proxies the *Gateway* cap command to Bridge Hub.
- **Bridge Hub:** Adds a `set_cap` extrinsic (in the Ethereum System V2 pallet) that relays the Gateway cap command on to Ethereum.

## Prior Art and References

- Hydration's [`pallet-circuit-breaker`](https://github.com/galacticcouncil/hydration-node/tree/master/pallets/circuit-breaker), a per-block net-volume limit. Considered and not adopted for this RFC (see "Gross flow").
- Wormhole's [Governor](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0007_governor.md) and [Global Accountant](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0011_accountant.md): rolling-24h USD-denominated per-chain cap (Governor) layered with a cumulative balance check (Accountant). The Governor originally tracked only outbound transfers (gross flow). Its later [flow-cancelling extension](https://wormhole.com/blog/understanding-the-flow-canceling-governor-in-wormhole) lets inbound transfers offset outbound ones, but only for allow-listed tokens (some stablecoins) on allow-listed chain pairs. It was added because round-trip arbitrage and settlement traffic kept several chains near 100% of their limits. Snowbridge could add netting per asset in the same way later. The Governor also delays transactions above a size threshold by a flat 24 hours instead of counting them against the daily limit. This RFC borrows that idea, with the delay proportional to size and large transfers queued one after another.
- LayerZero OFT [`RateLimiter`](https://github.com/LayerZero-Labs/devtools/blob/main/packages/oapp-evm/contracts/oapp/utils/RateLimiter.sol): per-pathway `(limit, window)` with linear refill, raw token denomination, inbound transfers crediting against outbound (net-flow). This RFC uses the same refilling limit, without the netting.
- Axelar's [governance-controlled transfer-rate limits](https://www.axelar.network/blog/axelar-governance-explained): a multisig sets per-token flow limits on-chain. Comparable to a Polkadot-governance-controlled bridge.
- The [Nomad bridge exploit post-mortem](https://cloud.google.com/blog/topics/threat-intelligence/dissecting-nomad-bridge-hack) ($190M drained within hours, no velocity cap), illustrative of the failure mode this RFC's primary cap is designed to prevent.

## Unresolved Questions

None at this time.

## Future Directions and Related Material
- **Asset-class default caps at registration.** Add an "asset class" field to the asset registry (stablecoin, ETH-LST, long-tail, etc.) with a per-class default cap so new assets get a starting cap until governance sets one.
- **Per-asset capacity reservation.** If large transfers of a specific asset are regularly starved by smaller ones, reservation could be added for that asset, so held transfers count as used and go through within 24 hours (see "Ordering of held transfers" for the trade-off). This is a Gateway upgrade, not a setting: the Gateway would need to record held messages and their amounts, plus a per-asset flag. The per-message release time already recorded for transfers larger than the cap could be reused.
- **Per-asset limited netting.** If an asset's two-way volume grows enough that its gross cap fills up on legitimate traffic, governance could enable netting for that asset. The counter would never go below zero and credit from the other direction would be limited to one cap per 24 hours, so the worst case is 2× the cap.
- **Companion RFC:** the [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md) (PR #166) specifies the reactive layer that this preventive layer composes with.
