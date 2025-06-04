# RFC-0000: Allow Voting While Delegating

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | June 7th, 2025                                                                              |
| **Description** | Allow voters to simultaneously delegate and vote                                            |
| **Authors**     | polka.dom (polkadotdom)                                                                     |

## Summary

This RFC proposes changes to `pallet-conviction-voting` that allow for simultaneous voting and delegation. For example, Alice would be able to delegate to Bob, and then later vote on a referenda while keeping their delegation intact. It is a strict subset of [RFC 35](https://github.com/polkadot-fellows/RFCs/pull/35).

## Motivation

### Backdrop
Under our current voting system a voter can either vote or delegate. To vote, they must first undelegate, and to delegate, they must first clear all of their current votes.

### The Current Issue

Empirically, we have seen that the vast majority of people do not vote on day to day policy. This was forseen and is the reason we have delegation. However, more worringly, we have also observed that most people do not delegate, leaving a large percentage of our voting population unrepresented.

### Analysis

One could think of three major reasons for this lack of delegation. 

- They do not know of anyone who accurately represents them. 
- They do not want their right to vote stripped, in consideration of some yet unknown, highly important, referenda.
- They do not want to clear their voting data so as to delegate.

This RFC aims to solve the second and third issue and thus more accurately align governance to the true voter preferences function.

### An Aside

One may ask, could they not just undelegate, vote, then delegate again? Could this just be built into the user interface? Unfortunately this does not work due to the need to clear their votes before redelegation. In practice you would undelegate, vote, wait until the referenda is closed, hope that there's no other referenda you'd like to vote on, then redelegate. At best it's a temporally extended annoyance, and at worst you go unrepresented in voting for the duration of the 'vote clearing' period.
 

## Stakeholders

`Runtime developers`: A runtime migration is needed. In addition it is a serious change in governance that requires some consideration. 

`App developers`: Apps like Subsquare and Polkassembly would need to update their user interface logic

## Explanation

### New Data & Runtime Logic

The [Voting Enum](https://github.com/paritytech/polkadot-sdk/blob/master/substrate/frame/conviction-voting/src/vote.rs#L225) is first collapsed, as there's no longer a distinction. Then a `(poll index -> retracted votes count)` data item would be added to the user's voting data, stored in [VotingFor](https://github.com/paritytech/polkadot-sdk/blob/master/substrate/frame/conviction-voting/src/lib.rs#L165). This would keep track of the per poll balance that has been clawed back from the user by their delegators. 

All changes to pallet conviction voting's stf would follow that simple change. For example, when a user votes standard, the final amount added to the poll's tally will be `balance + (amount delegated to user - retracted votes)`. Then if they are delegating, it will update their delegate's vote data with the newly retracted votes.

The retracted amount is always the full delegated amount. For example, if Alice delegates 10 Dot at 1x conviction to Bob and then votes 5 Dot Aye, the full 10 Dot is still added as a clawback to Bob for that poll. This is both for simplicity and to ensure we don't make unnecessary assumptions about what Alice wants.

Because you need to add the clawback, a delegator's vote can affect a delegate's voting history. If a delegator's vote or delegation makes the delegate's voting data exceed [MaxVotes](https://github.com/paritytech/polkadot-sdk/blob/master/substrate/frame/conviction-voting/src/vote.rs#L206-L216), the transaction is to fail. In practice, this means this new system is somewhere between the old and the ideal. However, this will incentivize delegate's to stay on top of cleaning their voting data. And with [MaxVotes](https://github.com/polkadot-fellows/runtimes/blob/main/relay/polkadot/src/governance/mod.rs#L43) set to 512 at our current referenda rates, it would be difficult to hit this limit.

### Locked Balance

A user's locked balance will be the greater of the delegation lock and the voting lock.

### Migrations 

A runtime migration is necessary, though simple considering voting and delegation are currently separate.

## Drawbacks

There's are two potential drawbacks to this system -

### Unbounded rate of change of the voter preferences function

If implemented, there will be no friction in delegating, undelegating, and voting. Therefore, there could be large and immediate shifts in the voter preferences function. In other voting systems we see bounds added to the rate of change (voting cycles, etc). That said, it's unclear whether this is actually desired for us. Additionally, there are more mathematically sound and tractable ways to handle this than what we currently have. See future directions.

### Lessened value in becoming a delegate

If a delegate's voting power can be stripped from them at any point, then there is necessarily a reduction in their power within the system. This provides less incentive to become a delegate. While at first that doesn't appear to be a motivation we want to bolster, it is certainly true delegates serve an important energy preserving function within the system. However, again, we can incentive this in better ways if need be. 

## Testing, Security, and Privacy

This change would mean a more complicated STF for voting, which could increase difficulty of hardening. Though sufficient unit testing should handle this with ease.

## Performance, Ergonomics, and Compatibility

### Performance

The proposed changes would increase both the compute and storage requirements linearly for all voting functions.

### Ergonomics

Voting and delegation will both become more ergonomic, as there are no longer hard constraints affecting what you can do and when you can do it.

### Compatibility

App developers will need to update their user interfaces to accomodate the new functionality.

## Prior Art and References

A current WIP implementation can be found [here](https://github.com/PolkadotDom/polkadot-sdk/tree/dom/vote-while-delegating/substrate/frame/conviction-voting/src). While WIP, it is STF complete & heavily commented for ease of understanding.

## Unresolved Questions

None

## Future Directions and Related Material

It is possible we would like to add a system parameter for the rate of change of the voting/delegation system. This could prevent wild swings in the voter preferences function and motivate delegates by solidifying their positions over some amount of time. However, it's unclear that this would be necessary or even valuable.
