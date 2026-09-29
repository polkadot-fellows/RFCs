# RFC-0106: Remove XCM fees mode

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 23 July 2024                                                                                |
| **Description** | Remove the `SetFeesMode` instruction and `fees_mode` register from XCM                      |
| **Authors**     | Francisco Aguirre                                                                           |

## Summary

The `SetFeesMode` instruction and the `fees_mode` register allow for the existence of JIT withdrawal.
JIT withdrawal complicates the fee mechanism and leads to bugs and unexpected behaviour.
The proposal is to remove said functionality.
Another effort to simplify fee handling in XCM.

## Motivation

The JIT withdrawal mechanism creates bugs such as not being able to get fees when all assets are put into holding and none left in the origin location.
This is a confusing behavior, since there are funds for fees, just not where the XCVM wants them.
The XCVM should have only one entrypoint to fee payment, the holding register.
That way there is also less surface for bugs.

## Stakeholders

- Runtime Users
- Runtime Devs
- Wallets
- dApps

## Explanation

The `SetFeesMode` instruction will be removed.
The `Fees Mode` register will be removed.

## Drawbacks

Users will have to make sure to put enough assets in `WithdrawAsset` when
previously some things might have been charged directly from their accounts.
This leads to a more predictable behaviour though so it will only be
a drawback for the minority of users.

## Testing, Security, and Privacy

Implementations and benchmarking must change for most existing pallet calls
that send XCMs to other locations.

## Performance, Ergonomics, and Compatibility

### Performance

Performance will be improved since unnecessary checks will be avoided.

### Ergonomics

JIT withdrawal was a way of side-stepping the regular flow of XCM programs.
By removing it, the spec is simplified but now old use-cases have to work with
the original intended behaviour, which may result in more implementation work.

Ergonomics for users will undoubtedly improve since the system is more predictable.

### Compatibility

Existing programs in the ecosystem will break.
The instruction should be deprecated as soon as this RFC is approved
(but still fully supported), then removed in a subsequent XCM version
(probably deprecate in v5, remove in v6).

## Prior Art and References

The previous RFC PR on the xcm-format repo, before XCM RFCs were moved to fellowship RFCs: https://github.com/polkadot-fellows/xcm-format/pull/57.

## Unresolved Questions

None.

## Future Directions and Related Material

The [new generic fees mechanism](https://github.com/polkadot-fellows/RFCs/pull/105) is related to this proposal and further stimulates it as the JIT withdraw fees mechanism will become useless anyway.
