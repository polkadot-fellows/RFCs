# RFC-0167: Snowbridge Circuit Breakers

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2026-05-28                                                                                  |
| **Description** | Per-asset velocity caps on the Ethereum Gateway (primary) and the AssetHub frontend (secondary) that automatically throttle anomalous Snowbridge flows. |
| **Authors**     | Snowbridge team                                                                             |

## Summary

Add two layers of automatic rate-limiting to Snowbridge: a primary per-asset velocity cap on the Ethereum Gateway covering both ERC20 release and PNA mint, and a secondary per-asset cap on the AssetHub frontend covering outbound exports. Each cap tracks rolling 24-hour net flow per asset, trips into a per-asset lockdown when exceeded, and auto-lifts after 24 hours. Caps are denominated in token units (no oracle in the security-critical path) and are opt-in per asset. This is the preventive half of a two-layer halt strategy; see the companion [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md) for the reactive half.

## Motivation

The emergency pause pallet is reactive: a human notices an incident, fires `trigger()`, the halt rolls out. Useful, but it has a detection-latency floor. If a drainage exploit runs for 15 minutes before anyone notices, 15 minutes of value is gone.

Circuit breakers cap value-at-risk during the detection window automatically. Calibrated correctly, they almost never fire in normal operation; when they fire, they buy the security council time to investigate before deciding whether to escalate to the full halt.

The empirical case for caps is the absence of incidents: bridges that have shipped automated velocity-cap circuit breakers (Wormhole's [Governor](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0007_governor.md), Chainlink CCIP's [token-pool rate limits](https://docs.chain.link/ccip/concepts/rate-limit-management/how-rate-limits-work), Axelar's [per-chain daily caps](https://www.axelar.network/blog/axelar-governance-explained), LayerZero OFT's [`RateLimiter`](https://docs.layerzero.network/v2/concepts/technical-reference/oft-reference)) have not been catastrophically drained since adoption; bridges that lacked them (Nomad's [$190M / 150-minute exploit](https://cloud.google.com/blog/topics/threat-intelligence/dissecting-nomad-bridge-hack), Multichain, Ronin, Wormhole's own pre-Governor Solana exploit) have. The pattern this RFC adopts (per-asset, rolling-window, governance-set, auto-lifting) is the state of the practice; specific calibrations and refinements borrow from CCIP and Wormhole experience documented in §Prior Art.

Per-asset velocity caps as a *primary* defense face a calibration dilemma: caps tight enough to catch single-tx exploits false-positive on legitimate institutional flows; caps loose enough to avoid false positives let large single-tx exploits through. Layered behind the per-asset emergency halt, that pressure drops sharply: catching every attack is not the cap layer's job, the halt pallet handles that with its broader, slower lever. The caps only need to bound the *runaway* attacks that would drain the bridge faster than a human can notice and trigger the halt, so they can sit much higher and rarely false-positive in practice.

### Why the primary cap belongs on the Gateway, not Polkadot

Snowbridge's value extraction point is the Gateway contract on Ethereum:

* ETH and ERC20 escrow lives on Ethereum. Drainage = unauthorized release from the Gateway.
* PNAs (wDOT etc.) get minted on Ethereum by the Gateway. Drainage = mint without a corresponding AH-side reservation.

Every meaningful drainage attack ultimately routes through a Gateway-side operation, regardless of where the exploit lives:

| Attack surface | Where it manifests as value extraction |
|---|---|
| Forged BEEFY commitment | unauthorized Gateway release |
| MMR proof bug | unauthorized Gateway release |
| Relayer key compromise | unauthorized Gateway release |
| Gateway message decode bug | direct (Gateway over-releases in one tx) |
| AH inbound queue bug minting unbacked snowETH | only realized at bridge-back, which is a Gateway release |
| PNA bug minting wDOT unbacked | direct Gateway mint |

A circuit breaker on Polkadot watches the wrong place for the attack classes that bypass Polkadot entirely (the top three rows). A Gateway-side cap catches all of them at the value-extraction step, regardless of how the attacker got the authorizing message there.

This is what makes Snowbridge's circuit-breaker design different from a DEX's. Hydration's per-block trade cap lives in `pallet-circuit-breaker` because their assets live in pool contracts on Polkadot; the cap is in the right place. For Snowbridge, the equivalent place is the Gateway.

## Stakeholders

* **Snowbridge maintainers**, who implement and operate the cap layers.
* **Polkadot Fellowship and OpenGov**, who set per-asset caps via governance vote and resolve trips.
* **Snowbridge users and integrators**, who experience a tripped cap as a temporary lockdown of one asset+direction.
* **Asset issuers** whose tokens are listed on Snowbridge and would have caps set against them.
* **Relayers and the existing relayer-operated monitoring stack**, which becomes the alerting backbone for cap events.

Prior socialization: design discussed in the 2026 Snowbridge maintenance proposal cycle; pattern lifted from Hydration's `pallet-circuit-breaker` net-volume tracker.

## Explanation

### Layer 1 (primary): Gateway-side per-asset velocity cap

**What it tracks:** per-asset NET outflow over a rolling 24-hour window, separately for two operation classes:

* Release of locked ERC20 (E-to-P originated, asset returning to user)
* Mint of PNA (P-to-E originated, Polkadot-native asset minted on Ethereum)

For each asset and each class, `net = outflow - inflow` over the window. Net flow, not gross, so two-way arbitrage and market-maker activity doesn't burn the budget (lifted from Hydration's `pallet-circuit-breaker` net-volume pattern).

**Window:** rolling 24 hours, implemented as 24 hourly buckets with a sliding sum. 24 hours because that's roughly the time-to-notice budget for a security council; the cap should ensure the bridge cannot be fully drained within one human response cycle. This window matches Wormhole's Governor (rolling 24h) and LayerZero OFT default deployments, and is the modal choice across major bridges; CCIP uses a continuously-refilling token bucket instead, see §Future Directions for that as a v2 refinement.

**Denomination:** token units. No oracle in the security-critical path. The trade-off with a USD-aggregate cap is below in "Why per-asset token-denominated, not aggregate USD". This is the same denomination choice CCIP made for its per-token-pool buckets and LayerZero OFT made for its `RateLimiter`. Wormhole's Governor uses USD-equivalent but hardcodes the thresholds in config rather than reading a live oracle, accepting the staleness rather than the oracle attack surface.

**Caps are opt-in per asset.** The Gateway maintains `cap[asset][class]: Option<uint256>`. When `None`, that asset+class has no velocity limit and bypasses the rate-tracking logic entirely (saving the ~10-15k gas on every operation). When `Some(n)`, the cap is enforced. Governance decides per asset whether the operational overhead of tracking and tuning a cap is worth it.

This matches the Hydration pattern (their per-asset XCM rate limit is `Option<u128>` keyed off the asset registry) and CCIP's per-token-pool model (each pool independently configured with capacity and refill rate). Capping a low-value asset wastes operator attention without buying defense, because the catastrophic outcome of an unrestricted drain is bounded by the asset's total locked value. The 100k-DOT emergency-pause trigger still covers low-cap assets in the rare case a drain attempt happens, just without the automated brake.

A rough heuristic: if the asset's total locked value on the bridge exceeds the 100k DOT trigger deposit by a meaningful multiple (say, 10x), the cap pays for itself in expected loss reduction; below that, skip it.

**Cap formula when set:** `cap = max(5x trailing-7-day-median hourly net flow, configured floor per asset)`.

* The 5x multiplier is high enough to not trip on legitimate spikes (institutional rebalances, arbitrage events, exchange listings).
* The floor prevents low-volume-but-high-value assets from having absurdly small caps relative to their total locked value.
* Both factors are governance-settable per asset; no automatic defaults at asset registration (new assets start uncapped).

**Trip behavior:** sets `lockdownUntil[asset][class]: BlockNumber`, proposed 24 hours from the trip block. Other assets keep flowing. Other classes for the same asset (e.g. PNA mint still works if ERC20 release tripped) keep flowing. Lockdown blocks new outflow/mint of that asset+class until `lockdownUntil` is reached, at which point the cap auto-lifts and normal rate tracking resumes. There is no separate manual-reset command, see "Auto-lift calibration" below for why.

**Auto-lift calibration.** The 24-hour auto-lift is sized to buy time for human escalation, not to *be* the defense. If the trip is a real attack, on-call detects the `CapTripped` event (paged as `critical` per §Observability) and fires the emergency-pause `trigger()` well within the window, which globally halts the bridge and supersedes the cap. If the trip is a false positive, the worst case is up to a day of asset+class lockdown for that one asset, with other assets continuing to flow normally. A weeks-scale auto-lift would be miscalibrated: it would unduly hinder legitimate flow on false positives without buying meaningful additional defense, since the relevant fast defense (emergency halt) acts in seconds and the auto-lift always wins the race against a governance reset anyway (OpenGov / Whitelisted Caller paths typically take ~24 hours minimum, often longer; a manual reset would never land before the 24-hour auto-lift). This is why there is no separate `ResetCap` command, with a 24-hour auto-lift it is structurally unreachable, and the emergency-pause halt is the fast override.

**Gas cost:** each ERC20 release and each PNA mint of a **capped** asset pays ~10-15k extra gas to read+write the per-asset counter and check the cap. Uncapped assets pay no extra gas (the cap lookup short-circuits on `None`). Material but not prohibitive for the small set of high-value assets where capping pays for itself; uncapped low-value assets stay cheap.

### Layer 2 (secondary): AssetHub-frontend per-asset cap on outbound exports

Catches AH-side exploits where the attacker abuses the frontend to send unauthorized exports. Same shape as the Gateway cap (per-asset, net, rolling window) but with much higher caps because actual value extraction is still at the Gateway. Treat this as defense-in-depth, not the primary line.

Cheap to add (`snowbridge-pallet-rate-limit` on AH, hooks into the `PausableExporter`). Tripping blocks new exports for the affected asset on AH; the Gateway-side cap continues to operate independently downstream.

### Stuck messages and stale fees

A P→E message that reaches the Gateway after the user's AH-side asset is already burned, but finds the cap tripped, must not produce asymmetric state (asset gone on AH, nothing dispatched on Ethereum). This subsection specifies the trip behavior to avoid that.

**Defer, don't revert.** The Gateway-side cap check fires *before* nonce increment in `submitV1` / `submitV2`. If the cap is tripped for the message's asset+class, the whole submit reverts:

* No nonce increment (the message stays at `inboundNonce + 1`, not consumed).
* No relayer payment (the relayer's tx reverts and they eat the gas; in practice they back off and wait for the auto-lift rather than retry tightly).
* No asset action.
* The message stays in the BH outbound queue's existing merkle commitment and is fully relayable after the cap auto-lifts.

The alternative (cap check inside the handler, dispatch reverts but submit succeeds) would consume the message but produce no asset action, leaving the user's AH-side burn unmatched on Ethereum. Defer-not-revert puts the message in a "wait and retry" state instead of stranding funds.

**Fee staleness does not permanently block messages.** The user pre-pays a fee at AH (computed at submit time from the governance-set `PricingParameters`, i.e., `fee_per_gas * gas_used_at_most + remote_reward`, see `pallets/outbound-queue/src/lib.rs:368`). If the cap holds a message for up to 24 hours and ETH gas has moved enough that the relayer's actual cost exceeds the pre-paid fee, the relayer will refuse to resubmit, but the message is still recoverable: anyone can call `add_tip` on `snowbridge-pallet-system-v2` (which routes to `OutboundQueue::add_tip`) with the message's nonce to bump the tip in DOT, and the relayer becomes willing to retry. This is a pre-existing Snowbridge primitive, not a new mechanism in this RFC; cap trips just exercise it more often than usual. The key point is that a stale fee never permanently strands the message; the auto-lift removes the cap block within 24h, and `add_tip` remains available indefinitely after that to clear any residual fee-economics block.

**Relayer-side retry scheduling.** Without cap-aware logic, a relayer that scans BH every loop tick will keep retrying a cap-tripped submission and burn gas on each revert for the full 24-hour lockdown window. To avoid this, relayer implementations should watch Gateway state and schedule retries appropriately:

* **Watch the `CapTripped(token, class, netFlow, cap, lockdownUntil)` event.** The `lockdownUntil` block number tells the relayer exactly when to retry. On receipt, mark the affected (token, class) submissions as deferred until that block.
* **Watch the `CapLifted(token, class)` event.** Confirms the cap has cleared; the relayer can submit any pending submissions for that (token, class) immediately.
* **Optionally query `lockdownUntil[asset][class]` directly.** The Gateway exposes a `view` function for the storage so a relayer recovering from a restart can resync state without replaying events: `function lockdownUntilOf(address token, uint8 class) external view returns (uint256)`.
* **On a generic `submitV1` / `submitV2` revert** where the relayer hasn't already noted the cap state (e.g., it missed the `CapTripped` event due to indexing lag), the revert reason includes a specific `CapTripped()` custom error so the relayer can route to the deferred path rather than treat it as a transient failure.

This is required relayer-side work for v1 deployment; see §Compatibility.

### Why per-asset token-denominated, not aggregate USD

Aggregate USD-equivalent is conceptually tighter: one number captures "total value flowing through the bridge". But it pulls a price oracle into the security-critical path. Oracle manipulation becomes an evasion vector: skew the price of the asset you're draining, the cap reads lower-than-real outflow, you exit. Bad trade-off for a defensive layer.

Per-asset token-denominated avoids this entirely. Each cap is in tokens of that asset; no cross-asset comparison; no oracle. The cost is operational overhead (each registered asset needs its own cap), which is acceptable for Snowbridge's asset registry size (small N forever).

If a global aggregate becomes desired later as additional defense, it can be added as a separate layer with oracle-priced denomination, run *in parallel* to the per-asset caps rather than replacing them.

### Why no per-tx delay layer

A "delay any transfer above threshold X by N hours" layer (optimistic-settlement style) was considered and not adopted. A correctly-set velocity cap subsumes it:

* A single $300M release trips the per-asset cap immediately.
* A slow drain just under the per-hour rate gets caught by the 24h aggregate.
* The threshold the delay would use ends up being approximately the same number as the velocity cap divided by N, so the two layers are largely redundant.

The per-tx delay would add UX friction (legitimate large transfers wait) without earning meaningful additional protection. Optimistic-settlement is the right pattern for OP rollups because it's fundamental to their security model (Arbitrum and Optimism use a 7-day challenge window on every L2→L1 withdrawal; Across uses a 1.5-hour optimistic-oracle dispute window on bundle proposals, with fast relayer-fronted liquidity covering user latency). For Snowbridge, which is non-optimistic by design, layering this pattern on top of velocity caps is structurally redundant.

### Why no BridgeHub outbound-queue message-rate cap

A third layer was considered and not adopted: a protocol-aggregate cap on how many messages BH outbound queue could commit per block, intended to catch "many small drains across many assets" patterns that wouldn't trip any individual per-asset cap. It was rejected for four reasons:

1. **Blast radius is too large for the trigger sensitivity.** A single trip halts *all* BH outbound for the full 24-hour auto-lift window. Every parachain integration, every legitimate user message, every Snowbridge governance command except the V1 governance channel bypass, all blocked. That overlaps with the emergency-pause pallet's role but with worse precision (everything halts, not just Snowbridge flows) and no deposit-gated permissionless trigger.
2. **High documented false-positive rate.** Legitimate spikes (a new parachain integration going live, a coordinated batch settlement, a busy market hour) routinely produce burst patterns that look anomalous to a per-block message count. Operator workflow would become "every few weeks the bridge halts on a non-incident."
3. **Message count is a poor proxy for value.** One parachain doing 1,000 small transfers and one whale doing one large transfer have wildly different message counts but possibly similar value-at-risk. Capping on count rather than value means catching the wrong thing.
4. **A better replacement exists.** §Future Directions retains the option of a global aggregate USD cap as a parallel layer; that addresses the same "multi-asset coordinated drain" gap with USD-aware accounting, which is the right unit for cross-asset comparison. The trade-off is pulling an oracle into the path, acceptable as a *parallel* check that doesn't replace the per-asset caps.

The conclusion: per-asset caps (Layer 1) catch the realistic attack surface; AH-frontend caps (Layer 2) catch AH-side abuse; the emergency-pause pallet handles broad halts when a human escalates; aggregate-USD detection, if and when added, is the right tool for residual multi-asset gaps. A protocol-aggregate message-count cap on BH sits in an awkward middle ground that pays a high false-positive cost without commensurate defensive value.

### Why no Gateway-side pending-action queue

A Gateway-side pending-action queue was considered and not adopted. The shape: instead of reverting at the Gateway when a cap is tripped (the current "defer, don't revert" behavior in §"Stuck messages and stale fees"), an alternative design would accept the message (nonce increments, relayer paid), record the asset action in a per-asset pending queue on the Gateway, and auto-execute (or drain via a separate function call) once the cap auto-lifts. It was rejected for five reasons:

1. **Significant new Gateway state and contract code.** A pending-action queue with ordering, pagination, and drain semantics is non-trivial Solidity in a security-critical path. The defer-revert approach adds zero new Gateway state for pending messages, the existing BH outbound queue commitment is reused as the durable record.
2. **DoS attack surface.** An attacker who has reached the Gateway with valid messages (e.g., during an active exploit before the cap trips) can push the queue arbitrarily large. Each entry is at least one storage slot, paid by the submitter, so the cost is bounded but the audit and post-incident-cleanup complexity is real.
3. **Drain ordering and gas accounting are complicated.** When the cap auto-lifts and the queue has many pending releases, drain semantics get tricky: do they all execute in one block (gas exhaustion risk)? In a batch with explicit pagination? Lazily as a side-effect of next normal release? Each option creates edge cases that need careful spec work.
4. **Fee staleness still applies at drain time.** The original message's pre-paid fee was sized for one dispatch at submission time. If the drain happens 24h later and gas has spiked, the dispatch can still fail at drain time for fee-insufficient reasons. The queue doesn't escape this; it just defers it.
5. **The defer-revert path is recoverable.** Per §"Stuck messages and stale fees", a deferred message stays in the BH outbound queue's existing merkle commitment, gets retried after auto-lift, and a stale fee is resolved by `add_tip`. The pending-queue path's UX advantage (relayer doesn't eat gas on the failed submit) is real but small at typical cap-trip frequency.

The pending-queue pattern is well-suited to a follow-up if operational data shows the defer-revert path's relayer-gas-waste or message-tracking complexity becomes a real pain point. It's not the right starting point for the initial cap layer.

### Higher-level alternatives considered

The per-asset velocity cap design in this RFC sits at one specific point on the design space. Several architecturally higher-level alternatives were considered and not adopted as the primary defense for the reasons below; some remain candidates for complementary future layers (see §Future Directions).

**Optimistic-style withdrawal delay window.** All P→E withdrawals wait N hours or days, during which anyone can submit a fraud proof to cancel. Default behavior is "permitted unless challenged." Not adopted because: (a) Snowbridge today is non-optimistic, this would be a paradigm-level re-architecture; (b) it introduces material UX latency on every legitimate transfer rather than only on cap-tripped ones; (c) it requires building a fraud-proof system and a watchtower-incentive scheme that don't exist today. If Snowbridge's risk profile materially changes, this is the canonical "next level up"; as an addition to the current trust-minimized model, it's heavier than the problem warrants.

**Committee multi-sig signoff on large withdrawals.** Transfers above a per-asset threshold require N-of-M security-committee approval before dispatching on Ethereum. Not adopted because it introduces a permissioned bottleneck and a trusted set of signers, at odds with Snowbridge's trust-minimized design. Could in principle be opt-in for very-high-TVL assets but is out of scope of an RFC focused on automated rate-limiting.

**Protocol-owned insurance / backstop pool.** A reserve funded by bridge fees pays claims for documented exploits; doesn't prevent attacks but bounds user damage. Not adopted as a primary defense (it isn't one, by design), but flagged in §Future Directions as a complementary layer. It pairs naturally with velocity caps: the cap bounds worst-case exposure, the pool covers what slips through.

**Watchtower / fisherman pattern with economic challenge.** External monitors actively scan for anomalies and stake bonds to raise challenges; the bond is slashed on false alarms, rewarded on real catches. Snowbridge already has a "fisherman" role on the relayer side. Generalising it, e.g., a fisherman can pause an asset by posting a bond, similar shape to the emergency-pause trigger but per-asset, would compose well with both the velocity caps and the pause pallet. Not adopted in this RFC because it deserves its own design work; flagged in §Future Directions.

**Higher-resolution velocity caps (sub-24h windows).** Same shape as the current design but with shorter rolling windows (per-hour, per-15-minute) stacked alongside the 24h cap. Not adopted as part of the initial layer because shorter windows multiply the calibration problem (each window per asset needs its own value) and create more false positives. Worth revisiting if 24h windows turn out to be too coarse against observed burst patterns.

**Per-recipient address rate-limit.** Velocity is tracked per-destination rather than (or in addition to) per-asset. Not adopted because it pulls address-attribution into the cap logic, which has privacy and attribution-spoofing implications that don't fit Snowbridge's permissionless model.

### Interaction with the emergency-pause pallet

The two systems compose cleanly:

* **Pause pallet halt is global.** When the pause pallet's `trigger()` fires the seven halts, all ERC20 release and PNA mint operations stop regardless of cap state. Cap counters keep accumulating in storage but no outflow happens.
* **Cap trip is per-asset.** A cap trip doesn't halt the bridge; it locks down one asset+class. Other traffic keeps flowing.
* **Resolution is independent.** If both fire (cap trips, then a human triggers the pause), the pause pallet's `resume()` flips the bridge's operating modes back without touching cap state; the cap lockdown clears on its own 24-hour auto-lift. Lifting the cap lockdown does not resume a halted bridge either. Intentional: the cap is a stronger signal than the human-triggered halt, and the auto-lift is the cap layer's only lift mechanism, so the two systems don't need to coordinate explicitly.

### Initial calibration approach

Caps are set via a new Gateway inbound command, `CommandV2.SetCap(asset, class, value)`, issued from BridgeHub governance through `EthereumSystemV2`. The initial set of caps is bundled into a governance preimage by the Snowbridge SDK and submitted to Polkadot OpenGov as a referendum; the community votes on it like any other root-level Snowbridge configuration change. Subsequent re-tunings (after telemetry becomes available, or after asset prices move materially enough to warrant a re-vote) use the same flow.

V2 is chosen for the cap-management commands because cap-setting is a normal-operation governance action, not an incident-response one; it does not need to land while the bridge is halted, so the V1 `PRIMARY_GOVERNANCE_CHANNEL` halt-bypass (relevant for `SetOperatingMode` in the companion pause-pallet RFC) is not required here. Routing through V2 keeps the new code in V2, which is the long-term path forward; V1 doesn't need to be extended for a new feature being added today.

Concrete cap values per asset are deliberately out of scope of this RFC, which specifies the cap mechanism's shape and the framework for choosing values, not the values themselves. Token-denominated cap values (per §Layer 1) are decided and ratified by community vote at deployment and at each subsequent re-vote.

Until per-asset volume telemetry is observable on-chain, the §Layer 1 formula (`cap = max(5x trailing-7-day-median hourly net flow, configured floor per asset)`) cannot be applied directly. Governance can bootstrap initial caps from a fraction-of-TVL heuristic instead, with the heuristic tuned by asset turnover profile. Illustrative tiers:

* **High-TVL concentrated holdings** (low turnover relative to balance, e.g., wrapped-Bitcoin variants): tightest fraction, around 5% of TVL per 24h. A runaway drain would be catastrophic in absolute terms, and legitimate flows rarely approach this fraction.
* **Mid-TVL DeFi assets** (e.g., ETH and ETH-LSTs): looser, around 10% of TVL per 24h.
* **Stablecoins**: loosest, around 15% of TVL per 24h, since stables turn over more often relative to balance.
* **Low-TVL assets**: skip the cap entirely (`cap[asset] = None`). The emergency-pause halt is sufficient defense for any single small-TVL asset; the operator overhead of capping it isn't worth the marginal protection.

Once telemetry is available, the §Layer 1 formula becomes the canonical input and governance re-tunes from it. The fraction-of-TVL heuristic is a bootstrap, not a permanent calibration.

### Observability and alerting

All three cap layers emit events at trip and lift so the existing relayer infrastructure (which already indexes Gateway and AH/BH chain events) can watch for them and page on-call. Events are the integration point: no separate monitoring stack, just one more set of filters in the relayer's existing watcher.

**Gateway-side primary (Solidity events):**

```solidity
event CapApproaching(
    address indexed token,
    uint8 indexed class,     // 0 = ERC20Release, 1 = PnaMint
    uint256 netFlow,
    uint256 cap
);

event CapTripped(
    address indexed token,
    uint8 indexed class,
    uint256 netFlow,
    uint256 cap,
    uint256 lockdownUntil
);

event CapLifted(
    address indexed token,
    uint8 indexed class
);
```

`CapApproaching` fires once per window when net flow first crosses 80% of the cap. Recommended alert policy:

* `CapApproaching`, `info` level, log + Slack channel.
* `CapTripped`, `critical` level, page on-call + auto-create incident ticket.
* `CapLifted`, `info`, confirms the 24-hour auto-lift fired. A trip + lift pair without an emergency-pause `trigger()` in between is worth a post-mortem.

**AH-frontend secondary (FRAME events):**

```rust
pub enum Event<T: Config> {
    CapApproaching { asset: AssetId, net_flow: Balance, cap: Balance },
    CapTripped { asset: AssetId, net_flow: Balance, cap: Balance, lockdown_until: BlockNumberFor<T> },
    CapLifted { asset: AssetId },
}
```

## Drawbacks

* **Calibration uncertainty.** The TVL-fraction starting caps are a heuristic stand-in for the trailing-7-day-median formula because per-asset volume telemetry isn't publicly available. Until live data is collected and the formula recalibrated, some risk of false positives during legitimate spikes remains.
* **Gas overhead on capped assets.** ~10-15k extra gas per ERC20 release / PNA mint of a capped asset. Falls hardest on small transfers (proportionally), with a possible perverse incentive pushing small transfers toward uncapped assets.
* **Per-asset operational overhead.** Each capped asset needs a governance vote to set its initial cap and another to re-tune; that's ongoing operator time.
* **Cap trip can lock funds during a false positive.** A legitimate but anomalous spike can lock down an asset until governance acts. The 24-hour auto-lift bounds the worst case but a day of lockup is still uncomfortable.
* **Aggregate USD blind spot.** Per-asset caps don't catch multi-asset coordinated drains where each individual asset stays under its cap. Documented as a follow-up; CCIP's combined per-pool + per-lane-aggregate model is the canonical "fully defended" target.
* **Stablecoin friction is the expected pain point.** Wormhole's Governor experience showed that stablecoin flows routinely hit 100% of their cap and benignly stranded users, leading to a "flow-cancelling" extension being added later. Snowbridge already uses *net* (outflow minus inflow) to mitigate this, but expect USDT/USDC to be the friction edge, calibrate accordingly and accept some operational overhead around stablecoin cap re-tuning.

## Testing, Security, and Privacy

* **Gateway unit tests** for the rolling-bucket window arithmetic (correct sliding-sum across hour boundaries), `None`-cap short-circuit, lockdown behavior, governance-reset path, and the `lockdownUntil` auto-lift.
* **AH-frontend pallet tests** for cap accounting on `ExportMessage` and trip behavior on the `PausableExporter` integration.
* **End-to-end simulation** (chopsticks fork): single-tx > cap, slow drain just under per-hour rate, two-way arbitrage staying net-zero, trip-then-24h-auto-lift across the rolling-window boundary.
* **Relayer retry-scheduling tests**: relayer correctly defers retries after a `CapTripped` event (no gas burned during lockdown), resumes on `CapLifted`, recovers state from `lockdownUntilOf` after restart, and parses the `CapTripped()` custom error from a Gateway revert when event indexing lags.
* **Reorg behavior on Gateway** for the rolling-bucket window: bucket writes happen inside the dispatched message tx, so they roll back with reorgs naturally; testing should confirm no double-counting on reorg recovery.
* **Security posture:** the cap layer is purely additive defense. It cannot enable a drain that the existing security model wouldn't allow; its only failure modes are (a) failing to trip on a real attack, and (b) tripping on a legitimate flow. Both are calibration issues, not authentication or authorization issues.
* **No new privacy surface.** All events public; no caller identity tracked beyond what the existing Snowbridge events already expose.

## Performance, Ergonomics, and Compatibility

### Performance

* **Gateway:** ~10-15k extra gas per ERC20 release / PNA mint of a **capped** asset. Uncapped assets pay no extra gas (the `Option<uint256>` lookup short-circuits on `None`).
* **AH frontend:** O(1) storage read/write per export of a capped asset.
* **BH outbound queue:** O(1) per-block aggregate increment, negligible.

### Ergonomics

User-facing: under normal operation, invisible. On a trip, the user sees a revert at submit time with a clear reason (Gateway emits `Disabled`-style revert; AH frontend emits a `Frozen` extrinsic error). Indexers should map cap-trip events to user-facing UI states.

Operator-facing: cap configuration is a governance-driven workflow. The relayer-operated dashboard should surface "current net flow vs cap" per asset so operators can spot a trip becoming likely before it happens.

### Compatibility

* **Gateway:** requires a contract upgrade adding storage fields (`cap`, `bucket counters`, `lockdownUntil`), rate-tracking in `submitV1` / `submitV2`, a new V2 inbound command `CommandV2.SetCap(asset, class, value)` for governance to set and update cap values (see §"Initial calibration approach"), and a view function `lockdownUntilOf(address token, uint8 class) external view returns (uint256)` for relayer state recovery. On cap trip, the submit reverts with a structured `CapTripped()` custom error so relayers can route accordingly. The cap storage is shared between V1 and V2 dispatch paths, so setting it via the V2 command flips the cap for both directions. The cap check fires *before* nonce increment so a cap-tripped message is deferred rather than consumed, no asymmetric state with the AH-side burn; see §"Stuck messages and stale fees" for the full reasoning and the fee-top-up fallback. No breaking ABI changes for existing callers. There is no `ResetCap` command, see §"Layer 1" for why a manual reset would be structurally unreachable given the 24-hour auto-lift.
* **BridgeHub (`snowbridge-pallet-system-v2`):** a new extrinsic `set_cap(asset, class, value)` lets governance issue the corresponding `CommandV2.SetCap` to the Gateway. Same shape as the existing `set_operating_mode` extrinsic on `snowbridge-pallet-system-v2`. Root-only origin, consistent with other Gateway-configuration commands.
* **AH frontend:** new pallet (`snowbridge-pallet-rate-limit`) wired into the existing `PausableExporter`. No migration; new state defaults to "no cap configured".
* **Relayer (`snowbridge/relayer`):** required cap-aware retry-scheduling changes. The parachain relayer (`relayer/relays/parachain`) needs to index the Gateway's `CapTripped` / `CapLifted` events and the `lockdownUntilOf(token, class)` view function, and defer retries for affected (token, class) submissions until the indicated unlock block. On a Gateway revert with a `CapTripped()` custom error, the relayer should route to the deferred path rather than retry. Without this change, the relayer will burn gas retrying on every scan loop for the full lockdown window; the messages are still safe (see §"Stuck messages and stale fees") but operationally expensive.

## Prior Art and References

* Hydration's [`pallet-circuit-breaker`](https://github.com/galacticcouncil/hydration-node/tree/master/pallets/circuit-breaker), the net-volume rolling-window pattern this design lifts.
* Wormhole's [Governor](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0007_governor.md) and [Global Accountant](https://github.com/wormhole-foundation/wormhole/blob/main/whitepapers/0011_accountant.md): rolling-24h USD-denominated per-chain cap (Governor) layered with a cumulative balance check (Accountant). Their later [flow-cancelling extension](https://wormhole.com/blog/understanding-the-flow-canceling-governor-in-wormhole) addressed stablecoin caps routinely hitting 100% utilization; informed the net-flow choice in this RFC.
* Chainlink CCIP's [token-pool rate limits](https://docs.chain.link/ccip/concepts/rate-limit-management/how-rate-limits-work): per-token-per-lane token-bucket model `(capacity, refillRate)` denominated in raw token units, optionally layered with a per-lane aggregate USD cap "always lower than the sum of all individual token pool rate limits". The cleanest reference for the design space this RFC targets; CCIP's continuous-refill model is flagged as a v2 refinement in §Future Directions.
* LayerZero OFT [`RateLimiter`](https://docs.layerzero.network/v2/concepts/technical-reference/oft-reference): per-pathway `(limit, window)` with linear refill, raw token denomination, separately tunable inbound and outbound. Demonstrates per-asset-per-route token-denominated as a workable production pattern.
* Axelar's [governance-controlled per-chain daily USD caps](https://www.axelar.network/blog/axelar-governance-explained): closest analogue to a Polkadot-governance-controlled bridge, governance-multisig sets limits on-chain with auto-lift refill.
* Linea's bridge `RateLimiter` ([OpenZeppelin audit notes](https://www.openzeppelin.com/news/linea-bridge-audit-1)): ETH-withdrawn-per-period cap with role-gated reset.
* OP-style optimistic-rollup withdrawal delays (Arbitrum, Optimism 7-day; Across 1.5-hour OO liveness), considered and rejected as a parallel layer for the reasons in "Why no per-tx delay layer".
* The [Nomad bridge exploit post-mortem](https://cloud.google.com/blog/topics/threat-intelligence/dissecting-nomad-bridge-hack) ($190M drained in 150 minutes, no velocity cap), illustrative of the failure mode this RFC's primary cap is designed to prevent.
* [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md), the companion reactive layer.

## Unresolved Questions

* **Which assets get a cap at launch.** Starting set proposed above; final list pre-voted by Fellowship before deployment.
* **Threshold for opting an asset into a cap.** A "total locked value > N x 100k DOT" rule works as a starting heuristic but ignores assets that are low-TVL but high-volume. Worth refining once there's a year of data.
* **Inflow-side credit timing.** Should inflow credit the cap immediately at deposit, or only after some confirmation period? If immediate, a wash-trading attacker could inflate their cap budget by depositing-then-immediately-withdrawing the same asset, paying only gas. Probably need a small inflow delay (a few minutes) before the deposit counts toward the cap.
* **Gas-cost regressivity for capped assets.** Whether the ~10-15k overhead meaningfully shifts the smallest-economical-transfer threshold, and whether that produces a perverse incentive toward uncapped assets for small transfers.

## Future Directions and Related Material
* **Continuous token-bucket refill (CCIP-style) as a v2 refinement.** Replace the discrete 24-hourly sliding-sum with a token-bucket `(capacity, refillRate)` model that refills continuously. Two real advantages: it avoids "midnight reset" gameability of fixed buckets, and the per-block accounting is cheaper. Same calibration framework as the current design, different arithmetic on the storage layout. Sensible v2 once the v1 layer has operational data.
* **Combined per-asset + per-lane aggregate USD cap (CCIP-style).** The canonical "fully defended" end-state: per-asset token-denominated caps (this RFC) plus an aggregate USD cap on the bridge as a whole, with the aggregate always lower than the sum of per-asset caps. The aggregate catches multi-asset coordinated drains that no individual per-asset cap would trip. Would pull an oracle into the path but as a *parallel* check rather than replacing the per-asset caps, so oracle manipulation can't bypass the primary defense. Treat as a follow-up RFC once the per-asset layer is shipping.
* **Generalised fisherman / watchtower bonded-challenge layer.** Extend Snowbridge's existing fisherman role into a generalised challenge mechanism: external monitors can pause an asset by posting a bond, similar in shape to the emergency-pause `trigger()` but per-asset. Composes well with both this RFC's caps and the pause pallet. Deserves its own design work; not a quick add to this RFC.
* **Auto-calibration.** Once per-asset trailing-7-day-median telemetry is observable, the formula `cap = max(5x median, floor)` could be re-applied periodically via a governance batch, replacing the initial TVL-fraction heuristic.
* **Asset-class default caps at registration.** Add an "asset class" field to the asset registry (stablecoin, ETH-LST, long-tail, etc.) with a per-class default cap multiplier so new asset listings auto-cap at a sensible starting value pending governance refinement.
* **Companion RFC:** the [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md) (PR #166) specifies the reactive layer that this preventive layer composes with.
