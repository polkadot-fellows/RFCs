# RFC-0015: Market Design Revisit

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 05.08.2023                                                                                  |
| **Description** | This RFC refines the previously proposed mechanisms involving the various Coretime markets and presents an integrated framework for harmonious interaction between all markets.                                                       |
| **Authors**     | Jonas Gehrlein                                                                              |

## Summary

This document is a proposal for restructuring the bulk markets in the Polkadot UC's coretime allocation system to improve efficiency and fairness. The proposal suggests separating the `BULK_PERIOD` into `MARKET_PERIOD` and `RENEWAL_PERIOD`, allowing for a market-driven price discovery through a clearing price Dutch auction during the `MARKET_PERIOD` followed by renewal offers at the `MARKET_PRICE` during the `RENEWAL_PERIOD`. The new system ensures synchronicity between renewal and market prices, fairness among all current tenants, and efficient price discovery, while preserving price caps to provide security for current tenants. It seeks to start a discussion about the possibility of long-term leases.

## Motivation

While the initial [RFC-1](https://github.com/polkadot-fellows/RFCs/blob/6f29561a4747bbfd95307ce75cd949dfff359e39/text/0001-agile-coretime.md) has provided a robust framework for Coretime allocation within the Polkadot UC, this proposal builds upon its strengths and uses many provided building blocks to address some areas that could be further improved. 

In particular, this proposal introduces the following changes:
- It introduces a `RESERVE_PRICE` that anchors all markets, promoting price synchronicity within the Bulk markets (flexible + renewals). 
    - This reduces complexity.
    - This makes sure all consumers pay a closely correlated price for coretime within a `BULK_PERIOD`.
- It reverses the order of the market and renewal phase. 
    - This allows to fine-tune the price through market forces.
- It exposes the renewal prices, while still being beneficial for longterm tenants, more to market forces. 
- It removes the LeadIn period and introduces a (from the perspective of the coretime systemchain) passive Settlement Phase, that allows the secondary market to exert it's force.

The premise of this proposal is to reduce complexity by introducing a common price (that develops releative to capacity consumption of Polkadot UC), while still allowing for market forces to add efficiency. Longterm lease owners still receive priority **IF** they can pay (close to) the market price. This prevents a situation where the renewal price significantly diverges from renewal prices which allows for core captures. While maximum price increase certainty might seem contradictory to efficient price discovery, the proposed model aims to balance these elements, utilizing market forces to determine the price and allocate cores effectively within certain bounds. It must be stated, that potential price increases remain predictable (in the worst-case) but could be higher than in the originally proposed design. The argument remains, however, that we need to allow market forces to affect all prices for an efficient Coretime pricing and allocation.

Ultimately, this the framework proposed here adheres to all requirements stated in RFC-1.

## Stakeholders

Primary stakeholder sets are:

- Protocol researchers and developers, largely represented by the Polkadot Fellowship and Parity Technologies' Engineering division.
- Polkadot Parachain teams both present and future, and their users.
- Polkadot DOT token holders.

## Explanation

### Bulk Markets
 
The `BULK_PERIOD` has been restructured into two primary segments: the `MARKET_PERIOD` and `RENEWAL_PERIOD`, along with an auxiliary `SETTLEMENT_PERIOD`. This latter period doesn't necessitate any actions from the coretime system chain, but it facilitates a more efficient allocation of coretime in secondary markets. A significant departure from the original proposal lies in the timing of renewals, which now occur post-market phase. This adjustment aims to harmonize renewal prices with their market counterparts, ensuring a more consistent and equitable pricing model.

#### Market Period (14 days)

During the market period, core sales are conducted through a well-established **clearing price Dutch auction** that features a `RESERVE_PRICE`. The price initiates at a premium, designated as `PRICE_PREMIUM` (for instance, 30%) and descends linearly to the `RESERVE_PRICE` throughout the duration of the `MARKET_PERIOD`. Each bidder is expected to submit both their desired price and the quantity (that is, the amount of Coretime) they wish to purchase. To secure these acquisitions, bidders must make a deposit equivalent to their bid multiplied by the chosen quantity, in DOT. 

The market achieves resolution once all quantities have been sold, or the `RESERVE_PRICE` has been reached. This situation leads to determining the `MARKET_PRICE` either by the lowest bid that was successful in clearing the entire market or by the `RESERVE_PRICE`. This mechanism yields a uniform price, shaped by market forces (refer to the following discussion for an explanation of its benefits). In other words, all buyers pay the same price (per unit of Coretime). Further down the benefits of this variant of a Dutch auction is discussed.

**Note:** In cases where some cores remain unsold in the market, all buyers are obligated to pay the `RESERVE_PRICE`.

#### Renewal Period (7 days)

As the `RENEWAL_PERIOD` commences, all current tenants are granted the opportunity to renew their cores at a slight discount of `MARKET_PRICE * RENEWAL_DISCOUNT` (for instance, 10%). This provision affords marginal benefits to existing tenants, balancing out the non-transferability aspect of renewals.

At the end of the period, all available cores are allocated to the current tenants who have opted for renewal and the participants who placed bids during the market period. If the demand for cores exceeds supply, the cores left unclaimed from renewals may be awarded to bidders who placed their bids early in the auction, thereby subtly incentivizing early participation. If the supply exceeds the demand, all unsold cores are transferred to the Instantanous Market.

#### Reserve Price Adjustment

After all cores are allocated, the `RESERVE_PRICE` is adjusted following the process described in RFC-1 and serves as baseline price in the next `BULK_PERIOD`. 

**Note:** The particular price curve is outside the scope of the proposal. The `MARKET_PRICE` (as a function of `RESERVE_PRICE`), however, is able to capture higher demand very well while being capped downwards. That means, the curve that adjusts the `RESERVE_PRICE` should be more sensitive to undercapacity.

#### Price Predictability 

Tasks that are in the "renewal-pipeline" can determine the upper bound for the price they will pay in any future period. The main driver of any price increase over time is the adjustment of the `RESERVE_PRICE`, that occurs at the end of each `BULK_PERIOD` after determining the capacity fillment of Polkadot UC.  To calculate the maximum price in some future period, a task could assume maximum capacity in all upcoming periods and track the resulting price increase of `RESERVE_PRICE`. In the final period, that price can get a maximum premium of `PRICE_PREMIUM` and after deducting a potential `RENEWAL_DISCOUNT`, the maximum price can be determined.

#### Settlement Period (7 days)

During the settlement period, participants have ample time to trade Coretime on secondary markets before the onset of the next `BULK_PERIOD`. This allows for trading with full Coretime availability. Trading transferrable Coretime naturally continues during each `BULK_PERIOD`, albeit with cores already in use.


### Benefits of this system
- The introduction of a single price, the `RESERVE_PRICE`, provides an anchor for all Coretime markets. This is a preventative measure against the possible divergence and mismatch of prices, which could inadvertently lead to a situation where existing tenants secure cores at significantly below-market rates.
- With a more market-responsive pricing system, we can achieve a more efficient price discovery process. Any price increases will be less arbitrary and more dynamic.
- The ideal strategy for existing tenants is to maintain passivity, i.e., refrain from active market participation and simply accept the offer presented to them during the renewal phase. This approach lessens the organizational overhead for long-term projects.
- In the two-week market phase, the maximum price increase is known well in advance, providing ample time for tenants to secure necessary funds to meet the potential price escalation.
- All existing tenants pay an equal amount for Coretime, reflecting our intent to price the Coretime itself and not the relative timing of individual projects.

#### Discussion: Clearing Price Dutch Auctions
Having all bidders pay the market clearing price offers some benefits and disadvantages.

- Advantages:
    - **Fairness**: All bidders pay the same price.
    - **Active participation**: Because bidders are protected from overbidding (winner's curse), they are more likely to engage and reveal their true valuations.  
    - **Simplicity**: A single price is easier to work with for pricing renewals later.
    - **Truthfulness**: There is no need to try to game the market by waiting with bidding. Bidders can just bid their valuations.
- Disadvantages:
    - **(Potentially) Lower Revenue**: While the theory predicts revenue-equivalence between a uniform price and pay-as-bid type of auction, slightly lower revenue for the former type is observed empirically. Arguably, revenue maximization (i.e., squeezing out the maximum willingness to pay from bidders) is not the priority for Polkadot UC. Instead, it is interested in efficient allocation and the other benefits illustrated above.
    - **(Technical) Complexity**: Instead of making a final purchase within the auction, the bid is only a deposit. Some refunds might happen after the auction is finished. This might pose additional challenges from the technical side (e.g., storage requirements).


### Further Discussion Points

- **Long-term Coretime**: The Polkadot UC is undergoing a transition from two-year leases without an instantaneous market to a model encompassing instantaneous and one-month leases. This shift seems to pivot from one extreme to another. While the introduction of short-term leases, both instantaneous and for one month, is a constructive move to lower barriers to entry and promote experimentation, it seems to be the case that established projects might benefit from more extended lease options. We could consider offering another product, such as a six-month Coretime lease, using the same mechanism described herein. Although the majority of leases would still be sold on a one-month basis, the addition of this option would enhance market efficiency as it would **strengthen the impact of a secondary market**.

## Drawbacks

There are trade-offs that arise from this proposal, compared to the initial model. The most notable one is that here, I prioritize requirement 6 over requirement 2. The price, in the very "worst-case" (meaning a huge explosion in demand for coretime) could lead to a much larger increase of prices in Coretime. From an economic perspective, this (rare edgecase) would also mean that we'd vastly underprice Coretime in the original model, leading to highly inefficient allocations.


## Prior Art and References

This RFC builds extensively on the available ideas put forward in [RFC-1](https://github.com/polkadot-fellows/RFCs/blob/6f29561a4747bbfd95307ce75cd949dfff359e39/text/0001-agile-coretime.md). 

Additionally, I want to express a special thanks to [Samuel Haefner](https://samuelhaefner.github.io/) and [Shahar Dobzinski](https://sites.google.com/site/dobzin/) for fruitful discussions and helping me structure my thoughts. 

## Unresolved Questions

The technical feasability needs to be assessed.