# RFC-0103:  Introduce a `CoreIndex` commitment in candidate receipts

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 15 July 2024                                                                    |
| **Description** | Constrain parachain block validity on a specific core                                                                   |
| **Authors**     | Andrei Sandu                                                                                            |

## Summary
The only requirement for collator nodes is to provide valid parachain blocks to the validators of a backing group and by definition the collator set is trustless. However, in the case of elastic scaling, for security reason, collators must be trusted - non-malicious. `CoreIndex` commitments are required to remove this limitation.

## Motivation

At present time misbehaving collator nodes can prevent their parachain from effecitvely using elastic scaling by providing the same valid block to all backing groups assigned to the parachain. This happens before the next parachain block is authored and will prevent the chain of candidates to be formed, reducing the throughput of the parachain to a single core.
There are no special requirements from collators to do it, just being a full node is sufficient and there are no methods of punishing or rewarding good behaviour.

This RFC solves the problem by enabling a parachain to provide the core index information as part of it's PVF execution output and in the associated candidate receipt data structure. 

Once this RFC is implemented the validity of a parachain block depends on the core it is being executed on.

## Stakeholders

- Polkadot core developers.
- Cumulus node developers.
- Tooling, block explorer developers.

This approach and alternatives have been considered and discussed in [this issue](https://github.com/polkadot-fellows/RFCs/issues/92).

## Explanation

The approach proposed below was chosen primarly because it minimizes the number of breaking changes, the complexity and takes far less implementation and testing time. The proposal is to free up space and introduce a new core index field in the `CandidateDescriptor` primitive and use the UMP queue as output for `CoreIndex` commitment. 

### Reclaiming unused space in the descriptor
The `CandidateDescriptor` currently includes `collator` and `signature` fields. The collator includes a signature on the following descriptor fields: parachain id, relay parent, validation data hash, validation code hash and the PoV hash.

However, in practice, having a collator signature in the receipt on the relay chain does not provide any benefits as there is no mechanism to punish or reward collators that have provided bad parachain blocks.

This proposal aims to remove the two fields and all the logic that checks the collator signatures. We reclaim the unused space as `reserved` fields and fill it with zeroes, so there is no change in the layout and lenght of the receipt. The new primitive binary compatible with the old one.


### Backwards compatibility

There are two flavors of candidate receipts which are used in network protocols, runtime and node implementation:
- `CommittedCandidateReceipt` which includes the `CanidateDescriptor` and the `CandidateCommitments` 
- `CandidateReceipt` which includes the `CanidateDescriptor` and just a hash of the commitments

We want to support both the old and new versions in the runtime and node . The implementation must be able to detect the version of a given candidate receipt.

This is easy to do in both cases:
- the reserved fields are zeroed
- the UMP queue contains the core index commitment that matches the core index in the descriptor.


### Polkadot Primitive changes

#### New [CandidateDescriptor](https://github.com/paritytech/polkadot-sdk/blob/master/polkadot/primitives/src/v7/mod.rs#L482)

- reclaim 32 bytes from `collator: CollatorId` and 64 bytes from `signature: CollatorSignature` as `reserved` 
- use 4 bytes for a new `core_index: CoreIndex` field.
- the unused reclaimed space will be filled with zeroes

Thew new primitive will look like this:
```
pub struct CandidateDescriptor<H = Hash> {
	/// The ID of the para this is a candidate for.
	pub para_id: Id,
	/// The hash of the relay-chain block this is executed in the context of.
	pub relay_parent: H,
	/// The core index where the candidate is backed.
	pub core_index: CoreIndex,
	/// Reserved bytes.
	pub reserved1: [u8; 28],
	/// The blake2-256 hash of the persisted validation data. This is extra data derived from
	/// relay-chain state which may vary based on bitfields included before the candidate.
	/// Thus it cannot be derived entirely from the relay-parent.
	pub persisted_validation_data_hash: Hash,
	/// The blake2-256 hash of the PoV.
	pub pov_hash: Hash,
	/// The root of a block's erasure encoding Merkle tree.
	pub erasure_root: Hash,
	/// Reserved bytes.
	pub reserved2: [u8; 64],
	/// Hash of the para header that is being generated by this candidate.
	pub para_head: Hash,
	/// The blake2-256 hash of the validation code bytes.
	pub validation_code_hash: ValidationCodeHash,
}

```

In the future, parts of the `reserved1` and `reserved2` bytes can be used to include additional information in the descriptor.

**Introduce new primitive for representing the `CoreIndex` commitment as an enum to allow future additions.**


```
pub enum UMPSignal {
	OnCore(CoreIndex),
}
```
### Cumulus primitives

Add a new version of the `ParachainInherentData` structure which includes an additional `core_index` field.
```
pub struct ParachainInherentData {
	pub validation_data: PersistedValidationData,
	/// A storage proof of a predefined set of keys from the relay-chain.
	///
	/// Specifically this witness contains the data for:
	///
	/// - the current slot number at the given relay parent
	/// - active host configuration as per the relay parent,
	/// - the relay dispatch queue sizes
	/// - the list of egress HRMP channels (in the list of recipients form)
	/// - the metadata for the egress HRMP channels
	pub relay_chain_state: sp_trie::StorageProof,
	/// Downward messages in the order they were sent.
	pub downward_messages: Vec<InboundDownwardMessage>,
	/// HRMP messages grouped by channels. The messages in the inner vec must be in order they
	/// were sent. In combination with the rule of no more than one message in a channel per block,
	/// this means `sent_at` is **strictly** greater than the previous one (if any).
	pub horizontal_messages: BTreeMap<ParaId, Vec<InboundHrmpMessage>>,
        /// The core index on which the parachain block must be backed
        pub core_index: CoreIndex,
}
```

### UMP transport
[CandidateCommitments](https://github.com/paritytech/polkadot-sdk/blob/master/polkadot/primitives/src/v7/mod.rs#L652) remains unchanged as we will store scale encoded `UMPSignal` messages directly in the parachain UMP queue by outputing them in the [upward_messages](https://github.com/paritytech/polkadot-sdk/blob/master/polkadot/primitives/src/v7/mod.rs#L682). 


The UMP queue layout is adjusted to allow the relay chain to receive both the XCM messages and `UMPSignal` messages. We will introduce a message separator that will be implemented as an empty `Vec<u8>`.

The separator marks the end of the XCM messages and the begging of the `UMPSignal` messages.

Example: 
```
[ XCM message1, XCM message2, ..., EMPTY message, UMPSignal::CoreIndex ]
```

### Parachain block validation
Backers will make use of the core index information to validate the blocks during backing and reject blocks if:
- the `core_index` in descriptor does not match the one in the `UMPSignal`.
- the `core_index` in the descriptor does not match the core the backing group is assigned to

If core index information is not available (backers got an old candidate receipt), there will be no changes compared to current behaviour.

## Drawbacks

The only drawback is that further additions to the descriptor are limited to the amount of remaining unused space.


## Testing, Security, and Privacy

Standard testing (unit tests, CI zombienet tests) for functionality and mandatory secuirty audit to ensure the implementation does not introduce any new security issues.

Backwards compatibility of the implementation will be tested on testnets (Versi and Westend).

There is no impact on privacy.

## Performance

The expectation is that performance impact is negligible for sending and processing the UMP message has negligible performance impact in the runtime as well as on the node side.

## Ergonomics

Parachain that use elastic scaling must send the separator empty message followed by the `UMPSignal::OnCore` only after sending all of the UMP XCM messages.

## Compatibility

To ensure a smooth transition the first step is to remove collator signature checking logic on the node side and upgrade validators. Any tooling that uses these fields will require similar changes as described above to support both formats.

The runtime does not check the collator signature so there are no other specific concers for compatibility except adding the support for the new primitives.


`CoreIndex` commitments are mandatory only for parachains using elastic scaling. No new implementation of networking protocol versions for collation and validation are required.


## Prior Art and References

Forum discussion about a new `CandidateReceipt` format: https://forum.polkadot.network/t/pre-rfc-discussion-candidate-receipt-format-v2/3738

## Unresolved Questions

N/A

## Future Directions and Related Material

The implementation is extensible and future proof to some extent. With minimal or no breaking changes, additional fields can be added in the candidate descriptor until the reserved space is exhausted

Once the reserved space is exhausted, versioning will be implemented. The candidate receipt format will be versioned. This will exteend to pvf execution which requires versioning for the validation function, inputs and outputs (`CandidateCommitments`).