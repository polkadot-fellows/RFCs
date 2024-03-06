# RFC-0078: Merkleized Metadata

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 22 February 2024                                                                    |
| **Description** | Include merkleized metadata hash in extrinsic signature for trust-less metadata verification.                                                                     |
| **Authors**     | Zondax AG, Parity Technologies                                                                                                |

## Summary

To interact with chains in the Polkadot ecosystem it is required to know how transactions are encoded and how to read state. For doing this, Polkadot-SDK, the framework used by most of the chains in the Polkadot ecosystem, exposes metadata about the runtime to the outside. UIs, wallets, and others can use this metadata to interact with these chains. This makes the metadata a crucial piece of the transaction encoding as users are relying on the interacting software to encode the transactions in the correct format.

It gets even more important when the user signs the transaction in an offline wallet, as the device by its nature cannot get access to the metadata without relying on the online wallet to provide it. This makes it so that the offline wallet needs to _trust_ an online party, deeming the security assumptions of the offline devices, mute. 

This RFC proposes a way for offline wallets to leverage metadata, within the constraints of these. The design idea is that the metadata is chunked and these chunks are put into a merkle tree. The root hash of this merkle tree represents the metadata. The offline wallets can use the root hash to decode transactions by getting proofs for the individual chunks of the metadata. This root hash is also included in the signed data of the transaction (but not sent as part of the transaction). The runtime is then including its known metadata root hash when verifying the transaction. If the metadata root hash known by the runtime differs from the one that the offline wallet used, it very likely means that the online wallet provided some fake data and the verification of the transaction fails.

Users depend on offline wallets to correctly display decoded transactions before signing. With merkleized metadata, they can be assured of the transaction's legitimacy, as incorrect transactions will be rejected by the runtime.

## Motivation

Polkadot's innovative design (both relay chain and parachains) present the ability to developers to upgrade their network as frequently as they need. These systems manage to have integrations working after the upgrades with the help of FRAME Metadata. This Metadata, which is in the order of half a MiB for most Polkadot-SDK chains, completely describes chain interfaces and properties. Securing this metadata is key for users to be able to interact with the Polkadot-SDK chain in the expected way.

On the other hand, offline wallets provide a secure way for Blockchain users to hold their own keys (some do a better job than others). These devices seldomly get upgraded, usually account for one particular network and hold very small internal memories. Currently in the Polkadot ecosystem there is no secure way of having these offline devices know the latest Metadata of the Polkadot-SDK chain they are interacting with. This results in a plethora of similar yet slightly different offline wallets for all different Polkadot-SDK chains, as well as the impediment of keeping these regularly updated, thus not fully leveraging Polkadot-SDK’s unique forkless upgrade feature.

The two main reasons why this is not possible today are:
1. **Metadata is too large for offline devices**. Currently Polkadot-SDK metadata is on average 500 KiB, which is more than what the mostly adopted offline devices can hold.
2. **Metadata is not authenticated**. Even if there was enough space on offline devices to hold the metadata, the user would be trusting the entity providing this metadata to the hardware wallet. In the Polkadot ecosystem, this is how currently Polkadot Vault works.

**This RFC proposes a solution to make FRAME Metadata compatible with offline signers in a secure way.** As it leverages FRAME Metadata, it does not only ensure that offline devices can always keep up to date with every FRAME based chain, but also that every offline wallet will be compatible with all FRAME based chains, avoiding the need of per-chain implementations.

## Requirements

1. Metadata's integrity MUST be preserved. If any compromise were to happen, extrinsics sent with compromised metadata SHOULD fail.
2. Metadata information that could be used in signable extrinsic decoding MAY be included in digest, yet its inclusion MUST be indicated in signed extensions.
3. Digest MUST be deterministic with respect to metadata.
4. Digest MUST be cryptographically strong against pre-image, both first (finding an input that results in given digest) and second (finding an input that results in same digest as some other input given).
5. Extra-metadata information necessary for extrinsic decoding and constant within runtime version MUST be included in digest.
6. It SHOULD be possible to quickly withdraw offline signing mechanism without access to cold signing devices.
7. Digest format SHOULD be versioned.
8. Work necessary for proving metadata authenticity MAY be omitted at discretion of signer device design (to support automation tools).

### Reduce metadata size

Metadata should be stripped from parts that are not necessary to parse a signable extrinsic, then it should be separated into a finite set of self-descriptive chunks. Thus, a subset of chunks necessary for signable extrinsic decoding and rendering could be sent, possibly in small portions (ultimately, one at a time), to cold devices together with the proof.

 1. Single chunk with proof payload size SHOULD fit within few kB;
 2. Chunks handling mechanism SHOULD support chunks being sent in any order without memory utilization overhead;
 3. Unused enum variants MUST be stripped (this has great impact on transmitted metadata size; examples: era enum, enum with all calls for call batching).

## Stakeholders

- Runtime implementors
- UI/wallet implementors
- Offline wallet implementors

The idea for this RFC was brought up by runtime implementors and was extensively discussed with offline wallet implementors. It was designed in such a way that it can work easily with the existing offline wallet solutions in the Polkadot ecosystem.

## Explanation

The FRAME metadata provides a wide range of information about a FRAME based runtime. It contains information about the pallets, the calls per pallet, the storage entries per pallet, runtime APIs, and type information about most of the types that are used in the runtime. For decoding extrinsics on an offline wallet, what is mainly required is type information. Most of the other information in the FRAME metadata is actually not required for decoding extrinsics and thus it can be removed. Therefore, the following is a proposal on a custom representation of the metadata and how this custom metadata is chunked, ensuring that only the needed chunks required for decoding a particular extrinsic are sent to the offline wallet. The necessary information to transform the FRAME metadata type information into the type information presented in this RFC will be provided. However, not every single detail on how to convert from FRAME metadata into the RFC type information is described.

First, the `MetadataDigest` is introduced. After that, `ExtrinsicMetadata` is covered and finally the actual format of the type information. Then pruning of unrelated type information is covered and how to generate the `TypeRef`s. In the latest step, merkle tree calculation is explained.

### Metadata digest

The metadata digest is the compact representation of the metadata. The hash of this digest is the *metadata hash*. Below the type declaration of the `Hash` type and the `MetadatDigest` itself can be found:

```rust
type Hash = [u8; 32];

enum MetadataDigest {
    #[index = 1]
    V1 {
        type_information_tree_root: Hash,
        extrinsic_metadata_hash: Hash,
        spec_version: u32,
        spec_name: String,
        base58_prefix: u16,
        decimals: u8,
        token_symbol: String,
    },
}
```

The `Hash` is 32 bytes long and `blake3` is used for calculating it. The hash of the `MetadataDigest` is calculated by `blake3(SCALE(MetadataDigest))`. Therefore, `MetadataDigest` is at first `SCALE` encoded, and then those bytes are hashed.

The `MetadataDigest` itself is represented as an `enum`. This is done to make it future proof, because a `SCALE` encoded `enum` is prefixed by the `index` of the variant. This `index` represents the version of the digest. As seen above, there is no `index` zero and it starts directly with one. Version one of the digest contains the following elements:

- `type_information_tree_root`: The root of the [Merkleized type information](#merkleizing-type-information) tree.
- `extrinsic_metadata_hash`: The hash of the [Extrinsic metadata](#extrinsic-metadata).
- `spec_version`: The `spec_version` of the runtime as found in the `RuntimeVersion` when generating the metadata. While this information can also be found in the metadata, it is hidden in a big blob of data. To avoid transferring this big blob of data, we directly add this information here.
- `spec_name`: Similar to `spec_version`, but being the `spec_name` found in the `RuntimeVersion`.
- `base58_prefix`: The `base58` prefix used for addresses.
- `decimals`: The number of decimals for the token.
- `token_symbol`: The symbol of the token.

### Extrinsic metadata

For decoding an extrinsic, more information on what types are being used is required. The actual format of the extrinsic is the format as described in the [Polkadot specification](https://spec.polkadot.network/id-extrinsics). The metadata for an extrinsic is as follows:

```rust
struct ExtrinsicMetadata {
    version: u8,
    address_ty: TypeRef,
    call_ty: TypeRef,
    signature_ty: TypeRef,
    signed_extensions: Vec<SignedExtensionMetadata>,
}

struct SignedExtensionMetadata {
    identifier: String,
    included_in_extrinsic: TypeRef,
    included_in_signed_data: TypeRef,
}
```

To begin with, `TypeRef`. This is a unique identifier for a type as found in the type information. Using this `TypeRef`, it is possible to look up the type in the type information tree. More details on this process can be found in the section [Merkleizing type information](#merkleizing-type-information).

The actual `ExtrinsicMetadata` contains the following information:

- `version`: The version of the extrinsic format. As of writing this, the latest version is `4`.
- `address_ty`: The address type used by the chain.
- `call_ty`: The `call` type used by the chain. The `call` in FRAME based runtimes represents the type of transaction being executed on chain. It references the actual function to execute and the parameters of this function.
- `signature_ty`: The signature type used by the chain.
- `signed_extensions`: FRAME based runtimes can extend the base extrinsic with extra information. This extra information that is put into an extrinsic is called "signed extensions". These extensions offer the runtime developer the possibility to include data directly into the extrinsic, like  `nonce`, `tip`, amongst others. This means that the this data is sent alongside the extrinsic to the runtime. The other possibility these extensions offer is to include extra information only in the signed data that is signed by the sender. This means that this data needs to be known by both sides, the signing side and the verification side. An example for this kind of data is the *genesis hash* that ensures that extrinsics are unique per chain. Another example is the *metadata hash* itself that will also be included in the signed data. The offline wallets need to know which signed extensions are present in the chain and this is communicated to them using this field.

The `SignedExtensionMetadata` provides information about a signed extension:

- `identifier`: The `identifier` of the signed extension. An `identifier` is required to be unique in the Polkadot ecosystem as otherwise extrinsics are maybe built incorrectly.
- `included_in_extrinsic`: The type that will be included in the extrinsic by this signed extension.
- `included_in_signed_data`: The type that will be included in the signed data by this signed extension.

### Type Information

As SCALE is not self descriptive like JSON, a decoder always needs to know the format of the type to decode it properly. This is where the type information comes into play. The format of the extrinsic is fixed as described above and `ExtrinsicMetadata`  provides information on which type information is required for which part of the extrinsic. So, offline wallets only need access to the actual type information. It is a requirement that the type information can be chunked into logical pieces to reduce the amount of data that is sent to the offline wallets for decoding the extrinsics. So, the type information is structured in the following way:

```rust
struct Type {
    path: Vec<String>,
    type_def: TypeDef,
    type_id: Compact<u32>,
}

enum TypeDef {
    Composite(Vec<Field>),
    Enumeration(EnumerationVariant),
    Sequence(TypeRef),
    Array(Array),
    Tuple(Vec<TypeRef>),
    BitSequence(BitSequence),
}

struct Field {
    name: Option<String>,
    ty: TypeRef,
    type_name: Option<String>,
}

struct Array {
    len: u32,
    type_param: TypeRef,
}

struct BitSequence {
    num_bytes: u8,
    least_significant_bit_first: bool,
}

struct EnumerationVariant {
    name: String,
    fields: Vec<Field>,
    index: Compact<u32>,
}

enum TypeRef {
    Bool,
    Char,
    Str,
    U8,
    U16,
    U32,
    U64,
    U128,
    U256,
    I8,
    I16,
    I32,
    I64,
    I128,
    I256,
    CompactU8,
    CompactU16,
    CompactU32,
    CompactU64,
    CompactU128,
    Void,
    PerId(Compact<u32>),
}
```

The `Type` declares the structure of a type. The `type` has the following fields:

- `path`: A `path` declares the position of a type locally to the place where it is defined. The `path` is not globally unique, this means that there can be multiple types with the same `path`.
- `type_def`: The high-level type definition, e.g. the type is a composition of fields where each field has a type, the type is a composition of different types as `tuple` etc.
- `type_id`: The unique identifier of this type.

Every `Type` is composed of multiple different types. Each of these "sub types" can reference either a full `Type` again or reference one of the primitive types. This is where `TypeRef` becomes relevant as the type referencing information. To reference a `Type` in the type information, a unique identifier is used. As primitive types can be represented using a single byte, they are not put as separate types into the type information. Instead the primitive types are directly part of `TypeRef` to not require the overhead of referencing them in an extra `Type`. The special primitive type `Void` represents a type that encodes to nothing and can be decoded from nothing. As FRAME doesn't support `Compact` as primitive type it requires a more involved implementation to convert a FRAME type to a `Compact` primitive type. SCALE only supports `u8`, `u16`, `u32`, `u64` and `u128` as `Compact` which maps onto the primitive type declaration in the RFC. One special case is a `Compact` that wraps an empty `Tuple` which is expressed as primitive type `Void`.

The `TypeDef` variants have the following meaning:

- `Composite`: A `struct` like type that is composed of multiple different fields. Each `Field` can have its own type. A `Composite` with no fields is expressed as primitive type `Void`.
- `Enumeration`: Stores a `EnumerationVariant`. A `EnumerationVariant` is a struct that is described by a name, an index and a vector of `Field`s, each of which can have it's own type. Typically `Enumeration`s have more than just one variant, and in those cases `Enumeration` will appear multiple times, each time with a different variant, in the type information. Given that `Enumeration`s can get quite big, yet usually for decoding a type only one variant is required, therefore this design brings optimizations and helps reduce the size of the proof. An `Enumeration` with no variants is expressed as primitive type `Void`.
- `Sequence`: A `vector` like type wrapping the given type.
- `BitSequence`: A `vector` storing bits. `num_bytes` represents the size in bytes of the internal storage. If `least_significant_bit_first` is `true` the least significant bit is first, otherwise the most significant bit is first.
- `Array`: A fixed-length array of a specific type.
- `Tuple`: A composition of multiple types. A `Tuple` that is composed of no types is expressed as primitive type `Void`.

Using the type information together with the [SCALE specification](https://spec.polkadot.network/id-cryptography-encoding#sect-scale-codec) provides enough information on how to decode types.

### Prune unrelated Types

The FRAME metadata contains not only the type information for decoding extrinsics, but it also contains type information about storage types. The scope of the RFC is only about decoding transactions on offline wallets. Thus, a lot of type information can be pruned. To know which type information are required to decode all possible extrinsics, `ExtrinsicMetadata` has been defined. The extrinsic metadata contains all the types that define the layout of an extrinsic. Therefore, all the types that are accessible from the types declared in the extrinsic metadata can be collected. To collect all accessible types, it requires to recursively iterate over all types starting from the types in `ExtrinsicMetadata`. Note that some types are accessible, but they don't appear in the final type information and thus, can be pruned as well. These are for example inner types of `Compact` or the types referenced by `BitSequence`. The result of collecting these accessible types is a list of all the types that are required to decode each possible extrinsic.

### Generating `TypeRef`

Each `TypeRef` basically references one of the following types:

- One of the primitive types. All primitive types can be represented by 1 byte and thus, they are directly part of the `TypeRef` itself to remove an extra level of indirection.
- A `Type` using its unique identifier.

In FRAME metadata a primitive type is represented like any other type. So, the first step is to remove all the primitive only types from the list of types that were generated in the previous section. The resulting list of types is sorted using the `id` provided by FRAME metadata. In the last step the `TypeRef`s are created. Each reference to a primitive type is replaced by one of the corresponding `TypeRef` primitive type variants and every other reference is replaced by the type's unique identifier. The unique identifier of a type is the index of the type in our sorted list. For `Enumeration`s all variants have the same unique identifier, while they are represented as multiple type information. All variants need to have the same unique identifier as the reference doesn't know which variant will appear in the actual encoded data.

```rust
let pruned_types = get_pruned_types();

for ty in pruned_types {
    if ty.is_primitive_type() {
        pruned_types.remove(ty);
    }
}

pruned_types.sort(|(left, right)|
    if left.frame_metadata_id() == right.frame_metadata_id() {
        left.variant_index() < right.variant_index()
    } else {
        left.frame_metadata_id() < right.frame_metadata_id()
    }
);

fn generate_type_ref(ty, ty_list) -> TypeRef {
    if ty.is_primitive_type() {
        TypeRef::primtive_from_ty(ty)
    }

    TypeRef::from_id(
        // Determine the id by using the position of the type in the
        // list of unique frame metadata ids.
        ty_list.position_by_frame_metadata_id(ty.frame_metadata_id())
    )
}

fn replace_all_sub_types_with_type_refs(ty, ty_list) -> Type {
    for sub_ty in ty.sub_types() {
        replace_all_sub_types_with_type_refs(sub_ty, ty_list);
        sub_ty = generate_type_ref(sub_ty, ty_list)
    }

    ty
}

let final_ty_list = Vec::new();
for ty in pruned_types {
    final_ty_list.push(replace_all_sub_types_with_type_refs(ty, ty_list))
}
```

### Building the Merkle Tree Root

A complete binary merkle tree with `blake3` as the hashing function is proposed. For building the merkle tree root, the initial data has to be hashed as a first step. This initial data is referred to as the *leaves* of the merkle tree. The leaves need to be sorted to make the tree root deterministic. The type information is sorted using their unique identifiers and for the `Enumeration`, variants are sort using their `index`. After sorting and hashing all leaves, two leaves have to be combined to one hash. The combination of these of two hashes is referred to as a *node*.

```rust
let nodes = [];
while leaves.len() > 1 {
    let right = leaves.pop_back();
    let left = leaves.pop_back();
    nodes.push_back(blake3::hash(scale::encode((left, right))));
}
if leaves.len() == 1 {
    nodes.push_front(leaves.pop_back());
}
while nodes.len() > 1 {
    let right = nodes.pop_front();
    let left = nodes.pop_front();
    nodes.push_back(blake3::hash(SCALE::encode((left, right))));
}
let merkle_tree_root = if nodes.is_empty() { [0u8; 32] } else { nodes.back() };
```

The `merkle_tree_root` in the end is the last node left in the list of nodes. If there are no nodes in the list left, it means that the initial data set was empty. In this case, all zeros hash is used to represent the empty tree. 

Building a tree with 5 leaves (numbered 0 to 4):
```
leaves: 0 1 2 3 4
nodes: []

leaves: 0 1 2
nodes: [[3, 4]]

leaves: 0
nodes: [[3, 4] [1, 2]]

leaves:
nodes: [[0] [3, 4] [1, 2]]

nodes: [[1, 2] [[3, 4] [0]]]

nodes: [[[[3, 4] [0]], [1, 2]]]
```

The resulting tree visualized:
```
     [root]
     /    \
    *      *
   / \    / \
  *   0  1   2
 / \
3   4
```

Building a tree with 6 leaves (numbered 0 to 5):
```
leaves: 0 1 2 3 4 5
nodes: []

leaves: 0 1 2 3
nodes: [[4, 5]]

leaves: 0 1
nodes: [[4, 5] [2, 3]]

leaves:
nodes: [[4, 5] [2, 3] [0, 1]]

nodes: [[0, 1] [[2, 3], [4, 5]]]

nodes: [[[[2, 3], [4, 5]] [0, 1]]]
```

The resulting tree visualized:
```
       [root]
      /      \
     *        *
   /   \     / \
  *     *   0   1
 / \   / \
2   3 4   5
```

### Inclusion in an Extrinsic

To ensure that the offline wallet used the correct metadata to show the extrinsic to the user the metadata hash needs to be included in the extrinsic. The metadata hash is generated by hashing the SCALE encoded `MetadataDigest`:

```rust
blake3::hash(SCALE::encode(MetadataDigest::V1 { .. }))
```

For the runtime the metadata hash is generated at compile time. Wallets will have to generate the hash using the FRAME metadata. 

The signing side should control whether it wants to add the metadata hash or if it wants to omit it. To accomplish this it is required to add one extra byte to the extrinsic itself. If this byte is `0` the metadata hash is not required and if the byte is `1` the metadata hash is added using `V1` of the `MetadataDigest`. This leaves room for future versions of the `MetadataDigest` format. When the metadata hash should be included, it is only added to the data that is signed. This brings the advantage of not requiring to include 32 bytes into the extrinsic itself, because the runtime knows the metadata hash as well and can add it to the signed data as well if required. This is similar to the genesis hash, while this isn't added conditionally to the signed data.

## Drawbacks

The chunking may not be the optimal case for every kind of offline wallet.

## Testing, Security, and Privacy

All implementations are required to strictly follow the RFC to generate the metadata hash. This includes which hash function to use and how to construct the metadata types tree. So, all implementations are following the same security criteria. As the chains will calculate the metadata hash at compile time, the build process needs to be trusted. However, this is already a solved problem in the Polkadot ecosystem by using reproducible builds. So, anyone can rebuild a chain runtime to ensure that a proposal is actually containing the changes as advertised.

Implementations can also be tested easily against each other by taking some metadata and ensuring that they all come to the same metadata hash.

Privacy of users should also not be impacted. This assumes that wallets will generate the metadata hash locally and don't leak any information to third party services about which chunks a user will send to their offline wallet. Besides that, there is no leak of private information as getting the raw metadata from the chain is an operation that is done by almost everyone.

## Performance, Ergonomics, and Compatibility

### Performance

There should be no measurable impact on performance to Polkadot or any other chain using this feature. The metadata root hash is calculated at compile time and at runtime it is optionally used when checking the signature of a transaction. This means that at runtime no performance heavy operations are done. 

###  Ergonomics & Compatibility

The proposal alters the way a transaction is built, signed, and verified. So, this imposes some required changes to any kind of developer who wants to construct transactions for Polkadot or any chain using this feature. As the developer can pass `0` for disabling the verification of the metadata root hash, it can be easily ignored.

## Prior Art and References

[RFC 46](https://github.com/polkadot-fellows/RFCs/pull/46) produce by the Alzymologist team is a previous work reference that goes in this direction as well.

On other ecosystems, there are other solutions to the problem of trusted signing. Cosmos for example has a standardized way of transforming a transaction into some textual representation and this textual representation is included in the signed data. Basically achieving the same as what the RFC proposes, but it requires that for every transaction applied in a block, every node in the network always has to generate this textual representation to ensure the transaction signature is valid.

## Unresolved Questions

None.

## Future Directions and Related Material

- Does it work with all kind of offline wallets?
- Generic types currently appear multiple times in the metadata with each instantiation. It could be may be useful to have generic type only once in the metadata and declare the generic parameters at their instantiation. 
- The metadata doesn't contain any kind of semantic information. This means that the offline wallet for example doesn't know what is a balance etc. The current solution for this problem is to match on the type name, but this isn't a sustainable solution.
- `MetadataDigest` only provides one `token` and `decimal`. However, chains support a lot of chains support multiple tokens for paying fees etc. Probably more a question of having semantic information as mentioned above.
