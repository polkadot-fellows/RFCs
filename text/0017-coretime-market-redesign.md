# RFC-0017: Coretime Market Redesign

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Original Proposition Date**  | 05.08.2023                                                                                  |
| **Revision Date**  | 19.05.2025                                                                                  |
| **Description** | This RFC redesigns Polkadot's coretime market to ensure that coretime is efficiently priced through a clearing-price Dutch auction. It also introduces a mechanism that guarantees current coretime holders the right to renew their cores outside the market, albeit at a renewal price derived directly from the market outcome. This design aligns renewal and market prices, preserving long-term access for current coretime owners while ensuring that market dynamics exert sufficient pressure on all purchasers, resulting in an efficient allocation.
| **Authors**     | Jonas Gehrlein                                                                              |

## Summary

This document is a proposal for restructuring the bulk markets in the Polkadot's coretime allocation system to improve efficiency and fairness. The proposal suggests separating the `BULK_PERIOD` into `MARKET_PERIOD` and `RENEWAL_PERIOD`, allowing for a market-driven price discovery through a clearing price Dutch auction during the `MARKET_PERIOD` followed by renewal offers at the `MARKET_PRICE` during the `RENEWAL_PERIOD`. The new system ensures synchronicity between renewal and market prices, fairness among all current tenants, and efficient price discovery, while preserving price caps to provide security for current tenants. It seeks to start a discussion about the possibility of long-term leases.

## Motivation

While the initial [RFC-1](https://github.com/polkadot-fellows/RFCs/blob/6f29561a4747bbfd95307ce75cd949dfff359e39/text/0001-agile-coretime.md) has provided a robust framework for Coretime allocation within the Polkadot, this proposal builds upon its strengths and uses many provided building blocks to address some areas that could be further improved. 

In particular, this proposal introduces the following changes:
- It introduces a `RESERVE_PRICE` that anchors all markets, promoting price synchronicity within the Bulk markets (flexible + renewals). 
    - This reduces complexity.
    - This makes sure all consumers pay a closely correlated price for coretime within a `BULK_PERIOD`.
- It reverses the order of the market and renewal phase. 
    - This allows to fine-tune the price through market forces.
    - This significantly increases the cost for core captures, because captured cores would become increasingly expensive over time.
- It exposes the renewal decision, while still guaranteeing longterm tenants to keep their core, more to market forces. 
- It removes the LeadIn period and introduces a (from the perspective of the coretime systemchain) passive Settlement Phase, that allows the secondary market to exert it's force.

The premise of this proposal is to reduce complexity by introducing a common price (that develops relative to capacity consumption of Polkadot), while still allowing for market forces to add efficiency. Longterm lease owners still receive priority and a guaranteed allocation **IF** they can pay (close to) the market price. This prevents a situation where the renewal price significantly diverges from market prices which allows for core captures and general inefficiencies. While maximum price increase certainty might seem contradictory to efficient price discovery, the proposed model aims to balance these elements, utilizing market forces to determine the price and allocate cores effectively within certain bounds. In particular, prices are bounded upward within a `BULK_PERIOD` and can be calculated for future periods. It must be stated, however, that under high demand, prices could exponentially increase. This is necessary to allow for proper price discovery and efficient Coretime pricing and allocation.

Ultimately, this the framework proposed here adheres to all requirements stated in RFC-1.

## Stakeholders

Primary stakeholder sets are:

- Protocol researchers, developers, and the Polkadot Fellowship.
- Polkadot Parachain teams both present and future, and their users.
- Polkadot DOT token holders.

## Explanation

### Bulk Markets
 
The `BULK_PERIOD` has been restructured into two primary segments: the `MARKET_PERIOD` and `RENEWAL_PERIOD`, along with an auxiliary `SETTLEMENT_PERIOD`. This latter period doesn't necessitate any actions from the coretime system chain, but it facilitates a more efficient allocation of coretime in secondary markets. A significant departure from the original proposal lies in the timing of renewals, which now occur post-market phase. This adjustment aims to harmonize renewal prices with their market counterparts, ensuring a more consistent and equitable pricing model.

#### Market Period (14 days)

During the market period, core sales are conducted through a well-established **clearing price Dutch auction** that features a `RESERVE_PRICE`. The price initiates at a premium, designated as `PRICE_PREMIUM` (for instance, 200% or 300%) and descends linearly to the `RESERVE_PRICE` throughout the duration of the `MARKET_PERIOD`. Each bidder is expected to submit both their desired price and the quantity (that is, the amount of Coretime) they wish to purchase. To secure these acquisitions, bidders must make a deposit equivalent to their bid multiplied by the chosen quantity, in DOT. Bidders are always allowed to post a bid under the current descending price, but never above it. 

The market achieves resolution once all quantities have been sold, or the `RESERVE_PRICE` has been reached. This situation leads to determining the `CLEARING_PRICE` either by the lowest bid that was successful in clearing the entire market or by the `RESERVE_PRICE`. This mechanism yields a uniform price, shaped by market forces (refer to the following discussion for an explanation of its benefits). In other words, all buyers pay the same price (per unit of Coretime). Further down the benefits of this variant of a Dutch auction is discussed.

**Note:** In cases where some cores remain unsold in the market, all buyers are obligated to pay the `RESERVE_PRICE`. Bids below the `RESERVE_PRICE` are not valid.

#### Renewal Period (7 days)

The renewal period guarantees current tenants the right to renew their core even if they did not place a bid above the `CLEARING_PRICE` in the auction or did not participate at all. For the `MARKET_PERIOD` to produce the most efficient outcome and properly discover the price, we want as many active bidders as possible. Therefore, as we expect at some point much more renewals than new entrants, we want to nudge even existing tenants to participate and place bids in the auction. We can do that, by making the renewal price slightly less attractive than the `CLEARING_PRICE` obtained in the auction. To achieve that, we can simply add a small `PENALTY` (e.g., 30%) to it. The renewal price would thereby be `CLEARING_PRICE * PENALTY`. We can easily argue that the privilege not to participate in the auction and having guaranteed coretime warrants a small price hike. 

All current tenants have 7 days to decide whether they want to renew their core or not. After obtaining the information who renewed and who did not, the system has the necessary information to conclusively allocate all cores and transfer ownership.

In the case where there are combined more renewals and bidders at or above the `CLEARING_PRICE` than available cores, we allocate cores to the highest to lowest bidders until all available cores are allocated (albeit still at the `CLEARING_PRICE`). That effectively means that in situations with very high demand, some bidders might not get the coretime they bid for.

If the supply exceeds the demand, all unallocated cores are transferred to the Instantanous Market.

#### Reserve Price Adjustment

After all cores are allocated, the `RESERVE_PRICE` is adjusted similar to the process described in RFC-1, where we define `TARGET_CONSUMPTION_RATE` as a ratio of the available to unsold cores. Then, the upcoming reserve price is adjusted upwards or downward, depending on whether we over- or undershoot the target consumption. If the consumption is met precisely, the price remains unchanged in the next `BULK_PERIOD`. 

**Note**: When designing this mechanism, we want to make sure that small deviations have a smaller price impact than bigger deviations. We propose the following function:

`reserve_price_old`: reserve price from the previous period
`consumption_rate`: how many cores were sold relative to how many were available.
`TARGET_CONSUMPTION_RATE`: how many of the available cores we want to sell without increasing the price. We propose 90%. This leaves enough area downward and upward to adjust prices more aggressively.
`K`: sensitivity parameter. How aggressively we want to adjust the price. We propose a value between 2 and 3, but might need more evaluation.
`P_MIN`: A minimum price we never undercut. This is important to bound the price downward and prevent computational issues if prices drop too low. We propose a value of 1 DOT.
`MIN_INCREMENT`: A minimum increment after we reached 100% capacity. This is important to quickly recover after long periods of low demand which resulted in low prices.

We update the price according to:

`p_new = reserve_price_old * exp(K * (consumption_rate - TARGET_CONSUMPTION_RATE))`

The `RESERVE_PRICE` in the next period will be:

`RESERVE_PRICE_NEXT = max(p_new, P_MIN)`

**Note:** To reduce the recovery time from very low prices it is important to, in the case of 100% capacity, at least increment the `RESERVE_PRICE_NEXT` by `MIN_INCREMENT`, which could be, e.g., 100 DOT.

#### Settlement Period / Secondary Market (7 days)

The remaining 7 days of a sales cycle serve as a settlement period, where participants have ample time to trade Coretime on secondary markets before the onset of the next `BULK_PERIOD`. This proposal makes no assumptions about the structure of these markets, because they are entirely operated on the social layer and handled directly by buyers and sellers. In this context, maintaining restrictions on the resale of renewed cores in the secondary market appears unjustified. In fact, such constraints could be harmful in cases where the primary market does not fully achieve efficiency. **We therefore propose lifting all restrictions on the resale or slicing of cores in the secondary market.**


### Benefits of this system
- The introduction of a single price, the `RESERVE_PRICE`, provides an anchor for all Coretime markets. This is a preventative measure against the possible divergence and mismatch of prices, which could inadvertently lead to a situation where existing tenants secure cores at significantly below-market rates.
- With a more market-responsive pricing system, we can achieve a more efficient price discovery process. Any price increases will be less arbitrary and more dynamic.
- The ideal strategy for existing tenants is to maintain passivity, i.e., refrain from active market participation and simply accept the offer presented to them during the renewal phase. This approach lessens the organizational overhead for long-term projects.
- Prices within a `BULK_PERIOD` are bound upwards by the current `RESERVE_PRICE * PREMIUM`. This provides ample time for tenants to secure necessary funds to meet the potential price escalation.
- All existing tenants pay an equal amount for Coretime, reflecting our intent to price the Coretime itself and not the relative timing of individual projects.

### Implications of this system
- Bidders above the clearing price might not receive their coretime: We aim to grant existing coretime users the exclusive right to renew their cores at the `CLEARING_PRICE * PENALTY`. To facilitate this, we conduct a market phase before the renewal phase, during which all cores are put up for sale. However, current coretime users are not obligated to participate in this market phase. While the `PENALTY` still nudges them to participate, it might be the case that, together with renewals, there are less cores available than we offered in the market. This condition may occasionally result in bidders not receiving their coretime despite bidding above the clearing price. After renewals, any remaining cores will be allocated to bidders in descending order of their bids, still applying the uniform clearing price. We consider this scenario a necessary trade-off to ensure that renewals remain influenced by market dynamics. Ultimately, we believe this approach is justified, as it is preferable to risk delaying new projects until subsequent cycles rather than displacing ongoing projects.
- We want current coretime owners to participate in the auction to improve overall efficiency. To encourage this, we introduce a `PENALTY`, which creates some financial incentive to take part during the `MARKET_PERIOD`. However, there’s a challenge: final allocation of cores can only happen after all renewal decisions have been collected. But current tenants would prefer to know whether they’ve won in the auction before deciding whether to fall back to renewal and pay the `PENALTY`. This can be resolved by ensuring that any bid from a current coretime owner that is at or above the `CLEARING_PRICE` is never kicked out. In other words, if a current owner bids at or above the `CLEARING_PRICE`, they are guaranteed to retain the coretime—avoiding the `PENALTY` altogether. If they don’t win in the auction, they can still fall back to renewal, paying `CLEARING_PRICE * PENALTY`. Note that this logic does not apply to new bidders (those without existing coretime): their bids may be displaced (starting from the lowest to highest) depending on the renewal decisions.
- Bids below the current descending price should always be allowed (i.e., we would not want to require teams sitting and waiting for the price to finally be declined to their taget level). That makes it easy to participate for bidders.
- Bids below the current descending price can always be raised, but only to the clock price at most.
- Bids above the current descending price **are not allowed**. This marks a difference to a simple kth-price auction and prevents sniping.

#### Insights: Clearing Price Dutch Auctions
Having all bidders pay the market clearing price offers some benefits and disadvantages.

- Advantages:
    - **Fairness**: All bidders pay the same price.
    - **Active participation**: Because bidders are protected from overbidding (winner's curse), they are more likely to engage and reveal their true valuations.  
    - **Simplicity**: A single price is easier to work with for pricing renewals later.
    - **Truthfulness**: There is no need to try to game the market by waiting with bidding. Bidders can just bid their valuations.
    - **No sniping**: As prices are descending, a player cannot wait until the end to place a high bid. They are only allowed to place the decreasing bid at the time of bidding. 
- Disadvantages:
    - **(Potentially) Lower Revenue**: While the theory predicts revenue-equivalence between a uniform price and pay-as-bid type of auction, slightly lower revenue for the former type is observed empirically. Arguably, revenue maximization (i.e., squeezing out the maximum willingness to pay from bidders) is not the priority for Polkadot. Instead, it is interested in efficient allocation and the other benefits illustrated above.
    - **(Technical) Complexity**: Instead of making a final purchase within the auction, the bid is only a deposit. Some refunds might happen after the auction is finished. This might pose additional challenges from the technical side (e.g., storage requirements).


### Further Discussion Points

- **Long-term Coretime**: The Polkadot is undergoing a transition from two-year leases without an instantaneous market to a model encompassing instantaneous and one-month leases. This shift seems to pivot from one extreme to another. While the introduction of short-term leases, both instantaneous and for one month, is a constructive move to lower barriers to entry and promote experimentation, it seems to be the case that established projects might benefit from more extended lease options. We could consider offering another product, such as a six-month Coretime lease, using the same mechanism described herein. Although the majority of leases would still be sold on a one-month basis, the addition of this option would enhance market efficiency as it would **strengthen the impact of a secondary market**.
- **Reintroduction of Candle Auctions**: Polkadot gathered vast experience with candle auctions where more than 200 auctions has been conducted throughout more than two years. [Our study](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5109856) analyzing the results in much detail reveals that the mechanism itself is both efficient and (nearly) extracting optimal revenue. This yields confidence and would allow us to reintroduce them to replace the proposed dutch auction. A benefit would be that we would not need to update reserve prices but a drawback would be that prices are not bound upwards within single periods.


## Prior Art and References

This RFC builds extensively on the available ideas put forward in [RFC-1](https://github.com/polkadot-fellows/RFCs/blob/6f29561a4747bbfd95307ce75cd949dfff359e39/text/0001-agile-coretime.md). 

Additionally, I want to express a special thanks to [Samuel Haefner](https://samuelhaefner.github.io/) and [Shahar Dobzinski](https://sites.google.com/site/dobzin/) for fruitful discussions and helping me structure my thoughts. 

## Unresolved Questions

- None yet