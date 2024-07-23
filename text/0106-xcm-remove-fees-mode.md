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

Users will have to make sure to put enough assets in `WithdrawAsset` when previously some things might have been charged directly from their accounts.
This leads to a more predictable behaviour though so it will only be a drawback for the minority of users.

## Testing, Security, and Privacy

Describe the the impact of the proposal on these three high-importance areas - how implementations can be tested for adherence, effects that the proposal has on security and privacy per-se, as well as any possible implementation pitfalls which should be clearly avoided.

## Performance, Ergonomics, and Compatibility

### Performance

Performance will be improved since unnecessary checks will be avoided.

### Ergonomics

The removal of JIT withdrawal simplifies code for developers and results in a more predictable behaviour for users.

### Compatibility

For backwards-compatibility, there should be a version of XCM in between the approval of this RFC and the actual removal of the instruction, to give time to the
ecosystem to adapt.

## Prior Art and References

The previous RFC PR on the xcm-format repo, before XCM RFCs were moved to fellowship RFCs: https://github.com/polkadot-fellows/xcm-format/pull/57.

## Unresolved Questions

None.

## Future Directions and Related Material

None.
