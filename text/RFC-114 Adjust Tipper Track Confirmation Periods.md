# RFC-114: Adjust Tipper Track Confirmation Periods

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 17-Aug-24                                                                                   |
| **Description** | Big and Small Tipper Track Conformation Period Modification                                 |
| **Authors**     | Leemo / ChaosDAO                                                                            |

## Summary

This RFC proposes to change the duration of the Confirmation Period for the Big Tipper and Small Tipper tracks in Polkadot OpenGov:

* Small Tipper: 10 Minutes -> 12 Hours

* Big Tipper: 1 Hour -> 1 Day

## Motivation

Currently, these are the durations of treasury tracks in Polkadot OpenGov. Confirmation periods for the Spender tracks were adjusted based on [RFC20](https://github.com/polkadot-fellows/RFCs/pull/20) and its related conversation.

| Track Description | Confirmation Period Duration |
| ----------------- | ---------------------------- |
| Treasurer         | 7 Days                       |
| Big Spender       | 7 Days                       |
| Medium Spender    | 4 Days                       |
| Small Spender     | 2 Days                       |
| Big Tipper        | **1 Hour**                   |
| Small Tipper      | **10 Minutes**               |

You can see that there is a general trend on the Spender track that when the privilege level (the amount the track can spend) the confirmation period approximately doubles.

I believe that the Big Tipper and Small Tipper track's confirmation periods should be adjusted to match this trend.

In the current state it is possible to somewhat positively snipe these tracks, and whilst the power/privilege level of these tracks is very low (they cannot spend a large amount of funds), I believe we should increase the confirmation periods to something higher. This is backed up by the recent sentiment in the greater community regarding referendums submitted on these tracks. The parameters of Polkadot OpenGov can be adjusted based on the general sentiment of token holders when necessary. 

## Stakeholders

The primary stakeholders of this RFC are:
– DOT token holders – as this affects the protocol's treasury
– Entities wishing to submit a referendum on these tracks – as this affects the referendum's timeline
– Projects with governance app integrations – see Performance, Ergonomics and Compatibility section below

## Explanation

This RFC proposes to change the duration of the confirmation period for both the Big Tipper and Small Tipper tracks. To achieve this the ``confirm_period`` parameter for those tracks should be changed.

You can see the lines of code that need to be adjusted here:

* Big Tipper: https://github.com/polkadot-fellows/runtimes/blob/f4c5d272d4672387771fb038ef52ca36f3429096/relay/polkadot/src/governance/tracks.rs#L245

* Small Tipper: https://github.com/polkadot-fellows/runtimes/blob/f4c5d272d4672387771fb038ef52ca36f3429096/relay/polkadot/src/governance/tracks.rs#L231

This RFC proposes to change the ``confirm_period`` for the Big Tipper track to ``DAYS`` (i.e. 1 Day) and the ``confirm_period`` for the Small Tipper track to ``12 * HOURS`` (i.e. 12 Hours).

## Drawbacks

The drawback of changing these confirmation periods is that the lifecycle of referenda submitted on those tracks would be ultimately longer, and it would add a greater potential to negatively "snipe" referenda on those tracks by knocking the referendum out of its confirmation period once the decision period has ended. This can be a good or a bad thing depending on your outlook of positive vs negative sniping.

## Testing, Security, and Privacy

This referendum will enhance the security of the protocol as it relates to its treasury. The confirmation period is one of the last lines of defense for the Polkadot token holder DAO to react to a potentially bad referendum and vote NAY in order for its confirmation period to be aborted.

## Performance, Ergonomics, and Compatibility

### Performance

This is a simple change (code wise) that should not affect the performance of the Polkadot protocol, outside of increasing the duration of the confirmation periods for these 2 tracks.

### Ergonomics & Compatibility

As per the implementation of changes described in RFC-20, it was identified that governance UIs automatically update to meet the new parameters:

- Nova Wallet - directly uses on-chain data, and change will be automatically reflected.
- Polkassembly - directly uses on-chain data via rpc to fetch trackInfo so the change will be automatically reflected.
- SubSquare - scan script will update their app to the latest parameters and it will be automatically reflected in their app.

## Prior Art and References

N/A

## Unresolved Questions

Some token holders may want these confirmation periods to remain as they are currently and for them not to increase. If this is something that the Polkadot Technical Fellowship considers to be an issue to implement into a runtime upgrade then I can create a Wish For Change to obtain token holder approval.

## Future Directions and Related Material

The parameters of Polkadot OpenGov will likely continue to change over time, there are additional discussions in the community regarding adjusting the ``min_support`` for some tracks so that it does not trend towards 0%, similar to the current state of the Whitelisted Caller track. This is outside of the scope of this RFC and requires a lot more discussion.
