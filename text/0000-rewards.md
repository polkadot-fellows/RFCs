# RFC-0000: Validator Rewards

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | Date of initial proposal                                                                    |
| **Description** | Rewards protocol for Polkadot validators                                                    |
| **Authors**     | Jeff Burdges, ...                                                                           |

## Summary

An off-chain approximation protocol should assign rewards based upon the approvals and availability work done by validators.

All validators track which approval votes they actually use, reporting the aggregate, after which an on-chain median computation gives a good approximation under byzantine assumptions.  Approval checkers report aggregate information about which availability chunks they use too, but in availability we need a tit-for-tat game to enforce honesty, because approval committees could often bias results thanks to their small size.

## Motivation

We want all or most polkadot subsystems be profitable for validataors, because otherwise operators might profit from running modified code.  In particular, almost all rewards in Kusama/Polkadot should come from work done securing parachains, primarily approval checking, but also backing, availability, and support of XCMP.

Among these task, our highest priorities must be approval checks, which ensure soundness, and sending availability chunks to approval checkers.  We prove backers must be paid strictly less than approval checkers.

At present though, [validators' rewards](https://wiki.polkadot.network/docs/maintain-guides-validator-payout) have relatively little relationship to validators operating costs, in terms of bandwidth and CPU time.  Worse, polkadot's scaling makes us particular vulnerable "no-shows" caused by validators skipping their approval checks.  

We're particularly concernned about hardware specks impact upon the number of parachain cores.  We've requested relatively low spec machines so far, only four physical CPU cores, although some run even lower specs like only two physical CPU cores.  Alone, rewards cannot fix our low speced validator problem, but rewards and outreach together should far more impact than either alone. 

In future, we'll further increase validator spec requirements, which directly improve polkadot's throughput, and which repeats this dynamic of purging underspeced nodes, except outreach becomes more important because de facto too many slow validators can "out vote" the faster ones

## Stakeholders

We alter the validators rewards protocol, but with negligable impact upon rewards for honest validators who comply with hardware and bandwidth recommendations.  

We shall still reward participation in relay chain concensus of course, which de facto means block production but not finality, but these current reward levels shall wind up greatly reduced.  Any validators who manipulate block rewards now could lose rewards here, simply because of rewards being shifted from block production to availability, but this sounds desirable.

We've discussed roughly this rewards protocol in https://hackmd.io/@rgbPIkIdTwSICPuAq67Jbw/S1fHcvXSF and https://github.com/paritytech/polkadot-sdk/issues/1811 as well as related topics like https://github.com/paritytech/polkadot-sdk/issues/5122

## Logic

### Categories

We alter the [current rewards scheme](https://wiki.polkadot.network/docs/maintain-guides-validator-payout) by reducing to roughly these proportions of total rewards:
- 15-20% - Relay chain block production and uncle logic 
- 5% - Anything else related to relay chain finality, primarily beefy proving, but maybe other tastes exist.
- Any existing rewards for on-chain validity statements would only cover backers, so those rewards must be removed.

We add roughly these proportions of total rewards covering parachain work:
- 70-75% - approval and backing validity checks, with the backing rewards being required to be less than approval rewards.  
- 5-10% - Availability redistribution from availability providers to approval checkers.  We do not reward for availability distribution from backers to availability providers.

### Observation

We track this data for each candidate during the approvals process:
```
/// Our subjective record of out availability transfers for this candidate.
CandidateRewards {
    /// Anyone who backed this parablock
    backers: [AuthorityId; NumBackers],
    /// Anyone to whome we think no-showed, even only briefly.
    noshows: HashSet<AuthorityId>,
    /// Anyone who sent us chunks for this candidate
    downloaded_from: HashMap<AuthorityId,u16>,    
    /// Anyone to whome we sent chunks for this candidate
    uploaded_to: HashMap<AuthorityId,u16>,
}
```
We no longer require this data during disputes.  
<!-- You could optionally track a `downloaded_one: Option<AuthorityBitField>` too, for the nodes from whome we douwnloaded only one chunk, but this seems like premature optimization -->

After we approve a relay chain block, then we collect all its `CandidateRewards` into an `ApprovalsTally`, with one `ApprovalTallyLine` for each validator.  In this, we compute `approval_usages` from the final run of the approvals loop, plus `0.8` for each backer.

We say a validator 𝑢 uses an approval vote by a validator 𝑣 on a candidate 𝑐 if the approval assignments loop by 𝑢 counted the vote by 𝑣 towards approving the candidate 𝑐.
```
/// Our subjective record of what we used from, and provided to, all other validators on the finalized chain
pub struct ApprovalsTally(Vec<ApprovalTallyLine>);

/// Our subjective record of what we used from, and provided to, all one other validators on the finalized chain
pub struct ApprovalTallyLine {
    /// Approvals by this validator which our approvals gadget used in marking candidates approved.
    approval_usages: u32,
    /// How many times we think this validator no-showed, even only briefly.
    noshows: u32
    /// Availability chunks we downloaded from this validator for our approval checks we used.
    used_downloads: u32,
    /// Availability chunks we uploaded to this validator which whose approval checks we used.
    used_uploads: u32,
}
```
At finality we sum these `ApprovalsTally` for one for the whole epoch so far, into another `ApprovalsTally`.  We can optionally sum them earlier at chain heads, but this requires mutablity.

### Messages

After the epoch is finalized, we share the first three field of each `ApprovalTallyLine` in its `ApprovalTally`.
```
/// Our subjective record of what we used from some other validator on the finalized chain
pub struct ApprovalTallyMessageLine {
    /// Approvals by this validator which our approvals gadget used in marking candidates approved.
    approval_usages: u32,
    /// How many times we think this validator no-showed, even only briefly.
    noshows: u32
    /// Availability chunks we downloaded from this validator for our approval checks we used.
    used_downloads: u32,
}

/// Our subjective record of what we used from all other validators on the finalized chain
pub struct ApprovalsTallyMessage(Vec<ApprovalTallyMessageLine>);
```

Actual `ApprovalsTallyMessage`s sent over the wire must be signed of course, likely by the grandpa ed25519 key.


### Rewards computation

We compute the approvals rewards for each validator by taking the median of the `approval_usages` fields for each validator across all validators `ApprovalsTallyMessage`s.  We compute some `noshows_percentiles` for each validator similarly, but using a 2/3 precentile instead of the median.
```
let mut approval_usages_medians = Vec::new(); 
let mut noshows_percentiles = = Vec::new(); 
for i in 0..num_validators {
    let mut v: Vec<u32> = approvals_tally_messages.iter().map(|atm| atm.0[i].approval_usages);
    v.sort();
    approval_usages_medians.push(v[num_validators/2]);
    let mut v: Vec<u32> = approvals_tally_messages.iter().map(|atm| atm.0[i].noshows);
    v.sort();
    noshows_percentiles.push(v[num_validators/3]); 
}
```
Assuming more than 50% honersty, these median tell us how many approval votes form each validator. 

We re-weight the `used_downloads` from the `i`th validator by their median times their expected `f+1` chunks and divided by how many chunks downloads they claimed, and sum them 
```
#[cfg(offchain)]
let mut my_missing_uploads = my_approvals_tally.iter().map(|l| l.used_uploads).collect();
let mut reweighted_total_used_downloads = vec[0u64; num_validators];
for (mmu,atm) in my_missing_uploads.iter_mut().zip(approvals_tally_messages) {
    let d = atm.0.iter().map(|l| l.used_downloads).sum();
    for i in 0..num_validators {
        let atm_from_i = approval_usages_medians[i] * (f+1) / d;
        #[cfg(offchain)]
        if i == me { mmu -= atm_from_i };
        reweighted_total_used_downloads[i] += atm_from_i;
    }
}
```
We distribute rewards on-chain using `approval_usages_medians` and `reweighted_total_used_downloads`.  Approval checkers could later change from who they download chunks using `my_missing_uploads`.

We deduct small amount of rewards using `noshows_medians` too, likely 1% of the rewards for an approval, but excuse some small number of noshows, ala `noshows_medians[i].saturating_sub(MAX_NO_PENALTY_NOSHOWS)`.

### Strategies

In theory, validators could adopt whatever strategy they like to penalize validators who stiff them on availability redistribution rewards, except they should not stiff back, only choose other availability providers.  We discuss one good strategy below, but initially this could go unimplemented. 

### Concensus

We avoid placing rewards logic on the relay chain now, so we must either collect the signed `ApprovalsTallyMessage`s and do the above computations somewhere sufficently trusted, like a parachain, or via some distributed protocol with its own assumptions.

#### In-core

A dedicated rewards parachain could easily collect the `ApprovalsTallyMessage`s and do the above computations.  In this, we logically have two phases, first we build the on-chain Merkle tree `M` of `ApprovalsTallyMessage`s, and second we process those into the rewards data.

Any in-core approach risks enough malicious collators biasing the rewards by censoring the `ApprovalsTallyMessage`s messages for some validators during the first phase.  After this first phase completes, our second phase proceeds deterministically.

As an option, each validator could handle this second phase itself by creating single heavy transaction with `n` state accesses in this Merkle tree `M`, and this transaction sends the era points.

A remark for future developments..

JAM-like non/sub-parachain accumulation could mitigate the risk of the rewards parachain being captured.

JAM services all have either parachain accumulation or else non/sub-parachain accumulation.
- A parachain should mean any service that tracks mutable state roots onto the relay chain, with its accumulation updating the state roots.  Inherently, these state roots create some capture risk for the parachain, although how much depends upon numerous other factors.
- A non/sub-parachain means the service does not maintain state like a blockchain does, but could use some tiny state within the relay chain.  Although seemingly less powerful than parachains, these non/sub-parachain accumulations could reduce the capture risk so that any validator could create a block for the service, without knowing any existing state.

In our case, each `ApprovalsTallyMessage` would become a block for the first phase rewards service, so then the accumulation tracks an MMR of the rewards service block hashes, which becomes `M` from Option 1.  At 1024 validators this requires `9 * 32 = 288` bytes for the MMR and `1024/8 = 128` bytes for a bitfield, so 416 bytes of relay chain state in total.  Any validator could then add their `ApprovalsTallyMessage` in any order, but only one per relay chain block, so the submission timeframe should be long enough to prevent censorship.

Arguably after JAM, we should migrate critical functions to non/sub-parachain aka JAM services without mutable state, so this covers validator elections, DKGs, and rewards.  Yet, non/sub-parachains cannot eliminate all censorship risks, so the near term benefits seem questionable.

#### Off-core

All validators could collect `ApprovalsTallyMessage`s and independently compute rewards off-core.  At that point, all validators have opinions about all other validators rewards, but even among honest validators these opinions could differ if some lack some `ApprovalsTallyMessage`s.  

We'd have the same in-core computation problem if we perform statistics like medians upon these opinions. We could however take an optimistic approach where each validator computes medians like above, but then shares their hash of the final rewards list.  If 2/3rds voted for the same hash, then we distribute rewards as above.  If not, then we distribute no rewards until governance selects the correct hash.

We never validate in-core the signatures on `ApprovalsTallyMessage`s or the computation, so this approach permits more direct cheating by malicious 2/3rd majority, but if that occurs then we've broken our security assumptions anyways.  It's likely these hashes do diverge during some network disruptions though, which increases our "drama" factor considerably, which maybe unacceptable.


## Explanation

### Backing

Polkadot's efficency creates subtle liveness concerns:  Anytime one node cannot perform one of its approval checks then Polkadot loses in expectation 3.25 approval checks, or 0.10833 parablocks.  This makes back pressure essential.

We cannot throttle approval checks securely either, so reactive off-chain back pressure only makes sense during or before the backing phase.  In other words, if nodes feel overworked themselves, or perhaps beleive others to be, then they should drop backing checks, never approval checks.  It follows backing work must be rewarded less well and less reliably than approvals, as otherwise validators could benefit from behavior that harms the network.

We propose that one backing statement be rewarded at 80% of one approval statement, so backers earn only 80% of what approval checkers earn.  We omit rewards for availability distribution, so backers spend more on bandwidth too.  Approval checkers always fetch chunks first from backers though, so good backers earn roughly 7% there, meaning backing checks earn roughly 13% less than approval checks.  We should lower this 80% if we ever increase availability redistribution rewards.

Although imperfect, we believe this simplifies implementation, and provides robustness against mistakes elsewhere, including by governance mistakes, but incurs minimal risk.  In principle, backer might not distribute systemic chunks, but approval checkers fetch systemic chunks from backers first anyways, so likely this yields negligable gains.

As always we require that backers' rewards covers their operational costs plus some profit, but approval checks must be more profitable.


### Approvals

In polkadot, all validators run an approval assignment loop for each candidate, in which the validator listens to other approval checkers assignments and approval statements/votes, with which it marks checkers no-show or done, and marks candidates approved.  Also, this loop determines and announces validators' own approval checker assignments.

Any validator should always conclude whatever approval checks it begins, but our approval assignment loop ignore some approval checks, either because they were announced too soon or because an earlier no-show delivered its approval vote before the final approval.  We say a validator $u$ *uses* an approval vote by a validator $v$ on a candidate $c$ if the approval assignments loop by $u$ counted the vote by $v$ towards approving the candidate $c$.  We should not rewards votes announced too soon, so we unavoidably omit rewards for some honest no-show replacements too.  We expect the 80% discount for backing covers these losses, so approval checks remain more profitable than backing.

We propose a simple approximate solution based upon computing medians across validators for used votes.

0. In an epoch $e$, each validator $u$ counts of the number $\alpha_{u,v}$ of votes they *used* from each validator $v$, including themselves.  Any time a validator marks a candidate approved, they increment these counts appropriately. 

1. After epoch $e$'s last block gets finalized, all validators of epoch $e$ submit an _approvals tally message_ `ApprovalsTallyMessage` that reveals their number $\alpha_{u,v}$ of useful approvals they saw from each validator $v$ on candidates that became available in epoch $n$.  We do not send $\alpha_{u,u}$ for tit-for-tat reasons discussed below, not for bias concerns.  We record these approvals tally messages on-chain.

2. After some delay, we compute on-chain the median $\alpha_v := \textrm{median} \{ \alpha_{u,v} : u \}$ used approvals statements for each validator $v$. 

As discussed in https://hackmd.io/@rgbPIkIdTwSICPuAq67Jbw/S1fHcvXSF we could compute these medians using the [on-line algorithm](https://www.quora.com/Is-there-an-online-algorithm-to-calculate-the-median-of-a-stream-of-numbers-if-stream-elements-can-be-added-or-removed-at-any-point?share=1) if substrate had a nice priority queue.

We never achieve true consensus on approval checkers and their approval votes.  Yet, our approval assignment loop gives a rough concensus, under our Byzantine assumption and some synchrony assumption.  It then follows that miss-reporting by malicious validators should not appreciably alter the median $\alpha_v$ and hence rewards.  

We never tally used approval assignments to candidate equivocations or other forks.  Any validator should always conclude whatever approval checks it begins, even on other forks, but we expect relay chain equivocations should be vanishingly rare, and sassafras should make forks uncommon.

We account for noshows similarly, and deduce a much smaller amount of rewards, but require a 2/3 precentile level, not kjust a median.

### Availability redistribution

As approval checkers could easily perform useless checks, we shall reward availability providers for the availability chunks they provide that resulted in useful approval checks.  We enforce honesty using a tit-for-tat mechanism because chunk transfers are inherently subjective.

An approval checker reconstructs the full parachain block by downloading distinct $f+1$ chunks from other validators, where at most $f$ validators are byzantine, out of the $n \ge 3 f + 1$ total validators.  In downloading chunks, validators prefer the $f+1$ systemic chunks over the non-systemic chunks, and prefer fetching from validators who already voted valid, like backing checkers.  It follows some validators should recieve credit for more than one chunk per candidate.  

We expect a validator $v$ has actually performed more approval checks $\omega_v$ than the median $\alpha_v$ for which they actually received credit.  In fact, approval checkers even ignore some of their own approval checks, meaning $\alpha_{v,v} \le \omega_v$ too.

Alongside approvals count for epoch $e$, approval checker $v$ computes the counts $\beta_{u,v}$ of the number of chunks they downloaded from each availability provider $u$, excluding themselves, for which they percieve the approval check turned out useful, meaning their own approval counts in $\alpha_{v,v}$.  Approval checkers publish $\beta_{u,v}$ alongside $\alpha_{u,v}$ in the approvals tally message `ApprovalsTallyMessage`.  We originally proposed include the self availability usage $\beta_{v,v}$ here, but this should not matter, and excluding simplifies the code.

Symmetrically, availability provider $u$ computes the counts $\gamma_{u,v}$ of the number of chunks they uploaded to each approval checker $v$, again including themselves, again for which they percieve the approval check turned out useful.  Availability provider $u$ never reveal its $\gamma_{u,v}$ however.

At this point, $\alpha_v$, $\alpha_{v,v}$, and $\alpha_{u,v}$ all potentially differ.  We established consensus upon $\alpha_v$ above however, with which we avoid approval checkers printing unearned availability provider rewards:

After receiving "all" pairs $(\alpha_{u,v},\beta_{u,v})$, validator $w$ re-weights the $\beta_{u,v}$ and their own $\gamma_{w,v}$.
$$
\begin{aligned}
\beta\prime_{w,v} &= {(f+1) \alpha_v \over \sum_u \beta_{u,v}} \beta_{w,v} \\
\gamma\prime_{w,v} &= {(f+1) \alpha_w \over \sum_v \gamma_{w,v}} \gamma_{w,v} \\
\end{aligned}
$$
At this point, we compute $\beta\prime_w = \sum_v \beta\prime_{w,v}$ on-chain for each $w$ and reward $w$ proportionally.


### Tit-for-tat

We employ a tit-for-tat strategy to punish validators who lie about from whome they obtain availability chunks.  We only alter validators future choices in from whom they obtain availability chunks, and never punish by lying ourselves, so nothing here breaks polkadot, but not having roughly this strategy enables cheating.  

An availability provider $w$ defines $\delta\prime_{w,v} := \gamma\prime_{w,v} - \beta\prime_{w,v}$ to be the re-weighted number of chunks by which $v$ *stiffed* $w$.  Now $w$ increments their cumulative stiffing perception $\eta_{w,v}$ from $v$ by the value $\delta\prime_{w,v}$, so $\eta_{w,v} \mathrel{+}= \delta\prime_{w,v}$

In future, anytime $w$ seeks chunks in reconstruction $w$ *skips* $v$ proportional to $\eta_{w,v} / \sum_u \eta_{w,u}$, with each skip reducing $\eta_{w,u}$ by 1.  We expect honest accedental availability stiffs have only small $\delta\prime_{w,v}$, so they clear out quickly, but intentional skips add up more quickly.  

We keep $\gamma_{w,v}$ and $\alpha_{u,u}$ secret so that approval checkers cannot really know others stiffing perceptions, although $\alpha_{u,v}$ leaks some relevant information.  We expect this secrecy keeps skips secret and thus prevents the tit-for-tat escalating beyond one round, which hopefully creates a desirable Nash equilibrium.  

We favor skiping systematic chunks to reduce reconstructon costs, so we face costs when skipping them.  We could however fetch systematic chunks from availability providers as well as backers, or even other approval checkers, so this might not become problematic in practice.


## Concerns: Drawbacks, Testing, Security, and Privacy

We do not pay backers individually for availability distribution per se.  We could only do so by including this information into the availability bitfields, which complicates on-chain computation.  Also, if one of the two backers does not distribute then the availability core should remain occupied longer, meaning the lazy backer loses some rewards too.  It's likely future protocol improbvements change this, so we should monitor for lazy backers outside the rewards system.  

We discuss approvals being considered by the tit-for-tat in earlier drafts.  An adversary who successfuly manipulates the rewards median votes would've alraedy violated polkadot's security assumptions though, which requires a hard fork and correcting the dot allocation.  Incorrect report wrong `approval_usages` remain interesting statistics though. 

Adversarial validators could manipulates their availability votes though, even without being a supermajority.  If they still download honestly, then this costs them more rewards than they earn.  We do not prevent validators from preferentially obtaining their pieces from their friends though.  We should analyze, or at least observe, the long-term consequences. 

A priori, whale nominator's validators could stiff validators but then rotate their validators quickly enough so that they never suffered being skipped back.  We discuss several possible solution, and their difficulties, under "Rob's nominator-wise skipping" in https://hackmd.io/@rgbPIkIdTwSICPuAq67Jbw/S1fHcvXSF but overall less seems like more here.  Also frequent validator rotation could be penalized elsewhere.


## Performance, Ergonomics, and Compatibility

<!-- ### Performance -->

We operate off-chain except for final rewards votes and median tallies.  We expect lower overhead rewards protocols would lack information, thereby admitting easier cheating.

Initially, we designed the ELVES approval gadget to allow on-chain operation, in part for rewards computation, but doing so looks expensive. Also, on-chain rewards computaiton remains only an approximation too, but could even be biased more easily than our off-chain protocol presented here.

<!--  ### Ergonomics  -->

We alraedy teach validators about missed parachain blocks, but we'll teach approval checking more going forwards, because current efforts focus more upon backing.

<!--  ### Compatibility  -->

JAM's block exports should not complicate availability rewards, but could impact some alternative schemes. 


## Prior Art and References

None

## Unresolved Questions

Provide specific questions to discuss and address before the RFC is voted on by the Fellowship. This should include, for example, alternatives to aspects of the proposed design where the appropriate trade-off to make is unclear.

## Future Directions and Related Material


### Synthetic parachain flag

Any rewards protocol could simply be "out voted" by too many slow validators:  An increase the number of parachain cores increases more workload, but this creates no-shows if too few validators could handle this workload.

We could add a synthetic parachain flag, only settable by governance, which treats no-shows as positive approval votes for that parachain, but without adding rewards.   We should never enable this for real parachains, only for synthetic ones like gluttons.  We should not enable the synthetic parachain flag long-term even for gluttonsm, because validators could easily modify their code.  Yet, synthetic approval checks might enable pushing the hardware upgrades more agressively over the short-term. 

