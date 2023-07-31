# RFC-1: Agile Coretime

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 30 June 2023                                                                                |
| **Description** | Agile periodic-sale-based model for assigning Coretime on the Polkadot Ubiquitous Computer. |
| **Authors**     | Gavin Wood                                                                                  |


## Summary

This proposes a periodic, sale-based method for assigning Polkadot Coretime, the analogue of "block space" within the Polkadot Network. The method takes into account the need for long-term capital expenditure planning for teams building on Polkadot, yet also provides a means to allow Polkadot to capture long-term value in the resource which it sells. It supports the possibility of building rich and dynamic secondary markets to optimize resource allocation and largely avoids the need for parameterization.

## Motivation

### Present System

The *Polkadot Ubiquitous Computer*, or just *Polkadot UC*, represents the public service provided by the Polkadot Network. It is a trust-free, WebAssembly-based, multicore, internet-native omnipresent virtual machine which is highly resilient to interference and corruption.

The present system of allocating the limited resources of the Polkadot Ubiquitous Computer is through a process known as *parachain slot auctions*. This is a parachain-centric paradigm whereby a single core is long-term allocated to a single parachain which itself implies a Substrate/Cumulus-based chain secured and connected via the Relay-chain. Slot auctions are on-chain candle auctions which proceed for several days and result in the core being assigned to the parachain for six months at a time up to 24 months in advance. Practically speaking, we only see two year periods being bid upon and leased.

Funds behind the bids made in the slot auctions are merely locked, they are not consumed or paid and become unlocked and returned to the bidder on expiry of the lease period. A means of sharing the deposit trustlessly known as a *crowdloan* is available allowing token holders to contribute to the overall deposit of a chain without any counterparty risk.

### Problems

The present system is based on a model of one-core-per-parachain. This is a legacy interpretation of the Polkadot platform and is not a reflection of its present capabilities. By restricting ownership and usage to this model, more dynamic and resource-efficient means of utilizing the Polkadot Ubiquitous Computer are lost.

More specifically, it is impossible to lease out cores at anything less than six months, and apparently unrealistic to do so at anything less than two years. This removes the ability to dynamically manage the underlying resource, and generally experimentation, iteration and innovation suffer. It bakes into the platform an assumption of permanence for anything deployed into it and restricts the market's ability to find a more optimal allocation of the finite resource.

There is no ability to determine capital requirements for hosting a parachain beyond two years from the point of its initial deployment onto Polkadot. While it would be unreasonable to have perfect and indefinite cost predictions for any real-world platform, not having any clarity whatsoever beyond "market rates" two years hence can be a very off-putting prospect for teams to buy into.

However, quite possibly the most substantial problem is both a perceived and often real high barrier to entry of the Polkadot ecosystem. By forcing innovators to either raise seven-figure sums through investors or appeal to the wider token-holding community, Polkadot makes it difficult for a small band of innovators to deploy their technology into Polkadot. While not being actually permissioned, it is also far from the barrierless, permissionless ideal which an innovation platform such as Polkadot should be striving for.

## Requirements

1. The solution SHOULD provide an acceptable value-capture mechanism for the Polkadot network.
1. The solution SHOULD allow parachains and other projects deployed on to the Polkadot UC to make long-term capital expenditure predictions for the cost of ongoing deployment.
2. The solution SHOULD minimize the barriers to entry in the ecosystem.
3. The solution SHOULD work well when the Polkadot UC has up to 1,000 cores.
4. The solution SHOULD work when the number of cores which the Polkadot UC can support changes over time.
5. The solution SHOULD facilitate the optimal allocation of work to cores of the Polkadot UC, including by facilitating the trade of regular core assignment at various intervals and for various spans.
6. The solution SHOULD avoid creating additional dependencies on functionality which the Relay-chain need not strictly provide for the delivery of the Polkadot UC.

Furthermore, the design SHOULD be implementable and deployable in a timely fashion; three months from the acceptance of this RFC should not be unreasonable.

## Stakeholders

Primary stakeholder sets are:

- Protocol researchers and developers, largely represented by the Polkadot Fellowship and Parity Technologies' Engineering division.
- Polkadot Parachain teams both present and future, and their users.
- Polkadot DOT token holders.

_Socialization:_

The essensials of this proposal were presented at Polkadot Decoded 2023 Copenhagen on the Main Stage. A small amount of socialization at the Parachain Summit preceeded it and some substantial discussion followed it. Parity Ecosystem team is currently soliciting views from ecosystem teams who would be key stakeholders.

## Explanation

### Overview

Upon implementation of this proposal, the parachain-centric slot auctions and associated crowdloans cease. Instead, Coretime on the Polkadot UC is sold by the Polkadot System in two separate formats: *Bulk Coretime* and *Instantaneous Coretime*.

When a Polkadot Core is utilized, we say it is dedicated to a *Task* rather than a "parachain". The Task to which a Core is dedicated may change at every Relay-chain block and while one predominant type of Task is to secure a Cumulus-based blockchain (i.e. a parachain), other types of Tasks are envisioned.

Bulk Coretime is sold periodically on a specialised system chain known as the *Coretime-chain* and allocated in advance of its usage, whereas Instantaneous Coretime is sold on the Relay-chain immediately prior to usage on a block-by-block basis.

This proposal does not fix what should be done with revenue from sales of Coretime and leaves it for a further RFC process.

Owners of Bulk Coretime are tracked on the Coretime-chain and the ownership status and properties of the owned Coretime are exposed over XCM as a non-fungible asset.

At the request of the owner, the Coretime-chain allows a single Bulk Coretime asset, known as a *Region*, to be used in various ways including transferal to another owner, allocated to a particular task (e.g. a parachain) or placed in the Instantaneous Coretime Pool. Regions can also be split out, either into non-overlapping sub-spans or exactly-overlapping spans with less regularity.

The Coretime-Chain periodically instructs the Relay-chain to assign its cores to alternative tasks as and when Core allocations change due to new Regions coming into effect.

#### Renewal and Migration

There is a renewal system which allows a Bulk Coretime assignment of a single core to be renewed unchanged with a known price increase from month to month. Renewals are processed in a period prior to regular purchases, effectively giving them precedence over a fixed number of cores available.

Renewals are only enabled when a core's assignment does not include an Instantaneous Coretime allocation and has not been split into shorter segments.

Thus, renewals are designed to ensure only that committed parachains get some guarantees about price for predicting future costs. This price-capped renewal system only allows cores to be reused for their same tasks from month to month. In any other context, Bulk Coretime would need to be purchased regularly.

As a migration mechanism, pre-existing leases (from the legacy lease/slots/crowdloan framework) are initialized into the Coretime-chain and cores assigned to them prior to Bulk Coretime sales. In the sale where the lease expires, the system offers a renewal, as above, to allow a priority sale of Bulk Coretime and ensure that the Parachain suffers no downtime when transitioning from the legacy framework.

#### Instantaneous Coretime

Processing of Instantaneous Coretime happens in part on the Polkadot Relay-chain. Credit is purchased on the Coretime-chain for regular DOT tokens, and this results in a DOT-denominated Instantaneous Coretime Credit account on the Relay-chain being credited for the same amount.

Though the Instantaneous Coretime Credit account records a balance for an account identifier (very likely controlled by a collator), it is *non-transferable* and *non-refundable*. It can only be consumed in order to purchase some Instantaneous Coretime with immediate availability.

The Relay-chain reports this usage back to the Coretime-chain in order to allow it to reward the providers of the underlying Coretime, either the Polkadot System or owners of Bulk Coretime who contributed to the Instantaneous Coretime Pool.

Specifically the Relay-chain is expected to be responsible for:

- holding non-transferable, non-refundable DOT-denominated Instantaneous Coretime Credit balance information.
- setting and adjusting the price of Instantaneous Coretime based on usage.
- allowing collators to consume their Instantaneous Coretime Credit at the current pricing in exchange for the ability to schedule one PoV for near-immediate usage.
- ensuring the Coretime-Chain has timely accounting information on Instantaneous Coretime Sales revenue.

#### Coretime-chain

The *Coretime-chain* is a new system parachain. It has the responsibility of providing the Relay-chain via UMP with information of:

- The number of cores which should be made available.
- Which tasks should be running on which cores and in what ratios.
- Accounting information for Instantaneous Coretime Credit.

It also expects information from the Relay-chain via DMP:

- The number of cores available to be scheduled.
- Account information on Instantaneous Coretime Sales.

The specific interface is properly described in RFC-5.

### Detail

#### Parameters

This proposal includes a number of parameters which need not necessarily be fixed. Their usage is explained below, but their values are suggested or specified in the later section *Parameter Values*.

#### Reservations and Leases

The Coretime-chain includes some governance-set reservations of Coretime; these cover every System-chain. Additionally, governance is expected to initialize details of the pre-existing leased chains.

#### Regions

A *Region* is an assignable period of Coretime with a known regularity.

All Regions are associated with a unique *Core Index*, to identify which core the assignment of which ownership of the Region controls.

All Regions are also associated with a *Core Mask*, an 80-bit bitmap, to denote the regularity at which it may be scheduled on the core. If all bits are set in the Core Mask value, it is said to be *Complete*. 80 is selected since this results in the size of the datatype used to identify any Region of Polkadot Coretime to be a very convenient 128-bit. Additionally, if `TIMESLICE` (the number of Relay-chain blocks in a Timeslice) is 80, then a single bit in the Core Mask bitmap represents exactly one Core for one Relay-chain block in one Timeslice.

All Regions have a span. Region spans are quantized into periods of `TIMESLICE` blocks; `BULK_PERIOD` divides into `TIMESLICE` a whole number of times.

The `Timeslice` type is a `u32` which can be multiplied by `TIMESLICE` to give a `BlockNumber` value representing the same quantity in terms of Relay-chain blocks.

Regions can be tasked to a `TaskId` (aka `ParaId`) or pooled into the Instantaneous Coretime Pool. This process can be *Provisional* or *Final*. If done only provisionally or not at all then they are fresh and have an *Owner* which is able to manipulate them further including reassignment. Once *Final*, then all ownership information is discarded and they cannot be manipulated further. Renewal is not possible when only provisionally tasked/pooled.

#### Bulk Sales

A sale of Bulk Coretime occurs on the Coretime-chain every `BULK_PERIOD` blocks.

In every sale, a `BULK_LIMIT` of individual *Regions* are offered for sale.

Each Region offered for sale has a different Core Index, ensuring that they each represent an independently allocatable resource on the Polkadot UC.

The Regions offered for sale have the same span: they last exactly `BULK_PERIOD` blocks, and begin immediately following the span of the previous Sale's Regions. The Regions offered for sale also have the complete, non-interlaced, Core Mask.

The Sale Period ends immediately as soon as span of the Coretime Regions that are being sold begins. At this point, the next Sale Price is set according to the previous Sale Price together with the number of Regions sold compared to the desired and maximum amount of Regions to be sold. See Price Setting for additional detail on this point.

Following the end of the previous Sale Period, there is an *Interlude Period* lasting `INTERLUDE_PERIOD` of blocks. After this period is elapsed, regular purchasing begins with the *Purchasing Period*.

This is designed to give at least two weeks worth of time for the purchased regions to be partitioned, interlaced, traded and allocated.

#### The Interlude

The Interlude period is a period prior to Regular Purchasing where renewals are allowed to happen. This has the effect of ensuring existing long-term tasks/parachains have a chance to secure their Bulk Coretime for a well-known price prior to general sales.

#### Regular Purchasing

Any account may purchase Regions of Bulk Coretime if they have the appropriate funds in place during the Purchasing Period, which is from `INTERLUDE_PERIOD` blocks after the end of the previous sale until the beginning of the Region of the Bulk Coretime which is for sale as long as there are Regions of Bulk Coretime left for sale (i.e. no more than `BULK_LIMIT` have already been sold in the Bulk Coretime Sale). The Purchasing Period is thus roughly `BULK_PERIOD - INTERLUDE_PERIOD` blocks in length.

The Sale Price varies during an initial portion of the Purchasing Period called the *Leadin Period* and then stays stable for the remainder. This initial portion is `LEADIN_PERIOD` blocks in duration. During the Leadin Period the price decreases towards the Sale Price, which it lands at by the end of the Leadin Period. The actual curve by which the price starts and descends to the Sale Price is outside the scope of this RFC, though a basic suggestion is provided in the Price Setting Notes, below.

#### Renewals

At any time when there are remaining Regions of Bulk Coretime to be sold, *including during the Interlude Period*, then certain Bulk Coretime assignmnents may be *Renewed*. This is similar to a purchase in that funds must be paid and it consumes one of the Regions of Bulk Coretime which would otherwise be placed for purchase. However there are two key differences.

Firstly, the price paid is the minimum of `RENEWAL_PRICE_CAP` more than what the purchase/renewal price was in the previous renewal and the current (or initial, if yet to begin) regular Sale Price.

Secondly, the purchased Region comes preassigned with exactly the same workload as before. It cannot be traded, repartitioned, interlaced or exchanged. As such unlike regular purchasing the Region never has an owner.

Renewal is only possible for either cores which have been assigned as a result of a previous renewal, which are migrating from legacy slot leases, or which fill their Bulk Coretime with an unsegmented, fully and finally assigned workload which does not include placement in the Instantaneous Coretime Pool. The renewed workload will be the same as this initial workload.

#### Manipulation

Regions may be manipulated in various ways by its owner:

1. *Transferred* in ownership.
1. *Partitioned* into quantized, non-overlapping segments of Bulk Coretime with the same ownership.
1. *Interlaced* into multiple Regions over the same period whose eventual assignments take turns to be scheduled.
1. *Assigned* to a single, specific task (identified by `TaskId` aka `ParaId`). This may be either *provisional* or *final*.
1. *Pooled* into the Instantaneous Coretime Pool, in return for a pro-rata amount of the revenue from the Instantaneous Coretime Sales over its period.

#### Enactment

### Specific functions of the Coretime-chain

Several functions of the Coretime-chain SHALL be exposed through dispatchables and/or a `nonfungible` trait implementation integrated into XCM:

#### 1. `transfer`

Regions may have their ownership transferred.

A `transfer(region: RegionId, new_owner: AccountId)` dispatchable shall have the effect of altering the current owner of the Region identified by `region` from the signed origin to `new_owner`.

An implementation of the `nonfungible` trait SHOULD include equivalent functionality. `RegionId` SHOULD be used for the `AssetInstance` value.

#### 2. `partition`

Regions may be split apart into two non-overlapping interior Regions of the same Core Mask which together concatenate to the original Region.

A `partition(region: RegionId, pivot: Timeslice)` dispatchable SHALL have the effect of removing the Region identified by `region` and adding two new Regions of the same owner and Core Mask. One new Region will begin at the same point of the old Region but end at `pivot` timeslices into the Region, whereas the other will begin at this point and end at the end point of the original Region.

Also:
- `owner` field of `region` must the equal to the Signed origin.
- `pivot` must equal neither the `begin` nor `end` fields of the `region`.

#### 3. `interlace`

Regions may be decomposed into two Regions of the same span whose eventual assignments take turns on the core by virtue of having complementary Core Masks.

An `interlace(region: RegionId, mask: CoreMask)` dispatchable shall have the effect of removing the Region identified by `region` and creating two new Regions. The new Regions will each have the same span and owner of the original Region, but one Region will have a Core Mask equal to `mask` and the other will have Core Mask equal to the XOR of `mask` and the Core Mask of the original Region.

Also:
- `owner` field of `region` must the equal to the Signed origin.
- `mask` must have some bits set AND must not equal the Core Mask of the old Region AND must only have bits set which are also set in the old Region's' Core Mask.

#### 4. `assign`

Regions may be assigned to a core.

A `assign(region: RegionId, target: TaskId, finality: Finality)` dispatchable shall have the effect of placing an item in the workplan corresponding to the region's properties and assigned to the `target` task.

If the region's end has already passed (taking into account any advance notice requirements) then this operation is a no-op. If the region's begining has already passed, then it is effectively altered to become the next schedulable timeslice.

`finality` may have the value of either `Final` or `Provisional`. If `Final`, then the operation is free, the `region` record is removed entirely from storage and renewal may be possible: if the Region's span is the entire `BULK_PERIOD`, then the Coretime-chain records in storage that the allocation happened during this period in order to facilitate the possibility for a renewal. (Renewal only becomes possible when the full Core Mask of a core is finally assigned for the full `BULK_PERIOD`.)

Also:
- `owner` field of `region` must the equal to the Signed origin.

#### 5. `pool`

Regions may be consumed in exchange for a pro rata portion of the Instantaneous Coretime Sales Revenue from its period and regularity.

A `pool(region: RegionId, beneficiary: AccountId, finality: Finality)` dispatchable shall have the effect of placing an item in the workplan corresponding to the region's properties and assigned to the Instantaneous Coretime Pool. The details of the region will be recorded in order to allow for a pro rata share of the Instantaneous Coretime Sales Revenue at the time of the Region relative to any other providers in the Pool.

If the region's end has already passed (taking into account any advance notice requirements) then this operation is a no-op. If the region's begining has already passed, then it is effectively altered to become the next schedulable timeslice.

`finality` may have the value of either `Final` or `Provisional`. If `Final`, then the operation is free and the `region` record is removed entirely from storage.

Also:
- `owner` field of `region` must the equal to the Signed origin.

#### 6. Purchases

A dispatchable `purchase(price_limit: Balance)` shall be provided. Any account may call `purchase` to purchase Bulk Coretime at the maximum price of `price_limit`.

This may be called successfully only:

1. during the regular Purchasing Period;
2. when the caller is a Signed origin and their account balance is reducible by the current sale price;
3. when the current sale price is no greater than `price_limit`; and
4. when the number of cores already sold is less than `BULK_LIMIT`.

If successful, the caller's account balance is reduced by the current sale price and a new Region item for the following Bulk Coretime span is issued with the owner equal to the caller's account.

#### 7. Renewals

A dispatchable `renew(core: CoreIndex)` shall be provided. Any account may call `renew` to purchase Bulk Coretime and renew an active allocation for the given `core`.

This may be called during the Interlude Period as well as the regular Purchasing Period and has the same effect as `purchase` followed by `assign`, except that:

1. The price of the sale is the Renewal Price (see next).
1. The Region is allocated exactly the given `core` is currently allocated for the present Region.

Renewal is only valid where a Region's span is assigned to Tasks (not placed in the Instantaneous Coretime Pool) for the entire unsplit `BULK_PERIOD` over all of the Core Mask and with Finality. There are thus three possibilities of a renewal being allowed:

1. Purchased unsplit Coretime with final assignment to tasks over the full Core Mask.
1. Renewed Coretime.
1. A legacy lease which is ending.

**Renewal Price**

The Renewal Price is the minimum of the current regular Sale Price (or the initial Sale Price if in the Interlude Period) and:

- If the workload being renewed came to be through the *Purchase and Assignment* of Bulk Coretime, then the price paid during that Purchase operation.
- If the workload being renewed was previously renewed, then the price paid during this previous Renewal operation plus `RENEWAL_PRICE_CAP`.
- If the workload being renewed is a migation from a legacy slot auction lease, then the nominal price for a Regular Purchase (outside of the Lead-in Period) of the Sale during which the legacy lease expires.

#### 8. Instantaneous Coretime Credits

A dispatchable `purchase_credit(amount: Balance, beneficiary: RelayChainAccountId)` shall be provided. Any account with at least `amount` spendable funds may call this. This increases the Instantaneous Coretime Credit balance on the Relay-chain of the `beneficiary` by the given `amount`.

This Credit is consumable on the Relay-chain as part of the Task scheduling system and its specifics are out of scope within this proposal. When consumed, revenue is recorded and provided to the Coretime-chain for proper distribution. The API for doing this is specified in RFC-5.

### Notes on the Instantaneous Coretime Market

For an efficient market to form around the provision of Bulk-purchased Cores into the pool of cores available for Instantaneous Coretime purchase, it is crucial to ensure that price changes for the purchase of Instantaneous Coretime are reflected well in the revenues of private Coretime providers during the same period.

In order to ensure this, then it is crucial that Instantaneous Coretime, once purchased, cannot be held indefinitely prior to eventual use since, if this were the case, a nefarious collator could purchase Coretime when cheap and utilize it some time later when expensive and deprive private Coretime providers of their revenue.

It must therefore be assumed that Instantaneous Coretime, once purchased, has a definite and short "shelf-life", after which it becomes unusable. This incentivizes collators to avoid purchasing Coretime unless they expect to utilize it imminently and thus helps create an efficient market-feedback mechanism whereby a higher price will actually result in material revenues for private Coretime providers who contribute to the pool of Cores available to service Instantaneous Coretime purchases.

### Notes on Economics

The specific pricing mechanisms are out of scope for the present proposal. Proposals on economics should be properly described and discussed in another RFC. However, for the sake of completeness, I provide some basic illustration of how price setting could potentially work.

#### Bulk Price Progression

The present proposal assumes the existence of a price-setting mechanism which takes into account several parameters:

- `OLD_PRICE`: The price of the previous sale.
- `BULK_TARGET`: the target number of cores to be purchased as Bulk Coretime Regions or renewed during the previous sale.
- `BULK_LIMIT`: the maximum number of cores which could have been purchased/renewed during the previous sale.
- `CORES_SOLD`: the actual number of cores purchased/renewed in the previous sale.
- `SELLOUT_PRICE`: the price at which the most recent Bulk Coretime was purchased (*not* renewed) prior to selling more cores than `BULK_TARGET` (or immediately after, if none were purchased before). This may not have a value if no Bulk Coretime was purchased.

In general we would expect the price to increase the closer `CORES_SOLD` gets to `BULK_LIMIT` and to decrease the closer it gets to zero. If it is exactly equal to `BULK_TARGET`, then we would expect the price to remain the same.

In the edge case that no cores were purchased yet more cores were sold (through renewals) than the target, then we would also avoid altering the price.

A simple example of this would be the formula:

```
IF SELLOUT_PRICE == NULL AND CORES_SOLD > BULK_TARGET THEN
    RETURN OLD_PRICE
END IF
EFFECTIVE_PRICE := IF CORES_SOLD > BULK_TARGET THEN
    SELLOUT_PRICE
ELSE
    OLD_PRICE
END IF
NEW_PRICE := IF CORES_SOLD < BULK_TARGET THEN
    EFFECTIVE_PRICE * MAX(CORES_SOLD, 1) / BULK_TARGET
ELSE
    EFFECTIVE_PRICE + EFFECTIVE_PRICE *
        (CORES_SOLD - BULK_TARGET) / (BULK_LIMIT - BULK_TARGET)
END IF
```

This exists only as a trivial example to demonstrate a basic solution exists, and should not be intended as a concrete proposal.

#### Intra-Leadin Price-decrease

During the Leadin Period of a sale, the effective price starts higher than the Sale Price and falls to end at the Sale Price at the end of the Leadin Period. The price can thus be defined as a simple factor above one on which the Sale Price is multiplied. A function which returns this factor would accept a factor between zero and one specifying the portion of the Leadin Period which has passed.

Thus we assume `SALE_PRICE`, then we can define `PRICE` as:

```
PRICE := SALE_PRICE * FACTOR((NOW - LEADIN_BEGIN) / LEADIN_PERIOD)
```

We can define a very simple progression where the price decreases monotonically from double the Sale Price at the beginning of the Leadin Period.

```
FACTOR(T) := 2 - T
```

#### Parameter Values

Parameters are either *suggested* or *specified*. If *suggested*, it is non-binding and the proposal should not be judged on the value since other RFCs and/or the governance mechanism of Polkadot is expected to specify/maintain it. If *specified*, then the proposal should be judged on the merit of the value as-is.

| Name                | Value                        | |
| ------------------- | ---------------------------- | ---------- |
| `BULK_PERIOD`       | `28 * DAYS`                  | specified  |
| `INTERLUDE_PERIOD`  | `7 * DAYS`                   | specified  |
| `LEADIN_PERIOD`     | `7 * DAYS`                   | specified  |
| `TIMESLICE`         | `8 * MINUTES`                | specified  |
| `BULK_TARGET`       | `30`                         | suggested  |
| `BULK_LIMIT`        | `45`                         | suggested  |
| `RENEWAL_PRICE_CAP` | `Perbill::from_percent(2)`   | suggested  |


#### Instantaneous Price Progression

This proposal assumes the existence of a Relay-chain-based price-setting mechanism for the Instantaneous Coretime Market which alters from block to block, taking into account several parameters: the last price, the size of the Instantaneous Coretime Pool (in terms of cores per Relay-chain block) and the amount of Instantaneous Coretime waiting for processing (in terms of Core-blocks queued).

The ideal situation is to have the size of the Instantaneous Coretime Pool be equal to some factor of the Instantaneous Coretime waiting. This allows all Instantaneous Coretime sales to be processed with some limited latency while giving limited flexibility over ordering to the Relay-chain apparatus which is needed for efficient operation.

If we set a factor of three, and thus aim to retain a queue of Instantaneous Coretime Sales which can be processed within three Relay-chain blocks, then we would increase the price if the queue goes above three times the amount of cores available, and decrease if it goes under.

Let us assume the values `OLD_PRICE`, `FACTOR`, `QUEUE_SIZE` and `POOL_SIZE`. A simple definition of the `NEW_PRICE` would be thus:

```
NEW_PRICE := IF QUEUE_SIZE < POOL_SIZE * FACTOR THEN
    OLD_PRICE * 0.95
ELSE
    OLD_PRICE / 0.95
END IF
```

This exists only as a trivial example to demonstrate a basic solution exists, and should not be intended as a concrete proposal.

### Notes on Types

This exists only as a short illustration of a potential technical implementation and should not be treated as anything more.

#### Regions

This data schema achieves a number of goals:
- Coretime can be individually traded at a level of a single usage of a single core.
- Coretime Regions, of arbitrary span and up to 1/80th interlacing can be exposed as NFTs and exchanged.
- Any Coretime Region can be contributed to the Instantaneous Coretime Pool.
- Unlimited number of individual Coretime contributors to the Instantaneous Coretime Pool. (Effectively limited only in number of cores and interlacing level; with current values this would allow 80,000 individual payees per timeslice).
- All keys are self-describing.
- Workload to communicate core (re-)assignments is well-bounded and low in weight.
- All mandatory bookkeeping workload is well-bounded in weight.

```rust
type Timeslice = u32; // 80 block amounts.
type CoreIndex = u16;
type CoreMask = [u8; 10]; // 80-bit bitmap.

// 128-bit (16 bytes)
struct RegionId {
    begin: Timeslice,
    core: CoreIndex,
    mask: CoreMask,
}
// 296-bit (37 bytes)
struct RegionRecord {
    end: Timeslice,
    owner: AccountId,
}

map Regions = Map<RegionId, RegionRecord>;

// 40-bit (5 bytes). Could be 32-bit with a more specialised type.
enum CoreTask {
    Off,
    Assigned { target: TaskId },
    InstaPool,
}
// 120-bit (15 bytes). Could be 14 bytes with a specialised 32-bit `CoreTask`.
struct ScheduleItem {
    mask: CoreMask, // 80 bit
    task: CoreTask, // 40 bit
}

/// The work we plan on having each core do at a particular time in the future.
type Workplan = Map<(Timeslice, CoreIndex), BoundedVec<ScheduleItem, 80>>;
/// The current workload of each core. This gets updated with workplan as timeslices pass.
type Workload = Map<CoreIndex, BoundedVec<ScheduleItem, 80>>;

enum Contributor {
    System,
    Private(AccountId),
}

struct ContributionRecord {
    begin: Timeslice,
    end: Timeslice,
    core: CoreIndex,
    mask: CoreMask,
    payee: Contributor,
}
type InstaPoolContribution = Map<ContributionRecord, ()>;

type SignedTotalMaskBits = u32;
type InstaPoolIo = Map<Timeslice, SignedTotalMaskBits>;

type PoolSize = Value<TotalMaskBits>;

/// Counter for the total CoreMask which could be dedicated to a pool. `u32` so we don't ever get
/// an overflow.
type TotalMaskBits = u32;
struct InstaPoolHistoryRecord {
    total_contributions: TotalMaskBits,
    maybe_payout: Option<Balance>,
}
/// Total InstaPool rewards for each Timeslice and the number of core Mask which contributed.
type InstaPoolHistory = Map<Timeslice, InstaPoolHistoryRecord>;
```

`CoreMask` tracks unique "parts" of a single core. It is used with interlacing in order to give a unique identifier to each component of any possible interlacing configuration of a core, allowing for simple self-describing keys for all core ownership and allocation information. It also allows for each core's workload to be tracked and updated progressively, keeping ongoing compute costs well-bounded and low.

Regions are issued into the `Regions` map and can be transferred, partitioned and interlaced as the owner desires. Regions can only be tasked if they begin after the current scheduling deadline (if they have missed this, then the region can be auto-trimmed until it is).

Once tasked, they are removed from there and a record is placed in `Workplan`. In addition, if they are contributed to the Instantaneous Coretime Pool, then an entry is placing in `InstaPoolContribution` and `InstaPoolIo`.

Each timeslice, `InstaPoolIo` is used to update the current value of `PoolSize`. A new entry in `InstaPoolHistory` is inserted, with the `total_contributions` field of `InstaPoolHistoryRecord` being informed by the `PoolSize` value. Each core's has its `Workload` mutated according to its `Workplan` for the upcoming timeslice.

When Instantaneous Coretime Market Revenues are reported for a particular timeslice from the Relay-chain, this information gets placed in the `maybe_payout` field of the relevant record of `InstaPoolHistory`.

Payments can be requested made for any records in `InstaPoolContribution` whose `begin` is the key for a value in `InstaPoolHistory` whose `maybe_payout` is `Some`. In this case, the `total_contributions` is reduced by the `ContributionRecord`'s `mask` and a pro rata amount paid. The `ContributionRecord` is mutated by incrementing `begin`, or removed if `begin` becomes equal to `end`.

Example:

```rust
// Simple example with a `u16` `CoreMask` and bulk sold in 100 timeslices.
Regions:
{ core: 0u16, begin: 100, mask: 0b1111_1111_1111_1111u16 } => { end: 200u32, owner: Alice };
// First split @ 50
Regions:
{ core: 0u16, begin: 100, mask: 0b1111_1111_1111_1111u16 } => { end: 150u32, owner: Alice };
{ core: 0u16, begin: 150, mask: 0b1111_1111_1111_1111u16 } => { end: 200u32, owner: Alice };
// Share half of first 50 blocks
Regions:
{ core: 0u16, begin: 100, mask: 0b1111_1111_0000_0000u16 } => { end: 150u32, owner: Alice };
{ core: 0u16, begin: 100, mask: 0b0000_0000_1111_1111u16 } => { end: 150u32, owner: Alice };
{ core: 0u16, begin: 150, mask: 0b1111_1111_1111_1111u16 } => { end: 200u32, owner: Alice };
// Sell half of them to Bob
Regions:
{ core: 0u16, begin: 100, mask: 0b1111_1111_0000_0000u16 } => { end: 150u32, owner: Alice };
{ core: 0u16, begin: 100, mask: 0b0000_0000_1111_1111u16 } => { end: 150u32, owner: Bob };
{ core: 0u16, begin: 150, mask: 0b1111_1111_1111_1111u16 } => { end: 200u32, owner: Alice };
// Bob splits first 10 and assigns them to himself.
Regions:
{ core: 0u16, begin: 100, mask: 0b1111_1111_0000_0000u16 } => { end: 150u32, owner: Alice };
{ core: 0u16, begin: 100, mask: 0b0000_0000_1111_1111u16 } => { end: 110u32, owner: Bob };
{ core: 0u16, begin: 110, mask: 0b0000_0000_1111_1111u16 } => { end: 150u32, owner: Bob };
{ core: 0u16, begin: 150, mask: 0b1111_1111_1111_1111u16 } => { end: 200u32, owner: Alice };
// Bob shares first 10 3 ways and sells smaller shares to Charlie and Dave
Regions:
{ core: 0u16, begin: 100, mask: 0b1111_1111_0000_0000u16 } => { end: 150u32, owner: Alice };
{ core: 0u16, begin: 100, mask: 0b0000_0000_1100_0000u16 } => { end: 110u32, owner: Charlie };
{ core: 0u16, begin: 100, mask: 0b0000_0000_0011_0000u16 } => { end: 110u32, owner: Dave };
{ core: 0u16, begin: 100, mask: 0b0000_0000_0000_1111u16 } => { end: 110u32, owner: Bob };
{ core: 0u16, begin: 110, mask: 0b0000_0000_1111_1111u16 } => { end: 150u32, owner: Bob };
{ core: 0u16, begin: 150, mask: 0b1111_1111_1111_1111u16 } => { end: 200u32, owner: Alice };
// Bob assigns to his para B, Charlie and Dave assign to their paras C and D; Alice assigns first 50 to A
Regions:
{ core: 0u16, begin: 150, mask: 0b1111_1111_1111_1111u16 } => { end: 200u32, owner: Alice };
Workplan:
(100, 0) => vec![
    { mask: 0b1111_1111_0000_0000u16, task: Assigned(A) },
    { mask: 0b0000_0000_1100_0000u16, task: Assigned(C) },
    { mask: 0b0000_0000_0011_0000u16, task: Assigned(D) },
    { mask: 0b0000_0000_0000_1111u16, task: Assigned(B) },
]
(110, 0) => vec![{ mask: 0b0000_0000_1111_1111u16, task: Assigned(B) }]
// Alice assigns her remaining 50 timeslices to the InstaPool paying herself:
Regions: (empty)
Workplan:
(100, 0) => vec![
    { mask: 0b1111_1111_0000_0000u16, task: Assigned(A) },
    { mask: 0b0000_0000_1100_0000u16, task: Assigned(C) },
    { mask: 0b0000_0000_0011_0000u16, task: Assigned(D) },
    { mask: 0b0000_0000_0000_1111u16, task: Assigned(B) },
]
(110, 0) => vec![{ mask: 0b0000_0000_1111_1111u16, task: Assigned(B) }]
(150, 0) => vec![{ mask: 0b1111_1111_1111_1111u16, task: InstaPool }]
InstaPoolContribution:
{ begin: 150, end: 200, core: 0, mask: 0b1111_1111_1111_1111u16, payee: Alice }
InstaPoolIo:
150 => 16
200 => -16
// Actual notifications to relay chain.
// Assumes:
// - Timeslice is 10 blocks.
// - Timeslice 0 begins at block #1000.
// - Relay needs 10 blocks notice of change.
//
Workload: 0 => vec![]
PoolSize: 0

// Block 990:
Relay <= assign_core(core: 0u16, begin: 1000, assignment: vec![(A, 8), (C, 2), (D, 2), (B, 4)])
Workload: 0 => vec![
    { mask: 0b1111_1111_0000_0000u16, task: Assigned(A) },
    { mask: 0b0000_0000_1100_0000u16, task: Assigned(C) },
    { mask: 0b0000_0000_0011_0000u16, task: Assigned(D) },
    { mask: 0b0000_0000_0000_1111u16, task: Assigned(B) },
]
PoolSize: 0

// Block 1090:
Relay <= assign_core(core: 0u16, begin: 1100, assignment: vec![(A, 8), (B, 8)])
Workload: 0 => vec![
    { mask: 0b1111_1111_0000_0000u16, task: Assigned(A) },
    { mask: 0b0000_0000_1111_1111u16, task: Assigned(B) },
]
PoolSize: 0

// Block 1490:
Relay <= assign_core(core: 0u16, begin: 1500, assignment: vec![(Pool, 16)])
Workload: 0 => vec![
    { mask: 0b1111_1111_1111_1111u16, task: InstaPool },
]
PoolSize: 16
InstaPoolIo:
200 => -16
InstaPoolHistory:
150 => { total_contributions: 16, maybe_payout: None }

// Sometime after block 1500:
InstaPoolHistory:
150 => { total_contributions: 16, maybe_payout: Some(P) }

// Sometime after block 1990:
InstaPoolIo: (empty)
PoolSize: 0
InstaPoolHistory:
150 => { total_contributions: 16, maybe_payout: Some(P0) }
151 => { total_contributions: 16, maybe_payout: Some(P1) }
152 => { total_contributions: 16, maybe_payout: Some(P2) }
...
199 => { total_contributions: 16, maybe_payout: Some(P49) }

// Sometime later still Alice calls for a payout
InstaPoolContribution: (empty)
InstaPoolHistory: (empty)
// Alice gets rewarded P0 + P1 + ... P49.
```

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

Parachains already deployed into the Polkadot UC must have a clear plan of action to migrate to an agile Coretime market.

While this proposal does not introduce documentable features per se, adequate documentation must be provided to potential purchasers of Polkadot Coretime. This SHOULD include any alterations to the Polkadot-SDK software collection.

## Testing, Security and Privacy

Regular testing through unit tests, integration tests, manual testnet tests, zombie-net tests and fuzzing SHOULD be conducted.

A regular security review SHOULD be conducted prior to deployment through a review by the Web3 Foundation economic research group.

Any final implementation MUST pass a professional external security audit.

The proposal introduces no new privacy concerns.

## Future Directions and Related Material

RFC-3 proposes a means of implementing the high-level allocations within the Relay-chain.

RFC-5 proposes the API for interacting with Relay-chain.

Additional work should specify the interface for the instantaneous market revenue so that the Coretime-chain can ensure Bulk Coretime placed in the instantaneous market is properly compensated.

## Drawbacks, Alternatives and Unknowns

Unknowns include the economic and resource parameterisations:

- The initial price of Bulk Coretime.
- The price-change algorithm between Bulk Coretime sales.
- The price increase per Bulk Coretime period for renewals.
- The price decrease graph in the Leadin period for Bulk Coretime sales.
- The initial price of Instantaneous Coretime.
- The price-change algorithm for Instantaneous Coretime sales.
- The percentage of cores to be sold as Bulk Coretime.
- The fate of revenue collected.

## Prior Art and References

None.
