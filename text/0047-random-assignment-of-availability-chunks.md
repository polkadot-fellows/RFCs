# RFC-0047: Random assignment of availability chunks to validators

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 03 November 2023                                                                            |
| **Description** | An evenly-distributing indirection layer between availability chunks and the validators that hold them.|
| **Authors**     | Alin Dima                                                                                   |

## Summary

Propose a way of randomly permuting the availability chunk indices assigned to validators for a given core and relay chain block,
in the context of [recovering available data from systematic chunks](https://github.com/paritytech/polkadot-sdk/issues/598).

## Motivation

The relay chain node must have a deterministic way of evenly distributing the first ~(N_VALIDATORS / 3) systematic availability chunks to different validators,
based on the session, relay chain block number and core.
This is needed in order to optimise network load distribution as evenly as possible during availability recovery.

## Stakeholders

Relay chain node core developers.

## Explanation

### Systematic erasure codes

An erasure coding algorithm is considered systematic if it preserves the original unencoded data as part of the resulting code.
[The implementation of the erasure coding algorithm used for polkadot's availability data](https://github.com/paritytech/reed-solomon-novelpoly) is systematic. Roughly speaking, the first N_VALIDATORS/3
chunks of data can be cheaply concatenated to retrieve the original data, without running the resource-intensive and time-consuming decoding algorithm.

### Availability recovery from systematic chunks

As part of the effort of [increasing polkadot's resource efficiency, scalability and performance](https://github.com/paritytech/roadmap/issues/26), work is under way to
modify the Availability Recovery subsystem by leveraging systematic chunks. See [this comment](https://github.com/paritytech/polkadot-sdk/issues/598#issuecomment-1792007099)
for preliminary performance results.

In this scheme, the relay chain node will first attempt to retrieve the N/3 systematic chunks from the validators that should hold them,
before falling back to recovering from regular chunks, as before.

The problem that this RFC aims to address is that, currently, the ValidatorIndex is always identical to the ChunkIndex.
Since the validator array is only shuffled once per session, naively using the ValidatorIndex as the ChunkIndex
would pose an unreasonable stress on the first N/3 validators during an entire session.

### Chunk assignment function

#### Properties
The function that decides the chunk index for a validator should be parametrised by at least `(validator_index, session_index, block_number, core_index)`
and have the following properties:
1. deterministic
1. pseudo-random
1. relatively quick to compute and resource-efficient.
1. when considering the other params besides `validator_index` as fixed,
the function should describe a random permutation of the chunk indices
1. considering `session_index` and `block_number` as fixed arguments, the validators that map to the first N/3 chunk indices should
have as little overlap as possible for different cores.

#### Proposed function and runtime API

Pseudocode:

```rust
pub fn get_chunk_index(
    n_validators: u32,
    validator_index: ValidatorIndex,
    session_index: SessionIndex,
    block_number: BlockNumber,
    core_index: CoreIndex
) -> ChunkIndex {
    let threshold = systematic_threshold(n_validators); // Roughly n_validators/3
    let seed = derive_seed(session_index, block_number);
    let mut rng: ChaCha8Rng = SeedableRng::from_seed(seed);
    let mut chunk_indices: Vec<ChunkIndex> = (0..n_validators).map(Into::into).collect();
    chunk_indices.shuffle(&mut rng);

    let core_start_pos = threshold * core_index.0;
    return chunk_indices[(core_start_pos + validator_index) % n_validators]
}
```

The function should be implemented as a runtime API, because:

1. it's critical to the consensus protocol that all validators have a common view of the Validator->Chunk mapping.
1. it enables further atomic changes to the shuffling algorithm.
1. it enables alternative client implementations (in other languages) to use it
1. mitigates the problem of third-party libraries changing the implementations of the `ChaCha8Rng` or the `rand::shuffle`
that could be introduced in further versions, which would stall parachains. This would be quite an "easy" attack.

Additionally, so that client code is able to efficiently get the mapping from the runtime, another API will be added
for retrieving chunk indices in bulk for all validators at a given block and core.

#### Upgrade path

Considering that the Validator->Chunk mapping is critical to para consensus, the change needs to be enacted atomically via
governance, only after all validators have upgraded the node to a version that is aware of this mapping.
It needs to be explicitly stated that after the runtime upgrade and governance enactment, validators that run older client versions that don't
support this mapping will not be able to participate in parachain consensus.

### Getting access to core_index in different subsystems

Availability-recovery can currently be triggered by three actors:
1. `ApprovalVoting` subsystem of the relay chain validator.
2. `pov_recovery` task of collators
3. `DisputeCoordinator` subsystem of the relay chain validator.

The one parameter of the assignment function that poses problems to some subsystems is the `core_index`.
The `core_index` refers to the index of the core that the candidate was occupying while it was pending availability (from backing to inclusion).

1. The `ApprovalVoting` subsystem starts the approval process on a candidate as a result to seeing a `CandidateIncluded` event.
This event also contains the core index that the candidate is leaving, so getting access to the core index is not an issue.
1. The `pov_recovery` task of the collators starts availability recovery in response to a `CandidateBacked` event, which enables
easy access to the core index the candidate started occupying.
1. Disputes may be initiated on a number of occasions:
  
    3.a. is initiated by the current node as a result of finding an invalid candidate while doing approval work. In this case,
  availability-recovery is not needed, since the validator already issued their vote.
    
    3.b is initiated by noticing dispute votes recorded as a result of chain scraping. In this case, the subsystem
  assumes it already has a copy of the `CandidateReceipt` as a result of scraping `CandidateBacked` events. The logic can be modified
  to also record core indices.
  
    3.c is initiated as a result of getting a dispute statement from another validator. It is possible that the dispute is happening on
  a fork that was not yet imported by this validator, so the subsystem will not always have access to the `CandidateBacked` event
  recorded by the chain scraper.

As a solution to 3.c, a new version for the disputes request-response networking protocol will be added.
This message type will include the relay block hash where the candidate was included. This information will be used
in order to query the runtime API and retrieve the core index that the candidate was occupying.

The usage of the systematic data availability recovery feature will also be subject to all nodes using the V2 disputes networking protocol.

#### Alternatives to using core_index

As an alternative to core_index, the `ParaId` could be used. It has the advantage of being readily available in the
`CandidateReceipt`, which would enable the dispute communication protocol to not change and would simplify the implementation.
However, in the context of [CoreJam](https://github.com/polkadot-fellows/RFCs/pull/31), `ParaId`s will no longer exist (at least not in their current form).

## Drawbacks

Has a fair amount of technical complexity involved:

- Introduces another runtime API that is going to be issued by multiple subsystems. With adequate client-side caching, this should be acceptable.

- Requires a networking protocol upgrade on the disputes request-response protocol

## Testing, Security, and Privacy

Extensive testing will be conducted - both automated and manual.
This proposal doesn't affect security or privacy.

## Performance, Ergonomics, and Compatibility

### Performance

This is a necessary optimisation, as reed-solomon erasure coding has proven to be a top consumer of CPU time in polkadot when scaling the parachain count.

With this optimisation, preliminary performance results show that CPU time used for reed-solomon coding can be halved and total POV recovery time decrease by 80% for large POVs. See more [here](https://github.com/paritytech/polkadot-sdk/issues/598#issuecomment-1792007099).

### Ergonomics

Not applicable.

### Compatibility

This is a breaking change. See "upgrade path" section above.
All validators need to have upgraded their node versions before the feature will be enabled via a runtime upgrade and governance call.

## Prior Art and References

See comments on the [tracking issue](https://github.com/paritytech/polkadot-sdk/issues/598) and the [in-progress PR](https://github.com/paritytech/polkadot-sdk/pull/1644)

## Unresolved Questions

- Is it a future-proof idea to utilise the core index as a parameter of the chunk index compute function? Is there a better alternative that avoid complicating the implementation?
- Is there a better upgrade path that would preserve backwards compatibility?

## Future Directions and Related Material

This enables future optimisations for the performance of availability recovery, such as retrieving batched systematic chunks from backers/approval-checkers.
