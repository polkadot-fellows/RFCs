# RFC-0104: Stale Nominations and Declining Reward Curve

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 28 October 2024                                                            |
| **Description** | Introduce a decaying reward curve for stale nominations in staking.     |
| **Authors**     | Shawn Tabrizi & Jonas Gehrlein                                                           |

## Summary

This is a proposal to define stale nominations in the Polkadot's staking system and introduce a mechanism to gradually reduce the rewards that these nominations would receive. Upon implementation, this nudges all nominators to become more active and either update or renew their selected validators at least once per period to prevent losing rewards. In response to that, it gives incentives to validators to behave in the best interest of the network and stay competitive. The decaying factor and duration of the period before nominations would be considered stale is long enough to not overburden nominators and compact enough to provide an incentive to regularly engage and revisit their selection.

Apart from the technical specification of how to achieve this goal, we discuss why active nominators are important for the security of the network. Further, we present ample empirical evidence to substantiate the claim that the current lack of direct incentives results in stale nominators.

Importantly, our proposal should neither be misinterpreted as a negative judgment on the current active set nor as a campaign to force out long-standing validators/nominators. Instead, we want to address the systemic issue of stale nominators that, with the growing age of the network, might at some point become a security risk. In that sense, our proposal aims to prevent a detoriation of our validator set before it is too late.

## Motivation

### Background

Polkadot employs the Nominated Proof-of-Stake (NPoS) mechanism that allows to accumulate resources both from validators and nominators to construct the active set. This increases the inclusivity for validators, because they do not necessarily need huge resources themselves but have the opportunity to convince nominators to entrust them with the important task of validating the Polkadot network. 

In the absence of enforcing a strict (and significant) lower limit on self-stake of validators, determining trustworthiness and competency is borderline impossible for an automated protocol. To cope with that challenge, we employ nominators as active agents that are able to navigate the fabrics of the social layer and are tasked to scout for, engage with and finally select suitable validators. The aggregated choices of these nominators are used by the election algorithm to determine a robust active set of validators. For this effort and the included risk, nominators are rewarded generously through staking rewards.

### Why nominators must be active

In this setup, the economic security of validators can be approximated by their self-stake, their future rewards (earned through commission), and the reputational costs incurred from causing a slash on their nominators. Although potentially significant in value, the latter factor is hardly measurable and difficult to quantify. Arguably, however, and irrespective of the exact value, it is diminishing the more time has passed of the last interaction between a nominator and their validator(s). This is because validators that were reputable in the past, might not be in the future and a growing distance between the two entities reduces their attachment to each other. In other words, the contribution of nominators to the security of the network is directly linked to how active they are in the process of engaging and scouting viable validators. Therefore, we not only require but also expect nominators to actively engage in the selection of validators to maximize their contribution to Polkadot's economic security.  

### Empirical evidence

In the following, we present empirical evidence to illustrate that, in the light of the mechanisms described above, nominator behavior can be improved upon. We include data from the first days of Polkadot up until the End of October 2024 (the full report can be found [here](https://jonasw3f.github.io/nominators_behavior_hosted/)), giving a comprehensive picture of current and historical behavior.

In our analysis, a key results is that the currently active nominators, on average, changed their selection of validators around 546 days ago. Additionally, the vast majority only makes a selection of validators once (when they become a nominator) and never again. This "set and forget" attitude directly translates into the backing of validators. To obtain a meaningful metric, we define the Weighted Backing Age (WBA) per validator. This metric calculates the age of their backing (from nominators) and weighs it with the size of their stake. This is superior to just taking the average, because we the activity of a nominator might be directly linked to their stake size (for more information, see the full report). Conducting this analysis reveals that the overall staleness of nominators translates into high values of WBA. While there are some validators activated by recent nominations, the average value remains rather high with 226 days  (with numerous values above 1000 days). Observing the density function of the individual WBAs, we can conclude that 40% of the total stake is older than *at least* 180 days (6 months).

### Implications of stale nominations

The fact that a large share of nominators simply “set and forget” their selections can inadvertently introduce risks into the network. When early-nominated incumbents hold their positions as validators for extended periods, they effectively gain tenure. This dynamic could lead to complacency among established validators, with quality and performance potentially declining over time. Furthermore, this lack of turnover discourages competition, creating barriers for new validators who may offer better performance but struggle to attract nominations, as the network environment disproportionately favors seniority over merit.

One might argue that nominators are naturally motivated to stay informed by the potential risk of slashing, ensuring they actively monitor and update their selections. And it is indeed possible that a selection made years ago is still optimal for a nominator today. However, we would counter these arguments by noting that nominators, as human individuals, are prone to biases that can lead to irrational behavior. To adequately protect themselves, nominators are required to secure themselves against highly unlikely but potentially detrimental events. Yet, the rarity of slashing incidents (which are even more rarely applied) makes it difficult for nominators to perceive a meaningful risk. Psychological phenomena like availability bias could cause decision-makers to underestimate both the probability and potential impact of such events, leaving them less prepared than they should be.

After all, slashing is meant as deterrend and not a frequently applied mechanism. As protocol designers, we must remain vigilant and continuously optimize the network's security, even in the absence of major issues. After all, if we notice a problem, it may already be too late.


### Conclusion
The NPoS system requires nominators to regularly engage and update their selections to meaningfully contribute to economic security. Additionally, they are compensated for their effort and the risk of potential slashes. However, these risks may be underestimated, leading many nominators to set their nominations once and never revisit them.

As the network matures, this behavior could have serious security implications. Our proposal aims to introduce a gentle incentive for nominators to stay actively engaged in the staking system. A positive side effect is that having more engaged nominators encourages validators to consistently perform at their best across all key dimensions.


## Stakeholders

Primary stakeholders are:

- Nominators
- Validators

## Explanation

Detail-heavy explanation of the RFC, suitable for explanation to an implementer of the changeset. This should address corner cases in detail and provide justification behind decisions, and provide rationale for how the design meets the solution requirements.

TODO Shawn

## Drawbacks

The proposed mechanism does come with some potential drawbacks:

### Risk of Alienating Nominators
- **Problem**: Some nominators, particularly those who don’t engage regularly, may feel alienated, especially if they experience reduced rewards due to lack of involvement, potentially without realizing there was an update.
- **Response**: Nominators who fail to stay engaged are not fully performing the role that the network rewards them for. We plan to mitigate this by launching informational campaigns to ensure that nominators are aware of any updates and changes. Moreover, any adjustments in rewards would only take effect after six months from implementation, as we won’t apply these changes retroactively.

### Potential for Bot Automation
- **Problem**: There is a possibility that some nominators might use bots to automate the process, simply reconfirming their selections without actual engagement.
- **Response**: In the worst-case scenario, automated reconfirmation would maintain the current state, with no improvement but also no additional detriment. Furthermore, running bots is not a feasible option for all nominators, as it requires effort that may exceed the effort of simply updating selections periodically. Recent advances have also made it easier for nominators to make informed choices, reducing the likelihood of relying on bots for this task.

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

- Report: https://jonasw3f.github.io/nominators_behavior_hosted/
- Github issue discussions: 

## Unresolved Questions

Provide specific questions to discuss and address before the RFC is voted on by the Fellowship. This should include, for example, alternatives to aspects of the proposed design where the appropriate trade-off to make is unclear.

## Future Directions and Related Material

Describe future work which could be enabled by this RFC, if it were accepted, as well as related RFCs. This is a place to brain-dump and explore possibilities, which themselves may become their own RFCs.