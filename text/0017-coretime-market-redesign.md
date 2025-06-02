# RFC-0017: Coretime Market Redesign

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Original Proposition Date**  | 05.08.2023                                                                                  |
| **Revision Date**  | 02.06.2025                                                                                  |
| **Description** | This RFC redesigns Polkadot's coretime market to ensure that coretime is efficiently priced through a clearing-price Dutch auction. It also introduces a mechanism that guarantees current coretime holders the right to renew their cores outside the market—albeit at the market price with an additional charge. This design aligns renewal and market prices, preserving long-term access for current coretime owners while ensuring that market dynamics exert sufficient pressure on all purchasers, resulting in an efficient allocation.
| **Authors**     | Jonas Gehrlein                                                                              |
# Summary

This document proposes a restructuring of the bulk markets in Polkadot's coretime allocation system to improve efficiency and fairness. The proposal suggests splitting the `BULK_PERIOD` into three consecutive phases: `MARKET_PERIOD`, `RENEWAL_PERIOD`, and `SETTLEMENT_PERIOD`. This structure enables market-driven price discovery through a clearing-price Dutch auction, followed by renewal offers during the `RENEWAL_PERIOD`.

With all coretime consumers paying a unified price, we propose removing all liquidity restrictions on cores purchased either during the initial market phase or renewed during the renewal phase. This allows a meaningful `SETTLEMENT_PERIOD`, during which final agreements and deals between coretime consumers can be orchestrated on the social layer—complementing the agility this system seeks to establish.

In the new design, we obtain a uniform price, the `clearing_price`, which anchors new entrants and current tenants. To complement market-based price discovery, the design includes a dynamic reserve price adjustment mechanism based on actual core consumption. Together, these two components ensure robust price discovery while mitigating price collapse in cases of slight underutilization or collusive behavior.

# Motivation

After exposing the initial system introduced in [RFC-1](https://github.com/polkadot-fellows/RFCs/blob/6f29561a4747bbfd95307ce75cd949dfff359e39/text/0001-agile-coretime.md) to real-world conditions, several weaknesses have become apparent. These lie especially in the fact that cores captured at very low prices are removed from the open market and can effectively be retained indefinitely, as renewal costs are minimal. The key issue here is the absence of price anchoring, which results in two divergent price paths: one for the initial purchase on the open market, and another fully deterministic one via the renewal bump mechanism.

This proposal addresses these issues by anchoring all prices to a value derived from the market, while still preserving necessary privileges for current coretime consumers. The goal is to produce robust results across varying demand conditions (low, high, or volatile).

In particular, this proposal introduces the following key changes:

* **Reverses the order** of the market and renewal phases: all cores are first offered on the open market, and only then are renewal options made available.
* **Introduces a dynamic `reserve_price`**, which is the minimum price coretime can be sold for in a period. This price adjusts based on consumption and does not rely on market participation.
* **Makes unproductive core captures sufficiently expensive**, as all cores are exposed to the market price.

The premise of this proposal is to offer a straightforward design that discovers the price of coretime within a period as a `clearing_price`. Long-term coretime holders still retain the privilege to keep their cores **if** they can pay the price discovered by the market (with some premium for that privilege). The proposed model aims to strike a balance between leveraging market forces for allocation while operating within defined bounds. In particular, prices are capped *within* a `BULK_PERIOD`, which gives some certainty about prices to existing teams. It must be noted, however, that under high demand, prices could increase exponentially *between* multiple market cycles. This is a necessary feature to ensure proper price discovery and efficient coretime allocation.

Ultimately, the framework proposed here seeks to adhere to all requirements originally stated in RFC-1.

# Stakeholders

Primary stakeholder sets are:

- Protocol researchers, developers, and the Polkadot Fellowship.
- Polkadot Parachain teams both present and future, and their users.
- Polkadot DOT token holders.

# Explanation

## Overview

The `BULK_PERIOD` has been restructured into two primary segments: the `MARKET_PERIOD` and the `RENEWAL_PERIOD`, along with an auxiliary`SETTLEMENT_PERIOD`. The latter does not require any active participation from the coretime system chain except to simply execute transfers of ownership between market participants. A significant departure from the current design lies in the timing of renewals, which now occur after the market phase. This adjustment aims to harmonize renewal prices with their market counterparts, ensuring a more consistent and equitable pricing model.

## Market Period (14 days)

During the market period, core sales are conducted through a well-established **clearing-price Dutch auction** that features a `reserve_price`. Since the auction format is a descending clock, the starting price is initialized as `reserve_price * PRICE_MULTIPLIER` (e.g., 300%). The price then descends linearly over the duration of the `MARKET_PERIOD` toward the `reserve_price`, which serves as the minimum price for coretime within that period.

Each bidder is expected to submit both their desired price and the quantity (i.e., number of cores) they wish to purchase. To secure these acquisitions, bidders must deposit an amount equivalent to their bid multiplied by the chosen quantity, in DOT. Bidders are always allowed to post a bid at or below the current descending price, but never above it.

The market reaches resolution once all quantities have been sold or the `reserve_price` is reached. In the former case, the `clearing_price` is set equal to the price that sold the last unit. If cores remain unsold, the `clearing_price` is set to the `reserve_price`. This mechanism yields a uniform price that all buyers pay. Among other benefits discussed in the Appendix, this promotes truthful bidding—meaning the optimal strategy is simply to submit one's true valuation of coretime.

## Renewal Period (7 days)

The renewal period guarantees current tenants the privilege to renew their core(s), even if they did not win in the auction (i.e., did not submit a bid at or above the `clearing_price`) or did not participate at all.

All current tenants who obtained less cores from the market than they have the right to renew, have 7 days to decide whether they want to renew their core(s). Once this information is known, the system has everything it needs to conclusively allocate all cores and assign ownership. In cases where the combined number of renewals and auction winners exceeds the number of available cores, renewals are first served and then remaining cores are allocated from highest to lowest bidder until all are assigned (more information in the details on mechanics section). This means that under larger demand than supply (and some renewal decisions), some bidders may not receive the coretime they expected from the auction.

While this mechanism is necessary to ensure that current coretime users are not suddenly left without an allocation, potentially disrupting their operations, it may distort price discovery in the open market. Specifically, it could mean that a winning bidder is displaced by a renewal decision.

Since bidding is straightforward and can be regarded static (it requires only one transaction) and can therefore be trivially automated, we view renewals as a safety net and want to encourage all coretime users to participate in the auction. To that end, we introduce a financial incentive to bid by increasing the renewal price to `clearing_price * PENALTY` (e.g., 30%). This penalty must be high enough to create a sufficient incentive for teams to prefer bidding over passively renewing.

**Note:** Importantly, the `PENALTY` only applies when the number of unique bidders in the auction plus current tenants with renewal rights exceeds the number of available cores. If total demand is lower than the number of offered cores, the `PENALTY` is set to 0%, and renewers pay only the `clearing_price`. This reflects the fact that we would not expect the `clearing_price` to exceed the `reserve_price` even with all coretime consumers participating in the auction. To avoid managing reimbursements, the 30% `PENALTY` is automatically applied to all renewers as soon as the combined count of unique bidders and potential renewers surpasses the number of available cores.

## Reserve Price Adjustment

After each `RENEWAL_PERIOD`, once all renewal decisions have been collected and cores are fully allocated, the `reserve_price` is updated to capture the demand in the next period. The goal is to ensure that prices adjust smoothly in response to demand fluctuations—rising when demand exceeds targets and falling when it is lower—while avoiding excessive volatility from small deviations.

We define the following parameters:

* `reserve_price_t`: Reserve price in the current period
* `reserve_price_{t+1}`: Reserve price for the next period (final value after adjustments)
* `consumption_rate_t`: Fraction of cores sold (including renewals) out of the total available in the current period
* `TARGET_CONSUMPTION_RATE`: Target ratio of sold-to-available cores (we propose 90%)
* `K`: Sensitivity parameter controlling how aggressively the price responds to deviations (we propose values between 2 and 3)
* `P_MIN`: Minimum reserve price floor (we propose 1 DOT to prevent runaway downward spirals and computational issues)
* `MIN_INCREMENT`: Minimum absolute increment applied when the market is fully saturated (i.e., 100% consumption; proposed value: 100 DOT)

We update the price according to the following rule:

```
price_candidate_t = reserve_price_t * exp(K * (consumption_rate_t - TARGET_CONSUMPTION_RATE))
```

We then ensure that the price does not fall below `P_MIN`:

```
price_candidate_t = max(price_candidate_t, P_MIN)
```

If `consumption_rate_t == 100%`, we apply an additional adjustment:

```
if (price_candidate_t - reserve_price_t < MIN_INCREMENT) {
    reserve_price_{t+1} = reserve_price_t + MIN_INCREMENT
} else {
    reserve_price_{t+1} = price_candidate_t
}
```

In other words, we adjust the `reserve_price` using the exponential scaling rule, except in the special case where consumption is at 100% but the resulting price increase would be less than `MIN_INCREMENT`. In that case, we instead apply the fixed minimum increment. This exception ensures that the system can recover more quickly from prolonged periods of low prices.

We argue that in a situation with persistently low prices and a sudden surge in real demand (i.e., full core consumption), such a jump is both warranted and economically justified.

## Settlement Period / Secondary Market (7 days)

The remaining 7 days of a sales cycle serve as a settlement period, during which participants have ample time to trade coretime on secondary markets before the onset of the next `BULK_PERIOD`. This proposal makes no assumptions about the structure of these markets, as they are entirely operated on the social layer and managed directly by buyers and sellers. In this context, maintaining restrictions on the resale of renewed cores in the secondary market appears unjustified—especially given that prices are uniform and market-driven. In fact, such constraints could be harmful in cases where the primary market does not fully achieve efficiency. 

We therefore propose lifting all restrictions on the resale or slicing of cores in the secondary market.

# Additional Considerations

## New Track: Coretime Admin

To enable rapid response, we propose that the parameters of the model be directly accessible by governance. These include:

* `P_MIN`
* `K`
* `PRICE_MULTIPLIER`
* `MIN_INCREMENT`
* `TARGET_CONSUMPTION_RATE`
* `PENALTY`

This setup should allow us to adjust the parameters in a timely manner, within the duration of a `BULK_PERIOD`, so that changes can take effect before the next period begins.

## Transition to the new Model

Upon acceptance of this RFC, we should make sure to transition as smoothly as possible to the new design.

* All teams that own cores in the current system should be endowed with the same number of cores in the new system, with the ability to renew them starting from the first period.
* The initial `reserve_price` should be chosen sensibly to avoid distortions in the early phases.
* A sufficient number of cores should be made available on the market to ensure enough liquidity to allow price discovery functions properly.

## Details on Some Mechanics

* The price descends linearly from `reserve_price * PRICE_MULTIPLIER` to the `reserve_price` over the duration of the `MARKET_PERIOD`. Importantly, each discrete price level should be held for a sufficiently long interval (e.g., 6–12 hours).
* A potential issue arises when we experience demand spikes after prolonged periods of low demand (which result in low reserve prices). In such cases, the price range between `reserve_price` and the upper bound (i.e., `reserve_price * PRICE_MULTIPLIER`) may become economically tight and unable to capture the full willingness to pay from all bidders. If this affects most participants, demand will concentrate at the upper bound of the Dutch auction, making front-running a profitable strategy—either by excessively tipping bidding transactions or through explicit collusion with block producers.
  To mitigate this, we propose preventing the market from closing at the upper bound prematurely. Even if demand exceeds available cores at this level, we continue collecting all orders. Then, we randomize winners instead of using a first-come-first-served approach. Additionally, we may break up bulk orders and treat them as separate bids. This still gives a higher chance to bidders willing to buy larger quantities, but avoids all-or-nothing outcomes. These steps diminish the benefit of tipping or collusion, since bid timing no longer affects allocation. While we expect such scenarios to be the exception, it's important to note that this will not negatively impact current tenants, who always retain the safety net of renewal. After a few periods of maximum bids at maximum capacity, the range should span wide enough to capture demand within its bounds.
* One implication of granting the renewal privilege after the `MARKET_PERIOD` is that some bidders, despite bidding above the `clearing_price`, may not receive coretime. We believe this is justified, because the harm of displacing an existing project is bigger than preventing a new project from getting in (if there is no cores available) for a bit. Additionally, this inefficiency is compensated for by the causing entities paying the `PENALTY`. We need, however, additional rules to resolve the allocation issues. These are:
  1. Bidders who already hold renewable cores cannot be displaced by the renewal decision of another party.
  2. Among those who *can* be displaced, we begin with the lowest submitted bids.
* If a current tenant wins cores on the market, they forfeit the right to renew those specific cores. For example, if an entity currently holds three cores and wins two in the market, it may only opt to renew one. The only way to increase the number of cores at the end of a `BULK_PERIOD` is to acquire them entirely through the market.
* Bids **below** the current descending price should always be allowed. In other words, teams shouldn't have to wait idly for the price to drop to their target.
* Bids below the current descending price can be **raised**, but only up to the current clock price.
* Bids **above** the current descending price are **not allowed**. This is a key difference from a simple *kth*-price auction and helps prevent sniping.
* All cores that remain unallocated after the `RENEWAL_PERIOD` are transferred to the On-Demand Market.

## Implications

* The introduction of a single price (`clearing_price`) provides a consistent anchor for all available coretime. This serves as a safeguard against price divergence, preventing scenarios where entities acquire cores at significantly below-market rates and keep them for minimal costs.
* With the introduction of the `PENALTY`, it is always financially preferable for teams to participate in the auction. By bidding their true valuation, they maximize their chance of winning a core at the lowest possible price without incurring the penalty.
* In this design, it is virtually impossible to "accidentally" lose cores, since renewals occur after the market phase and are guaranteed for current tenants.
* Prices within a `BULK_PERIOD` are bounded upward, as the maximum a renewer could ever pay is `reserve_price * PRICE_MULTIPLIER * PENALTY`. This provides teams with ample time to prepare and secure the necessary funds in anticipation of potential price increases. By incorporating reserve price adjustment into their planning, teams can anticipate worst-case future price increases.

# Appendix

## Further Discussion Points

- **Reintroduction of Candle Auctions**: Polkadot gathered vast experience with candle auctions where more than 200 auctions has been conducted throughout more than two years. [Our study](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=5109856) analyzing the results in much detail reveals that the mechanism itself is both efficient and (nearly) extracting optimal revenue. This provides confidence to use it to allocate the winners instead of a descending clock auction. Notably, this change solely affects the bidding process and winner determination. Core components, such as the k-th price, reserve price, and maximum price, remain unaffected.

## Insights: Clearing Price Dutch Auctions
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

## Prior Art and References

This RFC builds extensively on the available ideas put forward in [RFC-1](https://github.com/polkadot-fellows/RFCs/blob/6f29561a4747bbfd95307ce75cd949dfff359e39/text/0001-agile-coretime.md). 

Additionally, I want to express a special thanks to [Samuel Haefner](https://samuelhaefner.github.io/), [Shahar Dobzinski](https://sites.google.com/site/dobzin/), and Alistair Stewart for fruitful discussions and helping me structure my thoughts.