# RFC-0135: Compressed Blob Prefixes

|                 |                                                                    |
| --------------- | ------------------------------------------------------------------ |
| **Start Date**  | 2025-01-06 |
| **Description** | Standardize compressed blob prefixes |
| **Authors**     | s0me0ne-unkn0wn (13WGadgNgqSjiGQvfhimw9pX26mvGdYQ6XgrjPANSEDRoGMt) |

## Summary

This RFC proposes a change that makes it possible to identify types of compressed blobs stored on-chain, as well as used off-chain, without the need for decompression.

## Motivation

Currently, a compressed blob does not give any idea of what's inside because the only thing that can be inside, according to the spec, is Wasm. In reality, other blob types are already being used, and more are to come. Apart from being error-prone by itself, the current approach does not allow to properly route the blob through the execution paths before its decompression, which will result in suboptimal implementations when more blob types are used. Thus, it is necessary to introduce a mechanism allowing to identify the blob type without decompressing it.

This proposal is intended to support future work enabling Polkadot to execute PolkaVM and, more generally, other-than-Wasm parachain runtimes, and allow developers to introduce arbitrary compression methods seamlessly in the future.

## Stakeholders

Node developers are the main stakeholders for this proposal. It also creates a foundation on which parachain runtime developers will build.

## Explanation

### Overview

The current approach to compressing binary blobs involves using `zstd` compression, and the resulting compressed blob is prefixed with a unique 64-bit magic value specified in that subsection. The same procedure is used to compress both Wasm code blobs and proofs-of-validity. Currently, having solely a compressed blob, it's impossible to tell what's inside it without decompression, a Wasm blob, or a PoV. That doesn't cause problems in the current protocol, as Wasm blobs and PoV blobs take completely different execution paths in the code.

The changes proposed below are intended to define the means for distinguishing compressed blob types in a backward-compatible and future-proof way.

It is proposed to introduce an open list of 64-bit prefixes, each representing a compressed blob of a specific type compressed with a specific compression method. The currently used prefix becomes deprecated and will be removed or reused when it is no longer in use.

The proposed list of prefixes to support the current as well as currently known future work follows:

| Prefix name | Prefix bytes | Description |
| -- | -- | -- |
| `CBLOB_ZSTD_LEGACY`      | 82, 188, 83, 118, 70, 219, 142, 5 | Wasm code blob or PoV, zstd-compressed |
| `CBLOB_ZSTD_POV`         | 82, 188, 83, 118, 70, 219, 142, 6 | Proof-of-validity, zstd-compressed     |
| `CBLOB_ZSTD_WASM_CODE`   | 82, 188, 83, 118, 70, 219, 142, 7 | Wasm code blob, zstd-compressed        |
| `CBLOB_ZSTD_PVM_CODE`    | 82, 188, 83, 118, 70, 219, 142, 8 | PolkaVM code blob, zstd-compressed     |

No runtime code changes should be needed to imnplement this proposal. Node-side changes are trivial; a PoC already implemented as a part of [SDK PR#6704](https://github.com/paritytech/polkadot-sdk/pull/6704) may be used as an example.

### Timeline

1. The proposed prefix changes are implemented and released. No logic changes yet;
2. After the supermajority of production networks' nodes upgrades, one more change is released that adds `CBLOB_ZSTD_WASM_CODE` prefix instead of `CBLOB_ZSTD_LEGACY` when compiling and compressing Wasm parachain runtimes, and `CBLOB_ZSTD_POV` instead of `CBLOB_ZSTD_LEGACY` when compressing PoVs;
3. Conservatively, wait until no more PVFs prefixed with `CBLOB_ZSTD_LEGACY` remain on-chain. That may take quite some time. Alternatively, create a migration that alters prefixes of existing blobs;
4. Removing `CBLOB_ZSTD_LEGACY` prefix will be possible after all the nodes in all the networks cease using the prefix which is a long process, and additional incentives should be offered to the community to make people upgrade.

## Drawbacks

Currently, the only requirement for a compressed blob prefix is not to coincide with Wasm magic bytes (as stated in code comments). Changes proposed here increase prefix collision risk, given that arbitrary data may be compressed in the future. However, it must be taken into account that:
* Collision probability per arbitrary blob is ≈5,4×10⁻²⁰ for a single random 64-bit prefix (current situation) and ≈2,17×10⁻¹⁹ for the proposed set of four 64-bit prefixes (proposed situation), which is still low enough;
* The current de facto protocol uses the current compression implementation to compress PoVs, which are arbitrary binary data, so the collision risk already exists and is not introduced by changes proposed here.

## Testing, Security, and Privacy

As the change increases granularity, it will positively affect both testing possibilities and security, allowing developers to check what's inside a given compressed blob precisely. Testing the change itself is trivial. Privacy is not affected by this change.

## Performance, Ergonomics, and Compatibility

### Performance

The current implementation's performance is not affected by this change. Future implementations allowing for the execution of other-than-Wasm parachain runtimes will benefit from this change performance-wise.

### Ergonomics

The end-user ergonomics is not affected. The ergonomics for developers will benefit from this change as it enables exact checks and less guessing.

### Compatibility

The change is designed to be backward-compatible. 

## Prior Art and References

[SDK PR#6704](https://github.com/paritytech/polkadot-sdk/pull/6704) (WIP) introduces a mechanism similar to that described in this proposal and proves the necessity of such a change.

## Unresolved Questions

None

## Future Directions and Related Material

This proposal creates a foundation for two future work directions:
* Proposing to introduce other-than-Wasm code executors, including PolkaVM, allowing parachain runtime authors to seamlessly change execution platform using the existing mechanism of runtime upgrades;
* Proposing to use arbitrary compression methods in cases when they make sense from the point of view of efficiency and/or performance, including blob-type-specific compression approaches, streamlining the adoption of such methods and deprecation of the old ones.
