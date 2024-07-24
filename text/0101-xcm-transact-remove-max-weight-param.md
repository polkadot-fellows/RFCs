# RFC-0101: XCM Transact remove `require_weight_at_most` parameter
|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 12 July 2024                                                                                |
| **Description** | Remove `require_weight_at_most` parameter from XCM Transact                                 |
| **Authors**     | Adrian Catangiu                                                                             |

## Summary

The `Transact` XCM instruction currently forces the user to set a specific maximum weight allowed to the inner call and then also pay for that much weight regardless of how much the call actually needs in practice.

This RFC proposes improving the usability of `Transact` by removing that parameter and instead get and charge the actual weight of the inner call from its dispatch info on the remote chain.

## Motivation

The UX of using `Transact` is poor because of having to guess/estimate the `require_weight_at_most` weight used by the inner call on the target.

We've seen multiple `Transact` on-chain failures caused by guessing wrong values for this `require_weight_at_most` even though the rest of the XCM program would have worked.

In practice, this parameter only adds UX overhead with no real practical value. Use cases fall in one of two categories:
1. Unpaid execution of Transacts - in these cases the `require_weight_at_most` is not really useful, caller doesn't
have to pay for it, and on the call site it either fits the block or not;
2. Paid execution of _single_ Transact - the weight to be spent by the Transact is already covered by the `BuyExecution`
weight limit parameter.

We've had multiple OpenGov `root/whitelisted_caller` proposals initiated by core-devs completely or partially fail
because of incorrect configuration of `require_weight_at_most` parameter. This is a strong indication that the
instruction is hard to use.

## Stakeholders

- Runtime Users,
- Runtime Devs,
- Wallets,
- dApps,

## Explanation

The proposed enhancement is simple: remove `require_weight_at_most` parameter from the instruction:

```diff
- Transact { origin_kind: OriginKind, require_weight_at_most: Weight, call: DoubleEncoded<Call> },
+ Transact { origin_kind: OriginKind, call: DoubleEncoded<Call> },
```

The XCVM implementation shall no longer use `require_weight_at_most` for weighing. Instead, it shall weigh the Transact instruction by decoding and weighing the inner `call`.

## Drawbacks

No drawbacks, existing scenarios work as before, while this also allows new/easier flows.

## Testing, Security, and Privacy

Currently, an XCVM implementation can weigh a message just by looking at the decoded instructions without decoding the Transact's call, but assuming `require_weight_at_most` weight for it. With the new version it has to decode the inner call to know its actual weight.

But this does not actually change the security considerations, as can be seen below.

With the new `Transact` the weighing happens after decoding the inner `call`. The entirety of the XCM program containing this `Transact` needs to be either covered by enough bought weight using a `BuyExecution`, or the origin has to be allowed to do free execution.

The security considerations around how much can someone execute for free are the same for
both this new version and the old. In both cases, an "attacker" can do the XCM decoding (including Transact inner `call`s) for free by adding a large enough `BuyExecution` without actually having the funds available.

In both cases, decoding is done for free, but in both cases execution fails early on `BuyExecution`.

## Performance, Ergonomics, and Compatibility

### Performance

No performance change.

### Ergonomics

Ergonomics are slightly improved by simplifying `Transact` API.

### Compatibility

Compatible with previous XCM programs.

## Prior Art and References

None.

## Unresolved Questions

None.

## Future Directions and Related Material

None.
