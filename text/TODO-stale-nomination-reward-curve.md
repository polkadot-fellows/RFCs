# RFC-TODO: Stale Nomination Reward Curve

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 10 July 2024                                                            |
| **Description** | Introduce a decaying reward curve for stale nominations in staking.     |
| **Authors**     | Shawn Tabrizi                                                           |

## Summary

This is a proposal to reduce the impact of stale nominations in the Polkadot staking system. With this proposal, nominators are incentivized to update or renew their selected validators once per time period. Nominators that do not update or renew their selected validators would be considered stale, and a decaying multiplier would be applied to their nominations, reducing the weight of their nomination and rewards.

## Motivation

Longer motivation behind the content of the RFC, presented as a combination of both problems and requirements for the solution.

One of Polkadot's primary utilities is providing a high quality security layer for applications built on top of it.

## Stakeholders

Primary stakeholders are:

- Nominators
- Validators

## Explanation

Detail-heavy explanation of the RFC, suitable for explanation to an implementer of the changeset. This should address corner cases in detail and provide justification behind decisions, and provide rationale for how the design meets the solution requirements.

## Drawbacks

Description of recognized drawbacks to the approach given in the RFC. Non-exhaustively, drawbacks relating to performance, ergonomics, user experience, security, or privacy.

## Testing, Security, and Privacy

Describe the the impact of the proposal on these three high-importance areas - how implementations can be tested for adherence, effects that the proposal has on security and privacy per-se, as well as any possible implementation pitfalls which should be clearly avoided.

## Performance, Ergonomics, and Compatibility

Describe the impact of the proposal on the exposed functionality of Polkadot.

### Performance

Is this an optimization or a necessary pessimization? What steps have been taken to minimize additional overhead?

### Ergonomics

If the proposal alters exposed interfaces to developers or end-users, which types of usage patterns have been optimized for?

### Compatibility

Does this proposal break compatibility with existing interfaces, older versions of implementations? Summarize necessary migrations or upgrade strategies, if any.

## Prior Art and References

Provide references to either prior art or other relevant research for the submitted design.

## Unresolved Questions

Provide specific questions to discuss and address before the RFC is voted on by the Fellowship. This should include, for example, alternatives to aspects of the proposed design where the appropriate trade-off to make is unclear.

## Future Directions and Related Material

Describe future work which could be enabled by this RFC, if it were accepted, as well as related RFCs. This is a place to brain-dump and explore possibilities, which themselves may become their own RFCs.
