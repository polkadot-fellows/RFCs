# RFC-0175: On-demand Coretime as Core Scheduling

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 13 August 2026                                                                              |
| **Description** | Proposal to move on-demand coretime sales from the Relay Chain to the Coretime chain. |
| **Authors**     | Sergej Sakač                                                                                |

## Summary

This RFC proposes moving on-demand coretime sales from the Relay Chain to the Coretime chain. The broker sells individual blocks on pool cores and commits them to the Relay Chain as one-shot core assignments, through the same channel that bulk coretime already uses. The spot price is computed from Coretime chain state alone. The Relay Chain's `on_demand` pallet is removed.

## Motivation

RFC-1 defined two coretime products: Bulk Coretime, sold on the Coretime chain, and on-demand coretime, sold on the Relay Chain. Bulk is fully owned by the Coretime chain: the broker computes each core's schedule and commits it to the Relay Chain via `assign_core` (RFC-5). On-demand is the exception. To sell a single block, the Relay Chain maintains:

- an order queue
- an adaptive spot price
- extrinsics for placing orders (`place_order_*`)
- a payment pot and revenue tracking, so that income can be teleported back to the Coretime chain
- a `Credits` ledger for credits purchased on the Coretime chain

This is the last part of coretime remaining on the Relay Chain. RFC-32 established the goal of migrating such functionality into system chains.

### Requirements

1. A collator MUST be able to obtain a block for its parachain with a single DOT-paying transaction on the Coretime chain.
2. A paid order MUST NOT be overwritten by a later schedule, nor silently dropped.
3. The pricing input MUST be derived purely from Coretime chain state; no Relay Chain state may be required.
4. The Relay Chain SHOULD end up with zero on-demand-specific logic.
5. The UMP traffic sent per Coretime chain block MUST remain bounded, regardless of how many orders are placed.

## Stakeholders

- Parachain teams producing blocks on demand, and their collators.
- Bulk coretime holders who contribute regions to the instantaneous pool and receive its revenue.
- Runtime developers of the Relay Chain and the Coretime chain.
- Wallets, SDK tooling, and collator-node automation currently built against the Relay Chain `place_order_*` extrinsics.

## Explanation

### Overview

Pool cores are no longer committed to the Relay Chain as `CoreAssignment::Pool`; the broker sells their individual blocks instead. An order proceeds as follows:

1. A user calls `place_order(max_amount, para_id)` on the Coretime chain.
2. The broker computes the spot price from its local count of outstanding orders. The order is rejected, with nothing charged, if the price exceeds `max_amount`, every pool core is at its pending-order cap, or the block's order limit has been reached.
3. Otherwise the spot price is charged and the order is buffered against the pool core with the fewest pending orders.
4. At the end of the Coretime chain block, the whole buffer is flushed as a single UMP message: one `Transact` per core, each carrying one `assign_core_once(core, tasks)` call with every order assigned to that core in this block.
5. The Relay Chain appends each call's tasks to the target core's schedule queue as a *one-shot* schedule: each task is served for exactly one block, in order, retrying while the core is blocked. Once the schedule is exhausted, the next one in the queue takes over.

The `on_demand` pallet and all remaining on-demand logic is deleted from the Relay Chain.

### Ordering on the Coretime chain

`place_order(max_amount: Balance, para_id: TaskId)` is a new dispatchable on the Coretime chain. As on the Relay Chain today, `max_amount` is only a price cap; the caller is charged the current spot price.

`place_order` does not send an XCM message by itself; it only buffers the order. All orders buffered during a block are sent to the Relay Chain together, at the end of the block, so UMP traffic stays bounded no matter how many orders are placed.

The broker assigns each order to the pool core with the fewest pending orders. It refuses an order only when:

- the spot price exceeds the caller's `max_amount`
- every pool core has reached `MAX_PENDING_ORDERS_PER_CORE` pending orders
- `MAX_ORDERS_PER_BLOCK` orders have already been accepted in this block

Orders MUST NOT be accepted onto a core that leaves the pool before the order's expected service block (plus a safety margin). Bulk scheduling has priority on the Relay Chain: a windowed schedule takes over the core at its `begin` even if one-shot tasks are still pending. The safety margin is therefore what guarantees that every paid order is served before the core changes hands.

Because whole blocks of a core are sold, pooling now requires a complete `CoreMask`. Attempts to pool a region whose mask is not complete MUST be rejected.

### Batching

At the end of each Coretime chain block, the pallet drains the order buffer and constructs, per pool core with new orders, a single call:

```rust
assign_core_once(core, vec![p1, p2, ...])
```

The tasks are listed in the order in which the orders were placed. All per-core calls are packed into one UMP message containing one `Transact` per core, prefixed with `UnpaidExecution`, the same way `assign_core` messages are constructed today.

Two limits apply to this message. The Relay Chain caps the number of instructions per XCM message (100 on Polkadot today), which bounds the number of `Transact`s, and it has only limited weight for executing incoming messages. `MAX_ORDERS_PER_BLOCK` MUST be chosen to respect both; if the number of pool cores ever approaches the per-message `Transact` limit, the flush can spill into multiple messages.

### Pool cores

With the relay-side order queue gone, `CoreAssignment::Pool` has nothing to point at. When a core enters the pool, the broker instead commits `assign_core(core, begin, [(Idle, 57600)], None)`. This is needed because schedules have no expiry. Without it, the previous tenant would keep producing blocks on the core. Sold blocks arrive via `assign_core_once`, and between them the core stays idle.

### The one relay-side change: one-shot assignments

The Relay Chain's coretime-assignment scheduler gains a second schedule kind:

```rust
pub enum ScheduleKind {
    /// The assignments share the core, each getting blocks in proportion to its ratio.
    /// Replaced as soon as the next schedule's `begin` is reached. This is the existing
    /// behaviour of every `assign_core` created schedule.
    Windowed,
    /// Each assignment is served for exactly one block, in order. The schedule never
    /// expires on its own, but a windowed schedule takes priority once its `begin` is
    /// reached.
    OneShot,
}
```

`ScheduleKind` is internal to the Relay Chain scheduler and is not part of any interface. Schedules created by `assign_core` are `Windowed`, while schedules created by `assign_core_once` are `OneShot`.

The relay-side coretime pallet gains a second broker-facing call next to `assign_core`:

```rust
pub fn assign_core_once(
    origin: OriginFor<T>,
    core: BrokerCoreIndex,
    tasks: Vec<TaskId>,
) -> DispatchResult
```

with the same origin rule as `assign_core` (root, or the broker parachain), and the following semantics:

- Each task occupies the full core for exactly one block; tasks are served in the order they arrived. There are no ratios and no `end_hint`.
- A task that cannot be served in a given block retries the next block, keeping its place. This replaces the `on_demand` pallet's `push_back_order`.
- The call SHOULD never fail. The order is already paid for on the Coretime chain; if the Relay Chain rejected the call, the user would have paid for a block that never gets scheduled.

Because one-shots only ever append behind existing entries, they never replace assignments already visible in the claim queue.

A draft implementation of the relay-side changes: <https://github.com/paritytech/polkadot-sdk/compare/master...szegoo-oneshot-assignments>

### Pricing

Pricing uses no Relay Chain data: the Coretime chain has everything it needs in local state.

The price retains the exact form used by the Relay Chain today:

```
spot_price = traffic * on_demand_base_fee
```

with `traffic` updated by the same adaptive formula the Relay Chain uses now, but fed from local state:

- *queue size* is the number of orders accepted but not yet served. The broker can track this locally, since the Relay Chain serves one task per pool core per block;
- *queue capacity* is `number_of_pool_cores * MAX_PENDING_ORDERS_PER_CORE`.

`traffic` is updated on every order and on every block, as today. The `on_demand_base_fee`, target-utilisation, and fee-variability parameters move from the Relay Chain's `HostConfiguration` into broker configuration.

### Payment and pool revenue

The spot price is paid into the broker's pot and accrued to the current timeslice's `InstaPoolHistory` record. This is the same record that receives on-demand revenue today. Distribution is unchanged: the system's share goes to the runtime's `OnRevenue` sink, and private pool contributors claim theirs through `claim_revenue`.

## Drawbacks

- **Latency.** An order must be included in a Coretime chain block and delivered over UMP before it can be scheduled. This adds a few relay blocks compared to ordering on the Relay Chain directly.
- **Retries.** A blocked one-shot retries until served, and the tasks behind it wait. Blocking conditions resolve within a few blocks, so the delay is bounded in practice. This is the cost of the no-drop guarantee (Requirement 2).
- **Pooling.** Requiring a complete `CoreMask` for pooling removes the ability to contribute interlaced regions to the pool.
- **Price model approximation.** The broker assumes one order is served per pool core per relay block. Blocked cores retry, so an order counted as served may still be pending.

## Testing, Security, and Privacy

Unit tests MUST cover the one-shot scheduling semantics on the Relay Chain and the ordering, batching, and pricing logic on the Coretime chain. The full flow, from order placement to a served one-shot assignment, SHOULD be covered by integration tests.

`assign_core_once` is callable only by root or the broker parachain, the same trust assumption as `assign_core`. The Coretime chain can already assign arbitrary cores, so no new privilege is created.

No privacy implications: order placement is exactly as public as it is today.

## Performance, Ergonomics, and Compatibility

### Performance

This is an optimization for the Relay Chain: the order queue, spot pricing, and payment handling are removed. The Coretime chain takes on the work instead.

### Ergonomics

Collators place orders on the Coretime chain instead of the Relay Chain. Tooling built against the relay-side `place_order_*` extrinsics must be repointed at the new `place_order`.

### Compatibility

The rollout is a breaking change to the on-demand interface and MUST be sequenced so that no paid order is left unserved. The Relay Chain gains `assign_core_once` first; relay-side ordering is then disabled and the queue drains; only then does the broker switch to selling one-shots.

RFC-5's interface is extended with one new call. `assign_core` and the `CoreAssignment` encoding are untouched. Consumers of the claim-queue runtime API see no difference between a one-shot and a bulk assignment.

## Prior Art and References

- [RFC-1: Agile Coretime](https://polkadot-fellows.github.io/RFCs/approved/0001-agile-coretime.html): defined Instantaneous Coretime.
- [RFC-5: Coretime Interface](https://polkadot-fellows.github.io/RFCs/approved/0005-coretime-interface.html): the interface this proposal extends.
- [RFC-10: Burn Coretime Revenue](https://polkadot-fellows.github.io/RFCs/approved/0010-burn-coretime-revenue.html): handling of the system's revenue share.
- [RFC-32: Minimal Relay](https://polkadot-fellows.github.io/RFCs/approved/0032-minimal-relay.html): the direction this proposal follows.
- Draft relay-side implementation: <https://github.com/paritytech/polkadot-sdk/compare/master...szegoo-oneshot-assignments>

## Unresolved Questions

- **Parameter values.** `MAX_PENDING_ORDERS_PER_CORE` and `MAX_ORDERS_PER_BLOCK` need concrete values.
- **Core-exit margin.** How large should the safety margin be when refusing orders on a core that is about to leave the pool? Too small a margin risks a paid order being cut off by the incoming tenant's schedule.
- **Same-block re-ordering.** Today's relay queue serves at most one order per parachain per scheduling round. Should the broker impose an equivalent rule (e.g. at most one buffered order per para per core per block), or is unrestricted ordering acceptable now that each order is bound to a concrete queue position at purchase time?

## Future Directions and Related Material

- Removing on-demand takes the Relay Chain a step closer to the transactionless relay envisioned in RFC-32.
- `assign_core_once` is a general primitive. New products could be built purely in Coretime chain logic, with no further relay changes.
- Selling one-shots for the same parachain on multiple cores in the same block would give on-demand elastic scaling. The relay-side design does not preclude this.
