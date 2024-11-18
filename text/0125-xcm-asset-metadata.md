# RFC-0125: XCM Asset Metadata

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 22 Oct 2024                                                                                 |
| **Description** | XCM Asset Metadata definition and a way of communicating it via XCM                         |
| **Authors**     | Daniel Shiposha                                                                             |

## Summary

This RFC proposes a metadata format for XCM-identifiable assets (i.e., for fungible/non-fungible collections and non-fungible tokens) and a set of instructions to communicate it across chains.

## Motivation

Currently, there is no way to communicate metadata of an asset (or an asset instance) via XCM.

The ability to query and modify the metadata is useful for two kinds of entities:
* **Asset collections** (both fungible and nonfungible).

    Any collection has some metadata, such as the name of the collection. The standard way of communicating metadata could help with registering foreign assets within a consensus system. Therefore, this RFC could complement or supersede the [RFC for initializing fully-backed derivatives](https://github.com/paritytech/xcm-format/pull/35) (note that this RFC is related to the old XCM RFC process; it's not the Fellowship RFC and hasn't been migrated yet).

* **NFTs** (i.e., asset instances). 

    The metadata is the crucial aspect of any nonfungible object since metadata assigns meaning to such an object. The metadata for NFTs is just as important as the notion of "amount" for fungibles (there is no sense in fungibles if they have no amount).

    An NFT is always a representation of some object. The metadata describes the object represented by the NFT.
    
    NFTs can be transferred to another chain via XCM. However, there are limitations due to the inability to communicate its metadata:
    1. Teleports are inherently impossible because they imply the complete transfer of an NFT, including its metadata, which can't be done via XCM now.
    2. Reserve-based transfers currently have limited use-case scenarios if the reserve chain provides a way of modifying metadata for its users (usually, the token's owner has privileged rights to modify a specific metadata subset). When a user transfers an NFT using this model to another chain, the NFT owner-related metadata can't be updated anymore because another chain's sovereign account owns the original token, and another chain cannot modify the metadata. However, if it were possible to update NFT metadata in the standard XCM way, another chain could offer additional metadata-related logic. For instance, it could provide a facade logic to metadata modification (i.e., provide permission-based modification authorization, new value format check, etc.).

Besides metadata modification, the ability to read it is also valuable. On-chain logic can interpret the NFT metadata, i.e., the metadata could have not only the media meaning but also a utility function within a consensus system. Currently, such a way of using NFT metadata is possible only within one consensus system. This RFC proposes making it possible between different systems via XCM so different chains can fetch and analyze the asset metadata from other chains.

## Stakeholders

Runtime users, Runtime devs, Cross-chain dApps, Wallets.

## Explanation

The Asset Metadata is information bound to an asset class (fungible or NFT collection) or an asset instance (an NFT).
The Asset Metadata could be represented differently on different chains (or in other consensus entities).
However, to communicate metadata between consensus entities via XCM, we need a general format so that *any* consensus entity can make sense of such information.

We can name this format "XCM Asset Metadata".

This RFC proposes:
1. Using key-value pairs as XCM Asset Metadata since it is a general concept useful for both structured and unstructured data. Both key and value can be raw bytes with interpretation up to the communicating entities.

    The XCM Asset Metadata should be represented as a map SCALE-encoded equivalent to the `BTreeMap`.

    Let's call the type of the XCM Asset Metadata map `MetadataMap`.

2. Communicating only the demanded part of the metadata, not the whole metadata.

    * A consensus entity should be able to query the values of interested keys to read the metadata.
        To specify the keys to read, we need a set-like type. Let's call that type `MetadataKeys` and make its instance a SCALE-encoded equivalent to the `BTreeSet`.

    * A consensus entity should be able to write the values for specified keys.

3. New XCM instructions to communicate the metadata.

### New instructions

#### `ReportMetadata`

The `ReportMetadata` is a new instruction to query metadata information.
It can be used to query metadata key list or to query values of interested keys.

This instruction allows querying the metadata of:
* a collection (fungible or nonfungible)
* an NFT

If an asset (or an asset instance) for which the query is made doesn't exist, the `Response::Null` should be reported via the existing `QueryResponse` instruction.

The `ReportMetadata` can be used without origin (i.e., following the `ClearOrigin` instruction) since it only reads state.

Safety: The reporter origin should be trusted to hold the true metadata. If the reserve-based model is considered, the asset's reserve location must be viewed as the only source of truth about the metadata.

The use case for this instruction is when the metadata information of a foreign asset (or asset instance) is used in the logic of a consensus entity that requested it.

```rust
/// An instruction to query metadata of an asset or an asset instance.
ReportMetadata {
    /// The ID of an asset (a collection, fungible or nonfungible).
    asset_id: AssetId,

    /// The ID of an asset instance.
    ///
    /// If the value is `Undefined`, the metadata of the collection is reported.
    instance: AssetInstance,

    /// See `MetadataQueryKind` below.
    query_kind: MetadataQueryKind,

    /// The usual field for Report<something> XCM instructions.
    ///
    /// Information regarding the query response.
    /// The `QueryResponseInfo` type is already defined in the XCM spec.
    response_info: QueryResponseInfo,
}
```

Where the `MetadataQueryKind` is:

```rust
enum MetadataQueryKind {
    /// Query metadata key list.
    KeyList,

    /// Query values of the specified keys.
    Values(MetadataKeys),
}
```

The `ReportMetadata` works in conjunction with the existing `QueryResponse` instruction. The `Response` type should be modified accordingly: we need to add a new `AssetMetadata` variant to it.

```rust
/// The struct used in the existing `QueryResponse` instruction.
pub enum Response {
    // ... snip, existing variants ...

    /// The metadata info.
    AssetMetadata {
        /// The ID of an asset (a collection, fungible or nonfungible).
        asset_id: AssetId,

        /// The ID of an asset instance.
        ///
        /// If the value is `Undefined`, the reported metadata is related to the collection, not a token.
        instance: AssetInstance,

        /// See `MetadataResponseData` below.
        data: MetadataResponseData,
    }
}

pub enum MetadataResponseData {
    /// The metadata key list to be reported
    /// in response to the `KeyList` metadata query kind.
    KeyList(MetadataKeys),

    /// The values of the keys that were specified in the
    /// `Values` variant of the metadata query kind.
    Values(MetadataMap),
}
```

#### `ModifyMetadata`

The `ModifyMetadata` is a new instruction to request a remote chain to modify the values of the specified keys.

This instruction can be used to update the metadata of a collection (fungible or nonfungible) or of an NFT.

The remote chain handles the modification request and may reject it based on its internal rules.
The request can only be executed or rejected in its entirety. It must not be executed partially.

To execute the `ModifyMetadata`, an origin is required so that the handling logic can authorize the metadata modification request from a known source. Since this instruction requires an origin, the assets used to cover the execution fees must be transferred in a way that preserves the origin. For instance, one can use the approach described in RFC #122 if the handling chain configured aliasing rules accordingly.

The example use case of this instruction is to ask the reserve location of the asset to modify the metadata. So that, the original asset's metadata is updated according to the reserve location's rules.

```rust
ModifyMetadata {
    /// The ID of an asset (a collection, fungible or nonfungible).
    asset_id: AssetId,

    /// The ID of an asset instance.
    ///
    /// If the value is `Undefined`, the modification request targets the collection, not a token.
    instance: AssetInstance,

    /// The map contains the keys mapped to the requested new values.
    modification: MetadataMap,
}
```

### Repurposing `AssetInstance::Undefined`

As the new instructions show, this RFC reframes the purpose of the `Undefined` variant of the `AssetInstance` enum.
This RFC proposes to use the `Undefined` variant of a collection identified by an `AssetId` as a synonym of the collection itself. I.e., an asset `Asset { id: <AssetId>, fun: NonFungible(AssetInstance::Undefined) }` is considered an NFT representing the collection itself.

As a singleton non-fungible instance is barely distinguishable from its collection, this convention shouldn't cause any problems. 

Thus, the `AssetInstance` docs must be updated accordingly in the implementations.

## Drawbacks

Regarding ergonomics, no drawbacks were noticed.

As for the user experience, it could discover new cross-chain use cases involving asset collections and NFTs, indicating a positive impact.

There are no security concerns except for the `ReportMetadata` instruction, which implies that the source of the information must be trusted.

In terms of performance and privacy, there will be no changes.

## Testing, Security, and Privacy

The implementations must honor the contract for the new instructions. Namely, if the `instance` field has the value of `AssetInstance::Undefined`, the metadata must relate to the asset collection but not to a non-fungible token inside it.

## Performance, Ergonomics, and Compatibility

### Performance

No significant impact.

### Ergonomics

Introducing a standard metadata format and a way of communicating it is a valuable addition to the XCM format that potentially increases cross-chain interoperability without the need to form ad-hoc chain-to-chain integrations via `Transact`.

### Compatibility

This RFC proposes new functionality, so there are no compatibility issues.

## Prior Art and References

[RFC: XCM Asset Metadata](https://github.com/polkadot-fellows/xcm-format/pull/50)

## Unresolved Questions

Should the `MetadataMap` and `MetadataKeys` be bounded, or is it enough to rely on the fact that every XCM message is itself bounded?

## Future Directions and Related Material

The original RFC draft contained additional metadata instructions. Though they could be useful, they're clearly outside the basic logic. So, this RFC version omits them to make the metadata discussion more focused on the core things. Nonetheless, there is hope that metadata approval instructions might be useful in the future, so they are mentioned here.

You can read about the details in the [original draft](https://github.com/UniqueNetwork/xcm-format/blob/e4c989599fee3e37467ff2b4bb4e6c977c238ad3/proposals/0050-asset-metadata.md).

