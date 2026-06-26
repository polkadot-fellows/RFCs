# RFC-0166: Snowbridge Emergency Pause Pallet

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2026-05-28                                                                                  |
| **Description** | A permissionless, deposit-gated emergency pause for Snowbridge that halts both sides of the bridge via best-effort calls with on-chain retry, resolved by Fellowship. |
| **Authors**     | Snowbridge team                                                                             |

## Summary

At the moment, there is no way for Snowbridge to be halted immediately. The best course of action to halt the bridge should an exploit be detected, is to halt the bridge through a whitelisted caller proposal, through OpenGov. This has obvious drawbacks - even if a Snowbridge exploit is detected, there is no way to halt the bridge on-chain (off-chain relayers can be switched off but it is obviously not a fool-proof stopgap). This RFC proposes a permissionless, instant Snowbridge halt if the caller deposits a large sum of DOT, to be slashed if paused maliciously. This proposal is a reactive security measure (i.e. a exploit or vulnerability first need to be visible for this functionality to be useful). Another proposal, [Snowbridge Circuit Breakers](https://github.com/polkadot-fellows/RFCs/pull/167), is proposed alongside this RFC for a more proactive approach.

## Motivation

Snowbridge has no near-immediate halt path today. Existing governance halt routes require a referendum  and Fellowship action (hours-to-days latency). Both are too slow for an active drainage exploit and to stop activity during investigation.

Investigation into the new TX Pause pallet and Safe Mode pallet ([polkadot-fellows/runtimes PR1164](https://github.com/polkadot-fellows/runtimes/pull/1164)) revealed parts that can be reused and referenced, but they do not resolve Snowbridge's need directly. Pallet Safe Mode blocks all calls on the chain, including unrelated parts of the chain, which could have unintended effects for the rest of the chain. Besides this, Snowbridge requires a multi-chain freeze that spans Ethereum contracts, Bridge Hub and Asset Hub. Neither of these two existing pallets support inter-chain messaging. Similarly, pallet TX Pause requires a privileged origin. Snowbridge requires a permissionless pausing mechanism, given a sizeable, slashable deposit.

## Stakeholders

* **Polkadot Fellowship**, the `ResolveOrigin` and the body that decides between genuine vs malicious triggers. The most likely callers of a permissionless trigger during an incident.
* **Snowbridge maintainers**, who implement and operate the halt path.
* **Snowbridge users and integrators**, who experience a halt as the bridge being closed at submit time on both Ethereum and AssetHub.
* **Polkadot Treasury**, the destination of slashed deposits on malicious triggers.

## Explanation

### Goal

A permissionless DOT deposit triggers a complete Snowbridge halt, in response to possible exploit (stop new activity while investigating) and active exploits (attacker is actively draining value).

### Implementation

The proposed implementation starts with an entry point extrinsic on Bridge Hub (in a new pallet). The extrinsic requires a DOT deposit. Once a valid deposit has been reserved, the pallet state changes to `Halted` and the bridge is halted in both directions. The halt is graceful: messages that were already in flight, in either direction, are held and sent once the bridge resumes rather than being lost (see below). Once in the `Halted` state, follow-up calls to the same extrinsic will fail.

The halt blocks new transfers from entering the bridge:

1. `snowbridgeSystemFrontend::set_operating_mode(Halted)`: Sets the frontend's export mode on Asset Hub, blocking new P→E transfers there.
2. Outbound governance command issued from Bridge Hub via `snowbridge-pallet-system-v2`: Sets the Gateway's operating mode, blocking new E→P transfers on Ethereum.
3. `EthereumBeaconClient::set_operating_mode(Halted)` - a local Bridge Hub call that stops new Ethereum header ingestion, as defense-in-depth.

Messages that were already in flight when the halt landed are not rejected. Rejecting them would leave the bridge inconsistent, for example an asset burned on one side with nothing minted on the other. Instead, in-flight transfers are held and sent on resume, as described below.

These calls are all best-effort, and failure does not prevent the other calls from being executed. The pallet attempts each, logs successes and failures, and re-attempts pending calls in later blocks via `on_initialize`.

The holds below reads the new halt pallet's `Halted` state, which the inbound and outbound message handling on Bridge Hub read directly to decide whether to hold a message or process it as normal.

For P→E transfers, in-flight messages are held using the MessageQueue. Outbound messages only get a nonce when they are committed for relay to Ethereum, so while the bridge is halted they are accepted into the queue but not committed. When the bridge resumes, they are committed with fresh nonces, which avoids any stale light client proofs. A small number of P→E messages may have been committed and relayed just before the halt landed, which cannot be held on Bridge Hub; to cover those, we should also consider a bridge operating mode check in the Ethereum `submitV1` and `submitV2` contracts, so they do not process on Ethereum while the bridge is halted.

For E→P transfers, halting holds messages in storage until the bridge resumes. While the bridge is halted, incoming messages are still verified but, rather than being forwarded to Asset Hub, they are kept in the pallet's storage. When the bridge resumes, the held messages are sent on. This applies to the V2 inbound path only, since the older V1 path is being deprecated.

In both directions, the held messages can be inspected while the bridge is halted and any malicious ones removed via a governance approved migration before it resumes.

### Resuming the bridge

Resume is the symmetric inverse of the halt. Resuming the bridge and resolution of the halt deposit are separate extrinsics, to allow granular control over the shape of the recovery. The Fellowship will likely bundle the two concerns in a single whitelisted caller proposal (e.g. resume + slash), but in some cases, the specific scenario might require a longer halted bridge state. In that case, the halting account may be refunded, but the bridge should not be resumed yet.

It was considered to have the bridge auto resume after a set duration in case the Technical Fellowship should be unavailable for an extended time. The counter argument is that if the Technical Fellowship is unavailable, Polkadot would likely have bigger problems than resuming Snowbridge, and so it was removed from this spec.

The resume extrinsic should do the inverse of all the operations expressed in the previous section, and set the pallet state to `Normal`. While the async calls execute, the bridge might actually be in `Halted` still, but since this is short in duration (1-2 mins) the temporary inconsistency is allowable.

### Releasing or slashing the deposit

The pallet should add two extrinsics to resolve the halting deposit - `slash` and `refund`. Slashing the deposit should send the deposit to Treasury on Asset Hub. Refunding the deposit should release the funds back to the sender. It might be worthwhile to capture a bounded text reason, to capture the reason behind the slash or refund onchain.

### Threat model coverage

- **New E→P entry**, Gateway halt (call 2) stops new transfers starting on Ethereum.
- **E→P in-flight + inbound-queue exploit**, the inbound hold. Covers exploits that bypass the Gateway entirely (malformed proofs, payload-decode bugs, MMR weaknesses): messages are verified and held, and malicious ones can be dropped before reaching Asset Hub.
- **New P→E entry**, AH frontend halt (call 1) stops new transfers at Asset Hub.
- **P→E in-flight**, the outbound hold keeps messages queued and uncommitted until resume.
- **Beacon-client exploit**, beacon client halt (call 3).

## Drawbacks

- **Griefing**: This proposal adds permissionless halting, guarded by a slashable deposit. Someone who is willing to lose funds to censor the bridge, could repeatedly call the permissionless halt. In practice, this seems unlikely. Should this happen, the deposit amount can be upped as a further deterrent.
- **Best Effort Halt**: Since the halt relies on async calls to multiple chains, there is the possibility that some of the halt calls might fail.

## Testing, Security, and Privacy

* **Pallet unit tests:** Usual tests to cover the pallet code, in a unit test fashion (including halting, holding and replaying inbound messages, deposit under sufficient/insufficient balance, bridge resuming, extend).
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

This proposal mostly adds new functionality. The main changes to existing Snowbridge components are on Bridge Hub: while the bridge is paused, outbound P→E messages are held in the queue rather than committed, and inbound E→P messages are held in storage rather than dispatched to Asset Hub. As mentioned above, the Ethereum `submitV1` and `submitV2` contracts should also check the operating mode, so P→E messages that were already relayed cannot process on Ethereum while the bridge is halted. The new storage defaults to `Normal` so the change is backwards-compatible. No other existing Snowbridge pallet interfaces change.

## Prior Art and References

* [polkadot-fellows/runtimes #1089](https://github.com/polkadot-fellows/runtimes/issues/1089), the chain-wide safe-mode and tx-pause deployment proposal.
* [polkadot-fellows/runtimes #1164](https://github.com/polkadot-fellows/runtimes/pull/1164), the AssetHub safe-mode wiring.
* `pallet-safe-mode` and `pallet-tx-pause` in the Polkadot SDK.
* [Snowbridge Circuit Breakers RFC (PR #167)](https://github.com/polkadot-fellows/RFCs/pull/167), the companion preventive layer.

## Unresolved Questions

These all relate to pallet config, and decisions can be kicked down the line to Polkadot runtime config, if necessary:

* **Retry backoff:** Need to agree on a retry setting config, perhaps 30-60 seconds, in block time.
* **Deposit:** 100k DOT matches the runtimes #1089 number, but Snowbridge halts more than a generic safe-mode would. Worth a separate Fellowship discussion on whether the deposit should be higher.

## Future Directions and Related Material

* **Per-extrinsic granular pause** as a v2 of the pallet, using `pallet-tx-pause`'s `FullNameOf<T>` addressing.
* **Watchdog automation:** off-chain monitors with funded accounts that auto-trigger on observed anomalies.
* **Companion RFC:** the [Snowbridge Circuit Breakers RFC (PR #167)](https://github.com/polkadot-fellows/RFCs/pull/167) specifies the preventive layer (per-asset velocity caps on the Ethereum Gateway for P→E and Asset Hub for E→P) that bounds value-at-risk during the detection-latency window this pallet does not cover.
