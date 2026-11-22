# RFC-0176: Merkleized Metadata V2

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 22 November 2026                                                                            |
| **Description** | A metadata hash that covers every transaction extension version and does not depend on FRAME's type numbering. |
| **Authors**     | Baruch Fishman (@daiagi)                                                                    |

## Summary

[RFC-0078] defines a metadata hash that offline signers use to decode a transaction without trusting the online wallet. The runtime adds the hash it knows to the signed data, so a transaction decoded with wrong metadata fails its signature check. Since then, runtimes have started to accept more than one transaction extension pipeline. Metadata also now comes in two versions, V15 and V16, whose type registries can number the same types differently. The RFC-0078 hash describes only extension version 0. Its type ids follow FRAME registry numbering, so the same runtime can give different hashes from V15 and V16.

This RFC adds a second digest format, `MetadataDigest::V2`. Format 2 lists the extensions of every extension version the runtime accepts. It numbers types by a depth-first walk of the type graph instead of by registry id, and it is computed from metadata V16 only. `CheckMetadataHash` gains mode `2` for the new format, and the runtime stops accepting mode `1` on extension versions other than 0. Format 1 is not changed. The leaf encoding and Merkle tree of RFC-0078, and the proof format of its reference implementation, are reused unchanged. Format 2 works with today's extrinsic format 4. On extension versions 1 and above, format 2 commits to the extension lists and the runtime stops accepting mode 1, but offline signing on those versions needs a follow-up RFC.

## Motivation

### Problem 1: extension versions other than 0 are not covered

[RFC-0099] lets a runtime accept several transaction extension pipelines, selected by an extension version byte. Polkadot People and Polkadot Asset Hub already do this. Both define `TxExtensionV0` and `TxExtensionV1`, and both pipelines contain `CheckMetadataHash` ([People][fr-people-ext], [Asset Hub][fr-ah-ext]).

`substrate-wasm-builder` computes the metadata hash from metadata V15 ([wasm-builder][sdk-wasm-builder-v15]), and the conversion to V15 keeps only the extension version 0 pipeline ([metadata-ir][sdk-ir-v15]). On Polkadot People, version 0 has 11 extensions and version 1 has 19, including origin modifiers such as `AsPerson` and `AsMember`, and `RestrictOrigins`. No hash describes the 19, so a version 1 transaction with `Mode::Enabled` signs a hash that says nothing about its own extensions. This was reported in [runtimes#1322].

### Problem 2: the hash depends on FRAME registry numbering

RFC-0078 assigns type ids by sorting the reachable types "using the `id` provided by FRAME metadata" ([RFC-0078], "Generating `TypeRef`"), as does the reference implementation ([merkleized-metadata][mm-rank]). Registry ids reflect the order in which `scale-info` happened to register types. They are not part of the type graph.

On Kusama Asset Hub runtime 1007001 (block `0x505c4d0f39bd498254072ddc7a009eb6db220ef9859a8f5957a60b12e7334e99`), V15 and V16 contain identical type graphs. V16 registers `RuntimeCall` earlier (FRAME id 206 in V16, 416 in V15), and everything it pulls in moves with it. The two format 1 trees differ in 1039 of 1397 leaves, and the digests are `0x67e6f6ab…` (V15) and `0xb5d0f3d3…` (V16). This was [reported on RFCs#148][c-carlo-options].

[frame-metadata#110] registers extrinsic types first, so that V15 and V16 agree again. It was released in frame-metadata 23.0.1 and changes the V15 order too, so the same runtime source gives different V15 digests under 23.0.0 and 23.0.1. RFC-0078 does not specify the registration walk that the digest depends on.

### Requirements

1. The format 1 algorithm MUST stay byte-identical. Offline signers in the field hard-code mode byte `0x01` in the extension data and the variant name `"Enabled"` ([Ledger app][led-mode]), and digest index `0x01`, the first byte of the digest ([Ledger app][led-digest]). The format 1 hash value still changes when a runtime upgrades, as it does today whenever types change, because `Mode` gains a variant.
2. Format 2 MUST describe every extension version the runtime accepts.
3. Type ids in format 2 MUST depend only on the registry types reachable from the extrinsic metadata, never on FRAME registry id values.
4. Numbering MUST be deterministic for graphs with cycles.
5. Mode 1 MUST NOT be accepted on an extension version it does not describe.
6. Device input per signature SHOULD stay within a few kilobytes.
7. The hash MUST be computed at build time, as in RFC-0078.

## Stakeholders

- Runtime developers using `frame-metadata-hash-extension`, in particular the Fellowship system chains.
- Online wallet and library developers: polkadot-api, polkadot.js, subxt and others that compute the metadata hash and build proofs.
- Offline signer developers: Zondax (Ledger), Polkadot Vault, Kampela.
- Maintainers of `merkleized-metadata`, `substrate-wasm-builder` and `sp-runtime` in polkadot-sdk.

The problems and options were discussed in [RFCs#148], [runtimes#1322] and [frame-metadata#110]. One hash for all extension versions, the depth-first numbering and V16 as the source were agreed on RFCs#148 in November 2026 ([one hash and numbering][c-bkchr-agree], [V16][c-carlo-v16]). [sdk#13822] (open) implements the runtime check that mode 1 is used on extension version 0 only.

## Explanation

Computing a format 2 hash takes four steps: build `ExtrinsicMetadataV2` from metadata V16, number the types reachable from it, build the Merkle tree of their leaves, and hash the digest. Each step has its own section below, and anything not described here is as in RFC-0078. The worked example runs all four steps on a small runtime.

All encodings are SCALE. `Hash = [u8; 32]`. Every hash in the digest and the Merkle tree is `blake3`, as in RFC-0078. MUST, SHOULD and MAY are used as in RFC 2119.

Several different things are called "version":

| term | values | meaning |
|---|---|---|
| digest format | 1, 2 | the `MetadataDigest` variant. Format 1 is RFC-0078. Format 2 is this RFC. |
| mode | 0, 1, 2 | the explicit byte of `CheckMetadataHash`. Mode `n` selects digest format `n`. Mode 0 disables the check. |
| extension version | 0, 1, … | which transaction extension pipeline a transaction uses ([RFC-0099]). |
| extrinsic format | 4, 5 | format 4 Signed (`0x84`), format 5 General (`0x45`). |
| metadata version | 15, 16 | the FRAME metadata version a digest is computed from. |

Below, "format 1" and "format 2" alone mean the digest format. The extrinsic format is always written in full.

### Source metadata

Format 2 MUST be computed from metadata V16 ([agreed on RFCs#148][c-carlo-v16]). V15 keeps only the extension version 0 pipeline ([metadata-ir][sdk-ir-v15]), so a format 2 digest computed from V15 does not conform, even where the two agree today. A later metadata version MAY become a valid source only if its RFC requires that it reproduce the values in [Testing](#testing) exactly. A future digest format MUST state which metadata version it is computed from.

### Metadata digest

```rust
enum MetadataDigest {
    #[index = 1]
    V1 { /* unchanged, see RFC-0078 */ },
    #[index = 2]
    V2 {
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

The metadata hash of format 2 is `blake3(SCALE(MetadataDigest::V2 { .. }))`. `MetadataDigest::V2` has the same fields, in the same order, as V1. Its encoding starts with `0x02`. Two fields are computed differently: `type_information_tree_root` uses the type numbering below, and `extrinsic_metadata_hash` is `blake3(SCALE(ExtrinsicMetadataV2))`. The other five fields are computed as in format 1.

### Extrinsic metadata

`ExtrinsicMetadataV2` replaces RFC-0078's `ExtrinsicMetadata` in format 2.

```rust
struct ExtrinsicMetadataV2 {
    address_ty: TypeRef,
    call_ty: TypeRef,
    signature_ty: TypeRef,
    extensions_by_version: Vec<(u8, Vec<TransactionExtensionMetadata>)>,
}

struct TransactionExtensionMetadata {
    identifier: String,
    included_in_extrinsic: TypeRef,
    included_in_signed_data: TypeRef,
}
```

`TransactionExtensionMetadata` is RFC-0078's `SignedExtensionMetadata`, renamed as in polkadot-sdk. Fields and encoding are the same. Format 1's `version: u8` field is dropped. It held the extrinsic format, and with formats 4 and 5 both in use a single number has no meaning.

`extensions_by_version` holds one entry per extension version the runtime accepts:

1. Entries MUST be sorted by version, strictly increasing, and the vector MUST NOT be empty.
2. Each list MUST be the full pipeline for that version, in pipeline order.
3. An extension that appears in several pipelines MUST be written out in full in each list.
4. Within one list, an identifier MUST NOT occur twice.

Across lists, a runtime MUST NOT use one identifier with different `included_in_extrinsic` or `included_in_signed_data` types. V16 stores each identifier once and points every pipeline that uses it at that one entry ([sp-runtime][sdk-push-ext]), so a second use with other types would be described with the first one's types. A format 2 builder cannot detect this from V16, so the metadata builder in polkadot-sdk ([sp-runtime][sdk-push-ext]) MUST fail when an identifier is reused with different types.

`ExtrinsicMetadataV2` is built from the `extrinsic` field of metadata V16:

- `address_ty`, `call_ty`, `signature_ty`: the V16 fields of the same name.
- `extensions_by_version`: one entry `(v, list)` for each key `v` of `transaction_extensions_by_version`. That map's value is a list of 0-based positions in `transaction_extensions`, for example `{0: [0, 1, 2], 1: [3, 0, 1, 2]}`. `list` holds the extensions at those positions, in that order.
- In each extension, `identifier` is the V16 `identifier`, `included_in_extrinsic` is the V16 `ty`, and `included_in_signed_data` is the V16 `implicit`.

Each type is then written as a `TypeRef` ([Generating `TypeRef`](#generating-typeref)).

### Collecting types

The input is the type registry of metadata V16. Registry ids are used to look types up and to test two references for equality. Their numeric values MUST NOT be compared, sorted or written into any output.

A `Composite` with no fields, a `Variant` with no variants and a `Tuple` with no elements are *empty*; they become `TypeRef::Void`. `Primitive` and `Compact` types become primitive or compact `TypeRef`s (see [Compact](#compact)). Every other type is a *node*: it produces at least one leaf and gets an id.

Leaves are as in format 1. Each enum variant is a separate leaf, and all variants of one enum share one `type_id`. A leaf copies the `path`, field names and `type_name`s of its registry type and drops the docs. Leaf types and `TypeRef` are encoded as RFC-0078 declares them, with variant indices in declaration order. RFC-0078 calls the last `TypeRef` variant `PerId`; this RFC uses the reference implementation's name, `ById` ([merkleized-metadata][mm-types]). Its encoded index is 22 either way. A `BitSequence` leaf takes `num_bytes` from its store type (`u8`, `u16`, `u32`, `u64` give 1, 2, 4, 8) and sets `least_significant_bit_first` when a segment of its order type's path equals `Lsb0` (a segment equal to `Msb0` gives false). The store and order types are not children and get no id; any other store or order type is an error.

The *children* of a type are, in order:

| `type_def` | children |
|---|---|
| `Composite` | the type of each field, in declaration order |
| `Variant` | the variants sorted by `index`, ascending, not in registry order (the two differ on live chains, for example `DigestItem` on Polkadot People); for each variant, the type of each field in order |
| `Sequence`, `Array` | the element type |
| `Tuple` | each element type, in order |
| `BitSequence`, `Primitive`, `Compact` | none |

Two things are not children:

- Type parameters. The merkleized `Type` does not carry them, so if the walk followed them, types outside the tree could change the ids.
- The inner type of a `Compact`. It is resolved to a `TypeRef` (see [Compact](#compact)), not given an id.

The *roots* are every type referenced by `ExtrinsicMetadataV2`, in encoding order:

```rust
let mut roots = vec![address_ty, call_ty, signature_ty];
for (_version, list) in extensions_by_version {          // ascending version
    for ext in list {                                     // pipeline order
        roots.push(ext.included_in_extrinsic);
        roots.push(ext.included_in_signed_data);
    }
}
```

The root order changes the ids, so implementations MUST use the order above.

### Compact

`Compact<T>` resolves as follows:

- `T` is an unsigned integer: the matching `CompactU8` … `CompactU256`.
- `T` is a composite with exactly one field or a tuple with exactly one element (for example `Perbill`): resolve `Compact` of that field's type.
- `T` is an empty composite or an empty tuple, including `()`: `Void`. This occurs on live chains in `MultiAddress::Index` (`Compact<()>`, because the account index type is `()`).
- Anything else, including an empty enum: error.

### Generating `TypeRef`

This section replaces the FRAME id sort of RFC-0078 for format 2.

Walk the roots in order, depth first. The first time the walk reaches a node, give it the next id, starting from 0, then walk its children in order. Skip types that are not nodes and nodes that already have an id.

```rust
let mut ids: Map<RegistryId, u32> = Map::new();
let mut next = 0;

fn number(t: RegistryId) {
    if !is_node(t) || ids.contains_key(t) {
        return;
    }
    ids.insert(t, next);
    next += 1;
    for c in children(t) {
        number(c);
    }
}

for r in roots {
    number(r);
}
```

Every reference to a type `t` then becomes `TypeRef::ById(ids[t])` if `t` is a node, `TypeRef::Void` if `t` is empty, and the matching primitive or compact `TypeRef` otherwise. The `type_id` of every leaf of `t` is `ids[t]`. Types the walk did not reach are not part of the type information.

A cycle (for example `RuntimeCall` → `utility::Call` → `Vec<RuntimeCall>` → `RuntimeCall`) ends the first time the walk meets a node that already has an id. The first visit of every node is fixed by the root order and the child order, so the root order and the child order are the rule that picks where a cycle is entered. This answers the concern raised on [frame-metadata#110][c-lohann-cycle].

Call graphs on live chains are deep, so implementations usually walk iteratively. Push the roots in reverse order. Pop one type at a time. If it is not a node or already has an id, skip it. Otherwise assign the next id and push its children in reverse order. The "already has an id" check MUST happen when a type is popped. Checking on push gives a different order.

### Errors

A builder MUST NOT produce a digest if any of the following holds. The checks cover the types reached from the roots, including types examined while resolving a `Compact`.

1. A `Compact` does not resolve.
2. An enum has two variants with the same `index`.
3. `extensions_by_version` breaks rule 1 or rule 4 of its list.
4. A V16 position is outside `transaction_extensions`.
5. A `BitSequence` has a store or order type other than those in [Collecting types](#collecting-types).

### Building the Merkle tree root

As in RFC-0078, leaves are sorted by `(type_id, variant index)`; a type that is not an enum has one leaf, sorted by its `type_id`. A leaf hash is `blake3(SCALE(Type))`, and the tree and the empty root are as in RFC-0078. Proofs take the form `{ leaves, leaf_indices, nodes }` of the reference implementation ([merkleized-metadata][mm-proof]).

### Worked example

A small runtime with two extension versions. Each extension is written as `Name(explicit type, implicit type)`. `Mode` already has the `EnabledV2` variant (see [Inclusion in an extrinsic](#inclusion-in-an-extrinsic)):

```text
MultiAddress    enum { 0: Id(AccountId32), 1: Raw(Vec<u8>) }
AccountId32     struct([u8; 32])
RuntimeCall     enum { 0: System(system::Call), 1: Utility(utility::Call) }
system::Call    enum { 0: remark { remark: Vec<u8> } }
utility::Call   enum { 0: batch { calls: Vec<RuntimeCall> } }        // cycle
MultiSignature  enum { 0: Sr25519([u8; 64]) }
Mode            enum { 0: Disabled, 1: Enabled, 2: EnabledV2 }
Option<[u8;32]> enum { 0: None, 1: Some([u8; 32]) }
VerifySignature enum { 0: Signed { signature: MultiSignature, account: AccountId32 }, 1: Disabled }

version 0: [CheckNonce(Compact<u32>, ()), CheckMetadataHash(Mode, Option<[u8;32]>)]
version 1: [VerifyMultiSignature(VerifySignature, ()), CheckNonce(..), CheckMetadataHash(..)]
```

Format 2 numbers it as follows:

```text
MultiAddress     -> 0   children AccountId32, Vec<u8> (variant 0, then variant 1)
AccountId32      -> 1   child [u8; 32]
[u8; 32]         -> 2   child u8 is not a node
Vec<u8>          -> 3
RuntimeCall      -> 4   children system::Call, utility::Call
system::Call     -> 5   child Vec<u8> already has id 3
utility::Call    -> 6   child Vec<RuntimeCall>
Vec<RuntimeCall> -> 7   child RuntimeCall already has id 4, the cycle ends here
MultiSignature   -> 8   child [u8; 64]
[u8; 64]         -> 9
version 0 roots:  Compact<u32> and () are not nodes; Mode -> 10; Option<[u8;32]> -> 11
version 1 roots:  VerifySignature -> 12; its children and the other roots already have ids
```

The leaves, written as `type_id` or `(type_id, variant index)`, are `(0,0) (0,1) 1 2 3 (4,0) (4,1) (5,0) (6,0) 7 (8,0) 9 (10,0) (10,1) (10,2) (11,0) (11,1) (12,0) (12,1)`: 19 in all.

Format 1 never reaches `VerifySignature`, because it hashes only the version 0 list.

Format 1 ids also follow registry ids. Suppose the same types are registered twice, once with `RuntimeCall` at FRAME id 60 and once at 21 (made-up ids; V16 moved `RuntimeCall` earlier in the same way on Kusama Asset Hub). `RuntimeCall` and the types it pulls in then get different format 1 ids, and the root changes. Format 2 gives both registries the numbering above.

### Inclusion in an extrinsic

`CheckMetadataHash` keeps its identifier, its position in each pipeline and its implicit type. Its explicit `Mode` gains one variant:

```rust
enum Mode {
    Disabled,   // 0
    Enabled,    // 1: digest format 1, unchanged
    EnabledV2,  // 2: digest format 2
}

type Implicit = Option<[u8; 32]>;
```

With `EnabledV2` the implicit is `Some(metadata_hash_v2)`. If the runtime was built without a format 2 hash, the extension fails with `UnknownTransaction::CannotLookup`, as mode 1 already does without a format 1 hash ([source][sdk-implicit]).

The index `2` and the name `"EnabledV2"` are both normative. The index is the encoded byte; the name is part of the type information that signers check. `Mode` has no explicit codec indices today ([source][sdk-mode]). It MUST get explicit `#[codec(index = 0)]`, `#[codec(index = 1)]` and `#[codec(index = 2)]`, so that removing `Enabled` later cannot move `EnabledV2`. The type information of `Mode` changes, but existing byte encodings stay valid, including those of a pipeline whose encoding must not change, such as `TxExtensionV0`.

A runtime can accept mode 2 only if `Mode` has a variant with index 2 named `"EnabledV2"`; no new constant is introduced. The variant is necessary, not sufficient: a runtime built without a format 2 hash still has it, and rejects mode 2 with `CannotLookup`. Such a transaction fails; it is never signed against a wrong hash.

### Mode 1 is valid on extension version 0 only

If the mode is `Enabled` and the extension version is not 0, `CheckMetadataHash` MUST reject the transaction with `InvalidTransaction::BadProof`. On extension version 0 nothing changes.

The check is in `implicit`, which produces the signed hash. [sdk#13822] adds the extension version as a parameter of `TransactionExtension::implicit`. Format 4 Signed transactions pass version 0, as sp-runtime already does for `validate` ([sp-runtime][sdk-signed-v0]).

### Signing

| extrinsic format | extension version |
|---|---|
| 4, Signed (`0x84`) | always 0 ([comment on RFCs#148][c-bkchr-v4]) |
| 5, General (`0x45`) | the byte after the `0x45` version byte ([sp-runtime][sdk-decode-preamble], [RFC-0124]) |

For extrinsic format 4 Signed with mode 2, the signed payload is unchanged: `call ‖ explicit data of all version 0 extensions ‖ implicit data of all version 0 extensions`, hashed with `blake2_256` if longer than 256 bytes ([sp-runtime][sdk-signed-payload]). The implicit of `CheckMetadataHash` is `Some(metadata_hash_v2)`. This gives offline signers the fix for problem 2 without any extrinsic format 5 support.

A signer that signs with mode 2 MUST select the extension list by the extension version of the transaction it signs (0 for extrinsic format 4 Signed). It MUST refuse to sign if `extensions_by_version` has no list for that version, or if any bytes of the call or the extension data are left over after decoding against that list. Until an RFC defines offline signing on extension versions 1 and above, a signer MUST refuse those versions.

Offline signing on extension versions 1 and above also needs a definition of which bytes are signed and where the authorizing extension sits. That belongs in a follow-up `VerifySignature` RFC ([review of RFC-0124][c-carlo-124]).

## Drawbacks

- Two formats to maintain. Format 1 stays, with its dependence on V15 and on frame-metadata's registration walk.
- Larger extrinsic metadata. The signer receives every extension list with each transaction, about 350 bytes more than format 1 on today's two-pipeline runtimes (see [Performance](#performance)).
- Slightly larger proofs. The depth-first order spreads one transaction's leaves a little more than the FRAME order, so proofs need a few more sibling hashes.
- Identical types keep separate ids. About 11% of leaves on Polkadot People and Asset Hub are duplicates, for example the same generic type instantiated twice. Builder and wallet read the same V16, so they still agree. Two registries give the same hash only if they hold the same reachable types. Merging two duplicate entries into one, or splitting one into two, therefore changes the hash.
- The lists are declared, not derived. The extension lists are what each extension's `metadata()` declares ([sp-runtime][sdk-ext-metadata]), as in format 1. A wrong declaration is hashed as it is.
- A behaviour change for mode 1. A wallet that sends mode 1 on extension version 1 or above will see its transactions rejected. Those transactions were not protected by the hash.

## Testing, Security, and Privacy

### Testing

Implementations MUST produce identical digests. As in RFC-0078, they can be checked against each other on live metadata. The format 2 values for metadata V16 of these runtimes, fetched at the given block, are:

| chain | block | `type_information_tree_root` | `extrinsic_metadata_hash` | format 2 metadata hash |
|---|---|---|---|---|
| Polkadot People 2005002 | `0x8ddea996daca51107e9069abcb5cca64dbca4f769c75d0645f51621cec57cf51` | `0xb4a3e3b5384c00e6f3966596751b9b5b33269cfa5c1e055e961200c00327362f` | `0xad8ff260c0049bbed2d64134c74800f436464ba940651de43bdc288f70ae8e67` | `0x70b28e0f89eebe08d3bfe444a16a6b3592970fdaefc0157072d801b798af5d94` |
| Polkadot Asset Hub 2005002 | `0x4d84d54a112d850b36dbdd81f1dbf51ce15900302a59cbccc214b31f78d1a746` | `0x8580f16e03bb2b8eb9dbd59ad22ac0d86c188586909ba24b5eaceff491ea0613` | `0x8330e68af2d98ea1f4c387ba0b1e7a61a191eb131b3e4f9b4a829a976e76a8e4` | `0x2dfa90de20fe81dd4283c3b436609d9f9fca017c7ca4ee59cb305d9aacbfc5e6` |

The `blake2_256` hashes of the raw V16 metadata bytes (inside the `Option<OpaqueMetadata>` returned by `Metadata_metadata_at_version(16)`) are `0x30e681cce5b2f9918d786f688bd1c472e08abb0aa37f75270e33c3572a6adbba` (Polkadot People) and `0x1647e216a8a4b42c67220850e4d0d9d4b69d02060246f669a551caf9b95c5467` (Polkadot Asset Hub).

Both use `spec_version` 2005002, `base58_prefix` 0, `decimals` 10 and `token_symbol` `"DOT"`, with `spec_name` `"people-polkadot"` and `"statemint"`.

An implementation can also check that randomly permuting the registry ids leaves the root unchanged, and that format 1 still gives the fixture digests pinned in `merkleized-metadata` ([merkleized-metadata][mm-fixtures]).

### Security

A signer that predates this RFC requires mode byte `0x01` ([Ledger app][led-mode]) and refuses a mode 2 transaction. The mode byte is explicit data and is signed, so a mode 1 signature cannot be presented as mode 2. The runtime rejects mode 1 on extension versions other than 0, so a transaction cannot fall back to a hash that does not describe its pipeline. As in RFC-0078, the hash is computed at build time, and reproducible builds let anyone check it.

### Privacy

Unchanged from RFC-0078.

## Performance, Ergonomics, and Compatibility

### Performance

Both hashes are computed at build time. At runtime the only new work is the mode 1 check in `implicit`.

Signer input per transaction (proof, extrinsic metadata and extra information) on Polkadot Asset Hub and Polkadot People 2005002:

| chain | transaction | digest format 1 | digest format 2, extrinsic format 4 Signed |
|---|---|---|---|
| Polkadot Asset Hub | `transfer_keep_alive` | 3172 B | 3782 B |
| Polkadot Asset Hub | `batch_all[transfer_keep_alive, PolkadotXcm.transfer_assets]` | 6289 B | 6674 B |
| Polkadot People | `transfer_keep_alive` | 3038 B | 3496 B |

For the same extrinsic format 4 transaction, format 2 adds 385 to 610 bytes of total input. Most of that is the extrinsic metadata, which grows by about 350 bytes because it carries every extension list. The largest input above, 6674 bytes, is under half of the Ledger app's 16 KiB buffer ([source][led-buffer]).

### Ergonomics

Runtime developers keep the same `CheckMetadataHash` in every pipeline. Extensions that override `implicit` must add the extension version parameter that [sdk#13822] introduces; extensions on the default `implicit` need no change. Developers who build transactions compute the format 2 digest from V16 and send mode 2, much as they do for format 1 today. Offline signers change only the leading digest byte, the accepted mode byte and the extrinsic metadata they read. Type ids arrive inside the leaves, so a signer never runs the numbering. Dapps can keep sending mode 1 on extension version 0 until the signer they talk to supports format 2.

### Compatibility

Format 1, mode 1 on extension version 0, and every existing signer keep working. The rollout is:

1. Implementation in `merkleized-metadata`, `substrate-wasm-builder` and `frame-metadata-hash-extension`, and the `implicit` change in sp-runtime ([sdk#13822]). That change breaks custom `implicit` overrides at compile time.
2. Fellowship runtimes upgrade. The new runtimes build both hashes and reject mode 1 on extension version 1 and above. Wallet developers need notice of the mode 1 rejection before the upgrade.
3. Online libraries and signers adopt format 2 at their own pace.

Chains outside the Fellowship need matching versions of `substrate-wasm-builder` and `frame-metadata-hash-extension` and need to serve metadata V16. Chains with a single pipeline gain only the fix for problem 2, and many may stay on format 1.

## Prior Art and References

- [RFC-0078]: Merkleized Metadata, which this RFC extends.
- [RFC-0099]: transaction extension versions.
- [RFC-0124]: extrinsic format 5 (open).
- [RFCs#148]: RFC-0078 adaptation to Metadata V16 and Extrinsic V5.
- [runtimes#1322]: `CheckMetadataHash` does not cover transaction extension versions other than 0.
- [frame-metadata#110]: registers extrinsic types before pallet types, and the discussion of a canonical order that followed.
- [merkleized-metadata]: the reference implementation of RFC-0078.

Other designs discussed on [RFCs#148], [frame-metadata#110] and [sdk#13822]:

- One hash per extension version ([RFCs#148][c-bkchr-per-version], [sdk#13822][c-gui-options]). The device gets a smaller input that does not grow as versions are added. A single hash costs 211 to 358 bytes more device input on Polkadot People and Asset Hub, because the device receives every list instead of one. A single hash was preferred on RFCs#148 because it is [simpler][c-carlo-v16] and [any change to any pipeline changes it][c-carlo-one-hash].
- Keeping the FRAME id order and computing the hash from V16 only ([RFCs#148][c-carlo-options]). This covers every extension version, but the ids still follow registry order, so problem 2 remains.
- Sorting registry entries by their SCALE encoding ([RFCs#148][c-carlo-options]). An entry's encoding contains its children's registry ids, so the order still depends on them.
- Content hashes as type references ([frame-metadata#110][c-lohann]). These avoid ids entirely, but need a rule for cycles and make every reference 32 bytes.
- General graph canonization ([RFCs#148][c-lohann-canon]). This works without fixed starting points. Here the roots are fixed and the edges are ordered, so the depth-first walk is already canonical.

## Unresolved Questions

None.

## Future Directions and Related Material

- Semantic information (which fields are balances, which asset an amount refers to) and multi-token decimals remain out of scope, as in RFC-0078.
- Format 1 can be retired once signers have moved to format 2.

[RFC-0078]: https://github.com/polkadot-fellows/RFCs/blob/main/text/0078-merkleized-metadata.md
[RFC-0099]: https://github.com/polkadot-fellows/RFCs/blob/main/text/0099-transaction-extension-version.md
[RFC-0124]: https://github.com/polkadot-fellows/RFCs/pull/124
[RFCs#148]: https://github.com/polkadot-fellows/RFCs/issues/148
[runtimes#1322]: https://github.com/polkadot-fellows/runtimes/issues/1322
[frame-metadata#110]: https://github.com/paritytech/frame-metadata/pull/110
[merkleized-metadata]: https://github.com/bkchr/merkleized-metadata
[c-bkchr-per-version]: https://github.com/polkadot-fellows/RFCs/issues/148#issuecomment-3248305489
[c-bkchr-v4]: https://github.com/polkadot-fellows/RFCs/issues/148#issuecomment-3265173526
[c-carlo-options]: https://github.com/polkadot-fellows/RFCs/issues/148#issuecomment-3351667308
[c-carlo-v16]: https://github.com/polkadot-fellows/RFCs/issues/148#issuecomment-6740050684
[c-carlo-one-hash]: https://github.com/polkadot-fellows/RFCs/issues/148#issuecomment-6743267964
[c-bkchr-agree]: https://github.com/polkadot-fellows/RFCs/issues/148#issuecomment-7008724097
[c-lohann-canon]: https://github.com/polkadot-fellows/RFCs/issues/148#issuecomment-7036859872
[c-lohann]: https://github.com/paritytech/frame-metadata/pull/110#issuecomment-3628096698
[c-lohann-cycle]: https://github.com/paritytech/frame-metadata/pull/110#issuecomment-3628205101
[c-carlo-124]: https://github.com/polkadot-fellows/RFCs/pull/124#discussion_r1809204841
[sdk#13822]: https://github.com/paritytech/polkadot-sdk/pull/13822
[c-gui-options]: https://github.com/paritytech/polkadot-sdk/pull/13822#discussion_r4648193667
[sdk-wasm-builder-v15]: https://github.com/paritytech/polkadot-sdk/blob/006389c761e9ce8433dd99ea2cb3536fd5047598/substrate/utils/wasm-builder/src/metadata_hash.rs#L64-L73
[sdk-ir-v15]: https://github.com/paritytech/polkadot-sdk/blob/006389c761e9ce8433dd99ea2cb3536fd5047598/substrate/primitives/metadata-ir/src/v15.rs#L96-L111
[sdk-mode]: https://github.com/paritytech/polkadot-sdk/blob/006389c761e9ce8433dd99ea2cb3536fd5047598/substrate/frame/metadata-hash-extension/src/lib.rs#L55-L59
[sdk-implicit]: https://github.com/paritytech/polkadot-sdk/blob/006389c761e9ce8433dd99ea2cb3536fd5047598/substrate/frame/metadata-hash-extension/src/lib.rs#L148-L167
[sdk-signed-v0]: https://github.com/paritytech/polkadot-sdk/blob/006389c761e9ce8433dd99ea2cb3536fd5047598/substrate/primitives/runtime/src/generic/checked_extrinsic.rs#L105-L110
[sdk-decode-preamble]: https://github.com/paritytech/polkadot-sdk/blob/006389c761e9ce8433dd99ea2cb3536fd5047598/substrate/primitives/runtime/src/generic/unchecked_extrinsic.rs#L130-L144
[sdk-signed-payload]: https://github.com/paritytech/polkadot-sdk/blob/006389c761e9ce8433dd99ea2cb3536fd5047598/substrate/primitives/runtime/src/generic/unchecked_extrinsic.rs#L657-L675
[sdk-push-ext]: https://github.com/paritytech/polkadot-sdk/blob/006389c761e9ce8433dd99ea2cb3536fd5047598/substrate/primitives/runtime/src/traits/vers_tx_ext/mod.rs#L125-L151
[sdk-ext-metadata]: https://github.com/paritytech/polkadot-sdk/blob/006389c761e9ce8433dd99ea2cb3536fd5047598/substrate/primitives/runtime/src/traits/transaction_extension/mod.rs#L252-L266
[mm-rank]: https://github.com/bkchr/merkleized-metadata/blob/1997a55cfebf120d4b1037993a86d2e5d3b3f453/src/from_frame_metadata.rs#L77-L88
[mm-types]: https://github.com/bkchr/merkleized-metadata/blob/1997a55cfebf120d4b1037993a86d2e5d3b3f453/src/types.rs#L6-L143
[mm-proof]: https://github.com/bkchr/merkleized-metadata/blob/1997a55cfebf120d4b1037993a86d2e5d3b3f453/src/merkle_tree.rs#L126-L159
[mm-fixtures]: https://github.com/bkchr/merkleized-metadata/blob/1997a55cfebf120d4b1037993a86d2e5d3b3f453/src/lib.rs#L178-L203
[fr-people-ext]: https://github.com/polkadot-fellows/runtimes/blob/ddfd5bc3d2aa14489314a1faf76aa61b50729b3c/system-parachains/people/people-polkadot/src/lib.rs#L124-L171
[fr-ah-ext]: https://github.com/polkadot-fellows/runtimes/blob/ddfd5bc3d2aa14489314a1faf76aa61b50729b3c/system-parachains/asset-hubs/asset-hub-polkadot/src/lib.rs#L1838-L1890
[led-mode]: https://github.com/Zondax/ledger-polkadot/blob/7520e0e5ee822ad8c04f5003025124a146a1612e/app/src/parser_impl.c#L92-L110
[led-digest]: https://github.com/Zondax/ledger-polkadot/blob/7520e0e5ee822ad8c04f5003025124a146a1612e/app/src/metadata_proof.c#L262-L264
[led-buffer]: https://github.com/Zondax/ledger-polkadot/blob/7520e0e5ee822ad8c04f5003025124a146a1612e/app/src/common/tx.c#L34-L37
