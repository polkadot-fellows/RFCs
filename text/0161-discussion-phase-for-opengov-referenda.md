# RFC-0161: Discussion Period for OpenGov Referenda

|                 |                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Start Date**  | 22 December 2025                                                                                                 |
| **Description** | Introduce a mandatory discussion period during which the preimage and origin of a referendum can be changed        |
| **Authors**     | Tommi Enenkel                                                                                                    |

## Summary

This RFC proposes a new **discussion period** for OpenGov referenda that precedes the existing prepare period. During the discussion period, the original proposer can modify the referendum's preimage and origin, enabling on-chain response to negotiation and refinement of proposals before voting outcomes become binding. Once the discussion period concludes, the referendum transitions to the prepare period (which can be skipped if decision conditions are already met) and the preimage and track become immutable.


Todo:
- which tracks how long?


## Motivation

### Problem Statement

In the current OpenGov design, once a referendum is submitted on-chain, its preimage (the proposal content) and origin cannot be changed. This creates several practical problems:

1. **Preimage Errors**: Technical errors in preimages (incorrect parameters, wrong origins, miscalculated amounts) currently require a complete resubmission rather than a simple correction.
2. **Throwaway Referenda**: Proposals that receive negative feedback early on cannot be adjusted. Instead, they must be resubmitted as new referenda, creating unnecessary on-chain clutter and fragmenting discussion over several referenda
3. **Cross-Referencing Burden**: When a proposal is resubmitted, stakeholders must cross-reference the old referendum to understand the proposal's history, which creates an unnecessary mental burden.

### Current Lifecycle

The current referendum lifecycle is:

```
Submission → Prepare → Decision → Confirmation → Enactment
```

From the Prepare period onward:
- Votes can be cast (but don't trigger approval/confirmation logic)
- The preimage and origin are locked
- The proposer cannot make changes based on community feedback

### Proposed Lifecycle

This RFC proposes adding a Discussion period before the prepare period:

```
Submission → Discussion → Prepare → Decision → Confirmation → Enactment
```

During the discussion period:
- Community feedback is gathered
- No votes can be cast yet
- A decision deposit MAY already be placed
- The proposer MAY modify the preimage and origin
  - An adjustment to the decision deposit might become neccessary (topping up or receiving a refund).
  - Changes to the discussion time might be resulting from the track change
- Once Discussion ends, the proposal is locked

### Typical Use Cases

1. **Negotiated Treasury Proposals**: A team requests 100,000 USD in stables. During discussion, the community suggests a phased approach with milestones. The proposer can adjust the preimage to reflect this without resubmitting.

2. **Preimage Value Fixes**: A wrongly calculated amount due to denomination errors can be corrected in place.

3. **Scope Refinement**: Based on community discussion, a proposal's scope can be narrowed or expanded to better reflect consensus.

4. **Origin Corrections**: A proposer accidentally submits to the wrong origin. They can correct this during discussion rather than cancelling and resubmitting.

5. **Technical Parameter Adjustments**: A proposal to change a runtime parameter receives feedback that a different value would be more appropriate. The proposer can adjust accordingly.

## Stakeholders

- **DOT Token Holders/Voters**: Lowers mental burden to follow proposals. Their participation in feedback and negotiation is directly reflected in proposals, which increases confidence in the process.

- **Proposers**: Can iterate on proposals based on feedback without the friction of resubmission. Reduces UX friction and frustration. Maintains continuity of discussion.

- **Governance Platforms** (Polkassembly, SubSquare): Need to display discussion period status, show proposal change history of preimage and track changes, 

## Explanation

All changes refer to `pallet-referenda`.

### Struct Changes

- `types.rs`
    - `TrackDetails` is extended with a new `discussion_period: Moment` field
    - `ReferendumStatus` is extended with a new `discussion_ended: Option<Moment>` field

### New Events

The `Event` enum in `lib.rs` is extended with new events:
- `ReferendumUpdated`
- `PrepareStarted`
- `DecisionDepositReduced`
- `DecisionDepositIncreased`

### New Errors

The `Error` enum in `pallet-referenda` is extended with new errors:
- `DiscussionConcluded`

### New `update_referendum()` Extrinsic

A new dispatchable function is added: `update_referendum()`

The logic follows the basic pattern of `submit()`.Track changes might require to update the decision deposit and discussion period lenght:
- Updating the decision deposit: If the decision deposit has already been placed, the difference to the new track decision deposit MUST be topped up / refunded immediately.
- Discussion period changes: Discussion period length is determined by the track. Changing the origin/track can also lead to a different discussion period length. If the new track requires a discussion period that is shorter than the time that has already passed when updating the referendum, the referendum will immediately move to the next state. Else, the period will be extended.


Given an `index`, a `proposal_origin` and a `proposal`:
- check preimage length
- get `status` by calling `ensure_ongoing()`
- if `status.discussion_ended` is set, we return an `DiscussionConcluded` error
- If the `status.proposal_origin != proposal_origin`, we determine the new `track`
  - If `status.decision_deposit != None`, and 
    - if `track.decision_deposit` is bigger than the amount in `status.decision_deposit`, the proposer pays the difference as deposit and we emit `DecisionDepositIncreased`.
    - else, the proposer will receive the difference and we emit `DecisionDepositReduced`
  - Calculate the new `discussion_end` as `status.submitted + track.discussion_period`.
    - If `now >= discussion_end`, we move to the next state.
    - Else, we set `status.alarm` to `discussion_end`.
- emit `ReferendumUpdated`

### State Machine Transitions

The modified state machine operates as follows:

#### 1. Submission
When a referendum is submitted via `submit()`:
- `alarm` is set to `now + track.discussion_period`
- if `track.discussion_period` is 0, the referendum enter the prepare period, else we advance to the next state (either by setting the state properties or by calling `service_referendum()`)


#### 2. Discussion Period → Prepare Period
When `service_referendum()` either directly or via `nudge_referendum()` after `alarm`:
- The referendum enters the prepare period
- `status.discussion_ended` is set to `now`
- Check if conditions for entering the decision period are already met:
  - decision deposit is placed
  - track has capacity
- If conditions are met: **skip prepare period entirely** and enter decision immediately, emitting `DecisionStarted`
- If not: enter in prepare period as was previously the case during `submit()` and emit `PrepareStarted`


#### 3. Prepare Period → Decision Phase
Standard transition as currently implemented.

### Votes During Discussion

No votes may be cast during the discussion phase. This is a change from the previous model and require additional changes in the pallet's logic.

### Suggested Discussion Period Values

The following durations are suggested:
- Treasurer, Treasury spend origins should be discussed 14 days
- Treasury tip origins are intended for low-risk spends on shorter cycles. We suggest 7 days
- Whitelisted Caller, Canceller and Killer tracks are time sensitive. Instant progression to the prepare stage is indicated.
- All other (technical) origins are likely invoked by competent users that followed proper off-chain preparation procedures. We give 3 days discussion time to allow corrections, as sometimes a proposal gets accidentally submitted to the wrong track.

In the `runtimes` repo, add `discussion_period` to all track configurations for the AssetHub and system chains where applicable

## Drawbacks

### State Management Complexity

Adding a new state increases the complexity of the referendum lifecycle. A review of `pallet-referenda` shows that currently state management is already non-trivial to follow. A more thorough review and refactoring of the state management might be inficated.

### Extended Timeline

Adding a discussion period extends the minimum time before a referendum can be enacted. Decision periods could be shortened by some duration up to the discussion period length to not produce unneccessary long cycles. Bringing the discussion period on-chain will lead stakeholders to consider refs earlier and allows for shorter decision periods. Technically it is still possible the proposal never goes into voting if the decision deposit is not placed, so not shortening the decision period by the full discussion period amount could be prudent.

### Deposit Complexity

Track changes may require deposit adjustments (additional deposit for higher tracks, refunds for lower tracks), adding complexity to the deposit management logic.

## Testing, Security, and Privacy

### Testing

Suggested tests:
- **Unit Tests**: Verify state transitions
- **Integration Tests**: Full lifecycle tests including discussion phase changes
- **Scenario Tests**: Track changes with deposit adjustments, preimage changes, edge cases at phase boundaries

### Security Considerations

1. **Access Control**: Only the original proposer can update proposals. This is enforced at the extrinsic level.

2. **Deposit Safety**: Track changes must properly handle deposit adjustments without allowing deposit extraction or manipulation.

3. **Alarm Handling**: When tracks change, alarms must be properly rescheduled for the new track's parameters.

### Privacy

No new privacy concerns.

## Performance, Ergonomics, and Compatibility

### Performance

New extrinsic and updated logic should have similar weight to existing operations

### Ergonomics

**Improved:**
- Proposers can iterate based on feedback
- Reduced referendum clutter from resubmissions
- Continuity of discussion history

**Potentially Degraded:**
- Longer minimum timeline to enactment
- Users will need to adapt to the new lifecycle

### Compatibility

- `TrackInfo` and `ReferendumStatus` struct gain a new field, requiring all track configurations to be updated
- **Storage Migration**: Existing referenda might need migration to add `discussion_ends: None` (already past discussion)
- **API Changes**: New extrinsics and events; existing functionality unchanged
- **Governance Platform Updates**: Required to display discussion phase properly
- **Changes to Events**: Changing the way events are emitted and the state machine operates might lead indexers that do not update in time or do not properly update to misread the state progression. This is acceptable, since the proposed changes are not too invasive, and following events to understand state is not the suggested anyways.

## Prior Art and References

### Off-Chain Discussion and Negotiation

Requiring pre-decision discussions to happen have been established criteria by several high-profile voters for years. Similarly, proposals without proper consensus were negotiated to submit updated extrinsics. This RFC moves some of that iterative process on-chain, providing a formal mechanism for proposal refinement.

## Future Directions

### Refactor State Management

State management in the pallet relies on several different properties. Some other smaller improvements that increase legibility.