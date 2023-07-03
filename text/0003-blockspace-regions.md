# RFC-0003: Blockspace Regions

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | June 27, 2023                                                                               |
| **Description** | Flexible and Future-proof Coretime allocation on the Polkadot relay-chain                   |
| **Authors**     | Robert Habermeier                                                                           |

## Summary

Blockspace regions are a dynamic, multi-purpose mechanism for determining the assignment of parachains to a relay chain's Execution Cores. They replace existing scheduling logic in the Polkadot Relay Chain, and introduce a notion of Hypercores for accepting parachain blocks at flexible points in time.

Each blockspace region is a data structure which indicates future rights to create blocks for an assigned parachain and keeps records of how many blocks have already been created. Regions can be split, transferred, and reassigned as a way of trading rights to blockspace in secondary markets, though these actions are gated to specific origins as a means of reducing relay-chain traffic. Regions are initially created by enshrined scheduling mechanisms (for example, RFC-0001) which lie beyond scope for this RFC. Parachains can own an arbitrary number of regions and are limited in block production only by the number and production rate of regions which they own. Each region belongs to a specific execution core, and cannot move between cores. Regions are referenceable by a unique 256-bit identifier within the relay-chain.

## Motivation

Polkadot must go beyond the one-core-per-chain paradigm in order to maximize allocative efficiency of the primary resource it creates: secure blockspace. Polkadot allocates blockspace through Coretime, the scheduling of many processes onto Execution Cores. Each unit of Coretime gives applications the right to make coarse-grained state transitions. Advancing the underlying scheduling technology will allow Polkadot to present highly sophisticated market mechanisms for Coretime and increase the effective utilization of Execution Cores with low overhead for blockspace consumers.

Demand for applications is highly volatile. Accommodating the burstiness of demand is one of the primary motivations for the region primitive. Depending on the high-level allocation mechanisms which are exposed, applications should be able to acquire an arbitrary number of blockspace regions as needed to meet demand. In theory, they will be bounded only by the limits of their ability to create blocks and the regions available in either primary or secondary markets. Likewise, during periods of low demand, regions enable mechanisms for selling off some proportion of their rights to future blockspace in order to recoup costs. Regions are a core primitive for adaptive demand.

Regions also reduce barriers to further innovation in the core relay-chain blockspace offerings. Once the runtime and node software have been adapted to run on blockspace regions, all future mechanisms for the relay-chain to sell blockspace may be implemented as simple algorithms which create and assign blockspace regions, without requiring any further modifications to node logic. This will give Polkadot's governance a larger toolkit to regulate the supply and granularity of blockspace entering the economy.

### Requirements

The specific requirements of the solution are to solve these problems directly or indirectly via higher-level market mechanisms:
  1. **The solution MUST gracefully handle tens of thousands of parachains without significant runtime scheduling overhead.**
    - To enable world-scale, highly agile coretime, as much scheduling overhead as possible should be pushed to validators' native implementations, or even better collators'.
  2. **The solution MUST minimize the complexity of determining a mapping between upcoming blocks of a parachain when the parachain is scheduled on many Execution Cores simultaneously.** 
    - Without this, the validators assigned to those execution cores will have no way of determining which upcoming blocks they are responsible for, and will waste resources. This is a practical requirement for e.g. elastic scaling an application to 2, 8, or 16 simultaneous cores.
  3. **The solution SHOULD minimize the time for applications to make up for missed scheduling opportunities even when cores are highly shared**. 
    - When cores are shared among e.g. 16 or 100 chains, it should not take 20 blocks to get data availability or finality on a candidate which missed its opportunity to be backed due to network latency or other probablistic factors. Being forced to the back of the line after a near miss when sharing cores is a bad user experience compared to other market offerings, and is avoidable when the system has resources to spare, with hyperthreading-like techniques.
  4. **The solution MUST accommodate a variety of different scheduling frequencies and overlapping durations, all on the same core.**
    - In the end-state of Polkadot, there should be highly mature secondary blockspace markets which can deliver extremely customized coretime solutions to users. Getting the infrastructure right to accommodate this early on will save implementers years of time, not to mention avoiding future migrations.
  5. **The solution SHOULD minimize the required advance notice for scheduling Coretime.** 
    - Application load is highly volatile, and the core scheduling primitives should enable applications to pay for only the Coretime they need, while allowing them to gracefully handle periods of heavy load. It is quite common for applications to suddenly experience a large influx of traffic and interest which lasts for a short time.
  6. **The solution MUST not allow chains to access more than their scheduled amount of Coretime.**
  7. **The solution MUST NOT allow parachains to build up arbitrary amounts of Coretime to spend later on**
    - The intention of regions is to ensure consistent rates of utilization by scheduled parachains. Allowing arbitrary amounts of Coretime to be built up and spent later will lead to misallocation of system resources during periods of high demand. Eliminating this type of arbitrage is necessary.

## Stakeholders

- Protocol Reaearchers and Developers.
- Polkadot Parachain teams both present and future, and their users.
- DOT Token Holders

These concepts have been alluded to in [Polkadot: Blockspace over Blockchains](https://www.rob.tech/blog/polkadot-blockspace-over-blockchains/) and discussed, with previous drafts of the design, [on the Polkadot Forum](https://forum.polkadot.network/t/unifying-bulk-and-mid-term-blockspace-with-strided-regions/2228)

## Explanation

### Parameters:

| Name                | Constant | Value     |
| ------------------- | -------- | --------- |
| RATE_DENOMINATOR    | YES      | 5040      |
| SCHEDULING_LENIENCE | NO       | 16        |
| HYPERCORES          | NO       | 8         |
| HYPERCORES_PER_CORE | NO       | 1         |

### Region and RegionSchema

A region is a data structure outlined below:

```rust
struct RegionSchema {
    // Relay-chain block number at which this region becomes active.
    start: u32,
    // Duration of the region in relay-chain blocks, i.e. it ends at start + duration
    duration: u32,
    // The maximum number of blocks which can be made in the region.
    // `None` signifies that the maximum should be limited only by the duration and rate.
    maximum: Option<u32>,
    // This value determines the rate at which the parachain produces blocks.
    // 
    // It is the numerator of a fraction where the denominator is `RATE_DENOMINATOR`, where
    // the fraction indicates the rate at which this region provides blockspace as compared to the
    // relay-chain's block-rate. That is, a numerator of `RATE_DENOMINATOR`, i.e. 1/1, means that
    // the region allows blocks to be made every relay chain block. A numerator of `RATE_DENOMINATOR/2` gives
    // one block every 2 relay-chain blocks. And so on.
    //
    // This value may not be greater than `RATE_DENOMINATOR`.
    rate_numerator: u32,
}

struct Region {
    // The core this region is assigned to.
    core: CoreIndex,
    // The schema of the region.
    schema: RegionSchema,
    // The count of blocks which have already been produced under the region.
    count: u32,
    // The assignee of the region is the parachain the region gives the right to create blocks to.
    assignee: ParaId,
}
```

Regions each have a 256-bit identifier, which are unique within the branch of the  relay-chain they are created. When regions are split or decomposed, the identifier of the newly created region is computed as `blake2_256(RegionId, child_count)`, where `child_count` is incremented afterwards. Because child region identifiers are computed deterministically, it is simple to create atomic sequences of transactions that both create and modify new regions. 

```rust
type RegionId = [u8; 32];
```

The `RATE_DENOMINATOR = 5040` is used to provide a fixed reference point for block frequency. It is sufficiently large as to allow blocks to come fairly infrequently, at a minimum of 8.4 hours with a numerator of 1, but not so large as to be unwieldy. 5040 is deliberately chosen as a [highly composite](https://en.wikipedia.org/wiki/Highly_composite_number) number, with 60 divisors, including all numbers between 1 and 10. This makes it possible to find exact fractions for common desired ratios of the relay-chain block-time such as 1/3, 1/4, 1/5, and so on. It also divides cleanly into `28 * DAYS`.

### The Regions Pallet

Regions will be managed within a "Regions" Pallet which exposes the following storage and `Call`s:

```rust
// Updated whenever regions are created, modified, or collected.
storage map RegionId -> Region;

// Updated when regions are created, transfered, or collected.
// This is required for runtime APIs or other higher-level logic on collators to iterate the regions assigned
// to a specific para.
storage double_map (ParaId, RegionId) -> ();

// All functions are gated to permissioned origins, which are controlled by governance and intended to be assigned to system chains for managing regions.

// Create a region. This is gated on allowed origins, e.g. a `RegionCreator` origin, set by governance.
fn create(Origin, Region) -> RegionId;

// Update the assigned parachain for a region.
fn assign(Origin, RegionId, ParaId);
```

Created regions for a core MUST NOT exceed a combined block rate of 1 at any block.

### Changes to backing/availability

Regions are used to modify the behavior of the parachain backing/availability pipeline. The first major change is that parachain candidates submitted to the relay-chain in the `ParasInherent` will be annotated with the `RegionId` that they are intended to occupy. Validators and collators do the work of figuring out which blocks are assigned to which regions, lifting the burden of granular scheduling off of the relay chain.

A submitted candidate for a parachain P at a block B is accepted if:
  * There is no candidate pending availability for B
  * The region is not expired or at its maximum count.
  * `(now - start) * rate_numerator > count * RATE_DENOMINATOR`

If all of these conditions are met, along with other validity conditions for backed candidates beyond the scope of this RFC, then the candidate is pending availability and the region's count is incremented. If the region's count is less than `((now - start) * rate_numerator / RATE_DENOMINATOR) - SCHEDULING_LENIENCE`, the count is set to this value before being incremented. If the candidate times out before becoming available, the count is once again decremented.

The scheduling lenience allows regions to fall behind their expected tickrate, but bounded to a small maximum.

This RFC introduces a new `HYPERCORES` parameter into the `HostConfiguration` which relay-chain governance uses to manage the parameters of the parachains protocol. Hypercores are inspired by technologies such as hyperthreading, to emulate multiple logical cores on a single phsyical core as resources permit. Hypercores allow parachains to make up for missed scheduling opportunities.

No more than `HYPERCORES_PER_CORE` additional candidates may be backed per core per relay-chain block, and only when hypercores are free, and the total amount of hypercore utilization MUST be no more than `HYPERCORES` per relay-chain block.

The reason behind this is that there may be more backed candidates than there are cores on a per-block basis even if regions are never over-allocated onto cores. The regions architecture accommodates variance both in the direction of missing opportunities to make blocks as well as variance in the direction of making up for missed blocks. System load becomes more volatile on a block-by-block basis but is stable over longer runs of blocks. Accommodating this "positive variance" to respect the frequencies of regions eliminates friction between regions assigned to the same core, which would be a major complication for scheduling.

### Changes to approval checking

Approval-checking is altered to support core: it accommodates multiple blocks being made available on the same core at the same time, and samples selection for these blocks based on the number of regular cores.

### Changes to runtime APIs

New runtime APIs are introduced:

```rust
fn region(RegionId) -> Option<Region>;
fn regions_assigned_to(ParaId) -> Vec<(RegionId, Region)>;
```

### Mapping onto requirements

This RFC fulfills requirement (1) by introducing a region primitive which is processed only lazily and pushes the work of determining which parachain blocks map onto which cores onto nodes, while ensuring that no parachain can use Coretime it hasn't been allocated.

This RFC fulfills requirement (2) by giving each region a unique ID and requiring each backed parachain block to be tagged with the assigned region. To implement elastic scaling, collators need only send the expected region ID to validators along with their candidate.

This RFC fulfills requirement (3) with Hypercores. Up to the allowed leniency in scheduling and the resources available in the system, scheduled chains may make up for missed opportunities to make blocks as early as the next relay-chain block.

This RFC fulfills requirement (4) with the region validity check in backing and by pushing the requirement of not over-scheduling onto higher-level logic. The region validity check leads to no scheduling friction between overlapping durations or varying frequencies among regions assigned to the same core.

This RFC fulfills requirement (5) as it works well even if regions are scheduled in the past, due to the `SCHEDULING_LENIENCE`.

This RFC fulfills requirement (6) with the region validity check, ensuring that parachains never exceed either the explicit or implicit maximum allocated to the region.

This RFC fulfills requirement (7) with the scheduling lenience logic, by setting an effective limit on how far behind the maximum possible utilized coretime a region can be.

## Drawbacks

* Hypercores and scheduling lenience, if not properly parameterized, could lead to high system load for short runs of consecutive blocks. This raises the risk of cascading failures when load gets too high.

## Prior Art

None

## Unresolved Questions

* Should regions have the ability to carry "extra data" which enforce additional constraints, such as a required collator?

## Future Possibilities

This RFC is only a minimal introduction to regions. The long-run possibilities involve:
  * Allowing parachains to have more than one block pending availability at a time, to enable chains to go faster than the relay chain by combining regions on multiple cores.
  * Migrating the on-demand parachain model to use regions with a maximum of `Some(1)` and an expiry of a few blocks in the future.
  * Introducing regions into the candidate receipt data structure itself - when a parachain is juggling multiple regions, its collators already have to have an idea of which blocks are intended to go on which regions, and foisting this onto validators to figure out when it's already been done is wasteful and error-prone.
  * Introduce more functions for splitting or decomposing regions into more than 2 at a time.
  * Region secondary markets. Higher-level code can avoid splitting regions eagerly and instead defer splitting and reassignment of regions to shortly before they are actually needed.
  * Parachain boosts. Polkadot can sell short-term boosts for chains for short durations in order to accommodate extra demand.
