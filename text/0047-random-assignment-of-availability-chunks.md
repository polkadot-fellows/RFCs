# RFC-0047: Random assignment of availability chunks to validators

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 03 November 2023                                                                            |
| **Description** | An evenly-distributing indirection layer between availability chunks and validators.        |
| **Authors**     | Alin Dima                                                                                   |

## Summary

Propose a way of randomly permuting the availability chunk indices assigned to validators for a given core and relay
chain block, in the context of
[recovering available data from systematic chunks](https://github.com/paritytech/polkadot-sdk/issues/598), with the
purpose of fairly distributing network bandwidth usage.

## Motivation

Currently, the ValidatorIndex is always identical to the ChunkIndex. Since the validator array is only shuffled once
per session, naively using the ValidatorIndex as the ChunkIndex would pose an unreasonable stress on the first N/3
validators during an entire session, when favouring availability recovery from systematic chunks.

Therefore, the relay chain node needs a deterministic way of evenly distributing the first ~(N_VALIDATORS / 3)
systematic availability chunks to different validators, based on the session, relay chain block and core.
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

Here's the concatenation procedure of systematic chunks for polkadot's erasure coding algorithm
(minus error handling, for briefness):
```rust
pub fn reconstruct_from_systematic<T: Decode>(
	n_validators: usize,
	chunks: Vec<&[u8]>,
) -> T {
	let mut threshold = (n_validators - 1) / 3;
	if !is_power_of_two(threshold) {
		threshold = next_lower_power_of_2(threshold);
	}

	let shard_len = chunks.iter().next().unwrap().len();

	let mut systematic_bytes = Vec::with_capacity(shard_len * kpow2);

	for i in (0..shard_len).step_by(2) {
		for chunk in chunks.iter().take(kpow2) {
			systematic_bytes.push(chunk[i]);
			systematic_bytes.push(chunk[i + 1]);
		}
	}

	Decode::decode(&mut &systematic_bytes[..]).map_err(|err| Error::Decode(err))
}
```

In a nutshell, it performs a column-wise concatenation with 2-bit chunks.

### Availability recovery now

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

### Availability recovery from systematic chunks

As part of the effort of
[increasing polkadot's resource efficiency, scalability and performance](https://github.com/paritytech/roadmap/issues/26),
work is under way to modify the Availability Recovery protocol by leveraging systematic chunks. See
[this comment](https://github.com/paritytech/polkadot-sdk/issues/598#issuecomment-1792007099) for preliminary
performance results.

In this scheme, the relay chain node will first attempt to retrieve the ~N/3 systematic chunks from the validators that
should hold them, before falling back to recovering from regular chunks, as before.

### Chunk assignment function

#### Properties

The function that decides the chunk index for a validator should be parameterized by at least
`(validator_index, relay_parent, para_id)`
and have the following properties:
1. deterministic
1. pseudo-random
1. relatively quick to compute and resource-efficient.
1. when considering the other params besides `validator_index` as fixed, the function should describe a random permutation
of the chunk indices
1. considering `relay_parent` as a fixed argument, the validators that map to the first N/3 chunk indices should
have as little overlap as possible for different paras scheduled on that relay parent.

In other words, we want a uniformly distributed, deterministic mapping from `ValidatorIndex` to `ChunkIndex` per block
per scheduled para.

#### Proposed runtime API

The mapping function should be implemented as a runtime API, because:

1. it enables further atomic changes to the shuffling algorithm.
1. it enables alternative client implementations (in other languages) to use it
1. considering how critical it is for parachain consensus that all validators have a common view of the Validator->Chunk
mapping, this mitigates the problem of third-party libraries changing the implementations of the `ChaCha8Rng` or the `rand::shuffle`
that could be introduced in further versions. This would stall parachains if only a portion of validators upgraded the node.


Pseudocode:

```rust
pub fn get_chunk_index(
  n_validators: u32,
  validator_index: ValidatorIndex,
  relay_parent: Hash,
  para_id: ParaId
) -> ChunkIndex {
  let threshold = systematic_threshold(n_validators); // Roughly n_validators/3
  let seed = derive_seed(relay_parent);
  let mut rng: ChaCha8Rng = SeedableRng::from_seed(seed);
  let mut chunk_indices: Vec<ChunkIndex> = (0..n_validators).map(Into::into).collect();
  chunk_indices.shuffle(&mut rng);

  let seed = derive_seed(hash(para_id));
  let mut rng: ChaCha8Rng = SeedableRng::from_seed(seed);
	
	let core_start_pos = rng.gen_range(0..n_validators);

  chunk_indices[(core_start_pos + validator_index) % n_validators]
}
```

Additionally, so that client code is able to efficiently get the mapping from the runtime, another API will be added
for retrieving chunk indices in bulk for all validators at a given block and core:

```rust
pub fn get_chunk_indices(
  n_validators: u32,
  relay_parent: Hash,
  para_id: ParaId
) -> Vec<ChunkIndex> {
  let threshold = systematic_threshold(n_validators); // Roughly n_validators/3
  let seed = derive_seed(relay_parent);
  let mut rng: ChaCha8Rng = SeedableRng::from_seed(seed);
  let mut chunk_indices: Vec<ChunkIndex> = (0..n_validators).map(Into::into).collect();
  chunk_indices.shuffle(&mut rng);

  let seed = derive_seed(hash(para_id));
  let mut rng: ChaCha8Rng = SeedableRng::from_seed(seed);
	
	let core_start_pos = rng.gen_range(0..n_validators);
  
  chunk_indices
    .into_iter()
    .cycle()
    .skip(core_start_pos)
    .take(n_validators)
    .collect()
}
```

#### Upgrade path

Considering that the Validator->Chunk mapping is critical to para consensus, the change needs to be enacted atomically
via governance, only after all validators have upgraded the node to a version that is aware of this mapping.
It needs to be explicitly stated that after the runtime upgrade and governance enactment, validators that run older
client versions that don't support this mapping will not be able to participate in parachain consensus.

Additionally, an error will be logged when starting a validator with an older version, after the runtime was upgraded and the feature enabled.

## Drawbacks

- In terms of guaranteeing even load distribution, a simpler function that chooses the per-core start position in the
shuffle as `threshold * core_index` would likely perform better, but considering that the core_index is not part of the
CandidateReceipt, the implementation would be too complicated. More details in [Appendix A](#appendix-a).
- Considering future protocol changes that aim to generalise the work polkadot is doing (like CoreJam), `ParaId`s may be
removed from the protocol, in favour of more generic primitives. In that case, `ParaId`s in the availability recovery
process should be replaced with a similar identifier. It's important to note that the implementation is greatly simplified
if this identifier is part of the `CandidateReceipt` or the future analogous data structure.
- It's a breaking change that requires most validators to be upgrade their node version.

## Testing, Security, and Privacy

Extensive testing will be conducted - both automated and manual.
This proposal doesn't affect security or privacy.

## Performance, Ergonomics, and Compatibility

### Performance

This is a necessary data availability optimisation, as reed-solomon erasure coding has proven to be a top consumer of
CPU time in polkadot as we scale up the parachain block size and number of availability cores.

With this optimisation, preliminary performance results show that CPU time used for reed-solomon coding can be halved
and total POV recovery time decrease by 80% for large POVs. See more
[here](https://github.com/paritytech/polkadot-sdk/issues/598#issuecomment-1792007099).

### Ergonomics

Not applicable.

### Compatibility

This is a breaking change. See [upgrade path](#upgrade-path) section above.
All validators need to have upgraded their node versions before the feature will be enabled via a runtime upgrade and
governance call.

## Prior Art and References

See comments on the [tracking issue](https://github.com/paritytech/polkadot-sdk/issues/598) and the
[in-progress PR](https://github.com/paritytech/polkadot-sdk/pull/1644)

## Unresolved Questions

- Is it the best option to embed the mapping function in the runtime?
- Is there a better upgrade path that would preserve backwards compatibility?
- Is usage of `ParaId` the best choice for spreading out the network load during systematic chunk recovery within the
same block?

## Future Directions and Related Material

This enables future optimisations for the performance of availability recovery, such as retrieving batched systematic
chunks from backers/approval-checkers.

## Appendix A

This appendix explores alternatives to using the `ParaId` as the factor by which availability chunk indices are
distributed to validators within the same relay chain block, and why they weren't chosen.

### Core index

Here, `core_index` refers to the index of the core that a candidate was occupying while it was pending availability
(from backing to inclusion).

Availability-recovery can currently be triggered by the following phases in the polkadot protocol:
1. During the approval voting process.
1. By other collators of the same parachain.
1. During disputes.

Getting the right core index for a candidate is troublesome. Here's a breakdown of how different parts of the
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