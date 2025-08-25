# RFC-0149: AURA Multi-Slot Collation 

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 25th of August 2025                                                                    |
| **Description** | Multi-Slot AURA for System Parachains                                                                    |
| **Authors**     | bhargavbh, burdges, AlistairStewart                                                            |

## Summary
This RFC proposes a modification to the AURA round-robin block production mechanism for system parachains, such as Asset Hub. The proposed change increases the number of consecutive block production slots assigned to each collator from the current single-slot allocation to a configurable value, initially set at four. This modification aims to enhance censorship resistance by mitigating data-withholding attacks.

## Motivation

The Polkadot Relay Chain guarantees the safety of parachain blocks, but it does not provide explicit guarantees for liveness or censorship resistance. With the planned migration of core Relay Chain functionalities—such as Balances, Staking, and Governance—to the Polkadot Hub system parachain in early November 2025, it becomes critical to establish a mechanism for achieving censorship resistance for these parachains without compromising throughput. For example, if governance functionality is migrated to Polkadot-Hub, malicious collators could systematically censor `aye` votes for a Relay Chain runtime upgrade, potentially altering the referendum's outcome. This demonstrates that censorship attacks on a system parachain can have a direct and undesirable impact on the security of the Relay Chain. This proposal addresses such censorship vulnerabilities by modifying the AURA block production mechanism utilized by system parachain collators.  

## Stakeholders

- Collators: Operators responsible for block production on the Polkadot Hub and other system parachains.
- Users and Applications: Entities that interact with the Polkadot Hub or other system parachains.

## Threat Model

This analysis of censorship resistance for AURA-based parachains operates under the following assumptions:

- **Collator Honesty:** The model assumes the presence of at least one honest collator. We intentionally chose the most relaxed security assumption as collators are not slashable (unlike validators). Note that all system parachains use AURA via the [Aura-Ext](https://github.com/paritytech/polkadot-sdk/tree/master/cumulus/pallets/aura-ext) pallet. 

- **Backer Honesty:** The backer assigned to a block candidate is assumed to be honest. This is a reasonable assumption given 2/3rd honesty on relay-chain and that backers are assigned randomly by [ELVES](https://eprint.iacr.org/2024/961.pdf).
- **Availability Layer:** We also assume that the availability layer is robust and a collator can fetch the latest parablock (header and body) directly from the availability layer (or the backer) in a reasonable time, i.e., <6s from backer and <18s from availability layer provided by ELVES. 
- **Scope:** We focus mainly on honest collators ability to produce and get their blocks backed, rather than censorship at the transaction level. Ideally, we want to achive the property that honest collators eventually get their blocks backed even if there is a slight delay (and provide a provable bound on this delay). 

## Proposed Changes

The current AURA mechanism, which assigns a single block production slot per collator, is vulnerable to data-withholding attacks. A malicious collator can strategically produce a block and then selectively withhold it from subsequent collators. This can prevent honest collators from building their blocks in a timely manner, effectively censoring their block production.

**Illustrative Attack Scenario:**

Consider 3 collators A, B and C assigned to consecutive slots by the AURA mechanism. A and C conspire to censor collator B, i.e., not allow B's block to get backed, they can execute the following attack: A produces block $b_A$ and submits it to the backers but it selectively witholds $b_A$ from B. Then C builds on top of $b_A$ and gets in its block before B can recover $b_A$ from availability layer and build on top of it.

**Proposed Solution**

This proposal modifies the AURA round-robin mechanism to assign $x$ consecutive slots to each collator. The specific value of $x$ is contingent upon asynchronous backing parameters od the system parachain and will be derived using a generic formula provided in this document. The collator selected by AURA will be responsible for producing $x$ consecutive blocks. This modification will require corresponding adjustments to the AURA authorship checks within the PVF (Parachain Validation Function). For the current configuration of Polkadot Hub, $x=4$.

**Deriving `x`**
The number of consecutive slots to be assigned to ensure AURA's censorship resistance depends on Async Backing Parameters like `unincluded_segment_lenght`. We now describe our approach to deriving $x$ based on paramters of async backing and other variables like block production and latency in availability layer. The relevant values can then be plugged in to obtain $x$ for any system parachain. 

Clearly, the number of consecutive slots (x) in the round-robin is lower bounded by the time required to reconstruct the previous block from the availability layer (b) in addition to the block building time (a). Hence, we need to set $x$ such that $x\geq a+b$. But with async backing, a malicious collator sequentially tries to not share the block and just-in-time front-run the honest collator for all the unincluded_segment blocks. Hence, we require $x\geq (a+b)\cdot m$, where $m$ is the max allowed candidate depth (unincluded segment allowed). 

Independently, there is a check on the relay chain which filters out parablocks anchoring to very old relay_parents in the [`verify_backed_candidates`](https://github.com/paritytech/polkadot-sdk/blob/ec700de9cdca84cdf5d9f501e66164454c2e3b7d/polkadot/runtime/parachains/src/inclusion/mod.rs#L1237). Any parablock which is anchored to a relay parent older than the oldest element in `allowed_relay_parents` gets rejected. Hence, the malicious collator can not front-run and censor the consequent collator after this delay as the parablock is no longer valid. The update of the allowed_relay_parents occurs at [`process_inherent_data`](https://github.com/paritytech/polkadot-sdk/blob/ec700de9cdca84cdf5d9f501e66164454c2e3b7d/polkadot/runtime/parachains/src/paras_inherent/mod.rs#L321) where the buffer length of AllowedRelayParents is set by the scheduler parameter: [`lookahead`](https://github.com/paritytech/polkadot-sdk/blob/875437c4aecf99e1f0ffeb8278a3b0b0017acbc2/polkadot/primitives/src/v8/mod.rs#L2148) (set to 3 by default). Therefore, the async_backing delay ($async\_delay$) tolerated by the relay chain backers is $3*6s = 18s$. Hence, the number of consecutive slots is the minimum of the above two values:

$$
x \geq min((a+b)\cdot m, a + b + async\_delay)
$$
where $m$ is the $max\_candidate\_depth$ (or unincluded segment as seen from collator's perpective). 

**Number of consecutive slots for Polkadot Hub**

Assuming the previous block data can be fetched from backers, then we comfortably have $a+b \leq 6s$, i.e. block buiding plus recoinstruciton time is < 6s. Using the current async_delay of 18s, suffices to set $x$ to 4. If the max_candidate_depth (m) for plaza is set $m\leq3$, then this will reduce (improve) $x$ from 4 to $m$. Note that a channel would have to be provided for collators to fetch blocks from backers as the preferred option and only recover from availability layer as the fail-safe option. 


## Performance, Ergonomics, and Compatibility

The proposed changes are security critical and mitigate censorship attacks on core functionality like balances, staking and governance on Polkadot Hub.
This approach is compatible with the Slot-Based collation and the currently deployed FixedVelocityConsensusHook. Further analysis is needed to integrate with cusotm ConsesnsusHooks that leverage for Elastic Scaling. 
Multi-slot collation however is vulnerable to liveness attacks: adversarial collators don't show up to stall the liveness but then also lose out on block production rewards. The amount of missed blocks because of collators skipping is same as in the current implementation, only the distribution of missed slots changes (they are chunked together instead of being evenly distributed). Secondly, when ratio of adversarial (censoring) collators $\alpha$ is high (close to 1), the ratio of uncensored block to all blocks produced drops to $(1-\alpha)/(x\alpha)$. For more practical lower values of $\alpha<1/4$, the ratio of uncensored to all blocks is almost 1.   

The latency for backing of blocks is affected as follows:
- Censored Blocks: $(x-1)*6s$ compared to the blocks being indefinitely censored. $x$ is the number number of consecutive slots per collator.  
- An adversarial collator not showing up can slow the chain by $x*6s$ instead of $6s$. This is however not an economically rational attack as there are incentives for collating paid retrospectively.   

Effective multi-slot collation requires that collators be able to prioritize transactions that have been targeted for censorship. The implementation should incorporate a framework for priority transactions (e.g., governance votes, election extrinsics) to ensure that such transactions are included in the uncensored blocks.

## Prior Art and References

This RFC is related to RFC-7, which details the selection mechanism for System Parachain Collators. In general, a more robust collator selection mechanism that reduces the proportion of malicious actors would directly benefit the effectiveness of the ideas presented in this RFC

## Future Directions

- Future work should focus on defining which transactions or extrinsics should be considered priority. This would allow an honest collator to maximize the utility of its consecutive block production slots. While this is highly dependent on the specific parachain's functionality, a generic framework would be beneficial for runtime engineers to tag relevant transaction types.
