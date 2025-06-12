# RFC-0073: Decision Deposit Referendum Track

|                 |                                                                                |
| --------------- |--------------------------------------------------------------------------------|
| **Start Date**  | 12 February 2024                                                               |
| **Description** | Add a referendum track which can place the decision deposit on any other track |
| **Authors**     | JelliedOwl                                                                     |

## Summary

The current size of the decision deposit on some tracks is too high for many proposers. As a result, those needing to use it have to find someone else willing to put up the deposit for them - and a number of legitimate attempts to use the root track have timed out. This track would provide a more affordable (though slower) route for these holders to use the root track.

## Motivation

There have been recent attempts to use the Kusama root track which have timed out with no decision deposit placed. Usually, these referenda have been related to parachain registration related issues. 

## Explanation

Propose to address this by adding a new referendum track ***[22] Referendum Deposit*** which can place the decision deposit on another referendum. This would require the following changes:
- [Referenda Pallet] Modify the `placeDecisionDesposit` function to additionally allow it to be called by root, with root call bypassing the requirements for a deposit payment.
- [Runtime] Add a new referendum track which can only call `referenda->placeDecisionDeposit` and the utility functions.

### Referendum track parameters - Polkadot

- **Decision deposit**: 1000 DOT
- **Decision period**: 14 days
- **Confirmation period**: 12 hours
- **Enactment period**: 2 hour
- **Approval & Support curves**: As per the root track, timed to match the decision period
- **Maximum deciding**: 10

### Referendum track parameters - Kusama

- **Decision deposit**: 33.333333 KSM
- **Decision period**: 7 days
- **Confirmation period**: 6 hours
- **Enactment period**: 1 hour
- **Approval & Support curves**: As per the root track, timed to match the decision period
- **Maximum deciding**: 10

## Drawbacks

This track would provide a route to starting a root referendum with a much-reduced slashable deposit. This might be undesirable but, assuming the decision deposit cost for this track is still high enough, slashing would still act as a disincentive.

An alternative to this might be to reduce the decision deposit size some of the more expensive tracks. However, part of the purpose of the high deposit - at least on the root track - is to prevent spamming the limited queue with junk referenda.

## Testing, Security, and Privacy

Will need additional tests case for the modified pallet and runtime. No security or privacy issues.

## Performance, Ergonomics, and Compatibility
### Performance

No significant performance impact.

### Ergonomics

Only changes related to adding the track. Existing functionality is unchanged.

### Compatibility

No compatibility issues.

## Prior Art and References

- Recent discussion / referendum for an alternative way to address this issue: [Kusama Referendum 340 - Funding a Decision Deposit Sponsor](https://kusama.polkassembly.io/referenda/340)

## Unresolved Questions

Feedback on whether my proposed implementation of this is the best way to address the issue - including which calls the track should be allowed to make. Are the track parameters correct or should be use something different? Alternative would be welcome.
