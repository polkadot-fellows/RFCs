# RFC-0014: Improve locking mechanism for parachains

|                 |                                          |
| --------------- | ---------------------------------------- |
| **Start Date**  | July 25, 2023                            |
| **Description** | Improve locking mechanism for parachains |
| **Authors**     | Bryan Chen                               |

## Summary

The manager of a parachain have the permission to manage the parachain when the parachain is unlocked. Parachain is by default locked when onboarded on a slot. This requires the parachain wasm/genesis must be valid otherwise a root track governance action on relaychain is required to update the parachain.

This RFC proposes a mechanism to allow parachain manager self-service the parachain without root track governance action.

## Motivation

The current reliance on root track governance actions for managing parachains can be time-consuming and burdensome. This RFC aims to address this technical difficulty by allowing parachain managers to take self-service actions, rather than relying on general public voting.

The key scenarios this RFC seeks to improve are:

1. Rescue a parachain with invalid wasm/genesis.

While we have various resources and templates to build a new parachain, it is still not a trivial task. It is very easy to make a mistake and resulting an invalid wasm/genesis. With lack of tools to help detect those issues[^1], it is very likely that the issues are only discovered after the parachain is onboarded on a slot. In this case, the parachain is locked and the parachain team has to go through a lengthy governance process to rescue the parachain.

2. Perform lease renewal for an existing parachain.

One way to perform lease renewal for a parachain is by perform a least swap with another parachain with longer lease. This requires the other parachain must be operational and able to perform XCM transact call into relaychain to dispatch the swap call. Combined with the overhead of setting up a new parachain, this is an time consuming and expensive process. Ideally, the parachain manager should be able to perform the lease swap call without having a running parachain[^2].

## Stakeholders

- Parachain teams

## Explanation

A parachain can either be locked or unlocked[^3]. With parachain locked, the parachain manager does not have any privileges. With parachain unlocked, the parachain manager can perform various actions such as updating the wasm/genesis, perform lease swap, etc.

A parachain is automatically locked once it is onboarded on a slot[^4].

Only the relaychain Root origin or the parachain itself can unlock the lock[^5].

This creates an issue that if the parachain is unable to produce block, the parachain manager is unable to do anything and have to rely on relaychain Root origin to manage the parachain.

This RFC proposes to automatically ignore the lock status of the parachain with either of the conditions:

1. The wasm and genesis state are both empty.
2. The parachain is considered unable to create a block using the following heuristic:
   2.1 Parachain is onboarded on a slot.
     2.2 Parachain never ever produced a block including previous slots.
     2.3 A sufficiently long time has passed since the parachain is onboarded on a slot.

Note that the lock status is only ignored when the condition is met. This means if the parachain produced a block after was considered stuck, the lock status will be enforced onwards.

Furthermore, this is only considered as a short term solution. With planned coretime related changes, the whole slot mechanism will be replaced and this RFC will be obsolete.

## Drawbacks

Parachain locks are designed in such way to ensure the decentralization of parachains. This RFC proposes a way to bypass the lock mechanism and therefore could introduce centralization risk for new parachains.

For example, one possible scenario is that a collectives may decide to launch a parachain together without centralized risk. However, if the parachain is unable to produce block, the parachain manager will be able to perform various actions without the consent of the collectives.

It is considered this risk is tolerable as it requires the wasm/genesis to be invalid at first place or the parachain collators are fully controlled by centralized entity. It is not yet practically possible to develop a parachain without any centralized risk currently.

Existing operational parachains will not be impacted due to condition 2.2.

Long term impacts are not considered as this RFC is only a short term solution and will be obsolete once coretime related changes are implemented.

## Testing, Security, and Privacy

The implementation of this RFC will be tested on testnets (Rococo and Westend) first.

An audit maybe required to ensure the implementation does not introduce unwanted side effects.

There is no privacy related concerns.

### Performance

This RFC should not introduce any performance impact.

### Ergonomics

This RFC should improve the developer experiences for new and existing parachain teams

### Compatibility

This RFC is fully compatibility with existing interfaces.

## Prior Art and References

Parachain Slot Extension Story: https://github.com/paritytech/polkadot/issues/4758
Allow parachain to renew lease without actually run another parachain: https://github.com/paritytech/polkadot/issues/6685
Always treat parachain that never produced block for a significant amount of time as unlocked: https://github.com/paritytech/polkadot/issues/7539

## Unresolved Questions

How long should we wait before considering a parachain is unable to produce block? It should not be too long otherwise will defects the purpose of this RFC. It should not be too short otherwise will introduce centralization risk. It is proposed to be 7 days.

## Future Directions and Related Material

Everything this RFC touches should be gone in the future once coretime related changes are implemented and therefore future considerations are not applicable.

[^1]: https://github.com/paritytech/cumulus/issues/377
[^2]: https://github.com/paritytech/polkadot/issues/6685
[^3]: https://github.com/paritytech/polkadot/blob/994af3de79af25544bf39644844cbe70a7b4d695/runtime/common/src/paras_registrar.rs#L51-L52C15
[^4]: https://github.com/paritytech/polkadot/blob/994af3de79af25544bf39644844cbe70a7b4d695/runtime/common/src/paras_registrar.rs#L473-L475
[^5]: https://github.com/paritytech/polkadot/blob/994af3de79af25544bf39644844cbe70a7b4d695/runtime/common/src/paras_registrar.rs#L333-L340
