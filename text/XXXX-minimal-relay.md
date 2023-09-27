# RFC-0000: Minimal Relay

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| **Start Date**  | 20 September 2023                                                             |
| **Description** | Proposal to minimise Relay Chain functionality.                               |
| **Authors**     | Joe Petrowski, Gavin Wood                                                     |

## Summary

The Relay Chain contains most of the core logic for the Polkadot network. While this was necessary
prior to the launch of parachains and development of XCM, most of this logic can exist in
parachains. This is a proposal to migrate several subsystems into system parachains.

## Motivation

Polkadot's scaling approach allows many distinct state machines (known generally as parachains) to
operate with common guarantees about the validity and security of their state transitions. Polkadot
provides these common guarantees by executing the state transitions on a strict subset (a backing
group) of the Relay Chain's validator set.

However, state transitions on the Relay Chain need to be executed by _all_ validators. If any of
those state transitions can occur on parachains, then the resources of the complement of a single
backing group could be used to offer more cores. As in, they could be offering more coretime (a.k.a.
blockspace) to the network.

By minimising state transition logic on the Relay Chain by migrating it into "system chains" -- a
set of parachains that, with the Relay Chain, make up the Polkadot protocol -- the Polkadot
Ubiquitous Computer can maximise its primary offering: secure blockspace.

## Stakeholders

- Parachains that interact with affected logic on the Relay Chain;
- Core protocol and XCM format developers;
- Tooling, block explorer, and UI developers.

## Explanation

The following pallets and subsystems are good candidates to migrate from the Relay Chain:

- Identity
- Preimage
- Balances
- Staking
	- Staking
	- Election Provider
	- Bags List
	- NIS
	- Nomination Pools
	- Fast Unstake
- Governance
	- Treasury and Bounties
	- Conviction Voting
	- Referenda

Note: The Auctions and Crowdloan pallets will be replaced by Coretime, its system chain and
interface described in RFC-1 and RFC-5, respectively.

### Migrations

Some subsystems are simpler to move than others. For example, migrating Identity can be done by
simply preventing state changes in the Relay Chain, using the Identity-related state as the genesis
for a new chain, and launching that new chain with the genesis and logic (pallet) needed.

Other subsystems cannot experience any downtime like this because they are essential to the
network's functioning, like Staking and Governance. However, these can likely coexist with a
similarly-permissioned system chain for some time, much like how "Gov1" and "OpenGov" coexisted at
the latter's introduction.

Specific migration plans will be included in release notes of runtimes from the Polkadot Fellowship
when beginning the work of migrating a particular subsystem.

### Interfaces

The Relay Chain, in many cases, will still need to interact with these subsystems, especially
Staking and Governance. These subsystems will require making some APIs available either via
dispatchable calls accessible to XCM `Transact` or possibly XCM `Instruction`s in future versions.

For example, Staking provides a pallet-API to register points (e.g. for block production) and
offences (e.g. equivocation). With Staking in a system chain, that chain would need to allow the
Relay Chain to update validator points periodically so that it can correctly calculate rewards.

A pub-sub protocol may also lend itself to these types of interactions.

### Deployment

Actual migrations should happen based on some prioritization. This RFC proposes to migrate Identity,
Staking, and Governance as the systems to work on first. A brief discussion on the factors involved
in each one:

#### Identity

Identity will be one of the simpler pallets to migrate into a system chain, as its logic is largely
self-contained and it does not "share" balances with other subsystems. As in, any DOT is held in
reserve as a storage deposit and cannot be simultaneously used the way locked DOT can be locked for
multiple purposes.

Therefore, migration can take place as follows:

1. A runtime upgrade will block all calls to the pallet, preventing updates to identity info.
1. The frozen state will form the genesis of a new system parachain.
1. A Relay Chain runtime upgrade will allow migrating the deposit to the parachain. The parachain
   deposit is on the order of 1/100th of the Relay Chain's. Therefore, this will result in freeing
   up Relay State as well as most of each user's reserved balance.
1. The pallet and any leftover state can be removed from the Relay Chain.

User interfaces that render Identity information will need to source their data from the new system
parachain.

#### Governance

Migrating governance into a parachain will be more complicated, especially as the balances used for
voting in referenda are also used for staking. However, most of the other primitives needed for the
migration already exist. The Treasury supports spending assets on remote chains and collectives like
the Polkadot Technical Fellowship already function in a parachain. That is, XCM already provides the
ability to express system origins across chains.

Therefore, actually moving the governance logic into a parachain will be simple. It can run in
parallel with the Relay Chain's governance, which can be removed when the parachain has demonstrated
sufficient functionality. It's possible that the Relay Chain maintain a Root-level emergency track
for situations like [parachains
halting](https://forum.polkadot.network/t/stalled-parachains-on-kusama-post-mortem/3998). The only
problem that remains to solve is how to deal with balances that are used for staking too.

#### Staking

Migrating the staking subsystem will likely be the most complex technical undertaking, as the
staking system cannot stop (the system MUST always have a validator set) nor run in parallel (the
system MUST have _one_ validator set) and the subsystem itself is made up of subsystems in the
runtime and the node. For example, if offences are reported to the Staking parachain, validator
nodes will need to submit their reports there.

Handling balances also introduces complications. The same balance can be used for staking and
governance. Ideally, all balances stay on Asset Hub, and only report "credits" to system chains like
Staking and Governance. However, staking mutates balances by issuing new DOT on era changes and for
rewards. Allowing DOT directly on the Staking parachain would simplify staking changes.

There is more discussion about staking in a parachain in [Moving Staking off the Relay
Chain](https://github.com/paritytech/polkadot-sdk/issues/491).

## Drawbacks

None at present.

## Testing, Security, and Privacy

Standard audit/review requirements apply. More powerful multi-chain integration test tools would be
useful in developement.

## Performance, Ergonomics, and Compatibility

Describe the impact of the proposal on the exposed functionality of Polkadot.

### Performance

This is an optimization. The removal of public/user transactions on the Relay Chain ensures that its
primary resources are allocated to system performance.

### Ergonomics

This proposal alters very little for coretime users (e.g. parachain developers). Application
developers will need to interact with multiple chains, making ergonomic light client tools
particularly important for application development.

### Compatibility

Implementing this proposal will require some changes to pallet APIs and/or a pub-sub protocol.
Application developers will need to interact with multiple chains in the network.

## Prior Art and References

- [Transactionless Relay-chain](https://github.com/paritytech/polkadot/issues/323)
- [Moving Staking off the Relay Chain](https://github.com/paritytech/polkadot-sdk/issues/491)

## Unresolved Questions

There remain some implementation questions, like how to use balances for both Staking and
Governance. See, for example, [Moving Staking off the Relay
Chain](https://github.com/paritytech/polkadot-sdk/issues/491).

## Future Directions and Related Material

Ideally the Relay Chain becomes transactionless, such that not even balances are represented there.
