# RFC-0019: Treasurer Track Confirmation Period Duration Modification

                                                                                           
|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| **Start Date**  | August 10, 2023                                                  |
| **Description** | Treasurer Track Confirmation Period Duration Modification        |
| **Authors**     |    ChaosDAO                                                     |                                                                                           

## Summary

This RFC proposes a change to the duration of the confirmation period for the treasurer track from 3 hours to at least 48 hours.

## Motivation

Track parameters for Polkadot OpenGov should be configured in a way that their "difficulty" increases relative to the power associated with their respective origin. When we look at the confirmation periods for treasury based tracks, we can see that this is clearly the case - with the one notable exception to the trend being the treasurer track:

| Track Description | Confirmation Period Duration |
|-------------------|-----------------------------|
| Small Tipper      | 10 Min                      |
| Big Tipper        | 1 Hour                      |
| Small Spender     | 12 Hours                    |
| Medium Spender    | 24 Hours                    |
| Big Spender       | 48 Hours                    |
| Treasurer         | **3 Hours**                 |

The confirmation period is one of the last lines of defence for the collective Polkadot stakeholders to react to a potentially bad referendum and vote NAY in order for its confirmation period to be aborted. 

Since the power / privilege level of the treasurer track is greater than that of the the big spender track – their confirmation period should be either equal, or the treasurer track's should be higher (note: currently the big spender track has a longer confirmation period than even the root track).
 
## Stakeholders

The primary stakeholders of this RFC are:

- DOT token holders – as this affects the protocol's treasury
- Entities wishing to submit a referendum via the treasurer track - as this affects the referendum timeline
- Projects with governance app integrations - see Performance, Ergonomics, and Compatibility section below.
- [lolmcshizz](https://twitter.com/lolmcshizz/status/1681896333349736448) - expressed interest to change this parameter
- [Leemo](https://twitter.com/LeemoXD/status/1687408369147998208) - expressed interest to change this parameter
- [Paradox](https://twitter.com/ParaNodes/status/1681963024842731520) - expressed interest to change this parameter

## Explanation

This RFC proposes to change the duration of the confirmation period for the treasurer track. In order to achieve that, the ``confirm_period`` parameter for the treasurer track in ``runtime/polkadot/src/governance/tracks.rs`` must be changed.

[Currently it is set to](https://github.com/paritytech/polkadot/blob/a1c8d720e05624d5f2ac43d89dcedd3d0d2e7342/runtime/polkadot/src/governance/tracks.rs#L119C1-L119C30) ``confirm_period: 3 * HOURS`` 

It should be changed to ``confirm_period: 48 * HOURS`` as a minimum.

It may make sense for it to be changed to a value greater than 48 hours since the treasurer track has more power than the big spender track (48 hour confirmation period); however, the root track's confirmation period is 24 hours. 48 hours may be on the upper bounds of a trade-off between security and flexibility.

## Drawbacks

The drawback of changing the treasurer track's confirmation period would be that the lifecycle of a referendum submitted on the treasurer track would ultimately be longer. However, the security of the protocol and its treasury should take priority here.

## Testing, Security, and Privacy

This change will enhance / improve the  security of the protocol as it relates to its treasury.  The confirmation period is one of the last lines of defence for the collective Polkadot stakeholders to react to a potentially bad referendum and vote NAY in order for its confirmation period to be aborted. It makes sense for the treasurer track's confirmation period duration to be either equal to, or higher than, the big spender track confirmation period.

## Performance, Ergonomics, and Compatibility

### Performance

This is a simple change (code wise) which should not affect the performance of the Polkadot protocol, outside of increasing the duration of the confirmation period on the treasurer track.

### Ergonomics & Compatibility

If the proposal alters exposed interfaces to developers or end-users, which types of usage patterns have been optimized for?

I have confirmed with the following projects that this is not a breaking change for their governance apps:
- Nova Wallet - directly uses on-chain data, and change will be automatically reflected.
- Polkassembly - directly uses on-chain data via rpc to fetch trackInfo so the change will be automatically reflected.
- SubSquare - scan script will update their app to the latest parameters and it will be automatically reflected in their app.

## Prior Art and References

N/A

## Unresolved Questions

The proposed change to the confirmation period duration for the treasurer track is to set it to 48 hours. This is equal to the current confirmation period for the big spender track.

Typically it seems that track parameters increase in difficulty (duration, etc.) based on the power level of their associated origin. 

The longest confirmation period is that of the big spender, at 48 hours. There may be value in discussing whether or not the treasurer track confirmation period should be longer than 48 hours – a discussion of the trade-offs between security vs flexibility/agility.

As a side note, the root track confirmation period is 24 hours.

## Future Directions and Related Material

This RFC hopefully reminds the greater Polkadot community that it is possible to submit changes to the parameters of Polkadot OpenGov, and the greater protocol as a whole through the RFC process.
