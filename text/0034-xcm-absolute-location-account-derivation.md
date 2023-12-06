# RFC-34: XCM Absolute Location Account Derivation

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 05 October 2023                                                                             |
| **Description** | XCM Absolute Location Account Derivation                                                    |
| **Authors**     | Gabriel Facco de Arruda                                                                     |

## Summary

This RFC proposes changes that enable the use of absolute locations in AccountId derivations, which allows protocols built using XCM to have static account derivations in any runtime, regardless of its position in the family hierarchy.

## Motivation

These changes would allow protocol builders to leverage absolute locations to maintain the exact same derived account address across all networks in the ecosystem, thus enhancing user experience.

One such protocol, that is the original motivation for this proposal, is InvArch's Saturn Multisig, which gives users a unifying multisig and DAO experience across all XCM connected chains.

## Stakeholders

- Ecosystem developers

## Explanation

This proposal aims to make it possible to derive accounts for absolute locations, enabling protocols that require the ability to maintain the same derived account in any runtime. This is done by deriving accounts from the hash of described absolute locations, which are static across different destinations.

The same location can be represented in relative form and absolute form like so:
```rust
// Relative location (from own perspective)
{
    parents: 0,
    interior: Here
}

// Relative location (from perspective of parent)
{
    parents: 0,
    interior: [Parachain(1000)]
}

// Relative location (from perspective of sibling)
{
    parents: 1,
    interior: [Parachain(1000)]
}

// Absolute location
[GlobalConsensus(Kusama), Parachain(1000)]
```

Using `DescribeFamily`, the above relative locations would be described like so:
```rust
// Relative location (from own perspective)
// Not possible.

// Relative location (from perspective of parent)
(b"ChildChain", Compact::<u32>::from(*index)).encode()

// Relative location (from perspective of sibling)
(b"SiblingChain", Compact::<u32>::from(*index)).encode()

```

The proposed description for absolute location would follow the same pattern, like so:
```rust
(
    b"GlobalConsensus",
    network_id,
    b"Parachain",
    Compact::<u32>::from(para_id),
    tail
).encode()
```

This proposal requires the modification of two XCM types defined in the `xcm-builder` crate: The `WithComputedOrigin` barrier and the `DescribeFamily` MultiLocation descriptor.

#### WithComputedOrigin

The `WtihComputedOrigin` barrier serves as a wrapper around other barriers, consuming origin modification instructions and applying them to the message origin before passing to the inner barriers. One of the origin modifying instructions is `UniversalOrigin`, which serves the purpose of signaling that the origin should be a Universal Origin that represents the location as an absolute path  prefixed by the `GlobalConsensus` junction.

In it's current state the barrier transforms locations with the `UniversalOrigin` instruction into relative locations, so the proposed changes aim to make it return absolute locations instead.

#### DescribeFamily

The `DescribeFamily` location descriptor is part of the `HashedDescription` MultiLocation hashing system and exists to describe locations in an easy format for encoding and hashing, so that an AccountId can be derived from this MultiLocation.

This implementation contains a match statement that does not match against absolute locations, so changes to it involve matching against absolute locations and providing appropriate descriptions for hashing.

## Drawbacks

No drawbacks have been identified with this proposal.

## Testing, Security, and Privacy

Tests can be done using simple unit tests, as this is not a change to XCM itself but rather to types defined in `xcm-builder`.

Security considerations should be taken with the implementation to make sure no unwanted behavior is introduced.

This proposal does not introduce any privacy considerations.

## Performance, Ergonomics, and Compatibility

### Performance

Depending on the final implementation, this proposal should not introduce much overhead to performance.

### Ergonomics

The ergonomics of this proposal depend on the final implementation details.

### Compatibility

Backwards compatibility should remain unchanged, although that depend on the final implementation.

## Prior Art and References

- `DescirbeFamily` type: https://github.com/paritytech/polkadot-sdk/blob/master/polkadot/xcm/xcm-builder/src/location_conversion.rs#L122
- `WithComputedOrigin` type: https://github.com/paritytech/polkadot-sdk/blob/master/polkadot/xcm/xcm-builder/src/barriers.rs#L153

## Unresolved Questions

Implementation details and overall code is still up to discussion.
