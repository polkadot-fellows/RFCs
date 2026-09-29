# RFC-0104: Stale Nomination Reward Curve

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 10 July 2024                                                            |
| **Description** | Introduce a decaying reward curve for stale nominations in staking.     |
| **Authors**     | Shawn Tabrizi                                                           |

## Summary

This is a proposal to reduce the impact of stale nominations in the Polkadot staking system. With this proposal, nominators are incentivized to update or renew their selected validators once per time period. Nominators that do not update or renew their selected validators would be considered stale, and a decaying multiplier would be applied to their nominations, reducing the weight of their nomination and rewards.

## Motivation

One of Polkadot's primary utilities is providing a high quality security layer for applications built on top of it. To achieve this, Polkadot runs a Nominated Proof-of-Stake (NPoS) system, allowing nominators to vote on who they think are the best validators for Polkadot.

This system functions best when nominators and validators are active participants in the network. Nominators should consistently evaluate the quality and preferences of validators, and adjust their nominations accordingly.

Unfortunately, many Polkadot nominators do not play an active role in the NPoS system. For many, they set their nominations once, and then seldom look back at them.

This can lead to many negative behaviors:

- Incumbents who received early nominations effectively achieve tenure, regardless of ongoing performance.
- Validator quality and performance can decrease without recourse, since the votes that elected them remain in place even if the original nominators no longer endorse the validator's behavior.
- The active validator set drifts away from being optimal for Polkadot.
- New validators have a much harder time entering the active set, since they must compete against accumulated, unmaintained stake from years past.
- Validators are able to "sneakily" increase their commission once they have a stable nomination base, knowing that most of their nominators will not react.

The proposal aims to address these problems by tying nomination influence to nominator engagement: a nomination represents an _ongoing_ choice, not a one-time action.

## Stakeholders

Primary stakeholders are:

- **Nominators**: Directly affected. Active nominators are unaffected; passive nominators see reduced influence and rewards over time.
- **Validators**: Indirectly affected. Validators who maintain quality and reasonable commission retain support; those that coast on stale stake lose ground and may eventually drop out of the active set.
- **Nomination pools and pool members**: Pools nominate on behalf of their members, so the freshness counter applies at the pool level. Pool operators must keep nominations refreshed; pool members are exposed to the pool's freshness through their share of pool rewards.
- **Wallet, dashboard, and staking UI developers**: Will need to surface staleness information to users and provide a clear path for re-nominating.

## Explanation

### Overview

Each nomination has an associated _freshness_, defined as the number of eras since the nominator last submitted a `nominate` extrinsic. A configurable, monotonically non-increasing function `f(staleness) ∈ [Floor, 1]` produces a multiplier that is applied to the nominator's effective stake when the election snapshot is taken.

The multiplier is applied **only at the election input stage**, by scaling the nominator's `voter_weight`. All downstream behavior is unchanged: validator selection by Phragmen/PJR, the per-validator stake snapshot, and the per-nominator reward share computed from that snapshot.

A stale nominator therefore contributes a smaller share of a validator's total backing, takes a proportionally smaller share of that validator's era reward, and the remainder flows to the validator's other (non-stale) nominators. No reward is burned, no logic is added to the reward path, and no change is made to inflation or the reward curve.

### Behavior in the Election

The runtime exposes the per-nomination `submitted_in` field (the era in which the nominator most recently called `nominate`). When the election snapshot is taken, each voter's weight is computed as:

```
effective_weight = bonded_balance × f(current_era - submitted_in)
```

Voters whose `effective_weight` evaluates to zero are excluded from the snapshot entirely (matching the existing behavior for voters with zero active balance).

This has the following emergent properties:

- A validator backed entirely by stale nominators will see its total backing collapse to its own self-bond. Unless that self-bond is large enough to compete on its own merit, the validator falls out of the active set. **Stale-only validators get evicted automatically; no separate mechanism is required.**
- A validator backed by a mix of fresh and stale nominators retains its fresh nominators' full weight, and the stale ones contribute proportionally less. The validator may still be elected, but with smaller backing.
- A new or improving validator competes against fresh stake, not against a calcified historical vote.

#### Voter Iteration Order (`VoterList` / bags-list)

The staleness multiplier is applied to the value emitted into the snapshot, **not** to the score by which the `VoterList` (typically `pallet-bags-list`) orders voters. The bags-list continues to rank voters by their bonded weight, and stale voters are not re-bagged when they cross a staleness threshold.

The consequence: a heavily-stale voter still occupies the position in iteration order that their bonded balance entitles them to, even though the value they contribute to the snapshot is reduced or zero. In edge cases where the snapshot is bounded by voter count and that bound is binding, a stale voter could in principle take a snapshot slot that a fresher, lower-bonded voter further down the list would have made better use of.

This is an accepted tradeoff. The alternatives are re-bagging voters as they age across thresholds, or using an alternative `VoterList` keyed on staleness-adjusted weight. Both would impose per-era maintenance work on every nominator near a threshold, for a benefit that materializes only when the voter-count bound is the binding constraint. Voter-count bounds are rarely binding in practice, and runtimes that find this assumption no longer holds may revisit by supplying a custom `VoterList`.

### The Decay Curve

The curve is supplied by the runtime via a configurable trait:

```rust
/// Computes the multiplier applied to a nominator's voter weight, given the
/// number of eras since that nominator last (re)affirmed their nomination.
pub trait NominationStalenessCurve {
    fn multiplier(eras_since_last_nomination: EraIndex) -> Perbill;
}
```

A default piecewise-linear implementation, parameterized by three constants, is provided:

```rust
pub struct LinearStalenessCurve<GracePeriod, DecayPeriod, Floor>(...);
```

| Parameter | Meaning | Default |
|-----------|---------|---------|
| `GracePeriod` | Eras after a `nominate` call during which the multiplier is exactly `1`. | `28` eras (≈ 1 month) |
| `DecayPeriod` | Eras over which the multiplier decays linearly from `1` to `Floor`, immediately following the grace period. | `140` eras (≈ 5 months) |
| `Floor` | Lower bound on the multiplier. | `Perbill::zero()` |

With these defaults, a nomination is at full weight for one month, decays linearly over the following five months, and is fully decayed at six months total. A nominator who calls `nominate` at least once a month never experiences any reduction.

The piecewise-linear formula:

```
f(s) = 1                                                if s ≤ GracePeriod
f(s) = 1 - (s - GracePeriod) / DecayPeriod × (1 - Floor)   if GracePeriod < s < GracePeriod + DecayPeriod
f(s) = Floor                                            if s ≥ GracePeriod + DecayPeriod
```

The trait shape lets a runtime swap in any other curve (exponential, stepped, tighter or looser parameters) without further changes to the staking pallet.

### What Resets the Counter

Only a successful call to the `nominate(targets)` extrinsic resets `submitted_in` to the current era. This includes calls that re-submit the same target list, by design: re-submission is the explicit, intentional act of re-affirming a choice.

The following do **not** reset the counter:

- `bond_extra`, `unbond`, `withdraw_unbonded`, `payout_stakers`, and other staking calls that do not change validator selection.
- Any indirect activity such as receiving rewards or being slashed.

`chill` is a special case: it removes the nominator's entry from `Nominators` storage entirely. There is no `submitted_in` to update because there is no nomination. When the nominator returns, they must call `nominate` to re-enter the active set, which sets `submitted_in` to the current era. This is a fresh start, aligned with the goal of making nominators reconsider their validator selection at every transition.

There is intentionally no separate "renew" extrinsic. The act of staying engaged is the act of selecting validators; if a nominator wants to keep their existing list, they call `nominate` with that list. Adding a cheap renew path would let a nominator refresh without the friction of reviewing their selection. That friction is exactly what the RFC is trying to introduce.

### Interaction with Nomination Pools

Nomination pools call `nominate` from the pool's bonded account, so the pool's `submitted_in` is what governs the curve. The freshness counter applies to the pool's nomination as a whole, not to individual members.

Pool members are exposed to the pool's freshness through reduced pool rewards: as the pool's nomination decays, the pool's validators receive less effective backing, the pool earns a smaller share of those validators' rewards, and members' returns drop accordingly. This places the responsibility for staying fresh on the pool operator, which matches the existing division of responsibility in pools.

### Reward Treatment

Rewards are not burned and are not redirected to the Treasury. The decay multiplier is applied to election input weight only; reward distribution downstream is unchanged.

A natural consequence of this is that a stale nominator's "lost" share of a validator's reward flows to that validator's non-stale co-nominators. This is intentional and a feature of the design:

- It keeps the implementation surgical: one site of change in election input, no reward-path changes.
- It preserves the protocol-level invariant that era inflation is fully distributed to active stake.
- It rewards active nominators of well-attended validators, reinforcing the desired behavior.

### Migration

On the upgrade in which this proposal takes effect, all existing nominators have their `submitted_in` set to the era of the upgrade. Every existing nominator therefore enters the new regime with a full grace period to act.

This deliberately trades a one-cycle delay in evicting long-stale stake for a much gentler user-experience transition: no nominator is surprised by an immediate reward cut at the upgrade.

### Secondary Effect: Recurring Ecosystem Engagement

A side benefit of requiring periodic re-nomination is that nominators are brought back into contact with Polkadot's user-facing surface on a regular cadence. Under the proposed defaults, that cadence is roughly once per month. Each visit is an opportunity for staking UIs and the broader ecosystem to surface new applications, features, governance referenda, and other developments to a financially-engaged audience with clear incentive to show up.

This is not a primary motivation for the RFC, and the curve parameters should not be tuned for engagement metrics. But it is a real upside of the chosen mechanism: stakers who have to re-engage in order to keep getting paid are stakers who are reachable.

## Drawbacks

- **User experience**: Nominators must take a periodic action to maintain full influence and rewards. Users who forget, lose access for an extended period, or are simply unaware of the change will see their influence and rewards decay. The grace period is intended to be long enough that ordinary engaged users are not affected, but the new burden is real.
- **Asymmetric impact on long-term holders**: Set-and-forget stake (including stake from estates, lost keys, or otherwise dormant accounts) will decay to the floor. This reduces those participants' weight in validator selection, which is the intent, but worth flagging explicitly.
- **Custodial and institutional flows**: Custodians staking on behalf of clients will need to integrate periodic re-nomination into their operations.
- **Lost rewards are not directly recoverable**: A nominator whose weight decayed during an era cannot retroactively reclaim the rewards they would have earned had they been fresh. The RFC accepts this as the cost of the incentive.

## Testing, Security, and Privacy

### Testing

The decay function is pure and trivially testable. Integration tests should cover:

- The freshness counter resetting on `nominate`, including same-target re-submission.
- The freshness counter **not** resetting on `bond_extra`, `unbond`, `withdraw_unbonded`, `chill`, or `payout_stakers`.
- The election snapshot correctly applying the multiplier to voter weight, including the boundary cases at `s = GracePeriod` and `s = GracePeriod + DecayPeriod`.
- Voters whose effective weight evaluates to zero being excluded from the snapshot.
- A validator backed only by fully-decayed nominators failing to be elected (assuming insufficient self-bond).
- Pool nominations: pool's `submitted_in` governs the curve; member-level actions do not refresh the pool.
- Migration: existing nominators have `submitted_in` set to the upgrade era, and have a full grace period afterwards.

### Security

- **No new attack surface in the election solver.** The reduction in input stake does not change the structure of the optimization problem; the solver receives smaller weights for some voters and proceeds as before.
- **Slashing.** Staleness does not interact with slashing. A stale nominator is still slashed in full if their elected validator misbehaves; reducing slashing based on staleness would perversely reward inattention.
- **Griefing.** No third party can cause a nominator's freshness to decay; only the passage of time without action by the nominator themselves can do so.
- **Self-bond floor.** Validators with significant self-bond are not directly affected, only the nominators backing them. This is consistent with the broader NPoS design.

### Privacy

No change. `submitted_in` is already on-chain and observable.

## Performance, Ergonomics, and Compatibility

### Performance

The change adds:

- One additional read of `submitted_in` from each `Nominations` entry already iterated during snapshot construction (at no marginal storage cost; the field already exists).
- One arithmetic evaluation of the curve per voter per era.

Both are trivial relative to existing election work. No new storage items are introduced.

### Ergonomics

- **For active nominators**: no change in interface. If their existing engagement cadence is faster than the grace period, no behavioral change.
- **For passive nominators**: gradually reduced rewards and influence until they re-nominate, with a one-month grace period and five-month linear ramp before reaching the floor (under the proposed defaults).
- **For UI developers**: one new derived value to surface ("nomination freshness" or equivalent). All inputs are already on-chain.

### Compatibility

This is a runtime upgrade affecting staking economics. It does not change any external interface in a breaking way. Existing extrinsics continue to work with the same signatures. The migration sets `submitted_in` for all existing nominators to the upgrade era; no other migration is required.

## Prior Art and References

- [Polkadot Wiki: Nominated Proof-of-Stake](https://wiki.polkadot.network/docs/learn-staking)
- Prototype implementation: [`shawntabrizi-stale-nominations`](https://github.com/paritytech/polkadot-sdk/tree/shawntabrizi-stale-nominations) branch of `polkadot-sdk`, modifying `frame/staking/src/pallet/impls.rs` at the election snapshot site.

## Unresolved Questions

- **Default curve parameters.** A `GracePeriod` of 28 eras and `DecayPeriod` of 140 eras (one month plus five months) is proposed. Different values are reasonable. The trait-based design leaves the curve fully configurable; the question is what default values to ship.
- **Floor.** Proposed at zero. A non-zero floor (e.g. 25%) would soften the impact on long-term inactive holders at the cost of a less complete fix. The trait permits either choice without code changes elsewhere.

## Future Directions and Related Material

- **Validator-side staleness.** This RFC applies the staleness mechanism only to nominators. Validators' `validate(prefs)` registrations are not changed and continue to persist indefinitely, as today. A parallel mechanism (requiring validators to periodically re-call `validate` to remain in the candidate pool) would address dormant or abandoned validator entries, and is a plausible follow-up, but is explicitly **not** included in this RFC and should be proposed as its own RFC.
- **Differentiated curves.** The trait shape permits different curves for different contexts (e.g. a longer grace period for nomination pools, a steeper curve for solo nominators), should that prove useful.
- **Nominator reputation and analytics.** With per-nominator freshness now load-bearing, downstream tooling can surface "stewardship" metrics for nominators and pools.
