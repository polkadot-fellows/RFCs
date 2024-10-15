 # RFC-0035: Conviction Voting Delegation Modifications

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **October 10, 2023**  |                                                                     |
| **Conviction Voting Delegation Modifications** |                                                                   |
| **ChaosDAO**     |                                                                                             |

## Summary

This RFC proposes to make modifications to voting power delegations as part of the Conviction Voting pallet. The changes being proposed include:

1. Allow a Delegator to vote independently of their Delegate if they so desire.
2. Allow nested delegations – for example Charlie delegates to Bob who delegates to Alice – when Alice votes then both Bob and Charlie vote alongside Alice (in the current implementation Charlie will not vote when Alice votes).
3. Make a change so that when a delegate votes abstain their delegated votes also vote abstain.
4. Allow a Delegator to delegate/ undelegate their votes for all tracks with a single call. 

## Motivation

It has become clear since the launch of OpenGov that there are a few common tropes which pop up time and time again:
1. The frequency of referenda is often too high for network participants to have sufficient time to review, comprehend, and ultimately vote on each individual referendum. This means that these network participants end up being inactive in on-chain governance.
2. There are active network participants who are reviewing every referendum and are providing feedback in an attempt to help make the network thrive – but often time these participants do not control enough voting power to influence the network with their positive efforts.
3. Delegating votes for all tracks currently requires long batched calls which result in high fees for the Delegator - resulting in a reluctance from many to delegate their votes.

We believe (based on feedback from token holders with a larger stake in the network) that if there were some changes made to delegation mechanics, these larger stake holders would be more likely to delegate their voting power to active network participants – thus greatly increasing the support turnout.

## Stakeholders

The primary stakeholders of this RFC are:

- The Polkadot Technical Fellowship who will have to research and implement the technical aspects of this RFC
- DOT token holders in general 

## Explanation

This RFC proposes to make 4 changes to the convictionVoting pallet logic in order to improve the user experience of those delegating their voting power to another account. 

1. **Allow a Delegator to vote independently of their Delegate if they so desire** – this would empower network participants to more actively delegate their voting power to active voters, removing the tedious steps of having to undelegate across an entire track every time they do not agree with their delegate's voting direction for a particular referendum.

2. **Allow nested delegations – for example Charlie delegates to Bob who delegates to Alice – when Alice votes then both Bob and Charlie vote alongside Alice (in the current runtime Charlie will not vote when Alice votes)** – This would allow network participants who control multiple (possibly derived) accounts to be able to delegate all of their voting power to a single account under their control, which would in turn delegate to a more active voting participant. Then if the delegator wishes to vote independently of their delegate they can control all of their voting power from a single account, which again removes the pain point of having to issue multiple undelegate extrinsics in the event that they disagree with their delegate.

3. **Have delegated votes follow their delegates abstain votes** – there are times where delegates may vote abstain on a particular referendum and adding this functionality will increase the support of a particular referendum. It has a secondary benefit of meaning that Validators who are delegating their voting power do not lose points in the 1KV program in the event that their delegate votes abstain (another pain point which may be preventing those network participants from delegating).

4. **Allow a Delegator to delegate/ undelegate their votes for all tracks with a single call** - in order to delegate votes across all tracks, a user must batch 15 calls - resulting in high costs for delegation. A single call for `delegate_all`/ `undelegate_all` would reduce the complexity and therefore costs of delegations considerably for prospective Delegators.

## Drawbacks

We do not foresee any drawbacks by implementing these changes. If anything we believe that this should help to increase overall voter turnout (via the means of delegation) which we see as a net positive.

## Testing, Security, and Privacy

We feel that the Polkadot Technical Fellowship would be the most competent collective to identify the testing requirements for the ideas presented in this RFC.

## Performance, Ergonomics, and Compatibility

### Performance

This change may add extra chain storage requirements on Polkadot, especially with respect to nested delegations. 

### Ergonomics & Compatibility

The change to add nested delegations may affect governance interfaces such as Nova Wallet who will have to apply changes to their indexers to support nested delegations. It may also affect the Polkadot Delegation Dashboard as well as Polkassembly & SubSquare.

We want to highlight the importance for ecosystem builders to create a mechanism for indexers and wallets to be able to understand that changes have occurred such as increasing the pallet version, etc.

## Prior Art and References

N/A

## Unresolved Questions

N/A

## Future Directions and Related Material
Additionally we would like to re-open the conversation about the potential for there to be free delegations. This was discussed by Dr Gavin Wood at Sub0 2022 and we feel like this would go a great way towards increasing the amount of network participants that are delegating: https://youtu.be/hSoSA6laK3Q?t=526

Overall, we strongly feel that delegations are a great way to increase voter turnout, and the ideas presented in this RFC would hopefully help in that aspect.
