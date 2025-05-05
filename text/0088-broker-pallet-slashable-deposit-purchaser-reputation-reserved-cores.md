# RFC-0088: Add slashable locked deposit, purchaser reputation, and reserved cores for on-chain identities to broker pallet
|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 25 Apr 2024                                                                                 |
| **Description** | Add slashable locked deposit, purchaser reputation, and reserved cores for on-chain identities to broker pallet                                                                |
| **Authors**     | Luke Schoen                                                                                 |

## Summary

This proposes to require a slashable deposit in the [broker pallet](https://github.com/paritytech/polkadot-sdk/tree/master/substrate/frame/broker) when initially purchasing or renewing Bulk Coretime or Instantaneous Coretime cores.

Additionally, it proposes to record a reputational status based on the behavior of the purchaser, as it relates to their use of Kusama Coretime cores that they purchase, and to possibly reserve a proportion of the cores for prospective purchasers that have an on-chain identity.

## Motivation

### Background

There are sales of Kusama Coretime cores that are scheduled to occur later this month by Coretime Marketplace [Lastic.xyz](https://www.lastic.xyz/kusama/bulkcore1) initially in limited quantities, and potentially also by [RegionX](https://regionx.tech/) in future that is subject to their [Polkadot referendum #582](https://polkadot.polkassembly.io/referenda/582). This poses a risk in that some Kusama Coretime core purchasers may buy Kusama Coretime cores when they have no intention of actually placing a workload on them or leasing them out, which would prevent those that wish to purchase and actually use Kusama Coretime cores from being able to use any at cores at all.

### Problem

The types of purchasers may include:

* Collectors (e.g. purchase a significant core such as the first core that is sold just to increase their likelihood of receiving an NFT airdrop for being one of the first purchasers).
* Resellers (e.g. purchase a core that may be used at a popular period of time to resell closer to the date to realise a profit)
* Market makers (e.g. buy cores just to change the floor price or volume).
* Anti-competitive (e.g. competitor to Polkadot ecosystem purchases cores possibly in violation of anti-trust laws just to restrict access to prospective Kusama Coretime sales cores by the Kusama community that wish to do business in the Polkadot ecosystem).

Chaoatic repurcussions could include the following:

* Generation of "white elephant" Kusama Coretime cores, similar to "white elephant" properties in the real-estate industry that never actually get used, leased or tenanted.
* Kusama Coretime core resellers scalping the core time faster than the average core time consumer, and then choosing to use dynamic pricing that causes prices to fluctuate based on demand.
* Resellers that own the Kusama Coretime scalping organisations may actually turn out to be the Official Kusama Coretime sellers.
* Official Kusama Coretime sellers may establish a monopoly on the market and abuse that power by charging exhorbitant additional charge fees for each purchase, since they could then increase their floor prices even more, pretending that there are fewer cores available and more demand to make extra profits from their scalping organisations, similar to how it occurred in these [concert ticket sales](https://www.rollingstone.com/pro/news/ticketmaster-cheating-scalpers-726353/). This could caused Kusama Coretime costs to be no longer be affordable to the Kusama community.
* Official Kusama Coretime sellers may run pre-sale events, but their websites may not be able to unable to handle the traffic and crash multiple times, causing them to end up cancelling those pre-sales and the pre-sale registrants missing out on getting a core that way, which would then cause available Kusama Coretime cores to be bought and resold at a higher price on third-party sites.
* The scalping activity may be illegal in some jurisdictions and raise anti-trust issues similar to the Taylor Swift debacle over concert tickets.

### Solution Requirements

1. **On-chain identity**. It may be possible to circumvent bots and scalpers to an extent by requiring a proportion of Kusama Coretime purchasers to have an on-chain identity. As such, a possible solution could be to allow the configuration of a threshold in the Broker pallet that reserves a proportion of the cores for accounts that have an on-chain identity, that reverts to a waiting list of anonymous account purchasers if the reserved proportion of cores remain unsold.

2. **Slashable deposit**. A viable solution could be to require a slashable deposit to be locked prior to the purchase or renewal of a core, similar to how decision deposits are used in OpenGov to prevent spam, but where if you buy a Kusama Coretime core you could be challenged by one of more collectives of fishermen to provide proof against certain criteria of how you used it, and if you fail to provide adequate evidence in response to that scrutiny, then you would lose a proportion of that deposit and face restrictions on purchasing or renewing cores in future that may also be configured on-chain.

3. **Reputation**. To disincentivise certain behaviours, a reputational status indicator could be used to record the historic behavior of the purchaser and whether on-chain judgement has determined they have adequately rectified that behaviour, as it relates to their usage of Kusama Coretime cores that they purchase.

## Stakeholders

* Any Kusama account holder wishing to use the Broker pallet in any upcoming Kusama Coretime sales.
* Any prospective Kusama Coretime purchaser, developer, and user.
* KSM holders.

## Drawbacks

### Performance

The slashable deposit if set too high, may result in an economic impact, where less Kusama Coretime core sales are purchased.

## Testing, Security, and Privacy

Lack of a slashable deposit in the Broker pallet is a security concern, since it exposes Kusama Coretime sales to potential abuse.

Reserving a proportion of Kusama Coretime sales cores for those with on-chain identities should not be to the exclusion of accounts that wish to remain anonymous or cause cores to be wasted unnecessarily. As such, if cores that are reserved for on-chain identities remain unsold then they should be released to anonymous accounts that are on a waiting list.

No implementation pitfalls have been identified.

## Performance, Ergonomics, and Compatibility

### Performance

It should improve performance as it reduces the potential for state bloat since there is less risk of undesirable Kusama Coretime sales activity that would be apparent with no requirement for a slashable deposit or there being no reputational risk to purchasers that waste or misuse Kusama Coretime cores.

The solution proposes to minimize the risk of some Kusama Coretime cores not even being used or leased to perform any tasks at all.

It will be important to monitor and manage the slashable deposits, purchaser reputations, and utilization of the proportion of cores that are reserved for accounts with an on-chain identity.

### Ergonomics

The mechanism for setting a slashable deposit amount, should avoid undue complexity for users.

### Compatibility

Updates to Polkadot.js Apps, API and its documentation and those referring to it may be required.

## Prior Art and References

### Prior Art

No prior articles.

## Unresolved Questions

None

## Future Directions and Related Material

None
