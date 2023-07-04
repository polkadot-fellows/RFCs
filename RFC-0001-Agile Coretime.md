# RFC-1: Agile Coretime

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Status**      | Draft Proposal                                                                              |
| **Areas**       | General                                                                                     |
| **Description** | Agile periodic-sale-based model for assigning Coretime on the Polkadot Ubiquitous Computer. |
| **Issues**      | n/a                                                                                         | 
| **Authors**     | Gavin Wood                                                                                  |
| **Reviewers**   | None                                                                                        |


## Summary

This proposes a periodic, sale-based method for assigning Polkadot Coretime. The method takes into account the need for long-term capital expenditure planning for teams building on Polkadot, yet also provides a means to allow Polkadot to capture long-term value in the resource which it sells. It supports the possibility of building secondary markets to make resource allocation more efficient and largely avoids the need for parameterisation.

## Motivation

### Present System

The present system of allocating time for parachains on the cores of the Polkadot Ubiquitous Computer (aka "Polkadot") is through a process known as *slot auctions*. These are on-chain candle auctions which proceed for several days and result in a core being assigned to a single parachain for six months at a time up to 18 months in advance. Practically speaking, we only see two year periods being bid upon and leased.

Funds behind the bids made in the slot auctions are merely locked, not consumed or paid and become unlocked and returned to the bidder on expirt of the lease period. A means of sharing the deposit trustlessly known as a *crowdloan* is available allowing token holders to contribute to the overall deposit of a chain without any counterparty risk.

### Problems

The present system is based on a model of one-core-per-parachain. This is a legacy interpretation of the Polkadot platform and is not a reflection of its present capabilities. By restricting ownership and usage to this model, more dynamic and resource-efficient means of utilising the Polkadot Ubiquitous Computer is lost.

More specifically, it is impossible to lease out cores at anything less than six months, and apparently unrealistic to do so at anything less than two years. This cuts out the ability to dynamically manage the underlying resource, and generally experimentation, iteration and innovation are hampered. It bakes into the platform an assumption of permanence for anything deployed into it and restricts the market's ability to find a more optimal allocation of the finite resource.

There is no ability to determine capital requirements for hosting a parachain beyond two years from the point of its initial deployment onto Polkadot. While it would be unreasonable to have perfect and indefinite cost predictions for any real-world platform, not having any clarity whatsoever beyond "market rates" two years hence can be a very off-putting prospect for teams to buy into.

However, quite possibly the most substantial problem is both a perceived and often real high barrier to entry of the Polkadot ecosystem. By forcing innovators to either raise 7-figure sums through investors or appeal to the wider token-holding community, Polkadot makes it essentially difficult for a small band of innovators from deploying their technology into Polkadot. While not being actually permissioned, it is also far from the barrierless, permissionless ideal which an innovation platform such as Polkadot should be striving for.

## Stakeholders

Primary stakeholder sets are:

- Protocol researchers and developers, largely represented by the Polkadot Fellowship and Parity Technologies' Engineering division.
- Polkadot Parachain teams both present and future, and their users.
- Polkadot DOT token holders.

_Facilitator:_

Parity Technologies' Ecosystem division.

_Reviewers:_

None.

_Consulted:_
- Alistair
- Jonas
- Bjorn
- Rob H
- Rob K

_Socialization:_

This RFC was presented at Polkadot Decoded 2023 Copenhagen on the Main Stage. A small amount of socialisation at the Parachain Summit preceeded it and some substantial discussion followed it. Parity Ecosystem team is currently soliciting views from ecosystem teams who would be key stakeholders.

## Requirements

There are six main requirements:

1. The solution MUST provide an acceptable value-capture mechanism for the Polkadot network.
2. The solution SHOULD allow parachains and other projects deployed on to the Polkadot UC to make long-term capital expenditure predictions.
3. The solution SHOULD minimize the barriers to entry in the ecosystem.
4. The solution SHOULD maximize the value which the Polkadot UC provides by allocating its limited resources optimally.
5. The design MUST work with a limited set of resources (cores on the Polkadot UC) whose properties and number may evolve over time.
6. The design MUST avoid creating additional dependency on functionality which the Relay-chain need not strictly provide for the delivery of the Polkadot UC. This includes any dependency on the Relay-chain hosting a DOT token.

Furthermore, the design SHOULD be implementable and deployable in a timely fashion; three months from the acceptance of this RFC would seem reasonable.

## Parameters

This proposal includes a number of parameters which need not necessarily be fixed. They are stated here along with a value, either *suggested* in which case it is non-binding and the proposal should not be judged on the value since the governance mechanism of Polkadot is expected to specify/maintain it; or *specified* in which case the proposal should be judged on the merit of the value as-is.

| Name                | Value                        |
| ------------------- | ---------------------------- |
| `BULK_PERIOD`       | `28 * DAYS`                  |
| `TIMESLICE`         | `10 * MINUTES`               |
| `BULK_TARGET`       | `30`                         |
| `BULK_LIMIT`        | `45`                         |
| `LEADIN_PERIOD`     | `14 * DAYS`                  |
| `RENEWAL_PRICE_CAP` | `Perbill::from_percent(2)` | 


## Design

### Overview

Upon implementation of this proposal, slot auctions and associated crowdloans cease. Instead, Coretime on the Polkadot UC is sold by the Polkadot System in two separate formats: *Bulk* and *Instantaneous*. This proposal only mandates the implementation of *Bulk Coretime*; any mentions of *Instantaneous Coretime* should be treated only in terms of recommendation.

*Bulk Coretime* is sold periodically and allocated any time in advance of its usage, whereas *Instantaneous Coretime* is sold immediately prior to usage on a block-by-block basis with an explicit allocation at the time of purchase.

All Bulk Coretime sold by Polkadot is done so on a new system parachain known as the *Broker-chain*. Owners of Bulk Coretime are tracked on this chain and the ownership status and properties (i.e. the specific period) of the owned Coretime are exposed over XCM as a non-fungible asset.

At the request of the owner, the Broker-chain allows Bulk Coretime to be:

1. Transferred in ownership.
2. Split into quantized, non-overlapping segments of Bulk Coretime with the same ownership.
3. Consumed in exchange for the allocation of a Core during its period.
4. Consumed in exchange for a pro-rata amount of the revenue from Instantaneous Core sales over its period.

Pre-existing leases SHALL be recorded in the Broker-chain and cores reserved for them.

Sales of Instantaneous Coretime is expected to happen on the Polkadot Relay-chain. The Relay-chain is expected to be responsible for:

- holding non-transferable, non-refundable DOT balance information for collators.
- setting and adjusting the price of Instantaneous Coretime based on usage.
- allowing collators to consume their DOT balance in exchange for the ability to schedule one PoV for near-immediate usage.
- ensuring the Broker-chain has timely book-keeping information on Coretime sales revenue. This should include a total instantaneous revenue amount for each block number.

### Broker-chain

The Broker-chain is a new system parachain. It has the responsibility of providing the Relay-chain via UMP with scheduling information of:

- How many cores which should be made available during the next session.
- Which cores should be allocated to which para IDs.

Any cores left unallocated are assumed by the Broker-chain to be used for Instantaneous Coretime sales.

It is also expected to receive information from the Relay-chain on total revenue from instantaneous coretime sales on a per-block basis.

### Bulk Sales

There is a periodic sale of Coretime happening at a period of `BULK_PERIOD`.  A number of instances of Coretime spanning from `LEADIN_PERIOD` in the future to `LEADIN_PERIOD + BULK_PERIOD` in the future of a single Polkadot UC Core is offered by the Polkadot System at a fixed price.

These instances which are owned by purchaser are called *regions*. This sale happens on the Broker-chain. Regions are quantized into atomic periods of `TIMESLICE`, into which `BULK_PERIOD` divides a whole number of times. The `Timeslice` type is a `u16` which can be multiplied by `TIMESLICE` to give a `BlockNumber` value indicating the same period in times of (Relay-chain) blocks.

The Broker-chain aims to sell some `BULK_TARGET` of Cores, up to some `BULK_LIMIT`. It makes this sale in a single batch `LEADIN_PERIOD` prior to the beginning of the period being sold. The Broker chain publishes a price for this batch of sales for the `BULK_TARGET` period prior to the sale execution.

Accounts may call a `purchase` function with the appropriate funds in place to have their funds reserved and signal an intention to purchase Bulk Coretime for the forthcoming period. One account may have only one pending purchase. Any number of accounts may attempt to `purchase` Bulk Coretime for the forthcoming period, but the order is recorded.

If there are more purchase requests than available cores for purchase in this period, then requests are processed in incoming order. Any additional purchase orders are carried over but marked as such. A purchase is only cancellable if it was carried over.

When a region of Bulk Coretime is initially issued through this purchase, the price it was purchased for is recorded, in addition to the beginning and end Relay-chain block numbers to which it corresponds.

The Broker-chain SHALL record this information in a storage double-map called Regions, keyed first by the current bulk `SaleIndex` (a `u16` starting at zero and incrementing with each sale), then secondarily by a `RegionId`. It shall map into a value of `RegionRecord`:

```rust
type SaleIndex = u16;
struct RegionId {
    core: CoreIndex,  // A `u16`.
    begin: Timeslice, // A `u16`.
}
struct RegionRecord {
    owner: AccountId,
    end: Timeslice,
    price: Option<Balance>,
    allocation: Option<Vec<ParaId>>, // begins set to `None`
}
```

This map functions essentially as a linked list. With one region's `end` field functioning as the next region's key's `begin` field. It is keyyed by the sale index in order to allow the following sale period's Coretime to be manipulated during the `LEADIN_PERIOD` prior to it becoming allocatable.

An additional storage map is maintained to keep the "heads" of this linked list. It is called `NextRegion` and it maps `CoreIndex` to `Timeslice`, to indicate the earliest stored region of the given core.

Notably, if a region is split or transferred, then the `price` is reset to `None`, which has the effect of disallowing a price-increase-capped renewal.

The Broker-chain provides feedback to the Relay-chain on which `ParaId` sets should be serviced on which cores, and does so as they change. Each block, the Broker-chain checks if the period of a `Timeslice` has elapsed. If so, it checks to see if any cores have a newly active `RegionRecord` value in the `Regions` map. If they do, it MUST notify the Relay-chain of the new responsibilities of the relevant `core`. In this case, it MUST remove the item from the `Regions` map and update the `NextRegion` map so it maps the relevant core to the value of removed record's `end` field.

If the `RegionRecord` value for an elapsed `RegionId` has an `allocation` of `None`, then the item is not removed and the Relay-chain is instructed to place the core for instantaneous use.

### Specific functions of the Broker-chain

Several functions of the Broker-chain SHALL be exposed through dispatchables and/or a `nonfungible` trait implementation integrated into XCM:

#### 1. Transfer of ownership

A `transfer(region: RegionId, new_owner: AccountId)` dispatchable SHALL have the effect of altering the current `owner` field of `region` in the `Regions` map from the signed origin to `new_owner`.

An implementation of the `nonfungible` trait SHOULD include equivalent functionality. `RegionId` SHOULD be used for the `AssetInstance` value.

In both cases, the `price` field SHALL become `None`.

#### 2. Split into segments

A `split(region: RegionId, pivot: Timeslice)` dispatchable SHALL have the effect of mutating the Regions entry of key `region` so that the `end` field becomes `pivot` and create a new Regions entry of the same `core` but a `begin` equal to `pivot` whose `RegionRecord` has the same `owner`, `end` and `allocation` fields as the origin value of `region`.

`price` in both records is/becomes `None`.

Also:
- `owner` field of `region` must the equal to the Signed origin.
- `pivot` must equal neither the `begin` nor `end` fields of the `region`.

#### 3. Consumed in exchange for allocation

A dispatchable `allocate(region: RegionId, target: Vec<ParaId>)` SHALL be provided corresponding to the `allocate` function described above.

It MUST be called with a Signed origin equal to the `owner` field of the value of the Regions map for the `region` key. The `allocation` field of this value MUST be `None` (a region may not be re-allocated).

On success, the `allocation` value is changed to `Some` whose inner value is equal to `target`.

If the `begin` field of the `region` parameter is less than the current `Timeslice` value, then it is removed and re-entered with the current `Timeslice` value plus one, unless this would be equal to or greater than the `end` field of the corresponding `RegionRecord` value.

Initially `target` values with only one item MAY be supported.

If the `RegionRecord`'s `price` field is `Some` (indicating that the Region is freshly purchased), then the Broker-chain SHALL record an entry in a storage map called AllowedRenewals. This maps a `CoreIndex` to a struct `RenewalRecord`:

```rust
struct RenewalRecord {
    target: Vec<ParaId>,
    price: Balance,
    sale: SaleIndex,
}
```

#### 4. Renewals

A dispatchable `renew(core: CoreIndex)` SHALL be provided. Any account may call `renew` to purchase Bulk Coretime and renew an active allocation for the given `core`.

This MUST be called during the `LEADIN_PERIOD` prior to a Bulk sale (exactly like `purchase`) and has the same effect as `purchase` followed by `allocate` containing the same `Vec<ParaId>`, except that:

1. The purchase always succeeds and as such must be processed prior to regular `purchase` orders.
2. The price of the purchase is the previous `price` incremented by `RENEWAL_PRICE_CAP` of itself or the regular price, whichever is lower.

AllowedRenewals map is updated with the new information ready for the following Bulk sale.

#### 5. Migrations from Legacy Slot Leases

It is intended that paras which hold a lease from the legacy slot auction system are able to seamlessly transition into the Agile Coretime framework.

A dispatchable `migrate(core: CoreIndex)` SHALL be provided. Any account may call `migrate` to purchase Bulk Coretime at the current price for the given `core`.

This MUST be called during the `LEADIN_PERIOD` prior to a Bulk sale (exactly like `purchase`) and has the same effect as `purchase` followed by `allocate` with a value of `Vec<ParaId>` containing just one item equal to `target`, except that:

1. The purchase always succeeds and as such MUST be processed prior to regular `purchase` orders.
2. There MUST be an ongoing legacy parachain lease whose parachain is assigned to `core` and which is due to expire during the Coretime period being purchased.

AllowedRenewals map is updated with this information ready for the following Bulk sale.

### Notes on Instantaneous Core Sales

For access to the Instantaneous Core sales we may include an `allocate_instantaneous` function. This should allocate the Coretime for usage by Polkadot to serve instantaneous requests and allow the `owner` to collect a pro-rata amount of total Instantaneous sales revenue.

For an efficient market to form around the provision of Bulk-purchased Cores into the pool of cores available for Instantaneous Coretime purchase, it is crucial to ensure that price changes for the purchase of Instantaneous Coretime are reflected well in the revenues of private Coretime providers during the same period.

In order to ensure this, then it is crucial that Instantaneous Coretime, once purchased, cannot be held indefinitely prior to eventual use since, if this were the case, a nefarious collator could purchase Coretime when cheap and utilize it some time later when expensive and deprive private Coretime providers of their revenue. It SHOULD therefore be assumed that Instantaneous Coretime, once purchased, has a definite and short "shelf-life", after which it becomes unusable. This incentivizes collators to avoid purchasing Coretime unless they expect to utilize it imminently and thus helps create an efficient market-feedback mechanism whereby a higher price will actually result in material revenues for private Coretime providers who contribute to the pool of Cores available to service Instantaneous Coretime purchases.

## Implementation

Implementation of this proposal comes in several phases:

1. Finalise the specifics of implementation; this may be done through a design document or through a well-documented prototype implementation.
2. Implement the design, including all associated aspects such as unit tests, benchmarks and any support software needed.
3. If any new parachain is required, launch of this.
4. Formal audit of the implementation and any manual testing.
5. Announcement to the various stakeholders of the imminent changes.
6. Software integration and release.
7. Governance upgrade proposal(s).
8. Monitoring of the upgrade process.

## Performance

This proposal has no immediate performance considerations.

## Ergonomics

This proposal makes no changes to the existing end-user experience.

## Backwards Compatibility

Parachains already deployed into the Polkadot UC MUST have a clear plan of action to migrate to an agile Coretime market.

## Security considerations

A regular security review SHOULD be conducted prior to deployment through a review by the Web3 Foundation economic research group.

Any final implementation MUST pass a professional external security audit.

## Privacy considerations

The proposal introduces no new privacy concerns.

## Testing

Regular testing through unit tests, integration tests, manual testnet tests, zombie-net tests and fuzzing SHOULD be conducted.

## Documentation

While this proposal does not introduce documentable features per se, adequate documentation must be provided to potential purchasers of Polkadot Coretime. This SHOULD include any alterations to the Polkadot-SDK software collection, most likely Cumulus.

## Drawbacks, alternatives, and unknowns

None at present.

## Prior art and references

None.
