# RFC-0103:  Introduce a `CoreIndex` commitment and a `SessionIndex` field in candidate receipts

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 15 July 2024                                                                    |
| **Description** | Constrain parachain block validity to a specific core and session                                                                 |
| **Authors**     | Andrei Sandu                                                                                            |

## Summary

Elastic scaling is not resilient against griefing attacks without a way for a PoV (Proof of Validity) to commit to the particular core index it was intended for. This RFC proposes a way to include core index information in the candidate commitments and the `CandidateDescriptor` data structure in a backwards compatible way. Additionally it proposes the addition of a `SessionIndex` field in the `CandidateDescriptor` to make dispute resolution more secure and robust. 


## Motivation

This RFC proposes a way to solve two different problems:

1. For Elastic Scaling, it prevents anyone who has acquired a valid collation to DoS the parachain by providing the same collation to all backing groups assigned to the parachain. This can happen before the next valid parachain block is authored and will prevent the chain of candidates to be formed, reducing the throughput of the parachain to a single core.
2. The dispute protocol relies on validators trusting the session index provided by other valdiators when initiating and participating in disputes. It is used to lookup validator keys and check dispute vote signatures. By adding a `SessionIndex` in the `CandidateDescriptor`, validators no longer have to trust the `Sessionindex` provided by the validator raising a dispute. It can happen that the dispute concerns a relay chain block not yet imported by a validator. In this case validators can safely assume the session index refers to the session the candidate has appeared in, otherwise the chain would have rejected candidate.

## Stakeholders

- Polkadot core developers.
- Cumulus node developers.
- Tooling, block explorer developers.

This approach and alternatives have been considered and discussed in [this issue](https://github.com/polkadot-fellows/RFCs/issues/92).

## Explanation

The approach proposed below was chosen primarly because it minimizes the number of breaking changes, the complexity and takes less implementation and testing time. The proposal is to change the existing primitives while keeping binary compatibility with the older versions. We repurpose unused fields to introduce core index and a session index information in the `CandidateDescriptor` and extend the UMP for transporting non-XCM messages. 

### Reclaiming unused space in the descriptor

The `CandidateDescriptor` currently includes `collator` and `signature` fields. The collator includes a signature on the following descriptor fields: parachain id, relay parent, validation data hash, validation code hash and the PoV hash.

However, in practice, having a collator signature in the receipt on the relay chain does not provide any benefits as there is no mechanism to punish or reward collators that have provided bad parachain blocks.

This proposal aims to remove the collator signature and all the logic that checks the collator signatures of candidate receipts. We use the first 7 reclaimed bytes to represent version, the core and session index, and fill the rest with zeroes. So, there is no change in the layout and length of the receipt. The new primitive is binary compatible with the old one.

### UMP transport

[CandidateCommitments](https://github.com/paritytech/polkadot-sdk/blob/b5029eb4fd6c7ffd8164b2fe12b71bad0c59c9f2/polkadot/primitives/src/v7/mod.rs#L682) remains unchanged as we will store scale encoded `UMPSignal` messages directly in the parachain UMP queue by outputing them in [upward_messages](https://github.com/paritytech/polkadot-sdk/blob/b5029eb4fd6c7ffd8164b2fe12b71bad0c59c9f2/polkadot/primitives/src/v7/mod.rs#L684). 

The UMP queue layout is changed to allow the relay chain to receive both the XCM messages and `UMPSignal` messages. An empty message (empty `Vec<u8>`) is used to mark the end XCM messages and the start of `UMPSignal` messages.

This way of representing the new messages has been chosen over introducing an enum wrapper to minimize breaking changes of XCM message decoding in tools like Subscan for example. 

Example: 
```rust
[ XCM message1, XCM message2, ..., EMPTY message, UMPSignal::SelectCore ]
```

#### `UMPSignal` messages

```rust
/// An `u8` wrap around sequence number. Typically this would be the least significant byte of the parachain block number.
pub struct CoreSelector(pub u8);

/// An offset in the relay chain claim queue.
pub struct ClaimQueueOffset(pub u8);

/// Default claim queue offset
pub const DEFAULT_CLAIM_QUEUE_OFFSET: ClaimQueueOffset = ClaimQueueOffset(1);

pub enum UMPSignal {
	/// A message sent by a parachain to select the core the candidate is commited to.
	/// Relay chain validators, in particular backers, use the `CoreSelector` and `ClaimQueueOffset`
	/// to compute the index of the core the candidate has commited to.
	///
	SelectCore(CoreSelector, ClaimQueueOffset),
}
```

The parachain runtime is not concerned with the actual `CoreIndex` the candidate is intended for, 
but must provide enough information for the validators and collators to compute it. `CoreSelector` 
and `ClaimQueueOffset` use only 2 bytes and fullfil the requirement.

**Example:**

`cq_offset = 1` and `core_selector = 3`

The table below represents a snapshot of the claim queue:

|  | offset = 0 | offset = 1 | offset = 2 |
| :--:	 | :--:   | :--:   | :--:   |
| Core 1    | **Para A**     | **Para A**     | **Para A**     |
| Core 2   | **Para A**  | Para B  | **Para A**  |
| Core 3   | Para B  | **Para A**  | **Para A** |

The purpose of `ClaimQueueOffset` is to select the column from the above table. 
For `cq_offset = 1` we get `[ Para A, Para B, Para A]` and use as input to create 
a sorted vec with the cores A is assigned to: `[ Core 1, Core 3]` and call it `para_assigned_cores`.
We use `core_selector` and determine the commited core index is `Core 3` like this:

```rust
let committed_core_index = para_assigned_cores[core_selector % para_assigned_cores.len()];
```

Parachains should prefer to have a static `ClaimQueueOffset` value that makes sense for their 
usecase which can be changed by governance at some future point. Changing the value dynamically 
can be a friction point. It will work out fine to decrease the value to build more into the 
present. But if the value is increased to build more into the future, a relay chain block will 
be skipped.

### Polkadot Primitive changes

#### New [CandidateDescriptor](https://github.com/paritytech/polkadot-sdk/blob/b5029eb4fd6c7ffd8164b2fe12b71bad0c59c9f2/polkadot/primitives/src/v7/mod.rs#L512)

- reclaim 32 bytes from `collator: CollatorId` and 64 bytes from `signature: CollatorSignature` and rename to `reserved1`  and `reserved2` fields.
- take 1 bytes from `reserved1` for a new `version: u8` field.
- take 2 bytes from `reserved1` for a new `core_index: u16` field.
- take 4 bytes from `reserved1` for a new `session_index: u32` field.
- the remaining `reserved1` and `reserved2` fields are zeroed

Thew new primitive will look like this:

```rust
pub struct CandidateDescriptorV2<H = Hash> {
	/// The ID of the para this is a candidate for.
	para_id: ParaId,
	/// The hash of the relay-chain block this is executed in the context of.
	relay_parent: H,
	/// Version field. The raw value here is not exposed, instead it is used
	/// to determine the `CandidateDescriptorVersion`
	version: InternalVersion,
	/// The core index where the candidate is backed.
	core_index: u16,
	/// The session index of the candidate relay parent.
	session_index: SessionIndex,
	/// Reserved bytes.
	reserved1: [u8; 25],
	/// The blake2-256 hash of the persisted validation data. This is extra data derived from
	/// relay-chain state which may vary based on bitfields included before the candidate.
	/// Thus it cannot be derived entirely from the relay-parent.
	persisted_validation_data_hash: Hash,
	/// The blake2-256 hash of the PoV.
	pov_hash: Hash,
	/// The root of a block's erasure encoding Merkle tree.
	erasure_root: Hash,
	/// Reserved bytes.
	reserved2: [u8; 64],
	/// Hash of the para header that is being generated by this candidate.
	para_head: Hash,
	/// The blake2-256 hash of the validation code bytes.
	validation_code_hash: ValidationCodeHash,
}
```

In future format versions, parts of the `reserved1` and `reserved2` bytes can be used to include additional information in the descriptor.

### Parachain block validation

If the candidate descriptor is version 1, there are no changes.

For version 2, backers and the runtime must check the validity of `core_index` and `session_index` fields. 
A candidate must not be backed if any of the following are true:
- the `core_index` in the descriptor does not match the core the backing group is assigned to
- the `session_index` is not equal to the session of the `relay_parent` in the descriptor
- the `core_index` in descriptor does not match the one determined by the `UMPSignal::SelectCore` message


### Backwards compatibility

There are two flavors of candidate receipts which are used in network protocols, runtime and node implementation:
- `CommittedCandidateReceipt` which includes the `CanidateDescriptor` and the `CandidateCommitments` 
- `CandidateReceipt` which includes the `CanidateDescriptor` and just a hash of the commitments

We want to support both the old and new versions in the runtime and node. The implementation must be able to detect the version of a given candidate receipt.

The version of the descriptor is detected by checking if the `version` field is `0` and the 
reserved fields are zerored. If this is true it means the descriptor is version 2, 
otherwise we consider it is version 1.

## Drawbacks

The only drawback is that further additions to the descriptor are limited to the amount of remaining unused space.

## Testing, Security, and Privacy

Standard testing (unit tests, CI zombienet tests) for functionality and mandatory secuirty audit to ensure the implementation does not introduce any new security issues.

Backwards compatibility of the implementation will be tested on testnets (Versi and Westend).

There is no impact on privacy.

## Performance

The expectation is that performance impact is negligible for sending and processing the UMP message has negligible performance impact in the runtime as well as on the node side.

The `ClaimQueueOffset` along with the relay parent choice allows parachains to optimize their block production
for either throughput or latency. A value of `0` with newest relay parent provides best latency while picking
older relay parents avoids re-orgs.


## Ergonomics

It is mandatory for elastic parachains to switch to the new receipt format. It is optional but desired that all parachains
switch to the new receipts for providing the session index for disputes.

The implementation of this RFC itself must not introduce any breaking changes for the parachain runtime or collator nodes.

## Compatibility

The proposed changes are backwards compatible in general, but additional care must be taken by waiting for at least `2/3 + 1` validators to upgrade. Validators that have not upgraded will not back candidates using the new descriptor format and will also initiate disputes against.

### Relay chain runtime

The first step is to remove collator signature checking logic in the runtime, but keep the node side collator signature 
checks. 

The runtime must be upgraded to the new primitives before any collator or node are allowed to use the new candidate receipts format. 

### Validators

To ensure a smooth launch, a new node feature is required. 
The feature acts as a signal for supporting the new candidate receipts on the node side and can only be safely enabled if at least `2/3 + 1` of the validators are upgraded.

Once enabled, the validators will skip checking the collator signature when processing the candidate receipts and verify the `CoreIndex` and `SessionIndex` fields if present in the receipt.

No new implementation of networking protocol versions for collation and validation are required.

### Parachains

The implementation of this RFC will supersede the Elastic MVP feature that relies on injecting a core index in the `validator_indices` fields of the `BackedCandidate` primitive. Elastic parachains must upgrade to use the new receipt format.

### Tooling

Any tooling that decodes UMP XCM messages needs an update to support or ignore the new UMP messages, but they should be fine to decode the regular XCM messages that come before the separator.

## Prior Art and References

Forum discussion about a new `CandidateReceipt` format: https://forum.polkadot.network/t/pre-rfc-discussion-candidate-receipt-format-v2/3738

## Unresolved Questions

N/A

## Future Directions and Related Material

The implementation is extensible and future proof to some extent. With minimal or no breaking changes, additional fields can be added in the candidate descriptor until the reserved space is exhausted

At this point there is a simple way to determine the version of the receipt, by testing for zeroed reserved bytes in the
descriptor. Future versions of the receipt can be implemented and identified by using the `version` field of the descirptor introduced in this RFC.