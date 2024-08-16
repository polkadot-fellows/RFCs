# RFC-0108: Remove XCM testnet NetworkIds

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 23 July 2024                                                                                |
| **Description** | Remove the NetworkIds for testnets Westend and Rococo                                       |
| **Authors**     |                                                                                             |

## Summary

This RFC aims to remove the `NetworkId`s of `Westend` and `Rococo`, arguing that testnets shouldn't go in the language.

## Motivation

We've already seen the plans to phase out Rococo and Paseo has appeared.
Instead of constantly changing the testnets included in the language, we should favor specifying them via their genesis hash,
using `NetworkId::ByGenesis`.

## Stakeholders

- Runtime devs
- Wallets
- dApps

## Explanation

Remove `Westend` and `Rococo` from the included `NetworkId`s in the language.

## Drawbacks

This RFC will make it less convenient to specify a testnet, but not by a large amount.

## Testing, Security, and Privacy

None.

## Performance, Ergonomics, and Compatibility

### Performance

None.

### Ergonomics

It will very slightly reduce the ergonomics of testnet developers but improve the stability of the language.

### Compatibility

`NetworkId::Rococo` and `NetworkId::Westend` can just use `NetworkId::ByGenesis`, as can other testnets.

## Prior Art and References

A previous attempt to add `NetworkId::Paseo`: https://github.com/polkadot-fellows/xcm-format/pull/58.

## Unresolved Questions

None.

## Future Directions and Related Material

None.
