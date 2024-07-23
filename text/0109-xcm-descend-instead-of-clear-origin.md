# RFC-0109: Descend XCM origin instead of clearing it where possible

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 23 Jul 2024.                                                                                |
| **Description** | XCM programs should "descend" into a safe XCM origin rather than clearing it completely     |
| **Authors**     | Adrian Catangiu                                                                             |

## Summary

XCM programs that want to ensure that the following XCM instructions cannot command the authority of the Original Origin (such as asset transfer programs) should consider, where possible, using `DescendOrigin` into a demoted, safer origin rather than `ClearOrigin` which clears the origin completely.

## Motivation

Currently, all XCM asset transfer instructions ultimately clear the origin in the remote XCM message by use of the `ClearOrigin` instruction. This is done for security considerations to ensure that later instructions cannot command the authority of the Original Origin (the sending chain).

The problem with this approach is that it limits what can be achieved on remote chains through XCM. Most XCM operations require having an origin, and following any asset transfer the origin is lost, meaning not much can be done other than depositing the transferred assets to some local account or transferring them onward to another chain.

For example, we cannot transfer some funds for buying execution, then do a `Transact` (all in the same XCM message).

The above example is a basic, core building block for cross-chain interactions and we should support it.


## Stakeholders

Runtime Users, Runtime Devs, wallets, cross-chain dApps.

## Explanation

In the case of XCM programs going from `origin-chain` directly to `dest-chain` without an intermediary hop, we can enable scenarios such as above by using the `DescendOrigin` instruction instead of the `ClearOrigin` instruction.

Instead of clearing the `origin-chain` origin, we can "descend" into a child location of `origin-chain`, specifically we could "descend" into the actual origin of the initiator. Most common such descension would be `X2(Parachain(origin-chain), AccountId32(origin-account))`, when the initiator is a (signed/pure/proxy) account `origin-account`.

This allows an actor on chain A to `Transact` on chain B without having to prefund its SA account on chain B, instead they can simply transfer the required fees in the same XCM program as the `Transact`.

Unfortunately, this approach only works when the asset transfer has the same XCM route/hops as the rest of the program. Meaning it only works if the assets can be directly transferred from chain A to chain B without going through intermediary hops or reserve chains. When going through a reserve-chain, the original `origin-chain/origin-account` origin is lost and cannot be recreated using just the `DescendOrigin` instruction
Even so, this proposal is still useful for the majority of usecases (where the asset transfer happens directly between A and B).

The `TransferReserveAsset`, `DepositReserveAsset`, `InitiateReserveWithdraw` and `InitiateTeleport` instructions should use a `DescendOrigin` instruction on the onward XCM program instead of the currently used `ClearOrigin` instruction. The `DescendOrigin` instruction should effectively mutate the origin on the remote chain to the SA of the origin on the local chain.

## Drawbacks

No performance, ergonomics, user experience, security, or privacy drawbacks.

In terms of ergonomics and user experience, the support for combining an asset transfer with a subsequent action (like Transact) is assymetrical:
- natively works when assets can be transferred directly,
- doesn't natively work when assets have to go through a reserve location.

But it is still a net positive for ergonomics and user experience, while being neutral for the rest.

## Testing, Security, and Privacy

Barriers should also allow `DescendOrigin`, not just `ClearOrigin`.
XCM program builders should audit their programs and eliminate assumptions of "no origin" on remote side. Instead, the working assumption is that the origin on the remote side is the local origin reanchored location. This new assumption is 100% in line with the behavior of remote XCM programs sent over using `pallet_xcm::send`.

## Performance, Ergonomics, and Compatibility

### Performance

No impact.

### Ergonomics

Improves ergonomics by allowing the local origin to operate on the remote chain even when the XCM program includes an asset transfer.

### Compatibility

At the executor-level this change is backwards and forwards compatible. Both types of programs can be executed on new and old versions of XCM with no changes in behavior.

Programs switching to the new approach is however a **breaking** change from the existing XCM barriers point of view.
For example, the [AllowTopLevelPaidExecutionFrom](https://github.com/paritytech/polkadot-sdk/blob/35fcac758ad1a7e3d98377c5ca4d0ab4b61b14e0/polkadot/xcm/xcm-builder/src/barriers.rs#L62) barrier permits programs containing `ClearOrigin` before `BuyExecution`, but will reject programs with `DescendOrigin` before `BuyExecution`.

"The fix" is simple: upgrade the barrier to allow either `ClearOrigin` or `DescendOrigin`, but this new barrier needs to be rolled out (upgraded to) across the whole ecosystem before we can safely start rolling out the new `DescendOrigin` model (upgrade executor and pallets).

As such there are two options:
1. Change the barrier in XCMv5 and change the actual XCM programs in XCMv6 (long, potentially multi-year horizon),
2. Change the barrier and backport it to older SDK versions so that any ecosystem runtime upgrade will pick it up, then change the actual programs in XCMv5 (practical gap of a couple of months between the two).

## Prior Art and References

None.

## Unresolved Questions

How to achieve this for all workflows, not just point-to-point XCM programs with no intermediary hops?

As long as the intermediary hop(s) is/are not trusted to "impersonate" a location from the original origin chain, there is no way AFAICT to hold on to the original origin.

## Future Directions and Related Material

Similar (maybe even better) results can be achieved using XCMv5[ExecuteWithOrigin](https://github.com/polkadot-fellows/xcm-format/blob/master/proposals/0038-execute-with-origin.md) instruction, instead of `DescendOrigin`. But that introduces version downgrade compatibility challenges.
