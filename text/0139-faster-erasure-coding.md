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
efficiency and reduce CPU overhead. However, systematic recovery assumes
very good network connectivity to approximately one-third of validators (plus some
backup tolerance on backers) and still requires re-encoding. Therefore,
we need to ensure the system can handle load in the worst-case scenario.

Since RFC-47 already requires a breaking protocol change (including changes to
collator nodes), we propose bundling another performance-enhancing breaking
change that addresses the CPU bottleneck in the erasure coding process.

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

Here is a reference implementation:

```rust
use blake2b_simd::{blake2b as hash_fn, Hash, State as Hasher};

/// Yields all erasure chunks as an iterator.
pub struct MerklizedChunks {
	root: ErasureRoot,
	data: VecDeque<Vec<u8>>,
	// This is a Binary Merkle Tree,
	// where each level is a vector of hashes starting from leaves.
	// \`\`\`
	// 0 -> [c, d, e, Hash::zero()]
	// 1 -> [a = hash(c, d), b = hash(e, Hash::zero())]
	// 2 -> hash(a, b)
	// \`\`\`
	// Levels are guaranteed to have a power of 2 elements.
	// Leaves might be padded with `Hash::zero()`.
	tree: Vec<Vec<Hash>>,
	// Used by the iterator implementation.
	current_index: u16,
}

type ErasureRoot = Hash;
pub struct Proof(BoundedVec<Hash, ConstU32<16>>);

/// A chunk of erasure-encoded block data.
pub struct ErasureChunk {
	/// The erasure-encoded chunk of data belonging to the candidate block.
	pub chunk: Vec<u8>,
	/// The index of this erasure-encoded chunk of data.
	pub index: u16,
	/// Proof for this chunk against an erasure root.
	pub proof: Proof,
}

impl Iterator for MerklizedChunks {
	type Item = ErasureChunk;

	fn next(&mut self) -> Option<Self::Item> {
		let chunk = self.data.pop_front()?;
		let d = self.tree.len() - 1;
		let idx = self.current_index.0;
		let mut index = idx as usize;
		let mut path = Vec::with_capacity(d);
		for i in 0..d {
			let layer = &self.tree[i];
			if index % 2 == 0 {
				path.push(layer[index + 1]);
			} else {
				path.push(layer[index - 1]);
			}
			index /= 2;
		}
		self.current_index += 1;
		Some(ErasureChunk {
			chunk,
			proof: Proof::try_from(path).expect("the path is limited by tree depth; qed"),
			index: idx,
		})
	}
}

impl MerklizedChunks {
	/// Compute `MerklizedChunks` from a list of erasure chunks.
	pub fn compute(chunks: Vec<Vec<u8>>) -> Self {
		let mut hashes: Vec<Hash> = chunks
			.iter()
			.map(|chunk| {
				let hash = hash_fn(chunk);
				Hash::from(hash)
			})
			.collect();
		hashes.resize(chunks.len().next_power_of_two(), Hash::default());

		let depth = hashes.len().ilog2() as usize + 1;
		let mut tree = vec![Vec::new(); depth];
		tree[0] = hashes;

		// Build the tree bottom-up.
		(1..depth).for_each(|lvl| {
			let len = 2usize.pow((depth - 1 - lvl) as u32);
			tree[lvl].resize(len, Hash::default());

			// NOTE: This can be parallelized.
			(0..len).for_each(|i| {
				let prev = &tree[lvl - 1];

				let hash = combine(prev[2 * i], prev[2 * i + 1]);

				tree[lvl][i] = hash;
			});
		});

		assert!(tree[tree.len() - 1].len() == 1, "root must be a single hash");

		Self {
			root: ErasureRoot::from(tree[tree.len() - 1][0]),
			data: chunks.into(),
			tree,
			current_index: 0,
		}
	}
}

fn combine(left: Hash, right: Hash) -> Hash {
	let mut hasher = Hasher::new();

	hasher.update(left.0.as_slice());
	hasher.update(right.0.as_slice());

	hasher.finalize().into()
}

impl ErasureChunk {
	/// Verify the proof of the chunk against the erasure root and index.
	pub fn verify(&self, root: &ErasureRoot) -> bool {
		let leaf_hash = Hash::from(hash_fn(&self.chunk));
		let bits = Bitfield(self.index.0);

		let root_hash = self.proof.0.iter().fold((leaf_hash, 0), |(acc, i), hash| {
			let (a, b) = if bits.get_bit(i) { (*hash, acc) } else { (acc, *hash) };
			(combine(a, b), i + 1)
		});

		// check the index doesn't contain more bits than the proof length
		let index_bits = 16 - self.index.0.leading_zeros() as usize;
		index_bits <= self.proof.0.len() && root_hash.0 == root.0
	}
}

struct Bitfield(u16);

impl Bitfield {
	/// Get the bit at the given index.
	pub fn get_bit(&self, i: usize) -> bool {
		self.0 & (1u16 << i) != 0
	}
}
```

### Upgrade path

We propose adding support for the new erasure coding scheme on both validator and collator sides without activating it until:
1. All validators have upgraded
2. Most collators have upgraded

Block-authoring collators that remain on the old version will be unable to produce valid candidates until they upgrade. Parachain full nodes will continue to function normally without changes.

An alternative approach would be to allow collators to opt-in to the new erasure
coding scheme using a reserved field in the candidate receipt. This would allow
faster deployment for most parachains but would add complexity.

Given there isn't urgent demand for supporting larger PoVs currently, we recommend prioritizing simplicity with a way to implement future-proofing changes.

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
