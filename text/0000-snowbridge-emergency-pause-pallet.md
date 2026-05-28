# RFC-XXXX: Snowbridge Emergency Pause Pallet

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2026-05-28                                                                                  |
| **Description** | A permissionless, deposit-gated emergency pause for Snowbridge that halts both sides of the bridge via best-effort calls with on-chain retry, resolved by Fellowship. |
| **Authors**     | Snowbridge team                                                                             |

## Summary

Add a new FRAME pallet to BridgeHub (`pallet-snowbridge-emergency-pause`) that lets any account post a 100,000 DOT deposit to halt Snowbridge end-to-end. The halt is a best-effort sequence of seven side-effecting calls (five BridgeHub-local, one XCM to AssetHub, one outbound governance command to the Ethereum Gateway) with `on_initialize` retry of any leg that fails to land. Fellowship resolves the trigger as genuine (refund) or malicious (slash to treasury); a 7-day on-chain backstop refunds and resets only if Fellowship is incapacitated. This is the reactive half of a two-layer halt strategy; see the companion Snowbridge Circuit Breakers RFC (TBA) for the preventive half.

## Motivation

Snowbridge has no fast, broadly-accessible halt path today. Existing governance halt routes require a referendum (hours-to-days latency) or Fellowship action (minutes-to-hours, and only if Fellowship is reachable). Both are too slow for an active drainage exploit and too high-friction for "stop new activity while we investigate".

Two pieces of prior work in the Fellowship are relevant but do not solve Snowbridge's halt needs:

* [polkadot-fellows/runtimes #1089](https://github.com/polkadot-fellows/runtimes/issues/1089), proposing deployment of `pallet-tx-pause` and `pallet-safe-mode` across system chains.
* [polkadot-fellows/runtimes #1164](https://github.com/polkadot-fellows/runtimes/pull/1164) (draft), wiring `pallet-safe-mode` into AssetHub with a 100k DOT permissionless trigger.

Neither fits Snowbridge:

* **Blast radius is wrong.** `pallet-safe-mode` installs a chain-wide `BaseCallFilter`. On BridgeHub that would freeze Kusama-side bridging, identity, governance proxies, etc., not just Snowbridge.
* **No outbound side-effects.** Safe-mode is a passive filter. It cannot emit the XCM to AssetHub that halts `snowbridgeSystemFrontend`, and it cannot queue the outbound governance command that flips the Ethereum Gateway's operating mode.
* **Wrong release semantics.** Safe-mode's `EnterDuration` is days-scale, with auto-resume as the normal exit path. For a multi-million-TVL bridge, auto-resuming under an active attack is more dangerous than staying paused; the duration must be a long backstop, not the expected exit.
* **`pallet-tx-pause` requires Fellowship origin** for trigger and has no Currency coupling for a deposit.

What's needed: a Snowbridge-specific halt with a permissionless economic trigger that executes the different halting mechanisms, a longer halt window, and Fellowship-driven genuine/malicious classification.

## Stakeholders

* **Polkadot Fellowship**, the `ResolveOrigin` and the body that decides between genuine vs malicious triggers.
* **Snowbridge maintainers**, who implement and operate the halt path.
* **Snowbridge users and integrators**, who experience a halt as the bridge being closed at submit time on both Ethereum and AssetHub.
* **Polkadot Treasury**, the destination of slashed deposits on malicious triggers.
* **Security researchers and watchdog operators**, the most likely callers of a permissionless trigger during an incident.

## Explanation

### Goal

A permissionless 100,000 DOT deposit triggers a complete Snowbridge halt, in response to possible exploit (stop new activity while investigating) and active exploits (attacker is actively draining value).

### The seven halt calls

The pallet adds one new extrinsic to BridgeHub, `trigger()`. It is permissionless, gated only by a 100,000 DOT reservable deposit. On a successful call it reserves the deposit, transitions state to `Triggered`, and dispatches the seven halt calls below in priority order. Six of the seven are the same `set_operating_mode` extrinsics that root-level governance halts use today; the new pallet becomes an additional (deposit-gated, permissionless) caller of them. The seventh, `EthereumOutboundQueueV2::set_operating_mode(Halted)`, is a new extrinsic this RFC requires on the V2 outbound queue. V2's pause architecture is single-chokepoint at AssetHub: `pallet-snowbridge-system-frontend` owns the operating mode, and the AH XCM router's `PausableExporter` checks it at `validate()` time, so a halted frontend means V2 messages never reach BridgeHub at all, making a BH-local mode redundant in the steady state. The emergency-pause use case introduces a new reason for it: during the ~1-2 min window between `trigger()` and the cross-chain AH frontend halt (call 6) actually landing, V2 messages users submit on AH still pass `PausableExporter` (the frontend is still `Normal`), wrap into `ExportMessage`, ride XCMP to BH, and queue in V2 outbound with no check. The new BH-local mode closes that window symmetrically with how call 3 does for V1.

None of the seven calls block the trigger: the pallet attempts each, logs successes and failures, and re-attempts pending legs in later blocks via `on_initialize`.

BridgeHub-local calls are fired first because they are synchronous local writes with no cross-chain dependency, so they typically land in the same block as the trigger. **This serves as an immediate hard-stop of any asset flow through the bridge.** It could cause asymmetry in bridge assets (e.g. funds locked on Ethereum but not minted on AssetHub), but this is preferable to more possible illegitimate transactions being processed through the bridge. The two cross-chain calls depend on HRMP delivery and BEEFY relay respectively, so they take ~1-2 min when everything is healthy and can take longer or fail entirely under congestion.

1. `EthereumInboundQueue::set_operating_mode(Halted)` (BH local), blocks E→P V1 dispatch on Polkadot. Covers inbound-queue exploits and any in-flight V1 message arriving before the Gateway halt lands.
2. `EthereumInboundQueueV2::set_operating_mode(Halted)` (BH local), same for V2.
3. `EthereumOutboundQueue::set_operating_mode(Halted)` (BH local), rejects V1 P→E exports when AH's XCM `ExportMessage` lands on BH. Closes the gap between trigger time and the AH frontend halt landing.
4. `EthereumOutboundQueueV2::set_operating_mode(Halted)` (BH local, new). Same as call 3 but for V2 P→E exports. Closes the symmetric in-flight gap before the Gateway halt lands on Ethereum.
5. `EthereumBeaconClient::set_operating_mode(Halted)` (BH local), stops new beacon-header ingestion. Doesn't gate dispatch directly (calls 1 and 2 already do) but it's a cheap defense-in-depth lever for the case where the exploit IS the beacon client.
6. AH `snowbridgeSystemFrontend::set_operating_mode(Halted)` (XCM Transact from BH). Blocks AH users and parachains from even attempting P→E sends.
7. Outbound governance command via `EthereumSystem` / `EthereumSystemV2` flipping the Ethereum Gateway to `OperatingMode::RejectingOutboundMessages`. With Fiat-Shamir-assisted BEEFY verification this lands on Ethereum in ~1-2 min instead of ~20 min.

### Why best-effort everywhere

All seven calls are best-effort: any one of them failing does not abort `trigger()` or revert the others. The motivating failure mode is the XCM Transact to AH (call 6), which depends on the BH outbound HRMP queue having capacity. Under congestion, the same congestion an active incident might be causing, that send can fail. If the trigger were all-or-nothing, the whole halt would revert and the bridge would stay open at exactly the moment we need it closed. With best-effort, whichever calls land at trigger time take effect; the rest are retried by `on_initialize`. Worst case: "the bridge is closed via whatever subset landed, and the remaining levers retry on subsequent blocks".

The BH-local calls are synchronous storage writes on the same chain as the pallet, so they should always succeed; treating them as best-effort too doesn't change behavior in the common case, it just removes a class of "trigger reverted because of an edge case nobody anticipated" outcomes.

### Pallet structure

#### Storage

```rust
#[pallet::storage]
pub type State<T: Config> = StorageValue<_, PauseState<T>, ValueQuery>;

pub enum PauseState<T: Config> {
    Normal,
    Triggered {
        who: T::AccountId,
        at: BlockNumberFor<T>,
        deadline: BlockNumberFor<T>,
        deposit: BalanceOf<T>,
        pending: PendingHalts,
        last_attempt: BlockNumberFor<T>,
    },
}

#[derive(Encode, Decode, TypeInfo, Clone, Copy, PartialEq, Eq)]
pub struct PendingHalts {
    pub inbound_v1: bool,
    pub inbound_v2: bool,
    pub outbound_v1: bool,
    pub outbound_v2: bool,
    pub beacon_client: bool,
    pub ah_frontend: bool,
    pub gateway: bool,
}

#[pallet::storage]
pub type TriggerDeposit<T: Config> =
    StorageValue<_, BalanceOf<T>, ValueQuery, T::TriggerDeposit>;
```

#### Config trait

```rust
pub trait Config: frame_system::Config {
    type RuntimeEvent: From<Event<Self>> + IsType<<Self as frame_system::Config>::RuntimeEvent>;
    type Currency: ReservableCurrency<Self::AccountId>;
    type TriggerDeposit: Get<BalanceOf<Self>>;             // 100_000 DOT
    type BackstopDuration: Get<BlockNumberFor<Self>>;      // 7 days
    type ExtendDuration: Get<BlockNumberFor<Self>>;
    type ResolveOrigin: EnsureOrigin<Self::RuntimeOrigin>; // Fellowship XCM voice
    type SlashDestination: OnUnbalanced<NegativeImbalanceOf<Self>>; // Treasury
    type LocalHaltHook: SnowbridgeLocalHalt;
    type AssetHubXcmSender: SendXcm;
    type GatewayHaltSender: OutboundQueue;
    type RetryBackoff: Get<BlockNumberFor<Self>>;
}
```

`LocalHaltHook` is a thin trait the runtime implements to call `set_operating_mode(Halted)` on the four BH-local pallets, so the new pallet has zero direct dependency on them. The hook exposes per-leg methods each returning `DispatchResult` so the trigger can record which legs succeeded and retry only the failed ones.

#### Calls

* `trigger()`, permissionless. Checks `State::Normal`, reserves `TriggerDeposit`, attempts each of the seven halt calls in priority order, records which succeeded and which are still pending, transitions to `Triggered`. Emits `EmergencyPauseTriggered` plus a per-leg `HaltSucceeded` / `HaltFailed { leg, reason }`.
* `resolve_genuine()`, `ResolveOrigin` only. Unreserves deposit, transitions to `Normal`. Does not unpause Snowbridge; that is a separate governance act so incident response stays explicit.
* `resolve_malicious()`, `ResolveOrigin` only. Slashes deposit to `SlashDestination`, transitions to `Normal`, and additionally calls into the unpause path.
* `force_extend()`, `ResolveOrigin` only. Pushes `deadline` out by `ExtendDuration`.

`on_initialize` hook does two things while `State::Triggered`:

* If any leg is still pending and at least `RetryBackoff` blocks have passed since the last attempt, re-attempt just those legs.
* If `now >= deadline`, unreserve deposit, transition to `Normal`, emit `ResolvedTimeout`. Quorum-failure backstop only.

#### Events and errors

Events: `EmergencyPauseTriggered { who, deposit, deadline, pending }`, `HaltSucceeded { leg }`, `HaltFailed { leg, reason }`, `ResolvedGenuine`, `ResolvedMalicious { slashed }`, `ResolvedTimeout`, `Extended { new_deadline }`.

Errors: `AlreadyTriggered`, `NotTriggered`, `InsufficientDeposit`. There is intentionally no `HaltFailed` error variant; per-leg failures surface as events, not as dispatch errors, because they do not abort the trigger.

### What we reuse from prior work

**From `pallet-safe-mode` and [PR #1164](https://github.com/polkadot-fellows/runtimes/pull/1164)'s AssetHub wiring:** the deposit / reserve / release pattern, the `EnsureXcm<IsVoiceOfBody>` origin pattern for `ResolveOrigin`, the 100k DOT deposit calibration, the duration / extension machinery (`EnterDuration` + `ExtendDuration` + `on_initialize` deadline check).

**From `pallet-tx-pause`:** the (pallet, call) addressing convention as a future direction if a softer per-extrinsic pause is ever wanted, and the runtime-level Fellowship-only call gating model for `resolve_*`.

**Net code reuse:** the deposit/reserve/slash skeleton and the duration/extension/timeout machinery come from `pallet-safe-mode`. What we drop is the `BaseCallFilter` integration. What we add is the seven side-effect hooks (one of which requires a small accompanying change to the V2 outbound queue pallet, see §Compatibility) and the best-effort retry loop in `on_initialize`.

### Threat model coverage

* **E→P entry (Ethereum-side UX)**, Gateway halt (call 7).
* **E→P in-flight + inbound-queue exploit**, inbound V1 + V2 halts (calls 1, 2). Critically also covers exploits that bypass the Gateway entirely (malformed proofs, payload-decode bugs, MMR weaknesses).
* **P→E in-flight V1**, outbound V1 halt (call 3).
* **P→E in-flight V2**, outbound V2 halt (call 4).
* **P→E entry (AH-side UX)**, AH frontend halt (call 6).
* **Beacon-client exploit**, beacon client halt (call 5).

## Drawbacks

* **Spam vector mitigated only by deposit.** A determined adversary willing to forfeit 100k DOT can halt the bridge once. The Fellowship-resolved slash makes repeat abuse expensive but a single griefing event is unavoidable. The companion preventive layer reduces the value an attacker gains from the resulting investigation window.
* **Per-leg outcome dispersion.** Operators must inspect emitted events to know which legs actually landed. Worst case: a triggered pallet with the Gateway halt still pending for many blocks if the BH outbound queue is congested.
* **Bridge recovery before the backstop fires requires a reachable Fellowship.** The only paths back to `Normal` ahead of the 7-day backstop are `resolve_genuine` and `resolve_malicious`, both Fellowship-only. If Fellowship is unreachable at the same time as a bad trigger (a troll halt, a false-alarm halt), the bridge stays halted until the backstop auto-unhalts, up to a week later. Funds aren't lost, but no new transfers move in or out during that window. Intentional bias: auto-resuming too early under an active attack is worse than a week of downtime for legitimate users, but worth noting as a real failure mode.
* **Cross-chain calls remain a dependency.** If HRMP between BH and AH is down, the AH frontend halt will never land via `on_initialize`. The pallet has no in-band escape hatch for this case; Fellowship would need to land a separate runtime call (e.g., re-routing the XCM through an alternate path) outside the pallet's API.

## Testing, Security, and Privacy

* **Per-leg pallet tests** asserting each `LocalHaltHook` leg flips the correct storage, and that `on_initialize` retries the right subset on partial failure.
* **XCM integration tests** with a wedged AH HRMP queue, asserting `trigger()` still transitions to `Triggered`, records the AH leg as pending, retries on subsequent blocks, and clears once HRMP drains.
* **End-to-end simulation** (chopsticks fork): trigger with all seven legs healthy, with one failed leg, with the BH outbound queue at capacity, with AH unreachable. Each scenario should yield "bridge closed via whatever subset landed, remaining legs pending".
* **Deposit reservation paths** under sufficient/insufficient balance.
* **Resolution paths** (`resolve_genuine`, `resolve_malicious`, timeout, `force_extend`).
* **No new privacy surface.** All events are public; the deposit caller is already implicit in the transaction signer.
* **Security posture:** the pallet creates a new attack surface (anyone with 100k DOT can halt). This is the intended design, calibrated against the asymmetric harm of being unable to halt during an active drainage.

## Performance, Ergonomics, and Compatibility

### Performance

Trigger weight is dominated by the seven side-effect calls. BH-local legs are O(1) storage writes; the AH XCM and Gateway outbound legs queue messages but do not synchronously execute remote logic. `on_initialize` weight while `Triggered` is bounded by the per-leg retry cost gated by `RetryBackoff`, so the steady-state idle cost is reading `State` and a block-number comparison.

### Ergonomics

Trigger UX is one extrinsic with 100k DOT in the signer's account. Operator UX during a triggered state is event-driven, the relayer indexer should add `EmergencyPauseTriggered` and per-leg `HaltSucceeded` / `HaltFailed` to its watch set. Fellowship-side, `resolve_genuine` / `resolve_malicious` / `force_extend` follow the same XCM-voice pattern as existing Fellowship governance calls.

### Compatibility

One small change is required to an existing Snowbridge pallet: `EthereumOutboundQueueV2` gains an `OperatingMode` storage item and a `set_operating_mode` extrinsic, mirroring the V1 outbound queue. V2 deliberately omitted this because its pause architecture is single-chokepoint at the AH frontend's `PausableExporter`; in the steady state, a halted frontend means nothing reaches BH, so a BH-local check is redundant. This RFC adds the check as defense-in-depth for the brief window during which the cross-chain AH frontend halt is in flight (see §"The seven halt calls" for the full reasoning). The new storage defaults to `Normal` so the change is backwards-compatible. No other existing Snowbridge pallet interfaces change. The `LocalHaltHook` trait is new and implemented in the runtime. The XCM Transact and Gateway outbound paths use existing pallets and channels. No migration required for the new pallet's `State` (initial value is `Normal`).

## Prior Art and References

* [polkadot-fellows/runtimes #1089](https://github.com/polkadot-fellows/runtimes/issues/1089), the chain-wide safe-mode and tx-pause deployment proposal.
* [polkadot-fellows/runtimes #1164](https://github.com/polkadot-fellows/runtimes/pull/1164), the AssetHub safe-mode wiring.
* `pallet-safe-mode` and `pallet-tx-pause` in the Polkadot SDK.
* TBA Snowbridge Circuit Breakers RFC, the companion preventive layer.

## Unresolved Questions

* **`RetryBackoff` calibration.** Too short hammers a congested HRMP queue; too long extends cross-chain halt latency. ~30-60 seconds (a few blocks) is a starting point.
* **Cross-chain call ordering.** Whether to fire the AH XCM and the Gateway outbound send in a fixed order or in parallel within the same block. They are independent in practice.
* **Deposit calibration.** 100k DOT matches the runtimes #1089 number, but Snowbridge halts more than a generic safe-mode would. Worth a separate Fellowship discussion on whether the deposit should be higher.
* **`BackstopDuration` value.** Default is 7 days. Open question whether a longer value (e.g. 2-3 weeks) is warranted as additional caution against premature auto-resume under a prolonged real incident, weighed against the longer worst-case downtime in the Fellowship-unreachable case. Set in runtime config; can be tuned without changing the pallet.

## Future Directions and Related Material

* **Per-extrinsic granular pause** as a v2 of the pallet, using `pallet-tx-pause`'s `FullNameOf<T>` addressing.
* **Watchdog automation:** off-chain monitors with funded accounts that auto-trigger on observed anomalies, with the deposit acting as their skin in the game.
* **Companion RFC:** the TBA Snowbridge Circuit Breakers RFC specifies the preventive layer (per-asset Gateway-side velocity caps, AH and BH secondary caps) that bounds value-at-risk during the detection-latency window this pallet does not cover.
