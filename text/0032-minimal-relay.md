# RFC-0032: Minimal Relay

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

### Functional Architecture

This RFC proposes that system chains form individual components within the system's architecture and
that these components are chosen as functional groups. This approach allows synchronous
composibility where it is most valuable, but isolates logic in such a way that provides flexibility
for optimal resource allocation (see [Resource Allocation](#resource-allocation)). For the
subsystems discussed in this RFC, namely Identity, Governance, and Staking, this would mean:

- People Chain, for identity and personhood logic, providing functionality related to the attributes
  of single actors;
- Governance Chain, for governance and system collectives, providing functionality for pluralities
  to express their voices within the system;
- Staking Chain, for Polkadot's staking system, including elections, nominations, reward
  distribution, slashing, and non-interactive staking; and
- Asset Hub, for fungible and non-fungible assets, including DOT.

The Collectives chain and Asset Hub already exist, so implementation of this RFC would mean two new
chains (People and Staking), with Governance moving to the _currently-known-as_ Collectives chain
and Asset Hub being increasingly used for DOT over the Relay Chain.

Note that one functional group will likely include many pallets, as we do not know how pallet
configurations and interfaces will evolve over time.

### Resource Allocation

The system should minimise wasted blockspace. These three (and other) subsystems may not each
consistently require a dedicated core. However, core scheduling is far more agile than functional
grouping. While migrating functionality from one chain to another can be a multi-month endeavour,
cores can be rescheduled almost on-the-fly.

Migrations are also breaking changes to some use cases, for example other parachains that need to
route XCM programs to particular chains. It is thus preferable to do them a single time in migrating
off the Relay Chain, reducing the risk of needing parachain splits in the future.

Therefore, chain boundaries should be based on functional grouping where synchronous composibility
is most valuable; and efficient resource allocation should be managed by the core scheduling
protocol.

Many of these system chains (including Asset Hub) could often share a single core in a semi-round
robin fashion (the coretime may not be uniform). When needed, for example during NPoS elections or
slashing events, the scheduler could allocate a dedicated core to the chain in need of more
throughput.

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

1. The pallet can be put in a locked state, blocking most calls to the pallet and preventing updates
   to identity info.
1. The frozen state will form the genesis of a new system parachain.
1. Functions will be added to the pallet that allow migrating the deposit to the parachain. The
   parachain deposit is on the order of 1/100th of the Relay Chain's. Therefore, this will result in
   freeing up Relay State as well as most of each user's reserved balance.
1. The pallet and any leftover state can be removed from the Relay Chain.

User interfaces that render Identity information will need to source their data from the new system
parachain.

Note: In the future, it may make sense to decommission Kusama's Identity chain and do all account
identities via Polkadot's. However, the Kusama chain will serve as a dress rehearsal for Polkadot.

#### Staking

Migrating the staking subsystem will likely be the most complex technical undertaking, as the
Staking system cannot stop (the system MUST always have a validator set) nor run in parallel (the
system MUST have only _one_ validator set) and the subsystem itself is made up of subsystems in the
runtime and the node. For example, if offences are reported to the Staking parachain, validator
nodes will need to submit their reports there.

Handling balances also introduces complications. The same balance can be used for staking and
governance. Ideally, all balances stay on Asset Hub, and only report "credits" to system chains like
Staking and Governance. However, staking mutates balances by issuing new DOT on era changes and for
rewards. Allowing DOT directly on the Staking parachain would simplify staking changes.

Given the complexity, it would be pragmatic to include the Balances pallet in the Staking parachain
in its first version. Any other systems that use overlapping locks, most notably governance, will
need to recognise DOT held on both Asset Hub and the Staking parachain.

There is more discussion about staking in a parachain in [Moving Staking off the Relay
Chain](https://github.com/paritytech/polkadot-sdk/issues/491).

#### Governance

Migrating governance into a parachain will be less complicated than staking. Most of the primitives
needed for the migration already exist. The Treasury supports spending assets on remote chains and
collectives like the Polkadot Technical Fellowship already function in a parachain. That is, XCM
already provides the ability to express system origins across chains.

Therefore, actually moving the governance logic into a parachain will be simple. It can run in
parallel with the Relay Chain's governance, which can be removed when the parachain has demonstrated
sufficient functionality. It's possible that the Relay Chain maintain a Root-level emergency track
for situations like [parachains
halting](https://forum.polkadot.network/t/stalled-parachains-on-kusama-post-mortem/3998).

The only complication arises from the fact that both Asset Hub and the Staking parachain will have
DOT balances; therefore, the Governance chain will need to be able to credit users' voting power
based on balances from both locations. This is not expected to be difficult to handle.

### Kusama

Although Polkadot and Kusama both have system chains running, they have to date only been used for
introducing new features or bodies, for example fungible assets or the Technical Fellowship. There
has not yet been a migration of logic/state from the Relay Chain into a parachain. Given its more
realistic network conditions than testnets, Kusama is the best stage for rehearsal.

In the case of identity, Polkadot's system may be sufficient for the ecosystem. Therefore, Kusama
should be used to test the migration of logic and state from Relay Chain to parachain, but these
features may be (at the will of Kusama's governance) dropped from Kusama entirely after a successful
migration on Polkadot.

For Governance, Polkadot already has the Collectives parachain, which would become the Governance
parachain. The entire group of DOT holders is itself a collective (the legislative body), and
governance provides the means to express voice. Launching a Kusama Governance chain would be
sensible to rehearse a migration.

The Staking subsystem is perhaps where Kusama would provide the most value in its canary capacity.
Staking is the subsystem most constrained by PoV limits. Ensuring that elections, payouts, session
changes, offences/slashes, etc. work in a parachain on Kusama -- with its larger validator set --
will give confidence to the chain's robustness on Polkadot.

## Drawbacks

These subsystems will have reduced resources in cores than on the Relay Chain. Staking in particular
may require some optimizations to deal with constraints.

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

For existing parachains that interact with these subsystems, they will need to configure their
runtimes to recognize the new locations in the network.

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
With Staking and Governance off the Relay Chain, this is not an unreasonable next step.

With Identity on Polkadot, Kusama may opt to drop its People Chain.
