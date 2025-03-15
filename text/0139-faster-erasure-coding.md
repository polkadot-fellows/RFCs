# RFC-0139: Faster Erasure Coding

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 7 March 2025                                                                    |
| **Description** | Faster algorithm for Data Availability Layer                                                                    |
| **Authors**     | ordian                                                                                            |

## Summary

This RFC proposes changes to the erasure coding algorithm and the way the erasure root is computed on Polkadot to make both processes faster.

## Motivation

The Data Availability (DA) Layer provided by Polkadot serves as a foundational layer for
shared security, currently allowing Approval Checkers and Collators to download
the Proofs-of-Validity (PoV) for security and liveness purposes respectively.
As the number of parachains and PoV sizes grow, it is increasingly important
for the DA to be as performant as possible.

[RFC-47](https://github.com/polkadot-fellows/RFCs/blob/main/text/0047-assignment-of-availability-chunks.md)
proposed a way to enable systematic chunk recovery for Polkadot's DA, improving
the efficiency/reducing the CPU overhead. However, systematic recovery can only
work assumes very good network connectivity to the corresponding one third of
validators minus modulo some backup tolerance on backers and still requires
re-encoding anyway, and as such, we need to ensure the system will sustain the
load in the worst-case scenario. On top of that, enabling it requires making a
breaking change to the protocol (including the collator node side).

We propose bundling another breaking change to the protocol along with RFC-47
to speed up erasure coding, which constitutes the CPU bottleneck of DA.

## Stakeholders

- Infrastructure providers (people who run validator/collator nodes)
  will need to upgrade their client version in time

## Explanation

In particular, two changes are being proposed:

1. Switch the erasure coding algorithm to the one described in the Graypaper,
Appendix H. SIMD implementations of this algorithm are available in:

- [Rust](https://github.com/AndersTrier/reed-solomon-simd),
- [C++](https://github.com/catid/leopard) and
- [Go](https://github.com/celestiaorg/go-leopard).

2. For computing the erasure root, switch from Merkle Patricia Trie to a Binary
Merkle Tree.

Here is a reference implementation for that:

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

Here we propose to add support for the new erasure coding scheme on the validator and collator side, but don't activate it until all validators and most collators have been upgraded.
Block authoring collators remaining on the old version won't be able to produce valid candidates until they upgrade. Parachain full nodes will continue to work as before.

An alternative approach would be to allow the collators to opt-in to the new
erasure coding scheme by using a reserved field of the candidate receipt. This
has the benefit of allowing us to deploy the new erasure coding scheme faster
for most parachains at the cost of adding some complexity.

Since there's not much demand coming on big PoVs, we argue for simplicity and a path for making it future-proof.

## Drawbacks

Bundling breaking changes with RFC 47 might reset the progress of updating collators. However, the omni node initiative can alleviate this problem.

## Testing, Security, and Privacy

Some testing needs to be done to ensure binary compatibility across implementations in multiple languages.

## Performance and Compatibility

### Performance

According to [these benchmarks](https://gist.github.com/ordian/0af2822e20bf905d53410a48dc122fd0), a proper SIMD implementation of Reed-Solomon is 3-4x faster in encoding and up to 9x faster in full decoding.
Switching to Binary Merkle Trees for proofs makes them 4x smaller and slightly faster to generate and verify.

### Compatibility

This is a breaking change that can be coordinated in the same way as done in RFC 47.

## Prior Art and References

JAM is utilizing the same optimizations as described in the Graypaper.

## Unresolved Questions

None.

## Future Directions and Related Material

In the future, ZK proofs could be used to avoid the need to re-encode the data to verify that
the encoding was done correctly.

In addition, we should remove the requirement for collators to compute the erasure root for the collator protocol to work.
