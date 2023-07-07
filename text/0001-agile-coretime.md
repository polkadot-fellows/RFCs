# RFC-1: Agile Coretime

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 30 June 2023                                                                                |
| **Description** | Agile periodic-sale-based model for assigning Coretime on the Polkadot Ubiquitous Computer. |
| **Authors**     | Gavin Wood                                                                                  |


## Summary

This proposes a periodic, sale-based method for assigning Polkadot Coretime. The method takes into account the need for long-term capital expenditure planning for teams building on Polkadot, yet also provides a means to allow Polkadot to capture long-term value in the resource which it sells. It supports the possibility of building secondary markets to make resource allocation more efficient and largely avoids the need for parameterisation.

## Motivation

### Present System

The present system of allocating time for parachains on the cores of the Polkadot Ubiquitous Computer (aka "Polkadot") is through a process known as *slot auctions*. These are on-chain candle auctions which proceed for several days and result in a core being assigned to a single parachain for six months at a time up to 18 months in advance. Practically speaking, we only see two year periods being bid upon and leased.

Funds behind the bids made in the slot auctions are merely locked, not consumed or paid and become unlocked and returned to the bidder on expiry of the lease period. A means of sharing the deposit trustlessly known as a *crowdloan* is available allowing token holders to contribute to the overall deposit of a chain without any counterparty risk.

### Problems

The present system is based on a model of one-core-per-parachain. This is a legacy interpretation of the Polkadot platform and is not a reflection of its present capabilities. By restricting ownership and usage to this model, more dynamic and resource-efficient means of utilising the Polkadot Ubiquitous Computer is lost.

More specifically, it is impossible to lease out cores at anything less than six months, and apparently unrealistic to do so at anything less than two years. This cuts out the ability to dynamically manage the underlying resource, and generally experimentation, iteration and innovation are hampered. It bakes into the platform an assumption of permanence for anything deployed into it and restricts the market's ability to find a more optimal allocation of the finite resource.

There is no ability to determine capital requirements for hosting a parachain beyond two years from the point of its initial deployment onto Polkadot. While it would be unreasonable to have perfect and indefinite cost predictions for any real-world platform, not having any clarity whatsoever beyond "market rates" two years hence can be a very off-putting prospect for teams to buy into.

However, quite possibly the most substantial problem is both a perceived and often real high barrier to entry of the Polkadot ecosystem. By forcing innovators to either raise 7-figure sums through investors or appeal to the wider token-holding community, Polkadot makes it essentially difficult for a small band of innovators from deploying their technology into Polkadot. While not being actually permissioned, it is also far from the barrierless, permissionless ideal which an innovation platform such as Polkadot should be striving for.

## Requirements

1. The solution SHOULD provide an acceptable value-capture mechanism for the Polkadot network.
1. The solution SHOULD allow parachains and other projects deployed on to the Polkadot UC to make long-term capital expenditure predictions for the cost of ongoing deployment.
1. The solution SHOULD minimize the barriers to entry in the ecosystem.
1. The solution SHOULD work when the number of cores which the Polkadot UC can support changes over time.
1. The solution SHOULD facilitate the optimal allocation of work to core of the Polkadot UC, including by facilitating the trade of regular core assignment at various intervals and for various spans.
1. The solution SHOULD avoid creating additional dependencies on functionality which the Relay-chain need not strictly provide for the delivery of the Polkadot UC.

Furthermore, the design SHOULD be implementable and deployable in a timely fashion; three months from the acceptance of this RFC should not be unreasonable.

## Stakeholders

Primary stakeholder sets are:

- Protocol researchers and developers, largely represented by the Polkadot Fellowship and Parity Technologies' Engineering division.
- Polkadot Parachain teams both present and future, and their users.
- Polkadot DOT token holders.

_Socialization:_

This RFC was presented at Polkadot Decoded 2023 Copenhagen on the Main Stage. A small amount of socialisation at the Parachain Summit preceeded it and some substantial discussion followed it. Parity Ecosystem team is currently soliciting views from ecosystem teams who would be key stakeholders.

## Explanation

### Overview

Upon implementation of this proposal, slot auctions and associated crowdloans cease. Instead, Coretime on the Polkadot UC is sold by the Polkadot System in two separate formats: *Bulk* and *Instantaneous*. This proposal only mandates the implementation of *Bulk Coretime*; any mentions of *Instantaneous Coretime* are only intended to illustrate a possible final solution.

Bulk Coretime is sold periodically on a specialised *Brokerage System Chain* and allocated in advance of its usage, whereas Instantaneous Coretime is sold on the Relay-chain immediately prior to usage on a block-by-block basis with an explicit allocation at the time of purchase.

Revenue from sales of Bulk Coretime is owned by the Polkadot Treasury. Owners of Bulk Coretime are tracked on this chain and the ownership status and properties of the owned Coretime are exposed over XCM as a non-fungible asset.

At the request of the owner, the Broker-chain allows a single Bulk Coretime asset, known as a *Region*, to be used in various ways including transferal to another owner, allocated to a particular parachain or placed in the Instantaneous Coretime Pool. Regions can also be split out, either into non-overlapping sub-spans or exactly-overlapping spans with less regularity.

The Brokerage System Chain periodically instructs the Relay-chain to assign its cores to alternative tasks as and when the allocation changes owing to a new Region taking effect.

#### Special Considerations

As a migration mechanism, pre-existing leases (from the legacy lease/slots/crowdloan framework) SHALL be recorded in the Broker-chain and cores assigned to them. When the lease comes to expiry, there is a mechanism to gain a priority sale of Bulk Coretime to ensure that the Parachain suffers no downtime.

Additionally, there is a renewal system which allows a core's assignment to be renewed unchanged with a known maximum price increase from month to month. In this case, the core's assignment must not include an Instantaneous Coretime allocation and must not have been split into smaller amounts.

Note that the intention behind renewals is only to ensure that committed Paras get some guarantees about price for predicting future costs. As such this price-capped renewal system only allows cores to be reused for their same tasks from month to month. In any other context, the regular sale system must be used and the regular price paid.

#### Relay-chain and Instantaneous Coretime

Sales of Instantaneous Coretime happen on the Polkadot Relay-chain. The Relay-chain is expected to be responsible for:

- holding non-transferable, non-refundable DOT-denominated Instantaneous Coretime Market Credit balance information for collators.
- setting and adjusting the price of Instantaneous Coretime based on usage.
- allowing collators to consume their ICM Credit at the current pricing in exchange for the ability to schedule one PoV for near-immediate usage.
- ensuring the Broker System Chain has timely accounting information on Coretime sales revenue.

#### Broker System Chain

Also known as the *Broker-chain*, this is a new system parachain. It has the responsibility of providing the Relay-chain via UMP with scheduling information of:

- The number of cores which should be made available during the next session.
- Which para IDs should be running on which cores and in what ratios.

The specific interface is properly described in RFC-5.

### Detail

#### Parameters

This proposal includes a number of parameters which need not necessarily be fixed. They are stated here along with a value, and are either *suggested* or *specified*. If *suggested*, it is non-binding and the proposal should not be judged on the value since the governance mechanism of Polkadot is expected to specify/maintain it. If *specified*, then the proposal should be judged on the merit of the value as-is.

| Name                | Value                        | |
| ------------------- | ---------------------------- | ---------- |
| `BULK_PERIOD`       | `28 * DAYS`                  | specified  |
| `LEADIN_PERIOD`     | `14 * DAYS`                  | specified  |
| `TIMESLICE`         | `8 * MINUTES`                | specified  |
| `BULK_TARGET`       | `30`                         | suggested  |
| `BULK_LIMIT`        | `45`                         | suggested  |
| `RENEWAL_PRICE_CAP` | `Perbill::from_percent(2)`   | suggested  |

#### Reservations

The Broker-chain includes some governance-set reservations of Coretime; these cover every System-chain as well as the pre-existing leased chains.

#### Regions

A *Region* is an assignable period of Coretime with a known regularity.

All Regions are associated with a unique *Core Index*, to identify which core the Region controls the assignment of.

All Regions are also associated with a *Core Parts*, an 80-bit bitmap, to denote the regularity on which it may be scheduled on the core. If all bits are set in the Core Parts value, it is said to be *Complete*.

All Regions have a span. Region spans are quantized into periods of `TIMESLICE` blocks; `BULK_PERIOD` divides into `TIMESLICE` a whole number of times.

The `Timeslice` type is a `u32` which can be multiplied by `TIMESLICE` to give a `BlockNumber` value representing the same quantity in terms of (Relay-chain) blocks.

Regions can be tasked to a ParaId or placed in the Instantaneous Coretime Pool. If they have yet to be placed or tasked, then they are fresh. Fresh Regions have an *Owner*.

#### Bulk Sales

A sale of Bulk Coretime occurs on the Broker Chain every `BULK_PERIOD` blocks.

In every sale, a `BULK_LIMIT` of individual *Regions* are offered for sale at a particular Sale Price.

The Regions offered for sale have the same span: they last exactly `BULK_PERIOD` blocks, and begin `LEADIN_PERIOD` blocks into the future at the time of the sale.

The Regions offered for sale also have complete

Each Region offered for sale has a different Core Index, ensuring that they each represent an independently allocatable resource on the Polkadot UC.

After every sale, the Next Sale Price is set according to the Previous Sale Price and the number of Regions sold compared to the desired and maximum amount of Regions to be sold. See Price Setting for additional detail.

This is designed to give a minimum of around two weeks worth of time for it to be sliced, shared, traded and allocated.

The Broker-chain aims to sell some `BULK_TARGET` month-long Regions, up to some maximum amount of `BULK_LIMIT`. It makes this sale in a single batch prior to the beginning of the period being sold by `LEADIN_PERIOD` blocks. The Broker-chain publishes the price for a Region prior to the sale execution.

#### Purchasing

Accounts may call a `purchase` function with the appropriate funds in place to have their funds placed On Hold and signal an commitment to purchase Bulk Coretime for the forthcoming period. One account may have only one pending purchase. Any number of accounts may attempt to `purchase` Bulk Coretime for the forthcoming period and this order is recorded.

Requests are processed in incoming order. If there are more purchase requests than available Regions for purchase then remaining purchase orders are carried over to the next sale and flagged as carried. A purchase is only cancellable (and the funds On Hold refundable) if it is so flagged.

When a purchase request is processed, the Funds On Hold are transferred to the local Treasury and a fresh Region of the proper span is issued and assigned to the purchaser as the owner.

#### Manipulation

Regions may be manipulated in various ways by its owner:

1. *Transferred* in ownership.
1. *Assigned* to a single, specific ParaID task.
1. *Partitioned* into quantized, non-overlapping segments of Bulk Coretime with the same ownership.
1. *Interlaced* into multiple Regions over the same period whose eventual assignments take turns to be scheduled.
1. *Contributed* into the Instantaneous Coretime Pool, in return for a pro-rata amount of the revenue from the Instantaneous Coretime Sales over its period.

#### Enactment

### Specific functions of the Broker-chain

Several functions of the Broker-chain SHALL be exposed through dispatchables and/or a `nonfungible` trait implementation integrated into XCM:

#### 1. `transfer`

Regions may have their ownership transferred.

A `transfer(region: RegionId, new_owner: AccountId)` dispatchable SHALL have the effect of altering the current owner of the Region identified by `region` from the signed origin to `new_owner`.

An implementation of the `nonfungible` trait SHOULD include equivalent functionality. `RegionId` SHOULD be used for the `AssetInstance` value.

#### 2. `assign`

Regions may be consumed in exchange for being assigned to a core.

A dispatchable `assign(region: RegionId, target: ParaId)` SHALL be provided corresponding to the `allocate` function described above.

It MUST be called with a Signed origin equal to the `owner` field of the value of the Regions map for the `region` key. The `allocation` field of this value MUST be `None` (a region may not be re-allocated).

On success, the `assign` value is changed to `Some` whose inner value is equal to `target`.

If the `begin` field of the `region` parameter is less than the current `Timeslice` value, then it is removed and re-entered with the current `Timeslice` value plus one, unless this would be equal to or greater than the `end` field of the corresponding `RegionRecord` value.

If the Region's span is the entire `BULK_PERIOD`, then the Broker-chain records in storage that the allocation happened during this period in order to facilitate the possibility for a renewal.

#### 3. `partition`

Regions may be split apart into two non-overlapping interior Regions of the same regularity.

A `partition(region: RegionId, pivot: Timeslice)` dispatchable SHALL have the effect of removing the Region identified by `region` and adding two new Regions of the same owner and core-parts. One new Region will begin at the same point of the old Region but end at `pivot`, whereas the other will begin at `pivot` and end at the end point of the old Region.

Also:
- `owner` field of `region` must the equal to the Signed origin.
- `pivot` must equal neither the `begin` nor `end` fields of the `region`.

#### 4. `interlace`

Regions may be strided into two Regions of the same span whose eventual assignments take turns on the core.

An `interlace(region: RegionId, parts: CoreParts)` dispatchable SHALL have the effect of removing the Region identified by `region` and create two new Regions. The new Regions will each have the same span and owner of the old Region, but one Region will have Core Parts equal to `parts` and the other will have Core Parts equal to the XOR of `parts` and the Core Parts of the old Region.

Also:
- `owner` field of `region` must the equal to the Signed origin.
- `parts` must have some bits set AND must not equal the Core Parts of the old Region AND must only have bits set which are also set in the old Region's' Core Parts.

#### 5. `contribute`

Regions may be consumed in exchange for a pro rata portion of the Instantaneous Coretime Sales Revenue from its period and regularity.

A dispatchable `contribute(region: RegionId, beneficiary: AccountId)` SHALL be provided.

#### 6. Renewals

A dispatchable `renew(core: CoreIndex)` SHALL be provided. Any account may call `renew` to purchase Bulk Coretime and renew an active allocation for the given `core`.

This MUST be called during the `LEADIN_PERIOD` prior to a Bulk sale (exactly like `purchase`) and has the same effect as `purchase` followed by `allocate` containing the same `ParaId`, except that:

1. The purchase always succeeds and as such must be processed prior to regular `purchase` orders.
2. The price of the purchase is the previous `price` incremented by `RENEWAL_PRICE_CAP` of itself or the regular price, whichever is lower.
3. The Region must not have been split. (Transfer and striding are allowed.)
4. The Region must be allocated in exactly the same way as before.

#### 7. Migrations

It is intended that paras which hold a lease from the legacy slot auction system are able to seamlessly transition into the Agile Coretime framework.

A dispatchable `migrate(core: CoreIndex)` SHALL be provided. Any account may call `migrate` to purchase Bulk Coretime at the current price for the given `core`.

This MUST be called during the `LEADIN_PERIOD` prior to a Bulk sale (exactly like `purchase`) and has the same effect as `purchase` followed by `allocate` with a value of `ParaId` containing just one item equal to `target`, except that:

1. The purchase always succeeds and as such MUST be processed prior to regular `purchase` orders.
2. There MUST be an ongoing legacy parachain lease whose parachain is assigned to `core` and which is due to expire during the Coretime period being purchased.

AllowedRenewals map is updated with this information ready for the following Bulk sale.

### Notes on Price Setting

The specific price setting mechanism is out of scope for this proposal and should be covered in some other work. The present proposal assumes the existence of a price-setting mechanism which could take into account three parameters; two mostly fixed and one which changes each `BULK_PERIOD`. These parameters are `BULK_TARGET`, `BULK_LIMIT` and `CORES_SOLD` which is the actual number of cores sold for the present `BULK_PERIOD` and is always an unsigned integer at most `BULK_LIMIT`.

In general we would expect the price to increase the closer `CORES_SOLD` gets to `BULK_LIMIT` and to decrease the closer it gets to zero. If it is exactly equal to `BULK_TARGET`, then we would expect the price to remain the same.

A simple example of this would be the formula:

```
NEW_PRICE := IF CORES_OLD < BULK_TARGET THEN
    OLD_PRICE - OLD_PRICE / 2 * CORES_SOLD / BULK_TARGET
ELSE
    OLD_PRICE + OLD_PRICE / 2 *
        (CORES_SOLD - BULK_TARGET) / (BULK_LIMIT - BULK_TARGET)
END IF
```

This exists only as a trivial example to demonstrate a basic solution exists, and should not be intended as a concrete proposal.

### Notes on Instantaneous Core Sales

For access to the Instantaneous Core sales we may include an `allocate_instantaneous` function. This should allocate the Coretime for usage by Polkadot to serve instantaneous requests and allow the `owner` to collect a pro-rata amount of total Instantaneous sales revenue.

For an efficient market to form around the provision of Bulk-purchased Cores into the pool of cores available for Instantaneous Coretime purchase, it is crucial to ensure that price changes for the purchase of Instantaneous Coretime are reflected well in the revenues of private Coretime providers during the same period.

In order to ensure this, then it is crucial that Instantaneous Coretime, once purchased, cannot be held indefinitely prior to eventual use since, if this were the case, a nefarious collator could purchase Coretime when cheap and utilize it some time later when expensive and deprive private Coretime providers of their revenue. It SHOULD therefore be assumed that Instantaneous Coretime, once purchased, has a definite and short "shelf-life", after which it becomes unusable. This incentivizes collators to avoid purchasing Coretime unless they expect to utilize it imminently and thus helps create an efficient market-feedback mechanism whereby a higher price will actually result in material revenues for private Coretime providers who contribute to the pool of Cores available to service Instantaneous Coretime purchases.

### Notes on Types

#### Regions

```rust
enum RecordState {
    Fresh { owner: AccountId },
    Instantaneous { beneficiary: AccountId },
    Assigned { target: ParaId },
}
type Timeslice = u32; // 80 block amounts.
type CoreIndex = u16;
type CorePart = [u8; 10]; // 80-bit bitmap.
struct RegionId {
    begin: Timeslice,
    core: CoreIndex,
    part: CorePart,
}
enum RegionRecord {
    Split { one: CorePart },
    Merged { other: CorePart },
    State {
        end: Timeslice,
        state: RecordState,
    },
}
type Regions = Map<RegionId, RegionRecord, OptionQuery>;

struct SplitRegion {
    core: CoreIndex,
    one: CorePart,
    other: CorePart,
}
// Processed in forward order.
const MAX_SPLITS_PER_TIMESLICE;
type RegionSplits = Map<Timeslice, BoundedVec<SplitRegion, MAX_SPLITS_PER_TIMESLICE>>
// Processed in reverse order.
const MAX_MERGES_PER_TIMESLICE;
type RegionMerges = Map<Timeslice, BoundedVec<SplitRegion, MAX_MERGES_PER_TIMESLICE>>

// Tracks the parts that a core has been split into and their next Region; informed by RegionSplits
// and RegionMerges, and used to determine the keys to look up in `Regions`. Initialized to
// `vec![([0xffu8; 10], begin)]` where `begin` is the `begin` field of the `RegionId` key for the
// core's initial region.
type CoreParts = Map<CoreIndex, BoundedVec<(CorePart, Timeslice), 80>>;
```

Example:

```rust
// Simple example with a `u16` `CorePart` and bulk sold in 100 timeslices.
RegionId { core: 0u16, begin: 100 } => 0b1111_1111_1111_1111u16 =>
    RegionRecord { end: 200u32, state: Fresh(Alice) };
// First split @ 50
RegionId { core: 0u16, begin: 100 } => 0b1111_1111_1111_1111u16 =>
    RegionRecord { end: 150u32, state: Fresh(Alice) };
RegionId { core: 0u16, begin: 150 } => 0b1111_1111_1111_1111u16 =>
    RegionRecord { end: 200u32, state: Fresh(Alice) };
// Share half of first 50 blocks
RegionId { core: 0u16, begin: 100 } => 0b1111_1111_0000_0000u16 =>
    RegionRecord { end: 150u32, state: Fresh(Alice) };
RegionId { core: 0u16, begin: 100 } => 0b0000_0000_1111_1111u16 =>
    RegionRecord { end: 150u32, state: Fresh(Alice) };
RegionId { core: 0u16, begin: 150 } => 0b1111_1111_1111_1111u16 =>
    RegionRecord { end: 200u32, state: Fresh(Alice) };
RegionSplits: 100 => vec![ { core: 0, one: 0b1111_1111_0000_0000u16, other: 0b0000_0000_1111_1111u16 } ]
RegionMerges: 150 => vec![ { core: 0, one: 0b1111_1111_0000_0000u16, other: 0b0000_0000_1111_1111u16 } ]
// Sell half of them to Bob
RegionId { core: 0u16, begin: 100 } => 0b1111_1111_0000_0000u16 =>
    RegionRecord { end: 150u32, state: Fresh(Alice) };
RegionId { core: 0u16, begin: 100 } => 0b0000_0000_1111_1111u16 =>
    RegionRecord { end: 150u32, state: Fresh(Bob) };
RegionId { core: 0u16, begin: 150 } => 0b1111_1111_1111_1111u16 =>
    RegionRecord { end: 200u32, state: Fresh(Alice) };
RegionSplits: 100 => vec![ { core: 0, one: 0b1111_1111_0000_0000u16, other: 0b0000_0000_1111_1111u16 } ]
RegionMerges: 150 => vec![ { core: 0, one: 0b1111_1111_0000_0000u16, other: 0b0000_0000_1111_1111u16 } ]
// Bob splits first 10 and assigns them to himself.
RegionId { core: 0u16, begin: 100 } => 0b1111_1111_0000_0000u16 =>
    RegionRecord { end: 150u32, state: Fresh(Alice) };
RegionId { core: 0u16, begin: 100 } => 0b0000_0000_1111_1111u16 =>
    RegionRecord { end: 110u32, state: Fresh(Bob) };
RegionId { core: 0u16, begin: 110 } => 0b0000_0000_1111_1111u16 =>
    RegionRecord { end: 150u32, state: Fresh(Bob) };
RegionId { core: 0u16, begin: 150 } => 0b1111_1111_1111_1111u16 =>
    RegionRecord { end: 200u32, state: Fresh(Alice) };
RegionSplits: 100 => vec![ { core: 0, one: 0b1111_1111_0000_0000u16, other: 0b0000_0000_1111_1111u16 } ]
RegionMerges: 150 => vec![ { core: 0, one: 0b1111_1111_0000_0000u16, other: 0b0000_0000_1111_1111u16 } ]
// Bob shares first 10 3 ways and sells smaller shares to Charlie and Dave
RegionId { core: 0u16, begin: 100 } => 0b1111_1111_0000_0000u16 =>
    RegionRecord { end: 150u32, state: Fresh(Alice) };
RegionId { core: 0u16, begin: 100 } => 0b0000_0000_1100_0000u16 =>
    RegionRecord { end: 110u32, state: Fresh(Charlie) };
RegionId { core: 0u16, begin: 100 } => 0b0000_0000_0011_0000u16 =>
    RegionRecord { end: 110u32, state: Fresh(Dave) };
RegionId { core: 0u16, begin: 100 } => 0b0000_0000_0000_1111u16 =>
    RegionRecord { end: 110u32, state: Fresh(Bob) };
RegionId { core: 0u16, begin: 110 } => 0b0000_0000_1111_1111u16 =>
    RegionRecord { end: 150u32, state: Fresh(Bob) };
RegionId { core: 0u16, begin: 150 } => 0b1111_1111_1111_1111u16 =>
    RegionRecord { end: 200u32, state: Fresh(Alice) };
RegionSplits: 100 => vec![
    { core: 0, one: 0b1111_1111_0000_0000u16, other: 0b0000_0000_1111_1111u16 }
    { core: 0, one: 0b0000_0000_1111_0000u16, other: 0b0000_0000_0000_1111u16 }
    { core: 0, one: 0b0000_0000_0000_1100u16, other: 0b0000_0000_0000_0011u16 }
]
RegionMerges:
    110 => vec![
        { core: 0, one: 0b0000_0000_1111_0000u16, other: 0b0000_0000_0000_1111u16 }
        { core: 0, one: 0b0000_0000_0000_1100u16, other: 0b0000_0000_0000_0011u16 }
    ],
    150 => vec![ { core: 0, one: 0b1111_1111_0000_0000u16, other: 0b0000_0000_1111_1111u16 } ]
// Bob assigns to his para B, Charlie and Dave assign to their paras C and D; Alice assigns to A
RegionId { core: 0u16, begin: 100 } => 0b1111_1111_0000_0000u16 =>
    RegionRecord { end: 150u32, state: Assigned(A) };
RegionId { core: 0u16, begin: 100 } => 0b0000_0000_1100_0000u16 =>
    RegionRecord { end: 110u32, state: Assigned(C) };
RegionId { core: 0u16, begin: 100 } => 0b0000_0000_0011_0000u16 =>
    RegionRecord { end: 110u32, state: Assigned(D) };
RegionId { core: 0u16, begin: 100 } => 0b0000_0000_0000_1111u16 =>
    RegionRecord { end: 110u32, state: Assigned(B) };
RegionId { core: 0u16, begin: 110 } => 0b0000_0000_1111_1111u16 =>
    RegionRecord { end: 150u32, state: Assigned(B) };
RegionId { core: 0u16, begin: 150 } => 0b1111_1111_1111_1111u16 =>
    RegionRecord { end: 200u32, state: Assigned(A) };
RegionSplits: 100 => vec![
    { core: 0, one: 0b1111_1111_0000_0000u16, other: 0b0000_0000_1111_1111u16 }
    { core: 0, one: 0b0000_0000_1111_0000u16, other: 0b0000_0000_0000_1111u16 }
    { core: 0, one: 0b0000_0000_0000_1100u16, other: 0b0000_0000_0000_0011u16 }
]
RegionMerges:
    110 => vec![
        { core: 0, one: 0b0000_0000_1111_0000u16, other: 0b0000_0000_0000_1111u16 }
        { core: 0, one: 0b0000_0000_0000_1100u16, other: 0b0000_0000_0000_0011u16 }
    ],
    150 => vec![ { core: 0, one: 0b1111_1111_0000_0000u16, other: 0b0000_0000_1111_1111u16 } ]
// Actual notifications to relay chain.
// Assumes:
// - Timeslice is 10 blocks.
// - Timeslice 0 begins at block #1000.
// - Relay needs 10 blocks notice of change.
//
// Block 990:
assign_core(core: 0u16, begin: 1000, assignment: vec![(A, 8), (C, 2), (D, 2), (B, 4)])
// Block 1090:
assign_core(core: 0u16, begin: 1100, assignment: vec![(A, 8), (B, 8)])
// Block 1490:
assign_core(core: 0u16, begin: 1500, assignment: vec![(A, 16)])
```

This map functions essentially as a linked list, with one region's `end` field acting as a reference to the next region's key's `begin` field.

`CoreParts` tracks what parts each core is currently been split into. This must be kept up to date by ensuring that for every new Timeslice, `RegionMerges` is first applied to it in reverse order and then `RegionSplits` applied in regular order. Once done, `CoreParts` can be iterated through to both determine the keys to look up in `Regions` and check at which Timeslice there will be an entry in `Regions`. When a `Region` has been processed, `CoreParts` should also be updated so that the `Timeslice` for the Region's `CorePart` value is set to the `Region`'s `end` field.

The Broker-chain provides feedback to the Relay-chain on which `ParaId` sets should be serviced on which cores, and does so as they change. Each block, the Broker-chain checks if the period of a `Timeslice` has elapsed. If so, it checks to see if any cores have a newly active `RegionRecord` value in the `Regions` map. If they do, it MUST notify the Relay-chain of the new responsibilities of the relevant `core`. In this case, it MUST remove the item from the `Regions` map and update the `NextRegion` map so it maps the relevant core to the value of removed record's `end` field.

#### Renewals

When assigning a Region which is the full `BULK_PERIOD` in span, the `AllowedRenewals` map is altered.

The map item for the core being assigned to is (re-)initialized if a value does not yet exist or one does exist whose `sale_begin` is less than `begin` value of the `Region` being assigned. Initializing simply means creating a new value with an empty `weighted_targets`, `price` equal to the last Sale Price and `sale_begin` equal to the `begin` value of the `Region` being assigned.

It is then mutated; `weighted_targets` is changed to include the `target` of the assignment, along with the `u8` weight component equal to the number of bits set in its `CoreParts` bitmap.

```rust
struct RenewalRecord {
    weighted_targets: Vec<(ParaId, u8)>,
    price: Balance,
    sale_begin: Timeslice,
}
type AllowedRenewals = Map<CoreIndex, RenewalRecord>;
```

When renewing, `AllowedRenewals` must contain a record for the renewed core whose `sale_begin` is `BULK_PERIOD` blocks less than the period whose sale is approaching and the sum of the second components of `weighted_targets` is 80. If successful, then `price` is increased by itself multiplied by `RENEWAL_PRICE_CAP` and used as a cap to the approaching sale's Sale Price. `weighted_targets` is the assignment of the renewed core.

### Rollout

Rollout of this proposal comes in several phases:

1. Finalise the specifics of implementation; this may be done through a design document or through a well-documented prototype implementation.
2. Implement the design, including all associated aspects such as unit tests, benchmarks and any support software needed.
3. If any new parachain is required, launch of this.
4. Formal audit of the implementation and any manual testing.
5. Announcement to the various stakeholders of the imminent changes.
6. Software integration and release.
7. Governance upgrade proposal(s).
8. Monitoring of the upgrade process.

## Performance, Ergonomics and Compatibility

No specific considerations.

Parachains already deployed into the Polkadot UC MUST have a clear plan of action to migrate to an agile Coretime market.

While this proposal does not introduce documentable features per se, adequate documentation must be provided to potential purchasers of Polkadot Coretime. This SHOULD include any alterations to the Polkadot-SDK software collection, most likely Cumulus.

## Testing, Security and Privacy

Regular testing through unit tests, integration tests, manual testnet tests, zombie-net tests and fuzzing SHOULD be conducted.

A regular security review SHOULD be conducted prior to deployment through a review by the Web3 Foundation economic research group.

Any final implementation MUST pass a professional external security audit.

The proposal introduces no new privacy concerns.

## Future Directions and Related Material

RFC-2 proposes a means of implementing the high-level allocations within the Relay-chain.

Additional work should specify the interface for the instantaneous market revenue so that the Broker chain can ensure Bulk Coretime placed in the instantaneous market is properly compensated.

## Drawbacks, Alternatives and Unknowns

None at present.

## Prior Art and References

None.
