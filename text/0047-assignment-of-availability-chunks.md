# RFC-0047: Assignment of availability chunks to validators

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 03 November 2023                                                                            |
| **Description** | An evenly-distributing indirection layer between availability chunks and validators.        |
| **Authors**     | Alin Dima                                                                                   |

## Summary

Propose a way of permuting the availability chunk indices assigned to validators, in the context of
[recovering available data from systematic chunks](https://github.com/paritytech/polkadot-sdk/issues/598), with the
purpose of fairly distributing network bandwidth usage.

## Motivation

Currently, the ValidatorIndex is always identical to the ChunkIndex. Since the validator array is only shuffled once
per session, naively using the ValidatorIndex as the ChunkIndex would pose an unreasonable stress on the first N/3
validators during an entire session, when favouring availability recovery from systematic chunks.

Therefore, the relay chain node needs a deterministic way of evenly distributing the first ~(N_VALIDATORS / 3)
systematic availability chunks to different validators, based on the relay chain block and core.
The main purpose is to ensure fair distribution of network bandwidth usage for availability recovery in general and in
particular for systematic chunk holders. 

## Stakeholders

Relay chain node core developers.

## Explanation

### Systematic erasure codes

An erasure coding algorithm is considered systematic if it preserves the original unencoded data as part of the
resulting code.
[The implementation of the erasure coding algorithm used for polkadot's availability data](https://github.com/paritytech/reed-solomon-novelpoly) is systematic.
Roughly speaking, the first N_VALIDATORS/3 chunks of data can be cheaply concatenated to retrieve the original data,
without running the resource-intensive and time-consuming reconstruction algorithm.

You can find the concatenation procedure of systematic chunks for polkadot's erasure coding algorithm
[here](https://github.com/paritytech/reed-solomon-novelpoly/blob/be3751093e60adc20c19967f5443158552829011/reed-solomon-novelpoly/src/novel_poly_basis/mod.rs#L247)

In a nutshell, it performs a column-wise concatenation with 2-byte chunks.
The output could be zero-padded at the end, so scale decoding must be aware of the expected length in bytes and ignore
trailing zeros (this assertion is already being made for regular reconstruction).

### Availability recovery at present

According to the [polkadot protocol spec](https://spec.polkadot.network/chapter-anv#sect-candidate-recovery):

> A validator should request chunks by picking peers randomly and must recover at least `f+1` chunks, where
`n=3f+k` and `k in {1,2,3}`.

For parity's polkadot node implementation, the process was further optimised. At this moment, it works differently based
on the estimated size of the available data:

(a) for small PoVs (up to 128 Kib), sequentially try requesting the unencoded data from the backing group, in a random
order. If this fails, fallback to option (b).

(b) for large PoVs (over 128 Kib), launch N parallel requests for the erasure coded chunks (currently, N has an upper
limit of 50), until enough chunks were recovered. Validators are tried in a random order. Then, reconstruct the
original data.

All options require that after reconstruction, validators then re-encode the data and re-create the erasure chunks trie
in order to check the erasure root.

### Availability recovery from systematic chunks

As part of the effort of
[increasing polkadot's resource efficiency, scalability and performance](https://github.com/paritytech/roadmap/issues/26),
work is under way to modify the Availability Recovery protocol by leveraging systematic chunks. See
[this comment](https://github.com/paritytech/polkadot-sdk/issues/598#issuecomment-1792007099) for preliminary
performance results.

In this scheme, the relay chain node will first attempt to retrieve the ~N/3 systematic chunks from the validators that
should hold them, before falling back to recovering from regular chunks, as before.

A re-encoding step is still needed for verifying the erasure root, so the erasure coding overhead cannot be completely
brought down to 0.

Not being able to retrieve even one systematic chunk would make systematic reconstruction impossible. Therefore, backers
can be used as a backup to retrieve a couple of missing systematic chunks, before falling back to retrieving regular
chunks.

### Chunk assignment function

#### Properties

The function that decides the chunk index for a validator will be parameterized by at least
`(validator_index, core_index)`
and have the following properties:
1. deterministic
1. relatively quick to compute and resource-efficient.
1. when considering a fixed `core_index`, the function should describe a permutation of the chunk indices
1. the validators that map to the first N/3 chunk indices should have as little overlap as possible for different cores.

In other words, we want a uniformly distributed, deterministic mapping from `ValidatorIndex` to `ChunkIndex` per core.

It's desirable to not embed this function in the runtime, for performance and complexity reasons.
However, this means that the function needs to be kept very simple and with minimal or no external dependencies.
Any change to this function could result in parachains being stalled and needs to be coordinated via a runtime upgrade
or governance call.

#### Proposed function

Pseudocode:

```rust
pub fn get_chunk_index(
  n_validators: u32,
  validator_index: ValidatorIndex,
  core_index: CoreIndex
) -> ChunkIndex {
  let threshold = systematic_threshold(n_validators); // Roughly n_validators/3
  let core_start_pos = core_index * threshold;

  (core_start_pos + validator_index) % n_validators
}
```

### Network protocol

The request-response `/req_chunk` protocol will be bumped to a new version (from v1 to v2).
For v1, the request and response payloads are:
```rust
/// Request an availability chunk.
pub struct ChunkFetchingRequest {
	/// Hash of candidate we want a chunk for.
	pub candidate_hash: CandidateHash,
	/// The index of the chunk to fetch.
	pub index: ValidatorIndex,
}

/// Receive a requested erasure chunk.
pub enum ChunkFetchingResponse {
	/// The requested chunk data.
	Chunk(ChunkResponse),
	/// Node was not in possession of the requested chunk.
	NoSuchChunk,
}

/// This omits the chunk's index because it is already known by
/// the requester and by not transmitting it, we ensure the requester is going to use his index
/// value for validating the response, thus making sure he got what he requested.
pub struct ChunkResponse {
	/// The erasure-encoded chunk of data belonging to the candidate block.
	pub chunk: Vec<u8>,
	/// Proof for this chunk's branch in the Merkle tree.
	pub proof: Proof,
}
```

Version 2 will add an `index` field to `ChunkResponse`:

```rust
#[derive(Debug, Clone, Encode, Decode)]
pub struct ChunkResponse {
	/// The erasure-encoded chunk of data belonging to the candidate block.
	pub chunk: Vec<u8>,
	/// Proof for this chunk's branch in the Merkle tree.
	pub proof: Proof,
	/// Chunk index.
	pub index: ChunkIndex
}
```

An important thing to note is that in version 1, the `ValidatorIndex` value is always equal to the `ChunkIndex`.
Until the chunk rotation feature is enabled, this will also be true for version 2. However, after the feature is
enabled, this will generally not be true.

The requester will send the request to validator with index `V`. The responder will map the `V` validator index to the
`C` chunk index and respond with the `C`-th chunk. This mapping can be seamless, by having each validator store their
chunk by `ValidatorIndex` (just as before).

The protocol implementation MAY check the returned `ChunkIndex` against the expected mapping to ensure that
it received the right chunk.
In practice, this is desirable during availability-distribution and systematic chunk recovery. However, regular
recovery may not check this index, which is particularly useful when participating in disputes that don't allow
for easy access to the validator->chunk mapping. See [Appendix A](#appendix-a) for more details.

In any case, the requester MUST verify the chunk's proof using the provided index.

During availability-recovery, given that the requester may not know (if the mapping is not available) whether the
received chunk corresponds to the requested validator index, it has to keep track of received chunk indices and ignore
duplicates. Such duplicates should be considered the same as an invalid/garbage response (drop it and move on to the
next validator - we can't punish via reputation changes, because we don't know which validator misbehaved).

### Upgrade path

#### Step 1: Enabling new network protocol
In the beginning, both `/req_chunk/1` and `/req_chunk/2` will be supported, until all validators and
collators have upgraded to use the new version. V1 will be considered deprecated. During this step, the mapping will
still be 1:1 (`ValidatorIndex` == `ChunkIndex`), regardless of protocol.
Once all nodes are upgraded, a new release will be cut that removes the v1 protocol. Only once all nodes have upgraded
to this version will step 2 commence.

#### Step 2: Enabling the new validator->chunk mapping
Considering that the Validator->Chunk mapping is critical to para consensus, the change needs to be enacted atomically
via governance, only after all validators have upgraded the node to a version that is aware of this mapping,
functionality-wise.
It needs to be explicitly stated that after the governance enactment, validators that run older client versions that
don't support this mapping will not be able to participate in parachain consensus.

Additionally, an error will be logged when starting a validator with an older version, after the feature was enabled.

On the other hand, collators will not be required to upgrade in this step (but are still require to upgrade for step 1),
as regular chunk recovery will work as before, granted that version 1 of the networking protocol has been removed.
Note that collators only perform availability-recovery in rare, adversarial scenarios, so it is fine to not optimise for
this case and let them upgrade at their own pace.

To support enabling this feature via the runtime, we will use the `NodeFeatures` bitfield of the `HostConfiguration`
struct (added in `https://github.com/paritytech/polkadot-sdk/pull/2177`). Adding and enabling a feature
with this scheme does not require a runtime upgrade, but only a referendum that issues a
`Configuration::set_node_feature` extrinsic. Once the feature is enabled and new configuration is live, the
validator->chunk mapping ceases to be a 1:1 mapping and systematic recovery may begin.

## Drawbacks

- Getting access to the `core_index` that used to be occupied by a candidate in some parts of the dispute protocol is
very complicated (See [appendix A](#appendix-a)). This RFC assumes that availability-recovery processes initiated during
disputes will only use regular recovery, as before. This is acceptable since disputes are rare occurrences in practice
and is something that can be optimised later, if need be. Adding the `core_index` to the `CandidateReceipt` would
mitigate this problem and will likely be needed in the future for CoreJam and/or Elastic scaling.
[Related discussion about updating `CandidateReceipt`](https://forum.polkadot.network/t/pre-rfc-discussion-candidate-receipt-format-v2/3738)
- It's a breaking change that requires all validators and collators to upgrade their node version at least once.

## Testing, Security, and Privacy

Extensive testing will be conducted - both automated and manual.
This proposal doesn't affect security or privacy.

## Performance, Ergonomics, and Compatibility

### Performance

This is a necessary data availability optimisation, as reed-solomon erasure coding has proven to be a top consumer of
CPU time in polkadot as we scale up the parachain block size and number of availability cores.

With this optimisation, preliminary performance results show that CPU time used for reed-solomon coding/decoding can be
halved and total POV recovery time decrease by 80% for large POVs. See more
[here](https://github.com/paritytech/polkadot-sdk/issues/598#issuecomment-1792007099).

### Ergonomics

Not applicable.

### Compatibility

This is a breaking change. See [upgrade path](#upgrade-path) section above.
All validators and collators need to have upgraded their node versions before the feature will be enabled via a
governance call.

## Prior Art and References

See comments on the [tracking issue](https://github.com/paritytech/polkadot-sdk/issues/598) and the
[in-progress PR](https://github.com/paritytech/polkadot-sdk/pull/1644)

## Unresolved Questions

Not applicable.

## Future Directions and Related Material

This enables future optimisations for the performance of availability recovery, such as retrieving batched systematic
chunks from backers/approval-checkers.

## Appendix A

This appendix details the intricacies of getting access to the core index of a candidate in parity's polkadot node.

Here, `core_index` refers to the index of the core that a candidate was occupying while it was pending availability
(from backing to inclusion).

Availability-recovery can currently be triggered by the following phases in the polkadot protocol:
1. During the approval voting process.
1. By other collators of the same parachain.
1. During disputes.

Getting the right core index for a candidate can be troublesome. Here's a breakdown of how different parts of the
node implementation can get access to it:

1. The approval-voting process for a candidate begins after observing that the candidate was included. Therefore, the
node has easy access to the block where the candidate got included (and also the core that it occupied).
1. The `pov_recovery` task of the collators starts availability recovery in response to noticing a candidate getting
backed, which enables easy access to the core index the candidate started occupying.
1. Disputes may be initiated on a number of occasions:
  
    3.a. is initiated by the validator as a result of finding an invalid candidate while participating in the
  approval-voting protocol. In this case, availability-recovery is not needed, since the validator already issued their
  vote.
    
    3.b is initiated by the validator noticing dispute votes recorded on-chain. In this case, we can safely
  assume that the backing event for that candidate has been recorded and kept in memory.
  
    3.c is initiated as a result of getting a dispute statement from another validator. It is possible that the dispute
  is happening on a fork that was not yet imported by this validator, so the subsystem may not have seen this candidate
  being backed.

A naive attempt of solving 3.c would be to add a new version for the disputes request-response networking protocol.
Blindly passing the core index in the network payload would not work, since there is no way of validating that
the reported core_index was indeed the one occupied by the candidate at the respective relay parent.

Another attempt could be to include in the message the relay block hash where the candidate was included.
This information would be used in order to query the runtime API and retrieve the core index that the candidate was
occupying. However, considering it's part of an unimported fork, the validator cannot call a runtime API on that block.

Adding the `core_index` to the `CandidateReceipt` would solve this problem and would enable systematic recovery for all
dispute scenarios.
