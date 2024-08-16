# RFC-0107: XCM Execution hints

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 23 July 2024                                                                                |
| **Description** | Add a mechanism for configuring particular XCM executions                                   |
| **Authors**     | Francisco Aguirre                                                                           |

## Summary

A previous XCM RFC (https://github.com/polkadot-fellows/xcm-format/pull/37) introduced a `SetAssetClaimer` instruction.
This idea of instructing the XCVM to change some implementation-specific behavior is useful.
In order to generalize this mechanism, this RFC introduces a new instruction `SetHints`
and makes the `SetAssetClaimer` be just one of many possible execution hints.

## Motivation

There is a need for specifying how certain implementation-specific things should behave.
Things like who can claim the assets or what can be done instead of trapping assets.
Another idea for a hint:
- `AssetForFees`: to signify to the executor what asset the user prefers to use for fees.
- `LeftoverAssetsDestination`: for depositing leftover assets to a destination instead of trapping them

## Stakeholders

- Runtime devs
- Wallets
- dApps

## Explanation

A new instruction, `SetHints`, will be added.
This instruction will take a single parameter of type `Hint`, an enumeration.
The first variant for this enum is `AssetClaimer`, which allows to specify a location that should be able to claim trapped assets.
This means the instruction `SetAssetClaimer` would also be removed, in favor of this.

In Rust, the new definitions would look as follows:

```rust
enum Instruction {
  // ...snip...
  SetHints(BoundedVec<Hint, NumVariants>),
  // ...snip...
}

enum Hint {
  AssetClaimer(Location),
  // more can be added
}

type NumVariants = /* Number of variants of the `Hint` enum */;
```

## Drawbacks

The `SetHints` instruction might be hard to benchmark, since we should look into the actual hints being set to know how much weight to attribute to it.

## Testing, Security, and Privacy

`Hint`s are specified on a per-message basis, so they have to be specified at the beginning of a message.
If they were to be specified at the end, hints like `AssetClaimer` would be useless if an error occurs beforehand and assets get trapped before ever reaching the hint.

The instruction takes a bounded vector of hints so as to not force barriers to allow an arbitrary number of `SetHint` instructions.

## Performance, Ergonomics, and Compatibility

### Performance

None.

### Ergonomics

The `SetHints` instruction provides a better integration with barriers.
If we had to add one barrier for `SetAssetClaimer` and another for each new hint that's added, barriers would need to be changed all the time.
Also, this instruction would make it simpler to write XCM programs.
You only need to specify the hints you want in one single instruction at the top of your program.

### Compatibility

None.

## Prior Art and References

The previous RFC PR in the xcm-format repository before XCM RFCs moved to fellowship RFCs: https://github.com/polkadot-fellows/xcm-format/pull/59.

## Unresolved Questions

None.

## Future Directions and Related Material

None.
