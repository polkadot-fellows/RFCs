# RFC-0139: Faster Erasure Coding

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 7 March 2025                                                                    |
| **Description** | Faster algorithm for Data Availability Layer                                                                    |
| **Authors**     | ordian                                                                                            |

## Summary

This RFC proposes changes to the erasure coding algorithm and the method for computing the erasure root on Polkadot to improve performance of both processes.

## Motivation

The Data Availability (DA) Layer in Polkadot provides a foundation for
shared security, enabling Approval Checkers and Collators to download
Proofs-of-Validity (PoV) for security and liveness purposes respectively.
As the number of parachains and PoV sizes increase, optimizing the performance
of the DA layer becomes increasingly critical.

[RFC-47](https://github.com/polkadot-fellows/RFCs/blob/main/text/0047-assignment-of-availability-chunks.md)
proposed enabling systematic chunk recovery for Polkadot's DA to improve
efficiency and reduce CPU overhead. However, while it helps under the assumption of
good network connectivity to a specific one-third of validators (modulo some
backup tolerance on backers), it still requires re-encoding. Therefore,
we need to ensure the system can handle load in the worst-case scenario.
The proposed change is orthogonal to RFC-47 and can be used in conjunction with it.

Since RFC-47 already requires a breaking protocol change (including changes to
collator nodes), we propose bundling another performance-enhancing breaking
change that addresses the CPU bottleneck in the erasure coding process, but using
a separate node feature (`NodeFeatures` part of `HostConfiguration`) for its activation.

## Stakeholders

- Infrastructure providers (operators of validator/collator nodes)
  will need to upgrade their client version in a timely manner

## Explanation

We propose two specific changes:

1. Switch to the erasure coding algorithm described in the Graypaper,
Appendix H. SIMD implementations of this algorithm are available in:

   - [Rust](https://github.com/AndersTrier/reed-solomon-simd)
   - [C++](https://github.com/catid/leopard)
   - [Go](https://github.com/celestiaorg/go-leopard)

2. Replace the Merkle Patricia Trie with a Binary Merkle Tree for computing the erasure root.

The reference root merklization implementation can be found [here](https://github.com/paritytech/erasure-coding/blob/512e77472beb877fe0881a857623d54d97b82bc4/src/merklize.rs#L9-L197).

### Upgrade path

We propose adding support for the new erasure coding scheme on both validator and collator sides without activating it until:
1. All validators have upgraded
2. Most collators have upgraded

Block-authoring collators that remain on the old version will be unable to produce valid candidates until they upgrade. Parachain full nodes will continue to function normally without changes.

An alternative approach would be to allow collators to opt-in to the new erasure
coding scheme using a reserved field in the candidate receipt. This would allow
faster deployment for most parachains but would add complexity.

Given there isn't urgent demand for supporting larger PoVs currently, we recommend prioritizing simplicity with a way to implement future-proofing changes.

In short, the following steps are proposed:
1. Implement the changes a and wait for most collators to upgrade.
2. Activate RFC-47 via `Configuration::set_node_feature` runtime change.
3. Activate the new erasure coding scheme using another `Configuration::set_node_feature` runtime change.

## Drawbacks

Bundling this breaking change with RFC-47 might reset progress in updating collators. However, the omni node initiative should help mitigate this issue.

## Testing, Security, and Privacy

Testing is needed to ensure binary compatibility across implementations in multiple languages.

## Performance and Compatibility

### Performance

According to [benchmarks](https://gist.github.com/ordian/0af2822e20bf905d53410a48dc122fd0):
- A proper SIMD implementation of Reed-Solomon is 3-4× faster for encoding and up to 9× faster for full decoding
- Binary Merkle Trees produce proofs that are 4× smaller and slightly faster to generate and verify

### Compatibility

This requires a breaking change that can be coordinated following the same approach as in RFC-47.

## Prior Art and References

JAM already utilizes the same optimizations described in the Graypaper.

## Unresolved Questions

None.

## Future Directions and Related Material

Future improvements could include:
- Using ZK proofs to eliminate the need for re-encoding data to verify correct encoding
- Removing the requirement for collators to compute the erasure root for the collator protocol
