# RFC-0167: Snowbridge Circuit Breakers

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2026-05-28                                                                                  |
| **Description** | Per-asset velocity caps on the Ethereum Gateway (primary), the AssetHub frontend, and the BridgeHub outbound queue (secondary) that automatically throttle anomalous Snowbridge flows. |
| **Authors**     | Snowbridge team                                                                             |

## Summary

Add three layers of automatic rate-limiting to Snowbridge: a primary per-asset velocity cap on the Ethereum Gateway covering both ERC20 release and PNA mint, a secondary per-asset cap on the AssetHub frontend covering outbound exports, and a secondary aggregate message-rate cap on the BridgeHub outbound queue. Each cap tracks rolling 24-hour net flow per asset (or aggregate for BH), trips into a per-asset lockdown when exceeded, and is reset by governance. Caps are denominated in token units (no oracle in the security-critical path) and are opt-in per asset. This is the preventive half of a two-layer halt strategy; see the companion [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md) for the reactive half.

## Motivation

The emergency pause pallet is reactive: a human notices an incident, fires `trigger()`, the halt rolls out. Useful, but it has a detection-latency floor. If a drainage exploit runs for 15 minutes before anyone notices, 15 minutes of value is gone.

Circuit breakers cap value-at-risk during the detection window automatically. Calibrated correctly, they almost never fire in normal operation; when they fire, they buy the security council time to investigate before deciding whether to escalate to the full halt.

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

* Release of escrowed ERC20 (E-to-P originated, asset returning to user)
* Mint of PNA (P-to-E originated, Polkadot-native asset minted on Ethereum)

For each asset and each class, `net = outflow - inflow` over the window. Net flow, not gross, so two-way arbitrage and market-maker activity doesn't burn the budget (lifted from Hydration's `pallet-circuit-breaker` net-volume pattern).

**Window:** rolling 24 hours, implemented as 24 hourly buckets with a sliding sum. 24 hours because that's roughly the time-to-notice budget for a security council; the cap should ensure the bridge cannot be fully drained within one human response cycle.

**Denomination:** token units. No oracle in the security-critical path. The trade-off with a USD-aggregate cap is below in "Why per-asset token-denominated, not aggregate USD".

**Caps are opt-in per asset.** The Gateway maintains `cap[asset][class]: Option<uint256>`. When `None`, that asset+class has no velocity limit and bypasses the rate-tracking logic entirely (saving the ~10-15k gas on every operation). When `Some(n)`, the cap is enforced. Governance decides per asset whether the operational overhead of tracking and tuning a cap is worth it.

This matches the Hydration pattern (their per-asset XCM rate limit is `Option<u128>` keyed off the asset registry). Capping a low-value asset wastes operator attention without buying defense, because the catastrophic outcome of an unrestricted drain is bounded by the asset's total locked value. The 100k-DOT emergency-pause trigger still covers low-cap assets in the rare case a drain attempt happens, just without the automated brake.

A rough heuristic: if the asset's total locked value on the bridge exceeds the 100k DOT trigger deposit by a meaningful multiple (say, 10x), the cap pays for itself in expected loss reduction; below that, skip it.

**Cap formula when set:** `cap = max(5x trailing-7-day-median hourly net flow, configured floor per asset)`.

* The 5x multiplier is high enough to not trip on legitimate spikes (institutional rebalances, arbitrage events, exchange listings).
* The floor prevents low-volume-but-high-value assets from having absurdly small caps relative to their total locked value.
* Both factors are governance-settable per asset; no automatic defaults at asset registration (new assets start uncapped).

**Trip behavior:** sets `lockdownUntil[asset][class]: BlockNumber`. Other assets keep flowing. Other classes for the same asset (e.g. PNA mint still works if ERC20 release tripped) keep flowing. Lockdown blocks new outflow/mint of that asset+class until either:

1. A governance reset arrives via `PRIMARY_GOVERNANCE_CHANNEL`, or
2. `lockdownUntil` is reached (weeks-scale backstop, never expected to fire in normal operation; exists purely so an unresponsive governance cannot lock value forever).

**Reset path.** Implemented as a new Gateway inbound command (`CommandV1.ResetCap`, V1 only), handled identically to existing governance commands like `SetOperatingMode`. Routed from BH through `EthereumSystem` on the V1 outbound queue's `PRIMARY_GOVERNANCE_CHANNEL`, which already bypasses the V1 outbound queue halt (`pallets/outbound-queue/src/send_message_impl.rs:79`), so a cap-reset lands even when the bridge is fully halted. The Gateway's inbound dispatch (`submitV1`/`submitV2`) does not gate on operating mode either, so the command also dispatches regardless of halt state. Same routing pattern as call 7 in the companion pause-pallet RFC (Option A); the V2 path is intentionally not used because the V2 outbound queue has no governance bypass today.

**Gas cost:** each ERC20 release and each PNA mint of a **capped** asset pays ~10-15k extra gas to read+write the per-asset counter and check the cap. Uncapped assets pay no extra gas (the cap lookup short-circuits on `None`). Material but not prohibitive for the small set of high-value assets where capping pays for itself; uncapped low-value assets stay cheap.

### Layer 2 (secondary): AssetHub-frontend per-asset cap on outbound exports

Catches AH-side exploits where the attacker abuses the frontend to send unauthorized exports. Same shape as the Gateway cap (per-asset, net, rolling window) but with much higher caps because actual value extraction is still at the Gateway. Treat this as defense-in-depth, not the primary line.

Cheap to add (`snowbridge-pallet-rate-limit` on AH, hooks into the `PausableExporter`). Tripping blocks new exports for the affected asset on AH; the Gateway-side cap continues to operate independently downstream.

### Layer 3 (secondary): BridgeHub outbound-queue message-rate cap

A protocol-aggregate (not per-asset) cap on how many messages can be committed by the BH outbound queue per block. Catches "suddenly 1000x more messages are being committed than normal", anomalous regardless of which asset they reference. Trip behavior: blocks new commitments until governance reset.

Useful as a generic "something is wrong" detector. Higher false-positive surface than per-asset caps because legitimate spikes (e.g., a new parachain integration goes live) can hit it; calibration should be conservative (10x trailing median, not 5x) and operator workflow should expect occasional governance resets that aren't tied to incidents.

### Why per-asset token-denominated, not aggregate USD

Aggregate USD-equivalent is conceptually tighter: one number captures "total value flowing through the bridge". But it pulls a price oracle into the security-critical path. Oracle manipulation becomes an evasion vector: skew the price of the asset you're draining, the cap reads lower-than-real outflow, you exit. Bad trade-off for a defensive layer.

Per-asset token-denominated avoids this entirely. Each cap is in tokens of that asset; no cross-asset comparison; no oracle. The cost is operational overhead (each registered asset needs its own cap), which is acceptable for Snowbridge's asset registry size (small N forever).

If a global aggregate becomes desired later as additional defense, it can be added as a separate layer with oracle-priced denomination, run *in parallel* to the per-asset caps rather than replacing them.

### Why no per-tx delay layer

An earlier sketch considered a "delay any transfer above threshold X by N hours" layer (optimistic-settlement style). A correctly-set velocity cap subsumes it:

* A single $300M release trips the per-asset cap immediately.
* A slow drain just under the per-hour rate gets caught by the 24h aggregate.
* The threshold the delay would use ends up being approximately the same number as the velocity cap divided by N, so the two layers are largely redundant.

The per-tx delay would add UX friction (legitimate large transfers wait) without earning meaningful additional protection. Optimistic-settlement is the right pattern for OP rollups because it's fundamental to their security model; for Snowbridge it's not.

### Interaction with the emergency-pause pallet

The two systems compose cleanly:

* **Pause pallet halt is global.** When the pause pallet's `trigger()` fires the seven halts, all ERC20 release and PNA mint operations stop regardless of cap state. Cap counters keep accumulating in storage but no outflow happens.
* **Cap trip is per-asset.** A cap trip doesn't halt the bridge; it locks down one asset+class. Other traffic keeps flowing.
* **Resolution order is independent.** If both fire (cap trips, then a human triggers the pause), the pause pallet's `resume()` flips the bridge's operating modes back but does **not** lift the cap lockdown; the cap reset is a separate governance call routed through the Gateway's inbound dispatch (`CommandV1.ResetCap`). This is intentional: the cap is a stronger signal than the human-triggered halt; resetting it should be an explicit additional decision. Conversely, lifting the cap lockdown does not resume a halted bridge.

### Starting caps from current Snowbridge TVL

Concrete proposal for which assets warrant a cap and what the initial value should be, derived from the Snowbridge dashboard snapshot on 2026-05-25. Total TVL is $35.46M across 18 assets.

The cap formula uses trailing-7-day-median hourly net flow as the input, but that data isn't on the public dashboard. The numbers below use a **fraction-of-TVL per 24h window** stand-in heuristic, calibrated by asset turnover profile. Once the cap system is live and per-asset volume telemetry is observable, governance should refine these from the 5x-trailing-median formula instead.

**Tier A: cap at 5% of TVL per 24h (TVL > $5M).** Concentrated holdings where a runaway drain would be catastrophic in absolute terms.

| Asset | TVL | Cap (USD-equivalent, 24h) |
|---|---|---|
| TRAC | $16.83M | $840k |
| tBTC | $5.72M | $285k |

**Tier B: cap at 10% of TVL per 24h (TVL $1M-$5M).** Looser because legitimate spikes are more meaningful relative to TVL at this scale.

| Asset | TVL | Cap (USD-equivalent, 24h) |
|---|---|---|
| ETH | $2.29M | $230k |
| wstETH | $1.89M | $190k |
| PAXG | $1.52M | $150k |
| MYTH | $1.36M | $135k |
| KILT | $1.03M | $103k |
| LINK | $1.02M | $102k |

**Tier C: cap at 15% of TVL per 24h (TVL $500k-$1M, mostly stables).** Highest legitimate turnover (stablecoins move more relative to balance) so the cap is loosest.

| Asset | TVL | Cap (USD-equivalent, 24h) |
|---|---|---|
| WETH | $996k | $150k |
| USDT | $589k | $88k |
| USDC | $575k | $86k |

**Skip caps initially** (TVL < $500k): sUSDe ($471k), AAVE, CFG, SKY, LDO, ENA, WBTC. These stay as `None` in `cap[asset]`. The worst-case outcome of an unrestricted drain on any one of them is bounded by their TVL, which is small enough that the 100k-DOT emergency-pause trigger is sufficient defense. Governance opts an asset in when its TVL crosses $500k or its observed volume profile warrants it.

**On-chain encoding:** the Gateway stores caps in token units (not USD), so these USD figures need to be converted at the asset's prevailing oracle price when the governance vote to set the cap lands. For TRAC at $840k/24h cap: if TRAC trades around $7 at vote time, that's a `cap = 120_000` (TRAC units) value written to storage. The cap stays in token units forever after; if TRAC price moves materially, governance re-votes.

**Caveat on the recent-month volume spikes.** Monthly volume in 2026-04 was $36.07M, in 2025-10 was $84.35M, against a 6-month median of ~$13M. The tier-A and tier-B caps are deliberately permissive enough to tolerate spikes of this scale: a $36M month spread across 30 days is ~$50k/hour aggregate, well below even the smaller per-asset caps. Per-asset distribution of those spike months should be checked to confirm no individual asset would have tripped its cap during them; that is part of why the initial values should be re-tuned from real telemetry.

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
    uint8 indexed class,
    uint8 reason             // 0 = governance reset, 1 = lockdownUntil reached
);
```

`CapApproaching` fires once per window when net flow first crosses 80% of the cap. Recommended alert policy:

* `CapApproaching`, `info` level, log + Slack channel.
* `CapTripped`, `critical` level, page on-call + auto-create incident ticket.
* `CapLifted` with `reason == 0`, `info`, confirms governance reset landed.
* `CapLifted` with `reason == 1`, `warning`, the backstop fired without governance acting; worth a post-mortem.

**AH-frontend secondary (FRAME events):**

```rust
pub enum Event<T: Config> {
    CapApproaching { asset: AssetId, net_flow: Balance, cap: Balance },
    CapTripped { asset: AssetId, net_flow: Balance, cap: Balance, lockdown_until: BlockNumberFor<T> },
    CapLifted { asset: AssetId, reason: LiftReason },
}
```

**BH message-rate-cap secondary (FRAME events):**

```rust
pub enum Event<T: Config> {
    MessageRateCapApproaching { rate: u32, cap: u32 },
    MessageRateCapTripped { rate: u32, cap: u32, lockdown_until: BlockNumberFor<T> },
    MessageRateCapLifted { reason: LiftReason },
}
```

Aggregate, so one stream of events to watch. Higher false-positive surface, alert policy should tolerate occasional trips without paging, escalating only on repeated trips within a short window.

## Drawbacks

* **Calibration uncertainty.** The TVL-fraction starting caps are a heuristic stand-in for the trailing-7-day-median formula because per-asset volume telemetry isn't publicly available. Until live data is collected and the formula recalibrated, some risk of false positives during legitimate spikes remains.
* **Gas overhead on capped assets.** ~10-15k extra gas per ERC20 release / PNA mint of a capped asset. Falls hardest on small transfers (proportionally), with a possible perverse incentive pushing small transfers toward uncapped assets.
* **Per-asset operational overhead.** Each capped asset needs a governance vote to set its initial cap and another to re-tune; that's ongoing operator time.
* **Cap trip can lock funds during a false positive.** A legitimate but anomalous spike can lock down an asset until governance acts. The weeks-scale backstop limits the worst case but a multi-day lockup is uncomfortable.
* **Aggregate USD blind spot.** Per-asset caps don't catch multi-asset coordinated drains where each individual asset stays under its cap. Documented as a follow-up.

## Testing, Security, and Privacy

* **Gateway unit tests** for the rolling-bucket window arithmetic (correct sliding-sum across hour boundaries), `None`-cap short-circuit, lockdown behavior, governance-reset path, and the lockdown-until backstop.
* **AH-frontend pallet tests** for cap accounting on `ExportMessage` and trip behavior on the `PausableExporter` integration.
* **BH outbound-queue tests** for the aggregate message-rate cap.
* **End-to-end simulation** (chopsticks fork): single-tx > cap, slow drain just under per-hour rate, two-way arbitrage staying net-zero, governance reset while halted (verifies the inbound dispatch path lands the reset regardless of operating mode).
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

* **Gateway:** requires a contract upgrade adding storage fields (`cap`, `bucket counters`, `lockdownUntil`), a new inbound command (`CommandV1.ResetCap`, V1 only), and rate-tracking inside `submitV1` / `submitV2` dispatch handlers for the release / mint paths. No breaking ABI changes for existing callers. The reset command is routed through V1 only, leveraging V1's `PRIMARY_GOVERNANCE_CHANNEL` bypass at the BH outbound queue, the same Option A reasoning as the companion pause-pallet RFC's call 7. Adding a `CommandV2.ResetCap` is deferred to V1 deprecation, at which point the V2 outbound queue will also gain its governance bypass.
* **AH frontend:** new pallet (`snowbridge-pallet-rate-limit`) wired into the existing `PausableExporter`. No migration; new state defaults to "no cap configured".
* **BH:** message-rate counter added to the outbound queue pallet. No migration.

## Prior Art and References

* Hydration's [`pallet-circuit-breaker`](https://github.com/galacticcouncil/hydration-node/tree/master/pallets/circuit-breaker), the net-volume rolling-window pattern this design lifts.
* OP-style optimistic-rollup withdrawal delays, considered and rejected as a parallel layer for the reasons in "Why no per-tx delay layer".
* [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md), the companion reactive layer.

## Unresolved Questions

* **Which assets get a cap at launch.** Starting set proposed above; final list pre-voted by Fellowship before deployment.
* **Threshold for opting an asset into a cap.** A "total locked value > N x 100k DOT" rule works as a starting heuristic but ignores assets that are low-TVL but high-volume. Worth refining once there's a year of data.
* **Inflow-side credit timing.** Should inflow credit the cap immediately at deposit, or only after some confirmation period? If immediate, a wash-trading attacker could inflate their cap budget by depositing-then-immediately-withdrawing the same asset, paying only gas. Probably need a small inflow delay (a few minutes) before the deposit counts toward the cap.
* **Gas-cost regressivity for capped assets.** Whether the ~10-15k overhead meaningfully shifts the smallest-economical-transfer threshold, and whether that produces a perverse incentive toward uncapped assets for small transfers.
* **Reset preimage authoring vs on-chain reset extrinsic.** Two paths are available for issuing the `ResetCap` command:
  * Build it as a governance XCM preimage in the Snowbridge SDK alongside the existing halt/unhalt preimages, submit via OpenGov (hours).
  * Add an `on_chain_reset_cap(asset, class)` extrinsic on a BH pallet, callable by Fellowship XCM voice (minutes), which builds and dispatches the V1 outbound governance command from pallet code.

  The companion pause-pallet RFC moves halt/resume on-chain into a pallet for permissionless-speed (halt) and Fellowship-XCM-voice-speed (resume). The case for the same move on cap-reset is weaker: cap-reset is fundamentally a deliberate Fellowship decision after investigating *why* the cap tripped, and "wait for OpenGov" arguably is the right cadence rather than a misfeature. SDK-only is the proposed starting point; an on-chain reset extrinsic is a future direction if operational experience shows the OpenGov path is too slow in practice.

## Future Directions and Related Material

* **Global aggregate USD cap as a third parallel layer.** Catches multi-asset coordinated drains. Would pull an oracle into the path but as a *parallel* check, not replacing the per-asset caps, so oracle manipulation can't bypass the primary defense.
* **Auto-calibration.** Once per-asset trailing-7-day-median telemetry is observable, the formula `cap = max(5x median, floor)` could be re-applied periodically via a governance batch, replacing the initial TVL-fraction heuristic.
* **Asset-class default caps at registration.** Add an "asset class" field to the asset registry (stablecoin, ETH-LST, long-tail, etc.) with a per-class default cap multiplier so new asset listings auto-cap at a sensible starting value pending governance refinement.
* **V2 outbound queue governance bypass (V1-deprecation follow-up).** Cap-reset currently routes through V1's `EthereumSystem`. When V1 is deprecated, `CommandV2.ResetCap` will need to exist on the Gateway and the V2 outbound queue will need to gain a governance bypass on its send path. Tracked in tandem with the equivalent follow-up in the [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md) (PR #166).
* **Companion RFC:** the [Snowbridge Emergency Pause Pallet RFC](./0166-snowbridge-emergency-pause-pallet.md) (PR #166) specifies the reactive layer that this preventive layer composes with.
