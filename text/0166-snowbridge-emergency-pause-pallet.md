# RFC-0166: Snowbridge Emergency Pause Pallet

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2026-05-28                                                                                  |
| **Description** | A permissionless, deposit-gated emergency pause for Snowbridge that halts both sides of the bridge via best-effort calls with on-chain retry, resolved by Fellowship. |
| **Authors**     | Snowbridge team                                                                             |

## Summary

At the moment, there is no way for Snowbridge to be halted immediately. The best course of action to halt the bridge should an exploit be detected, is to halt the bridge through a whitelisted caller proposal, through OpenGov. This has obvious drawbacks - even if a Snowbridge exploit is detected, there is no way to halt the bridge on-chain (off-chain relayers can be switched off but it is obviously not a fool-proof stopgap). This RFC proposes a permissionless, instant Snowbridge halt if the caller deposits a large sum of DOT, to be slashed if paused maliciously. This proposal is a reactive security measure (i.e. a exploit or vulnerability first need to be visible for this functionality to be useful). Another proposal, Snowbridge Circuit Breakers, is proposed alongside this RFC for a more proactive approach.

## Motivation

Snowbridge has no near-immediately halt path today. Existing governance halt routes require a referendum  and Fellowship action (hours-to-days latency). Both are too slow for an active drainage exploit and to stop activity during investigation.

Investigation into the new TX pause pallet and Safe Mode pallet ([polkadot-fellows/runtimes PR1164](https://github.com/polkadot-fellows/runtimes/pull/1164) revealed that parts that can be reused and referenced, but
it does not resolve Snowbridge's need directly. Pallet Safe Mode blocks all calls on the chain, including unrelated parts of the chain, which could have intended affects for the rest of chain. Besides this, Snowbridge requires a multi-chain freeze that spans Ethereum contracts, Bridge Hub and Asset Hub. Neither of these two existing pallets support inter-chain messaging. Similarly, pallet TX Pause requires a privileged origin. Snowbridge requires a permissionless pausing mechanism, given an sizeable, slashable deposit.

## Stakeholders

* **Polkadot Fellowship**, the `ResolveOrigin` and the body that decides between genuine vs malicious triggers. The most likely callers of a permissionless trigger during an incident.
* **Snowbridge maintainers**, who implement and operate the halt path.
* **Snowbridge users and integrators**, who experience a halt as the bridge being closed at submit time on both Ethereum and AssetHub.
* **Polkadot Treasury**, the destination of slashed deposits on malicious triggers.

## Explanation

### Goal

A permissionless DOT deposit triggers a complete Snowbridge halt, in response to possible exploit (stop new activity while investigating) and active exploits (attacker is actively draining value).

### Implementation

The proposed implementation starts with an entry point extrinsic on Bridge Hub (in a new pallet). The extrinsic should require a DOT deposit. If a valid deposit has been reserved, the pallet state should change to `Halted`. The caller should specify an `Immediate` or `Gradual` option to the extrinsic:

- `Immediate`: The immediate option would immediately block all incoming and outgoing bridge traffic on BridgeHub. This might have inconvenient effects on both sides of the bridge - Ethereum transactions might have been submitted and will not be processed on Polkadot, and transactions from other parachains might have to initiated but will not be completed due to the immediate block on BridgeHub. In an active exploit scenario, the upside (blocking all traffic, immediately) outweighs the downside, given that it can be corrected with a follow-up recon proposal.
- `Gradual`: The gradual option sends the required cross-chain messages to block messages incoming from AssetHub and Ethereum, so that the bridge is halted gracefully, with inflight transactions being allowed to complete before halting the bridge. This case would make more sense to use in a situation where a vulnerability is detected but not actively exploited.

Once the pallet is in `Halted` state, follow-up calls to the same extrinsic will fail.

The halting extrinsics and messages that will be used to block the bridge are:

1. `EthereumInboundQueue::set_operating_mode(Halted)` (Immediate)
2. `EthereumInboundQueueV2::set_operating_mode(Halted)` (Immediate)
3. `EthereumOutboundQueue::set_operating_mode(Halted)` (Immediate)
4. `EthereumOutboundQueueV2::set_operating_mode(Halted)` (Immediate) - needs to be implemented, does not exist yet.
5. `EthereumBeaconClient::set_operating_mode(Halted)` (Immediate)
6. `snowbridgeSystemFrontend::set_operating_mode(Halted)` (Immediate, Gradual)
7. Outbound governance command via `EthereumSystem` (Immediate, Gradual)

We should consider adding a bridge operating mode state check in the Ethereum `submitV1` and `submitV2` contracts, to prevent in-flight messages from P->E from processing in an immediate halt.

These calls are all best-effort, and failure does not prevent the other calls from being executed. The pallet attempts each, logs successes and failures, and re-attempts pending calls in later blocks via `on_initialize`.

### Resuming the bridge

Resume is the symmetric inverse of the halt. Resuming the bridge and resolution of the halt deposit are separate extrinsics, to allow granular control over the shape of the recovery. The Fellowship will likely bundle the two concerns in a single whitelisted caller proposal (e.g. resume + slash), but in some cases, the specific scenario might require a longer halted bridge state. In that case, the halting account may be refunded, but the bridge should not be resumed yet.

To prevent censoring the bridge should the Technical Fellowship being unavailable for an extended amount of time, the bridge should autoresume after a set duration, set in the pallet config (suggested around 2 weeks).

The resume extrinsic should do the inverse of all the operations expressed in the previous section, and set the pallet state to `Normal`. While the async calls execute, the bridge might actually be in `Halted` still, but since this is short in duration (1-2 mins) the temporary inconsistency is allowable.

The pallet should also have an extend extrinsic, callable by the Fellowship, to extend the halt by the provided duration.

### Releasing or slashing the deposit

The pallet should add two extrinsics to resolve the halting deposit - `slash` and `refund`. Slashing the deposit should send the deposit to Treasury on Asset Hub. Refunding the deposit should release the funds back to the sender. It might be worthwhile to capture a bounded text reason, to capture the reason behind the slash or refund onchain.

### Threat model coverage

- **E→P entry (Ethereum-side UX)**, Gateway halt (call 7).
- **E→P in-flight + inbound-queue exploit**, inbound V1 + V2 halts (calls 1, 2). Critically also covers exploits that bypass the Gateway entirely (malformed proofs, payload-decode bugs, MMR weaknesses).
- **P→E new submissions during AH-halt-in-flight window, V1**, outbound V1 halt (call 3).
- **P→E new submissions during AH-halt-in-flight window, V2**, outbound V2 halt (call 4).
- **P→E entry (AH-side UX)**, AH frontend halt (call 6).
- **Beacon-client exploit**, beacon client halt (call 5).

## Drawbacks

- **Griefing**: This proposal adds permissionless halting, guarded by a slashable deposit. Someone who is willing to lose funds to censor the bridge, could repeatedly call the permissionless halt. In practice, this seems unlikely. Should this happen, the deposit amount can be upped as a further deterrent.
- **Best Effort Halt**: Since the halt relies on async calls to multiple chains, there is the possibility that some of the halt calls might fail.

## Testing, Security, and Privacy

* **Pallet unit tests:** Usual tests to cover the pallet code, in a unit test fashion (including halt type, deposit under sufficient/insufficient balance, bridge resuming, extend).
* **Integration tests:** Test that calls the pallet extrinsic and verifies all the expected effects occur (all the Bridge Hub halt events trigger, outbound message to Ethereum is queued and AssetHub receives and processed Snowbridge system frontend halt message).
* **End-to-end simulation** (chopsticks fork): Polkadot ecosystem tests to verify that all the correct behaviour executes against a fork of Polkadot mainnet.
* **Security posture:** the pallet creates a new attack surface. This is the intended design, calibrated against the asymmetric harm of being unable to halt during an active drainage.

## Performance, Ergonomics, and Compatibility

### Performance

Performance is not really a concern of this RFC, since the halt is gated by a large deposit and is unlikely to ever receive high traffic. That said, Bridge Hub local operations are O(1) storage writes. The outbound calls to Ethereum and AssetHub are well-defined and there is no performance concern with them.

### Ergonomics

The permissionless halt trigger is an extrinsic with large (to be determined, around 100k) DOT in the signer's account. Offchain relayers should implement watching events for the new pallet, and also stop relaying messages once the pallet `Halted` state is discovered.

The second user of this new function is the Fellowship, who will likely interact with this pallet through whitelisted caller proposals, to resume, slash, refund or extend the halt.

### Compatibility

This proposal mostly adds new functionality, with minor extensions to EthereumOutboundQueueV2 and EthereumOutboundQueueV1 (add set_operating_mode` extrinsic). As mentioned in the implementation, `submitV1` and `submitV2` Ethereum contracts should also check the operating mode, to ensure messages already enqueued on Polkadot can still be prevented to process on Ethereum. The new storage defaults to `Normal` so the change is backwards-compatible. No other existing Snowbridge pallet interfaces change. 

## Prior Art and References

* [polkadot-fellows/runtimes #1089](https://github.com/polkadot-fellows/runtimes/issues/1089), the chain-wide safe-mode and tx-pause deployment proposal.
* [polkadot-fellows/runtimes #1164](https://github.com/polkadot-fellows/runtimes/pull/1164), the AssetHub safe-mode wiring.
* `pallet-safe-mode` and `pallet-tx-pause` in the Polkadot SDK.
* TBA Snowbridge Circuit Breakers RFC, the companion preventive layer.

## Unresolved Questions

These all relate to pallet config, and decisions can be kicked down the line to Polkadot runtime config, if necessary:

* **Retry backoff:** Need to agree on a retry setting config, perhaps 30-60 seconds, in block time.
* **Deposit:** 100k DOT matches the runtimes #1089 number, but Snowbridge halts more than a generic safe-mode would. Worth a separate Fellowship discussion on whether the deposit should be higher.
* **Auto resume duration:** Suggested to be between 7 - 14 days.

## Future Directions and Related Material

* **Per-extrinsic granular pause** as a v2 of the pallet, using `pallet-tx-pause`'s `FullNameOf<T>` addressing.
* **Watchdog automation:** off-chain monitors with funded accounts that auto-trigger on observed anomalies.
* **Companion RFC:** the TBA Snowbridge Circuit Breakers RFC specifies the preventive layer (per-asset Gateway-side velocity caps, AH and BH secondary caps) that bounds value-at-risk during the detection-latency window this pallet does not cover.
