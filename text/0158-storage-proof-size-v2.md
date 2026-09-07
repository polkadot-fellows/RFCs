# RFC-0158: Storage Proof Size Host Function Version 2

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 11 December 2024                                                                            |
| **Description** | Extend `storage_proof_size` host function to account for storage root calculation           |
| **Authors**     | Michał Kucharczyk                                                                           |

## Summary

RFC-0043 introduced the `storage_proof_size` host function to track proof size for weight reclaim. However, version 1 does not account for trie node accesses that occur during storage root calculation. This RFC proposes version 2 that returns the proof size including these accesses, enabling accurate PoV tracking.

## Motivation

Storage weight reclaim allows parachains to return unused proof-of-validity (PoV) space from completed extrinsics, enabling subsequent transactions to use this space. This mechanism relies on the `storage_proof_size` host function introduced in RFC-0043 to track the current proof size.

An issue was discovered: the current implementation does not account for storage root calculation. When storage items are written or deleted during extrinsic execution, these operations are only noted in the overlay - no trie access occurs, and therefore nothing is recorded in the proof. However, when calculating the storage root at block finalization, trie nodes must be accessed to insert, delete, or merge the changes. These trie node accesses are recorded in the proof, causing the actual PoV size to exceed the number recorded during extrinsics execution phase.

This discrepancy can cause the block builder to overshoot the PoV budget when using storage reclaim, resulting in blocks that exceed the limit and would be rejected by the relay chain. A new version of the host function is needed to provide accurate proof size that accounts for trie node accesses during storage root calculation, while maintaining acceptable performance overhead.

## Stakeholders

- **Parachain Teams**: MUST upgrade runtime and node to use version 2 for accurate PoV tracking. Chains using storage weight reclaim are particularly affected.
- **Cumulus Node Developers**: MUST implement version 2 of the host function.
- **Light-client Implementors**: SHOULD support version 2 for block re-execution capabilities.

## Explanation

This RFC proposes version 2 of the `storage_proof_size` host function:

```rust
fn ext_storage_proof_size_version_2() -> u64;
```

Version 2 returns the proof size comprising:
- the size of all trie nodes accessed (read) since block execution started (as RFC-0043 specified), and
- the size of trie nodes that would be accessed if storage root were calculated for all state modifications made so far in the current block.

The `state_version` parameter specifies the trie layout version (V0 or V1). In contexts where proof recording is disabled, it returns `u64::MAX` (as RFC-0043 specified).

## Drawbacks

1. **Performance Overhead**: Additional trie node accesses introduce performance overhead during block production.

2. **Implementation Complexity**: Achieving acceptable performance requires careful implementation. A naive approach would be prohibitively expensive.

3. **Node Requirements**: Proof recording must be enabled during block import.

## Testing, Security, and Privacy

Implementations should verify that proof size after version 2 call equals proof size after actual `storage_root()` call, including tests with nested storage transactions.

This proposal improves security by preventing PoV budget overshoots. No new security concerns or privacy impacts are introduced.

## Performance, Ergonomics, and Compatibility

### Performance

- **Block Production**: 2-7% overhead for balance transfer benchmarks (more details to be added if needed)

### Ergonomics

The host function interface remains simple - a single function call with one parameter. Most parachain developers will not interact with the host function directly, as it is called internally by the `StorageWeightReclaim` transaction extension.

### Compatibility

- **Backwards Compatible**: Version 1 remains available and unchanged for parachains that have not upgraded
- **Runtime Upgrade**: Parachains MUST upgrade runtime to use version 2 for accurate PoV tracking
- **Node Upgrade**: Nodes MUST be upgraded to provide version 2 implementation
- **Coordination**: Runtime and node upgrades should be coordinated; using version 2 on a node that doesn't implement it will fail

## Prior Art and References

- [RFC-0043: Introduce `storage_proof_size` Host Function](https://github.com/polkadot-fellows/RFCs/blob/main/text/0043-storage-proof-size-hostfunction.md): Original proposal for the host function
- [GitHub Issue #6020](https://github.com/paritytech/polkadot-sdk/issues/6020): Bug discovery and discussion about storage root calculation not being accounted for
- [PoV Reclaim Implementation PR](https://github.com/paritytech/polkadot-sdk/pull/1462): Original PoV reclaim implementation
- [Incremental Storage Root Estimation PR](https://github.com/paritytech/polkadot-sdk/pull/10215): Implementation of version 2

## Unresolved Questions

### Proof Generation Determinism

A concern was raised during RFC-0043 discussion regarding proof generation determinism: alternative implementations must generate proofs with exactly the same size as the reference implementation for deterministic block validation. This is a pre-existing concern that applies to all proof-dependent logic, not specifically introduced by this RFC. Implementers already must match the reference implementation's proof behavior for PVF validation to succeed.

## Appendix: Implementation Considerations

This appendix provides context for implementers. These are not requirements but describe one approach to achieving acceptable performance.

### Incremental Estimation

A naive approach of computing the full storage root after each host function call would result in approximately 98% throughput loss. To achieve acceptable performance, the reference implementation uses incremental estimation:

1. **Delta Tracking**: Track which storage keys have been modified (written or deleted) since the last call to version 2.

2. **Deduplication**: Only process keys modified since the previous call. Keys already accounted for in earlier calls are not reprocessed.

3. **Trie Access Simulation**: For each modified key, simulate the trie node accesses that would occur during storage root calculation:
   - For updated keys: access nodes along the path to where the value would be inserted
   - For deleted keys: access nodes that would be affected by the deletion (including potential node merges)

4. **Proof Recording**: Record the accessed trie nodes in the proof recorder, updating the proof size.

### Storage Transaction Support

The implementation must correctly handle nested storage transactions. It needs to track which storage keys have been modified or deleted, and handle transaction boundaries appropriately:
- When a storage transaction is committed, modified keys from that transaction become part of the parent transaction's set of tracked keys
- When a storage transaction is rolled back, modified keys from that transaction are discarded and not included in the storage root estimation

### Usage Context

The `StorageWeightReclaim` transaction extension in Cumulus calls `storage_proof_size` in `post_dispatch_details` after each extrinsic completes. This enables accurate weight reclaim during block building.
