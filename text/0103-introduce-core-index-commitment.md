# RFC-0103:  Introduce a `CoreIndex` commitment in candidate receipts

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 15 July 2024                                                                    |
| **Description** | Constrain parachain block validity to a specific core and session                                                                 |
| **Authors**     | Andrei Sandu                                                                                            |

## Summary
The only requirement for collator nodes is to provide valid parachain blocks to the validators of a backing group and by definition the collator set is trustless. However, in the case of elastic scaling, for security reason, collators must be trusted - non-malicious. `CoreIndex` commitments are required to remove this limitation. Additionally we are introducing a `SessionIndex` field in the `CandidateReceipt` to make dispute resolution more secure and robust. 

## Motivation

At present time misbehaving collator nodes, or anyone who has acquired a valid collation can prevent a parachain from effecitvely using elastic scaling by providing the same valid block to all backing groups assigned to the parachain. This happens before the next parachain block is authored and will prevent the chain of candidates to be formed, reducing the throughput of the parachain to a single core.

This RFC solves the problem by enabling a parachain to provide the core index information as part of it's PVF execution output and in the associated candidate receipt data structure. 

Once this RFC is implemented the validity of a parachain block depends on the core it is being executed on.

## Stakeholders

- Polkadot core developers.
- Cumulus node developers.
- Tooling, block explorer developers.

This approach and alternatives have been considered and discussed in [this issue](https://github.com/polkadot-fellows/RFCs/issues/92).

## Explanation

The approach proposed below was chosen primarly because it minimizes the number of breaking changes, the complexity and takes far less implementation and testing time. The proposal is to free up space and introduce a core index and a session index field in the `CandidateDescriptor` primitive and use the UMP queue as output for `CoreIndex` commitment. 

### Reclaiming unused space in the descriptor
The `CandidateDescriptor` currently includes `collator` and `signature` fields. The collator includes a signature on the following descriptor fields: parachain id, relay parent, validation data hash, validation code hash and the PoV hash.

However, in practice, having a collator signature in the receipt on the relay chain does not provide any benefits as there is no mechanism to punish or reward collators that have provided bad parachain blocks.

This proposal aims to remove the collator signature and all the logic that checks the collator signatures of candidate receipts. We use the first 6 bytes to represent the core and session index, and fill the rest with zeroes. So, there is no change in the layout and length of the receipt. The new primitive is binary compatible with the old one.


### Backwards compatibility

There are two flavors of candidate receipts which are used in network protocols, runtime and node implementation:
- `CommittedCandidateReceipt` which includes the `CanidateDescriptor` and the `CandidateCommitments` 
- `CandidateReceipt` which includes the `CanidateDescriptor` and just a hash of the commitments

We want to support both the old and new versions in the runtime and node. The implementation must be able to detect the version of a given candidate receipt.

This is easy to do in both cases:
- the reserved fields are zeroed
- the UMP queue contains the core and session index commitments and the commitments value matching the ones in the descriptor.

### Polkadot Primitive changes

#### New [CandidateDescriptor](https://github.com/paritytech/polkadot-sdk/blob/master/polkadot/primitives/src/v7/mod.rs#L482)

- reclaim 32 bytes from `collator: CollatorId` and 64 bytes from `signature: CollatorSignature` and rename to `reserved1`  and `reserved2` fields.
- take 2 bytes from `reserved1` for a new `core_index: u16` field.  
- take 4 bytes from `reserved2` for a new `session_index: u32` field.
- the `reserved1` and `reserved2` fields are zeroed

Thew new primitive will look like this:
```
pub struct CandidateDescriptorV2<H = Hash> {
	/// The ID of the para this is a candidate for.
	para_id: Id,
	/// The hash of the relay-chain block this is executed in the context of.
	relay_parent: H,
	/// The core index where the candidate is backed.
	core_index: CoreIndex,
	/// The session index in which the candidate is backed.
	session_index: SessionIndex,
	/// Reserved bytes.
	reserved1: [u8; 26],
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


#### Versioned `CandidateReceipt` and `CommittedCandidateReceipt` primitives:

We want to decouple the actual representation of the `CandidateReceipt` from the higher level code. This should make it easier to implement future format versions of this primitive. To hide the logic of versioning the descriptor fields will be private and accessor methods are provided.

``` 
pub enum VersionedCandidateReceipt {
	V1(CandidateReceipt),
	V2(CandidateReceiptV2),
}

impl VersionedCandidateReceipt {
	/// Returns the core index the candidate has commited to. 
	/// Returns `None` if the candidate receipt is the old version (v1).
	fn core_index() -> Option<CoreIndex>;

	/// Returns the session index of the candidate relay parent.
	fn session_index() -> Option<CoreIndex>;

	/// ...
}

```

A manual decode `Decode`  implementation is required to account for version detection and constructing the appropriate variant.


#### New primitive for representing the `CoreIndex` commitments.**

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
- the `session_index` is equal to the session of the `relay_parent` in the descriptor

If core index (and session index) information is not available (backers got an old candidate receipt), there will be no changes compared to current behaviour.

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

### Runtime
The first step is to remove collator signature checking logic in the runtime, but keep the node side collator signature 
checks. 

The runtime must be upgraded to the new primitives before any collator or node are allowed to use the new candidate receipts format. 

### Validators

To ensure a smooth launch, a new node feature is required. 
The feature acts as a signal for supporting the new candidate receipts on the node side and can only be safely enabled if at least 2/3 of the validators are upgraded.

Once enabled, the validators will skip checking the collator signature when processing the candidate receipts and verify the `CoreIndex` and `SessionIndex` fields if present in the receipit.

No new implementation of networking protocol versions for collation and validation are required.


### Parachains

`CoreIndex` commitments are needed only by parachains using elastic scaling. Just upgrading the collator node and runtime should be sufficient and possible without manual changes.

### Tooling

Any tooling that decodes UMP XCM messages needs an update to support or ignore the new UMP messages, but they should be fine to decode the regular XCM messages that come before the separator.

## Prior Art and References

Forum discussion about a new `CandidateReceipt` format: https://forum.polkadot.network/t/pre-rfc-discussion-candidate-receipt-format-v2/3738

## Unresolved Questions

N/A

## Future Directions and Related Material

The implementation is extensible and future proof to some extent. With minimal or no breaking changes, additional fields can be added in the candidate descriptor until the reserved space is exhausted

Once the reserved space is exhausted, versioning will be implemented. The candidate receipt format will be versioned. This will exteend to pvf execution which requires versioning for the validation function, inputs and outputs (`CandidateCommitments`).