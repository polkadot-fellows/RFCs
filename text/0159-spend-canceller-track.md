# RFC-0000: Spend Canceller Track

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 17 December 2025                                                                            |
| **Description** | Introduce a new OpenGov track for cancelling scheduled treasury spends with a maximum 21-day timeline |
| **Authors**     | Tommi Enenkel                                                                               |

## Summary

This RFC proposes a new OpenGov track called Spend Canceller (Track ID 22) that provides a dedicated, expedited governance pathway for cancelling scheduled treasury spends via `treasury.void_spend()`. The current mechanism requires using the Treasurer track, which takes approximately 36 days due to its conservative parameters designed for approving large expenditures. This proposal introduces a track with a maximum 21-day timeline, enabling the network to respond more swiftly to problematic or erroneous spend approvals while maintaining appropriate governance safeguards.
The proposed track features a 10,000 DOT decision deposit, curves calibrated so that 10% support enables passage within 1 day, and at the end of the decision period, a simple 50% approval majority with 0% minimum support is sufficient for passage.

## Motivation

Polkadot's treasury pallet supports time-based ("milestone-based") spends through the `spend()` extrinsic, which accepts an optional `valid_from` parameter to schedule disbursements for future block heights. This mechanism enables staged funding proposals where tranches are released incrementally. This feature is used to present "milestone-based" proposals which are paid out at specified times with the assumption that milestones will be reached by that point in time or cancelled through governance.

Currently, the simplest path to cancel a spend is by using the Treasurer track, which has a decision period of 28 days and confirmation period of 7 days with a linear support treshold curve of 50% to 0%. Under current conditions, this makes it likely that cancellations will conclude not earlier than 4 weeks after submission and can take up to 5 weeks.

This configuration is impractical to use in situations where monthly milestones are being paid out. If the governance community identifies issues with an approved spend, such as project abandonment, scope changes, bad delivery quality, abuse of funds, or incorrect parameters, cancellations might take too long to prevent the next spend.

A better solution would be to introduce a pathway for cancellations that can conclude within 15 days. This RFC proposes to introduce a new track called `Spend Canceller`

## Stakeholders

- DOT token holders: Will vote on referenda to spend or void spends. Want to retain value at the Treasury and only see it spent when the spend creates value.
- Governance agents: Need to coordinate responses to non-delivering spends by preparing cancellations.
- Governance explorer developers: Need to implement changes resulting from this RFC

## Explanation

The Spend Canceller track (track ID 22) introduces a new governance origin that is authorized to call `treasury.void_spend(index)`.

### Parameters
The parameters of the track are:

| Param           | Value   | Rationale |
| --------------- | ------- | ------- |
| Prepare Period  | 2 hours | Copied from Ref canceller |
| Decision Period | 14 days | Two weeks is sufficient time to come to a positive confirmation. If the governance community is uncertain it can decide negatively and a new proposal can be submitted at a later time.
| Confirm Period  | 1 day | Quick positive decision that is counterbalanced with the curves. Gives 24 hours for NAY voters to kick the ref out of confirmation.
| Min Enactment   | 1 min | Can enact immediately |
| Max Deciding | 500 | There can be a lot of concurrently scheduled spends in state |
| Decision Deposit | 1000 DOT | given that Treasurer has 1000 DOT DD, this track should not have a higher one.
| Approval Curve | Linear 100% -> 50% | reasonable
| Support Curve | Linear 10% -> 0% | 10% support is possible, and would signal sufficient stakeholder commitment to get the spend cancelled early. Linear curve is conservative, which should be acceptable given the parameters chosen as a whole.


### Affected code files

- `runtimes/system-parachains/asset-hubs/asset-hub-polkadot/`
  - `origins.rs`: We add a `SpendCanceller` origin.
  - `tracks.rs`: We add the curve constants, add the track to `TRACKS_DATA` and update `track_for()`.
- `polkadot-sdk/substrate/frame/treasury/src/lib.rs`: update `RejectOrigin` to accept our new `SpendCanceller` origin.


### Edge Cases
Edge cases with regards to spend lifecycle management should be handled by the Treasury pallet itself. No additional edge cases are currently expected.

## Drawbacks

A politically motivated agent could overabuse the track. The decision deposit parameter has been chosen to be equal to the Treasurer track decision deposit, so that the surface area for governance attacks stays equal.

## Testing, Security, and Privacy

Besides adding tests for the new track to behave as expected, no additional considerations are expected.

## Performance, Ergonomics, and Compatibility

### Performance

No performance issues are expected.

### Ergonomics

The RFC improves OpenGov ergonomics by allowing governance agents to more quickly react to misbheavior. Governance explorers and all other UIs integrating governance have to adapt their interfaces to match the new track.

### Compatibility

Existing interfaces should stay fully compatible, since this RFC only improves convenience.

## Prior Art and References

The parameters reference other OpenGov tracks to fit into the existing configuration.

## Unresolved Questions

None.

## Future Directions and Related Material

None.
