# RFC-0014: Improve locking mechanism for parachains

|                 |                                          |
| --------------- | ---------------------------------------- |
| **Start Date**  | July 25, 2023                            |
| **Description** | Improve locking mechanism for parachains |
| **Authors**     | Bryan Chen                               |

## Summary

This RFC proposes a set of changes to the parachain lock mechanism. The goal is to allow a parachain manager to self-service the parachain without root track governance action.

This is achieved by remove existing lock conditions and only lock a parachain when:
- A parachain manager explicitly lock the parachain
- OR a parachain block is produced successfully

## Motivation

The manager of a parachain has permission to manage the parachain when the parachain is unlocked. Parachains are by default locked when onboarded to a slot. This requires the parachain wasm/genesis must be valid, otherwise a root track governance action on relaychain is required to update the parachain.

The current reliance on root track governance actions for managing parachains can be time-consuming and burdensome. This RFC aims to address this technical difficulty by allowing parachain managers to take self-service actions, rather than relying on general public voting.

The key scenarios this RFC seeks to improve are:

1. Rescue a parachain with invalid wasm/genesis.

While we have various resources and templates to build a new parachain, it is still not a trivial task. It is very easy to make a mistake and resulting an invalid wasm/genesis. With lack of tools to help detect those issues[^1], it is very likely that the issues are only discovered after the parachain is onboarded on a slot. In this case, the parachain is locked and the parachain team has to go through a lengthy governance process to rescue the parachain.

2. Perform lease renewal for an existing parachain.

One way to perform lease renewal for a parachain is by doing a least swap with another parachain with a longer lease. This requires the other parachain must be operational and able to perform XCM transact call into relaychain to dispatch the swap call. Combined with the overhead of setting up a new parachain, this is an time consuming and expensive process. Ideally, the parachain manager should be able to perform the lease swap call without having a running parachain[^2].

## Requirements

- A parachain manager SHOULD be able to rescue a parachain by updating the wasm/genesis without root track governance action.
- A parachain manager MUST NOT be able to update the wasm/genesis if the parachain is locked.
- A parachain SHOULD be locked when it successfully produced the first block.
- A parachain manager MUST be able to perform lease swap without having a running parachain.

## Stakeholders

- Parachain teams
- Parachain users

## Explanation

### Status quo

A parachain can either be locked or unlocked[^3]. With parachain locked, the parachain manager does not have any privileges. With parachain unlocked, the parachain manager can perform following actions with the `paras_registrar` pallet:

- `deregister`: Deregister a Para Id, freeing all data and returning any deposit.
- `swap`: Initiate or confirm lease swap with another parachain.
- `add_lock`: Lock the parachain.
- `schedule_code_upgrade`: Schedule a parachain upgrade to update parachain wasm.
- `set_current_head`: Set the parachain's current head.

Currently, a parachain can be locked with following conditions:

- From `add_lock` call, which can be dispatched by relaychain Root origin, the parachain, or the parachain manager.
- When a parachain is onboarded on a slot[^4].
- When a crowdloan is created.

Only the relaychain Root origin or the parachain itself can unlock the lock[^5].

This creates an issue that if the parachain is unable to produce block, the parachain manager is unable to do anything and have to rely on relaychain Root origin to manage the parachain.

### Proposed changes

This RFC proposes to change the lock and unlock conditions.

A parachain can be locked only with following conditions:

- Relaychain governance MUST be able to lock any parachain.
- A parachain MUST be able to lock its own lock.
- A parachain manager SHOULD be able to lock the parachain.
- A parachain SHOULD be locked when it successfully produced a block for the first time.

A parachain can be unlocked only with following conditions:

- Relaychain governance MUST be able to unlock any parachain.
- A parachain MUST be able to unlock its own lock.

Note that create crowdloan MUST NOT lock the parachain and onboard a parachain SHOULD NOT lock it until a new block is successfully produced.

### Migration

A one off migration is proposed in order to apply this change retrospectively so that existing parachains can also be benefited from this RFC. This migration will unlock parachains that confirms with following conditions:

- Parachain is locked.
- Parachain never produced a block. Including from expired leases.
- Parachain manager never explicitly lock the parachain.

## Drawbacks

Parachain locks are designed in such way to ensure the decentralization of parachains. If parachains are not locked when it should be, it could introduce centralization risk for new parachains.

For example, one possible scenario is that a collective may decide to launch a parachain fully decentralized. However, if the parachain is unable to produce block, the parachain manager will be able to replace the wasm and genesis without the consent of the collective.

It is considered this risk is tolerable as it requires the wasm/genesis to be invalid at first place. It is not yet practically possible to develop a parachain without any centralized risk currently.

Another case is that a parachain team may decide to use crowdloan to help secure a slot lease. Previously, creating a crowdloan will lock a parachain. This means crowdloan participants will know exactly the genesis of the parachain for the crowdloan they are participating. However, this actually providers little assurance to crowdloan participants. For example, if the genesis block is determined before a crowdloan is started, it is not possible to have onchain mechanism to enforce reward distributions for crowdloan participants. They always have to rely on the parachain team to fulfill the promise after the parachain is alive.

Existing operational parachains will not be impacted.

## Testing, Security, and Privacy

The implementation of this RFC will be tested on testnets (Rococo and Westend) first.

An audit maybe required to ensure the implementation does not introduce unwanted side effects.

There is no privacy related concerns.

## Performance

This RFC should not introduce any performance impact.

## Ergonomics

This RFC should improve the developer experiences for new and existing parachain teams

## Compatibility

This RFC is fully compatibility with existing interfaces.

## Prior Art and References

- Parachain Slot Extension Story: https://github.com/paritytech/polkadot/issues/4758
- Allow parachain to renew lease without actually run another parachain: https://github.com/paritytech/polkadot/issues/6685
- Always treat parachain that never produced block for a significant amount of time as unlocked: https://github.com/paritytech/polkadot/issues/7539

## Unresolved Questions

None at this stage.

## Future Directions and Related Material

This RFC is only intended to be a short term solution. Slots will be removed in future and lock mechanism is likely going to be replaced with a more generalized parachain manage & recovery system in future. Therefore long term impacts of this RFC are not considered.

[^1]: https://github.com/paritytech/cumulus/issues/377
[^2]: https://github.com/paritytech/polkadot/issues/6685
[^3]: https://github.com/paritytech/polkadot/blob/994af3de79af25544bf39644844cbe70a7b4d695/runtime/common/src/paras_registrar.rs#L51-L52C15
[^4]: https://github.com/paritytech/polkadot/blob/994af3de79af25544bf39644844cbe70a7b4d695/runtime/common/src/paras_registrar.rs#L473-L475
[^5]: https://github.com/paritytech/polkadot/blob/994af3de79af25544bf39644844cbe70a7b4d695/runtime/common/src/paras_registrar.rs#L333-L340
