# RFC-150: Allow Voting While Delegating

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | June 5th, 2025                                                                              |
| **Description** | Allow voters to simultaneously delegate and vote                                            |
| **Authors**     | polka.dom (polkadotdom)                                                                     |

## Summary

This RFC proposes changes to `pallet-conviction-voting` that allow for simultaneous voting and delegation. For example, Alice could delegate to Bob, then later vote on a referendum while keeping their delegation to Bob intact. It is a strict subset of Leemo's [RFC 35](https://github.com/polkadot-fellows/RFCs/pull/35).

## Motivation

### Backdrop
Under our current voting system, a voter can either vote or delegate. To vote, they must first ensure they have no delegate, and to delegate, they must first clear their current votes.

### The Issue

Empirically, the vast majority of people do not vote on day to day policy. This was foreseen and is the reason governance has delegation. However, more worriedly, it has also been observed that most people do not delegate either, leaving a large percentage of our voting population unrepresented.

### Factors Limiting Delegation

One could think of three major reasons for this lack of delegation. 

- The voter does not know of anyone who accurately represents them. 
- The voter does not want their right to vote stripped, in consideration of some yet unknown, highly important, referendum.
- The voter does not want to clear their voting data so as to delegate.

This RFC aims to solve the second and third issue and thus more accurately align governance to the true voter preferences.

### An Aside

One may ask, could a voter not just undelegate, vote, then delegate again? Could this just be built into the user interface? Unfortunately, this does not work due to the need to clear their votes before redelegation. In practice the voter would undelegate, vote, wait until the referendum is closed, hope that there's no other referenda they would like to vote on, then redelegate. At best it's a temporally extended friction. At worst the voter goes unrepresented in voting for the duration of the vote clearing period.
 

## Stakeholders

`Runtime developers`: If runtime developers are relying on the previous assumptions for their [VotingHooks](https://github.com/paritytech/polkadot-sdk/blob/939fc198daaf5e8ae319419f112dacbc1ea7aefe/substrate/frame/conviction-voting/src/lib.rs#L159) implementations, they will need to rethink their approach. In addition, a runtime migration is needed. Lastly, it is a serious change in governance that requires some consideration beyond the technical. 

`App developers`: Apps like Subsquare and Polkassembly would need to update their user interface logic. They will also need to handle the new error.

`Users`: We will want users to be aware of the new functionality, though not required.

`Technical Writers`: This change will require rewrites of documentation and tutorials. 

## Explanation

### New Data & Runtime Logic

The new logic allows a delegator's vote on a specific poll to override their delegation for that poll only. When a delegator votes, their delegated voting power is temporarily "clawed back" from their delegate for that single referendum. This ensures a delegator's direct vote takes precedence.

The core of the algorithm is as follows:

1.  **Calculating a User's Voting Power:** A user's total voting power on any given poll is their own balance plus the total balance delegated to them, minus the total amount retracted by any of their delegators who chose to vote directly on that poll.

2.  **Tracking Clawbacks:** When a delegator votes, the system records the full amount of their delegated stake as "retracted" on their delegate's account for that specific poll. This clawback is always for the delegator's full delegated amount, regardless of the amount they personally vote with. This is for simplicity and to avoid making assumptions about the delegator's intent. Crucially, clawbacks from multiple delegators can be accumulated, such that only one tracking entry per referendum is necessary.

Here is how the logic plays out in different scenarios:

* **When a Delegator Votes:**
    1.  Alice delegates 10 UNITS to Bob. She then votes 'Aye' on Referendum #5 with her own 5 UNITS.
    2.  The system adds Alice's 5 UNITS to the 'Aye' tally for Referendum #5.
    3.  Simultaneously, the system creates a "retracted votes" entry on *Bob's* account, specific to Referendum #5, for the full 10 UNITS. If he had already voted, the tally would be adjusted to remove Alice's 10 UNITS.
    4.  If Bob now votes, or changes his previous vote, his voting power will be his own balance plus all delegations *except* for Alice's 10 UNITS for this specific poll.

* **When a Delegator Removes Their Vote:**
    1.  Following the above, Alice removes her vote from Referendum #5.
    2.  The system removes her 5 UNITS from the 'Aye' tally.
    3.  The system also removes the "retracted votes" entry from Bob's account. This action "returns" the 10 UNITS of voting power to Bob for Referendum #5. If Bob has a vote, the poll tally is updated accordingly.
    4.  The cleanup of the delegate's state is handled by the delegator's transaction to ensure no orphaned data remains.

A key consequence of this design is that a delegator's vote can alter their delegate's storage. If adding a "retracted votes" entry pushes the delegate's voting data beyond the [MaxVotes](https://github.com/paritytech/polkadot-sdk/blob/939fc198daaf5e8ae319419f112dacbc1ea7aefe/substrate/frame/conviction-voting/src/lib.rs#L138) limit, the delegator's transaction will fail. A new error will be introduced to signal this specific case. While a constraint, this will incentivize delegates to regularly clear their voting data for concluded referenda, and given our current referenda rates and MaxVotes set to [512](https://github.com/polkadot-fellows/runtimes/blob/34ecb949660704ccf139a06afb075c6a729b1295/relay/polkadot/src/governance/mod.rs#L43), this scenario is unlikely to occur.

### Locked Balance

A user's locked balance will be the greater of the delegation lock and the voting lock.

### Migrations 

A multi-block runtime migration is necessary. It would iterate over the [VotingFor](https://github.com/paritytech/polkadot-sdk/blob/939fc198daaf5e8ae319419f112dacbc1ea7aefe/substrate/frame/conviction-voting/src/lib.rs#L165) storage item and convert the [old vote data structure](https://github.com/paritytech/polkadot-sdk/blob/939fc198daaf5e8ae319419f112dacbc1ea7aefe/substrate/frame/conviction-voting/src/vote.rs#L256-L264) to the [new structure](https://github.com/PolkadotDom/polkadot-sdk/blob/dom/vote-while-delegating/substrate/frame/conviction-voting/src/vote.rs#L227-L243).

## Drawbacks

There are two potential drawbacks to this system -

### An unbounded rate of change of the voter preferences function

If implemented, there will be no friction in delegating, undelegating, and voting. Therefore, there could be large and immediate shifts in the voter preferences function. In other voting systems we see bounds added to the rate of change (voting cycles, etc). That said, it is unclear whether this is desired or advantageous. Additionally, there are more easily parameterized and analytically tractable ways to handle this than what we currently have. See future directions.

### Lessened value in becoming a delegate

If a delegate's voting power can be stripped from them at any point, then there is necessarily a reduction in their power within the system. This provides less incentive to become a delegate. But again, there are more customizable ways to handle this if it proves necessary. 

## Testing, Security, and Privacy

The changes herein would allow for a cost-symmetric grief in which a delegator votes on every referendum, adding more votes to the delegate's record, then accepts the lock and waits until the delegate themselves pays to remove the vote from their record-- costing the delegate `cost_of_removal_per_ref * number_of_refs_not_voted_on`. This cost will inevitably be small and accepted by aspirational delegates, considering they'll be voting on most refs anyway. However, for those who don't want to incur the possibility of this cost, we introduce a per voting class flag that toggles delegator voting on/off.

In addition, these changes would mean a more complicated STF, which would increase the difficulty of hardening. Though sufficient unit testing should handle this with ease.

## Performance, Ergonomics, and Compatibility

### Performance

The proposed changes would increase both the compute and storage requirements by about 2x for all voting functions. No change in complexity.

### Ergonomics

Voting and delegation will both become more ergonomic for users, as there are no longer hard constraints affecting what you can do and when you can do it.

### Compatibility

Runtime developers will need to add the migration and ensure their hooks still work.

App developers will need to update their user interfaces to accommodate the new functionality. They will need to handle the new error as well.

## Prior Art and References

A current implementation can be found [here](https://github.com/paritytech/polkadot-sdk/pull/9026).

## Unresolved Questions

None

## Future Directions and Related Material

It is possible we would like to add a system parameter for the rate of change of the voting/delegation system. This could prevent wild swings in the voter preferences function and motivate/shield delegates by solidifying their positions over some amount of time. However, it's unclear that this would be valuable or even desirable.
