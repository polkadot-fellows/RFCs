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

The [Voting Enum](https://github.com/paritytech/polkadot-sdk/blob/939fc198daaf5e8ae319419f112dacbc1ea7aefe/substrate/frame/conviction-voting/src/vote.rs#L256-L264), which currently holds the user's vote data, would first be collapsed and it's underlying fields consolidated, as there would no longer be a distinction between the enum's variants. A `(poll index -> retracted votes count)` field would then be added to the resulting structure - It's role to keep track of the per poll balance that has been clawed back from the user by those delegating to them. See [here](https://github.com/PolkadotDom/polkadot-sdk/blob/f9af95133534c18dfde990cb9d775c325c2c6ebf/substrate/frame/conviction-voting/src/vote.rs#L227-L244) for a potential implementation.

The implementation must allow for the `(poll index -> retracted votes)` data to exist even if the user does not currently have a vote for that poll. A simple example that highlights the necessity is as follows: A delegator votes first, then the delegate does. If the delegator is not allowed to create the retracted votes data on the delegate, the tally count would be corrupted when the delegate votes.

It follows then that the delegator must also handle clean up of that data when their vote is removed. Otherwise, the delegate has no immediate monetary incentive to clean the retracted vote's state.

All changes to pallet-conviction-voting's STF would follow those simple changes. For example, when a user votes standard, the final amount added to the poll's tally would be `balance + (amount delegated to user - retracted votes)`. Then, if they are delegating, it will update their delegate's vote data with the newly retracted votes.

The retracted amount is always the full delegated amount. For example, if Alice delegates 10 UNITS to Bob and then votes with 5 UNITS, the full 10 UNITS is still added as a clawback to Bob for that poll. This is both for simplicity and to ensure we don't make unnecessary assumptions about what Alice wants.

Because you need to add the clawback, a delegator's vote can affect a delegate's voting data. If a delegator's vote or delegation makes the delegate's voting data exceed [MaxVotes](https://github.com/paritytech/polkadot-sdk/blob/939fc198daaf5e8ae319419f112dacbc1ea7aefe/substrate/frame/conviction-voting/src/lib.rs#L138), the transaction will fail. In practice, this means this new system is somewhere between the old and the ideal. However, this will incentivize delegates to stay on top of voting data clearance. And given our current referenda rates and MaxVotes set to [512](https://github.com/polkadot-fellows/runtimes/blob/34ecb949660704ccf139a06afb075c6a729b1295/relay/polkadot/src/governance/mod.rs#L43), it would be difficult to hit this limit.

A new error is to be introduced that signals MaxVotes was reached specifically for the delegate's voting data.

### Locked Balance

A user's locked balance will be the greater of the delegation lock and the voting lock.

### Migrations 

A runtime migration is necessary, though simple considering voting and delegation are currently separate. It would iterate over the [VotingFor](https://github.com/paritytech/polkadot-sdk/blob/939fc198daaf5e8ae319419f112dacbc1ea7aefe/substrate/frame/conviction-voting/src/lib.rs#L165) storage item and convert the [old vote data structure](https://github.com/paritytech/polkadot-sdk/blob/939fc198daaf5e8ae319419f112dacbc1ea7aefe/substrate/frame/conviction-voting/src/vote.rs#L256-L264) to the [new structure](https://github.com/PolkadotDom/polkadot-sdk/blob/dom/vote-while-delegating/substrate/frame/conviction-voting/src/vote.rs#L227-L243).

## Drawbacks

There are two potential drawbacks to this system -

### An unbounded rate of change of the voter preferences function

If implemented, there will be no friction in delegating, undelegating, and voting. Therefore, there could be large and immediate shifts in the voter preferences function. In other voting systems we see bounds added to the rate of change (voting cycles, etc). That said, it is unclear whether this is desired or advantageous. Additionally, there are more easily parameterized and analytically tractable ways to handle this than what we currently have. See future directions.

### Lessened value in becoming a delegate

If a delegate's voting power can be stripped from them at any point, then there is necessarily a reduction in their power within the system. This provides less incentive to become a delegate. But again, there are more customizable ways to handle this if it proves necessary. 

## Testing, Security, and Privacy

This change would mean a more complicated STF for voting, which would increase difficulty of hardening. Though sufficient unit testing should handle this with ease.

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
