# RFC-0000: Introduce `storage_proof_size` Host Function for Improved Parachain Block Utilization
|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 30 October 2023                                                                    |
| **Description** | Host function to provide the storage proof size to runtimes.                                                                    |
| **Authors**     | Sebastian Kunert                                                                                            |

## Summary

This RFC proposes a new host function for parachains, `storage_proof_size`.  It shall provide the size of the currently recorded storage proof to the runtime. Runtime authors can use the proof size to improve block utilization by retroactively reclaiming unused storage weight.

## Motivation
The number of extrinsics that are included in a parachain block is limited by two constraints: execution time and proof size. FRAME weights cover both concepts, and block-builders use them to decide how many extrinsics to include in a block. However, these weights are calculated ahead of time by benchmarking on a machine with reference hardware. The execution-time properties of the state-trie and its storage items are unknown at benchmarking time. Therefore, we make some assumptions about the state-trie:
- **Trie Depth:** We assume a trie depth to account for intermediary nodes.
- **Storage Item Size:** We make a pessimistic assumption based on the `MaxEncodedLen` trait.

These pessimistic assumptions lead to an overestimation of storage weight, negatively impacting block utilization on parachains.

In addition, the current model does not account for multiple accesses to the same storage items. While these repetitive accesses will not increase storage-proof size, the runtime-side weight monitoring will account for them multiple times. Since the proof size is completely opaque to the runtime, we can not implement retroactive storage weight correction.

A solution must provide a way for the runtime to track the exact storage-proof size consumed on a per-extrinsic basis.

## Stakeholders
- **Parachain Teams:** They should include this host function in their runtime and node.
- **Light-client Implementors:** They should include this host function in their runtime and node.

## Explanation
This RFC proposes a new host function that exposes the storage-proof size to the runtime. As a result, runtimes can implement storage weight reclaiming mechanisms that improve block utilization.

This RFC proposes the following host function signature:
```rust
fn storage_proof_size() -> u64;
```
The host function MUST return an unsigned 64-bit integer value representing the current proof size. In block-execution and block-import contexts, this function MUST return the current size of the proof. To achieve this, parachain node implementors need to enable proof recording for block imports. In contexts without proof recording, this function MUST return 0. 

## Performance, Ergonomics, and Compatibility
### Performance
Parachain nodes need to enable proof recording during block import to correctly implement the proposed host function. Benchmarking conducted with balance transfers has shown a performance reduction of around 0.6% when proof recording is enabled. 

### Ergonomics
The host function proposed in this RFC allows parachain runtime developers to keep track of the proof size. Typical usage patterns would be to keep track of the overall proof size or the difference between subsequent calls to the host function.

### Compatibility
Parachain teams will need to include this host function to upgrade.

## Prior Art and References
- Pull Request including proposed host function: [PoV Reclaim (Clawback) Node Side](https://github.com/paritytech/polkadot-sdk/pull/1462).
- Issue with discussion: [[FRAME core] Clawback PoV Weights For Dispatchables](https://github.com/paritytech/polkadot-sdk/issues/209#top)
