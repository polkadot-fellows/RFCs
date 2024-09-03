# RFC-0103:  Introduce a `CoreIndex` commitment and a `SessionIndex` field in candidate receipts

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date** | 15 July 2024                                                                    |
| **Description** | Constrain parachain block validity to a specific core and session                                                                 |
| **Authors** | Andrei Sandu                                                                                            |

## Summary

Elastic scaling is not resilient against griefing attacks without a way for a PoV (Proof of Validity)
to commit to the particular core index it was intended for. This RFC proposes a way to include
core index information in the candidate commitments and the `CandidateDescriptor` data structure
in a backward compatible way. Additionally, it proposes the addition of a `SessionIndex` field in
the `CandidateDescriptor` to make dispute resolution more secure and robust.

## Motivation

This RFC proposes a way to solve two different problems:

1. For Elastic Scaling, it prevents anyone who has acquired a valid collation to DoS the parachain
 by providing the same collation to all backing groups assigned to the parachain. This can
 happen before the next valid parachain block is authored and will prevent the chain of
 candidates from being formed, reducing the throughput of the parachain to a single core.
2. The dispute protocol relies on validators trusting the session index provided by other
 validators when initiating and participating in disputes. It is used to look up validator keys
 and check dispute vote signatures. By adding a `SessionIndex` in the `CandidateDescriptor`,
 validators no longer have to trust the `Sessionindex` provided by the validator raising a
 dispute. The dispute may concern a relay chain block not yet imported by a
 validator. In this case, validators can safely assume the session index refers to the session
 the candidate has appeared in, otherwise, the chain would have rejected the candidate.

## Stakeholders

- Polkadot core developers.
- Cumulus node developers.
- Tooling, block explorer developers.

This approach and alternatives have been considered and discussed in [this issue](https://github.com/polkadot-fellows/RFCs/issues/92).

## Explanation

The approach proposed below was chosen primarily because it minimizes the number of breaking
changes, the complexity and takes less implementation and testing time. The proposal is to change
the existing primitives while keeping binary compatibility with the older versions. We repurpose
unused fields to introduce core index and a session index information in the `CandidateDescriptor`
and extend the UMP to transport non-XCM messages.

### Reclaiming unused space in the descriptor

The `CandidateDescriptor` includes `collator` and `signature` fields. The collator
includes a signature on the following descriptor fields: parachain id, relay parent, validation
data hash, validation code hash, and the PoV hash.

However, in practice, having a collator signature in the receipt on the relay chain does not
provide any benefits as there is no mechanism to punish or reward collators that have provided
bad parachain blocks.

This proposal aims to remove the collator signature and all the logic that checks the collator
signatures of candidate receipts. We use the first 7 reclaimed bytes to represent the version,
the core, session index, and fill the rest with zeroes. So, there is no change in the layout
and length of the receipt. The new primitive is binary-compatible with the old one.

### UMP transport

[CandidateCommitments](https://github.com/paritytech/polkadot-sdk/blob/b5029eb4fd6c7ffd8164b2fe12b71bad0c59c9f2/polkadot/primitives/src/v7/mod.rs#L682)
remains unchanged as we will store scale encoded `UMPSignal` messages directly in the parachain
UMP queue by outputting them in [upward_messages](https://github.com/paritytech/polkadot-sdk/blob/b5029eb4fd6c7ffd8164b2fe12b71bad0c59c9f2/polkadot/primitives/src/v7/mod.rs#L684).

The UMP queue layout is changed to allow the relay chain to receive both the XCM messages and
`UMPSignal` messages. An empty message (empty `Vec<u8>`) is used to mark the end of XCM messages and
the start of `UMPSignal` messages. The `UMPSignal` is optional and can be omitted by parachains
not using elastic scaling.

This way of representing the new messages has been chosen over introducing an enum wrapper to
minimize breaking changes of XCM message decoding in tools like Subscan for example.

Example:

```rust
[ XCM message1, XCM message2, ..., EMPTY message, UMPSignal::SelectCore ]
```

#### `UMPSignal` messages

```rust
/// The selector that determines the core index.
pub struct CoreSelector(pub u8);

/// The offset in the relay chain claim queue.
///
/// The state of the claim queue is given by the relay chain block
/// that is used as context for the `PoV`. 
pub struct ClaimQueueOffset(pub u8);

/// Signals sent by a parachain to the relay chain.
pub enum UMPSignal {
    /// A message sent by a parachain to select the core the candidate is committed to.
    /// Relay chain validators, in particular backers, use the `CoreSelector` and `ClaimQueueOffset`
    /// to compute the index of the core the candidate has committed to.
    SelectCore(CoreSelector, ClaimQueueOffset),
}
```

The `CoreSelector` together with the `ClaimQueueOffset` are used to index the claim queue. This way
the validators can compute the `CoreIndex` and ensure that the collator put the correct `CoreIndex`
into the `CandidateDescriptor`.

**Example:**

`cq_offset = 1` and `core_selector = 3`

The table below represents a snapshot of the claim queue:

|  | offset = 0 | offset = 1 | offset = 2 |
| :--:   | :--:   | :--:   | :--:   |
| Core 1    | **Para A** | **Para A** | **Para A** |
| Core 2   | **Para A** | Para B  | **Para A** |
| Core 3   | Para B  | **Para A** | **Para A** |

The purpose of `ClaimQueueOffset` is to select the column from the above table.
For `cq_offset = 1` we get `[Para A, Para B, Para A]` and use as input to create
a sorted vec with the cores A is assigned to: `[Core 1, Core 3]` and call it `para_assigned_cores`.
We use `core_selector` and determine the committed core index is `Core 3` like this:

```rust
let committed_core_index = para_assigned_cores[core_selector % para_assigned_cores.len()];
```

### Polkadot Primitive changes

#### New [CandidateDescriptor](https://github.com/paritytech/polkadot-sdk/blob/b5029eb4fd6c7ffd8164b2fe12b71bad0c59c9f2/polkadot/primitives/src/v7/mod.rs#L512)

- reclaim 32 bytes from `collator: CollatorId` and 64 bytes from `signature: CollatorSignature`
 and rename to `reserved1` and `reserved2` fields.
- take 1 bytes from `reserved1` for a new `version: u8` field.
- take 2 bytes from `reserved1` for a new `core_index: u16` field.
- take 4 bytes from `reserved1` for a new `session_index: u32` field.
- the remaining `reserved1` and `reserved2` fields are zeroed

The new primitive will look like this:

```rust
pub struct CandidateDescriptorV2<H = Hash> {
    /// The ID of the para this is a candidate for.
    para_id: ParaId,
    /// The hash of the relay-chain block this is executed in the context of.
    relay_parent: H,
    /// Version field. The raw value here is not exposed, instead, it is used
    /// to determine the `CandidateDescriptorVersion`
    version: InternalVersion,
    /// The core index where the candidate is backed.
    core_index: u16,
    /// The session in which the candidate is backed.
    session_index: SessionIndex,
    /// Reserved bytes.
    reserved1: [u8; 25],
    /// The blake2-256 hash of the persisted validation data. This is extra data derived from
    /// relay-chain state which may vary based on bitfields included before the candidate.
    /// Thus it cannot be derived entirely from the relay parent.
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

In future format versions, parts of the `reserved1` and `reserved2` bytes can be used to include
additional information in the descriptor.

### Backwards compatibility

Two flavors of candidate receipts are used in network protocols, runtime and node
implementation:

- `CommittedCandidateReceipt` which includes the `CandidateDescriptor` and the `CandidateCommitments`
- `CandidateReceipt` which includes the `CandidateDescriptor` and just a hash of the commitments

We want to support both the old and new versions in the runtime and node, so the implementation must
be able to detect the version of a given candidate receipt.

The version of the descriptor is detected by checking the reserved fields.
If they are not zeroed, it means it is a version 1 descriptor. Otherwise the `version` field
is used further to determine the version. It should be `0` for version 2 descriptors. If it is not
the descriptor has an unknown version and should be considered invalid.

### Parachain block validation

If the candidate descriptor is version 1, there are no changes.

Backers must check the validity of `core_index` and `session_index` fields.
A candidate must not be backed if any of the following are true:

- the `core_index` in the descriptor does not match the core the backer is assigned to
- the `session_index` is not equal to the session index the candidate is backed in
- the `core_index` in the descriptor does not match the one determined by the
  `UMPSignal::SelectCore` message

### On-chain backing

If the candidate descriptor is version 1, there are no changes.

For version 2 descriptors the runtime will determine the `core_index` using the same inputs
as backers did off-chain. It currently stores the claim queue at the newest allowed
relay parent corresponding to the claim queue offset `0`. The runtime needs to be changed to store
a claim queue snapshot at all allowed relay parents.

## Drawbacks

The only drawback is that further additions to the descriptor are limited to the amount of
remaining unused space.

## Testing, Security, and Privacy

Standard testing (unit tests, CI zombienet tests) for functionality and mandatory security audit
to ensure the implementation does not introduce any new security issues.

Backward compatibility of the implementation will be tested on testnets (Versi and Westend).

There is no impact on privacy.

## Performance

Overall performance will be improved by not checking the collator signatures in runtime and nodes.
The impact on the UMP queue and candidate receipt processing is negligible.

The `ClaimQueueOffset` along with the relay parent choice allows parachains to optimize their
block production for either throughput or lower XCM message processing latency. A value of `0`
with the newest relay parent provides the best latency while picking older relay parents avoids
re-orgs.

## Ergonomics

It is mandatory for elastic parachains to switch to the new receipt format and commit to a
core by sending the `UMPSignal::SelectCore` message. It is optional but desired that all
parachains switch to the new receipts for providing the session index for disputes.

The implementation of this RFC itself must not introduce any breaking changes for the parachain
runtime or collator nodes.

## Compatibility

The proposed changes are not fully backward compatible, because older validators verify the
collator signature of candidate descriptors.

Additional care must be taken before enabling the new descriptors by waiting for at least
`2/3 + 1` validators to upgrade. Validators that have not upgraded will not back candidates
using the new descriptor format and will also initiate disputes against these candidates.

### Relay chain runtime

The first step is to remove collator signature checking logic in the runtime but keep the node
side collator signature checks.

The runtime must be upgraded to support the new primitives before any collator or node is allowed
to use the new candidate receipts format.

### Validators

To ensure a smooth launch, a new node feature is required.
The feature acts as a signal for supporting the new candidate receipts on the node side and can
only be safely enabled if at least `2/3 + 1` of the validators are upgraded. Node implementations
need to decode the new candidate descriptor once the feature is enabled otherwise they might
raise disputes and get slashed.

Once the feature is enabled, the validators will skip checking the collator signature when
processing the candidate receipts and verify the `CoreIndex` and `SessionIndex` fields if
present in the receipt.

No new implementation of networking protocol versions for collation and validation is required.

### Tooling

Any tooling that decodes UMP XCM messages needs an update to support or ignore the new UMP
messages, but they should be fine to decode the regular XCM messages that come before the
separator.

## Prior Art and References

Forum discussion about a new `CandidateReceipt` format:
 <https://forum.polkadot.network/t/pre-rfc-discussion-candidate-receipt-format-v2/3738>

## Unresolved Questions

N/A

## Future Directions and Related Material

The implementation is extensible and future-proof to some extent. With minimal or no breaking
changes, additional fields can be added in the candidate descriptor until the reserved space is
exhausted

At this point, there is a simple way to determine the version of the receipt, by testing for zeroed
reserved bytes in the descriptor. Future versions of the receipt can be implemented and identified
by using the `version` field of the descriptor introduced in this RFC.
