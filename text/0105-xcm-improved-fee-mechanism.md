# RFC-0105: XCM improved fee mechanism

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 23 July 2024                                                                                |
| **Description** | Allow multiple types of fees to be paid                                                     |
| **Authors**     | Francisco Aguirre                                                                           |

## Summary

XCM already handles execution fees in an effective and efficient manner using the `BuyExecution` instruction.
However, other types of fees are not handled as effectively -- for example, delivery fees.
Fees exist that can't be measured using `Weight` -- as execution fees can -- so a new method should be thought up for those cases.
This RFC proposes making the fee handling system simpler and more general, by doing two things:
- Adding a `fees` register
- Deprecating `BuyExecution` and adding a new instruction `PayFees` with new semantics to ultimately replace it.

## Motivation

Execution fees are handled correctly by XCM right now.
However, the addition of extra fees, like for message delivery, result in awkward ways of integrating them into the XCVM implementation.
This is because these types of fees are not included in the language.
The standard should have a way to correctly deal with these implementation specific fees, that might not exist in every system that uses XCM.
The new instruction only takes the amount of fees that the XCVM can use from the holding register.
The XCVM implementation is free to use these fees to pay for execution fees, transport fees, or any other type of fee that might be necessary.
This moves the specifics of fees further away from the XCM standard, and more into the actual underlying XCVM implementation, which is a good thing.

## Stakeholders

- Runtime Users
- Runtime Devs
- Wallets
- dApps

## Explanation

The new instruction that will replace `BuyExecution` is a much simpler and general version: `PayFees`.
This instruction takes one `Asset`, takes it from the holding register, and puts it into a new `fees` register.
The XCVM implementation can now use this `Asset` to make sure every necessary fee is paid for, this includes execution fees, delivery fees, or any other fee.

```rust
PayFees { asset: Asset }
```

This new instruction will reserve **the entirety** of `asset` for fee payment.
The asset can't be used for anything else during the entirety of the program.
This is different from the current semantics of `BuyExecution`.

If not all `Asset` in the `fees` register is used when the execution ends, then we trap them alongside any possible leftover assets from the holding register.

### Examples

Most XCM programs that pay for execution are written like so:

```rust
// Instruction that loads the holding register
BuyExecution { asset, weight_limit }
// ...rest
```

With this RFC, the structure would be the same, but using the new instruction, that has different semantics:

```rust
// Instruction that loads the holding register
PayFees { asset }
// ...rest
```

## Drawbacks

There needs to be an explicit change from `BuyExecution` to `PayFees`, most often accompanied by a reduction in the assets passed in.

## Testing, Security, and Privacy

It might become a security concern if leftover fees are trapped, since a lot of them are expected.

## Performance, Ergonomics, and Compatibility

### Performance

There should be no performance downsides to this approach.
The `fees` register is a simplification that may actually result in better performance, in the case an implementation is doing a workaround to achieve what this RFC proposes.

### Ergonomics

The interface is going to be very similar to the already existing one.
Even simpler since `PayFees` will only receive one asset.
That asset will allow users to limit the amount of fees they are willing to pay.

### Compatibility

This RFC can't just change the semantics of the `BuyExecution` instruction since that instruction accepts any funds, uses what it needs and returns the rest immediately.
The new proposed instruction, `PayFees`, doesn't return the leftover immediately, it keeps it in the `fees` register.
In order for the proposal to be backwards compatible, `BuyExecution` needs to be slowly rolled out in favour of `PayFees`.

## Prior Art and References

The closed RFC PR on the xcm-format repository, before XCM RFCs got moved to fellowship RFCs: https://github.com/polkadot-fellows/xcm-format/pull/53.

## Unresolved Questions

How to improve the asset trapping mechanism?

## Future Directions and Related Material

This proposal would greatly benefit from an improved asset trapping system.
