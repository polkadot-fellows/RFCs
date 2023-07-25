# RFC-5: Coretime Interface

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 06 July 2023                                                                                |
| **Description** | Interface for manipulating the usage of cores on the Polkadot Ubiquitous Computer. |
| **Authors**     | Gavin Wood, Robert Habermeier                                                                    |


## Summary

In the Agile Coretime model of the Polkadot Ubiquitous Computer, as proposed in RFC-1 and RFC-3, it is necessary for the allocating parachain (envisioned to be one or more pallets on a specialised Brokerage System Chain) to communicate the core assignments to the Relay-chain, which is responsible for ensuring those assignments are properly enacted.

This is a proposal for the interface which will exist around the Relay-chain in order to communicate this information and instructions.

## Motivation

The background motivation for this interface is splitting out coretime allocation functions and secondary markets from the Relay-chain onto System parachains. A well-understood and general interface is necessary for ensuring the Relay-chain receives coretime allocation instructions from one or more System chains without introducing dependencies on the implementation details of either side.

## Requirements

- The interface MUST allow the Relay-chain to be scheduled on a low-latency basis.
- Individual cores MUST be schedulable, both in full to a single task (a ParaId or the Instantaneous Coretime Pool) or to many unique tasks in differing ratios.
- Typical usage of the interface SHOULD NOT overload the VMP message system.
- The interface MUST allow for the allocating chain to be notified of all accounting information relevant for making accurate rewards for contributing to the Instantaneous Coretime Pool.
- The interface MUST allow for Instantaneous Coretime Market Credits to be communicated.
- The interface MUST allow for the allocating chain to instruct changes to the number of cores which it is able to allocate.
- The interface MUST allow for the allocating chain to be notified of changes to the number of cores which are able to be allocated by the allocating chain.

## Stakeholders

Primary stakeholder sets are:

- Developers of the Relay-chain core-management logic.
- Developers of the Brokerage System Chain and its pallets.

_Socialization:_

This content of this RFC was discussed in the Polkdot Fellows channel.

## Explanation

The interface has two sections: The messages which the Relay-chain is able to receive from the allocating parachain (the *UMP message types*), and messages which the Relay-chain is able to send to the allocating parachain (the *DMP message types*). These messages are expected to be able to be implemented in a well-known pallet and called with the XCM `Transact` instruction.

Future work may include these messages being introduced into the XCM standard.

### UMP Message Types

#### `request_core_count`

Prototype:

```
fn request_core_count(
    count: u16,
)
```

Requests the Relay-chain to alter the number of schedulable cores to `count`. Under normal operation, the Relay-chain SHOULD send a `notify_core_count(count)` message back.

#### `request_revenue_info_at`

Prototype:

```
fn request_revenue_at(
    when: BlockNumber,
)
```

Requests that the Relay-chain send a `notify_revenue` message back at or soon after Relay-chain block number `when` whose `until` parameter is equal to `when`.

The period in to the past which `when` is allowed to be may be limited; if so the limit should be understood on a channel outside of this proposal. In the case that the request cannot be serviced because `when` is too old a block then a `notify_revenue` message must still be returned, but its `revenue` field may be `None`.

#### `credit_account`

Prototype:

```
fn credit_account(
    who: AccountId,
    amount: Balance,
)
```

Instructs the Relay-chain to add the `amount` of DOT to the Instantaneous Coretime Market Credit account of `who`.

It is expected that Instantaneous Coretime Market Credit on the Relay-chain is NOT transferrable and only redeemable when used to assign cores in the Instantaneous Coretime Pool.

#### `assign_core`

Prototype:

```
type PartsOf57600 = u16;
enum CoreAssignment {
    InstantaneousPool,
    Task(ParaId),
}
fn assign_core(
    core: CoreIndex,
    begin: BlockNumber,
    assignment: Vec<(CoreAssignment, PartsOf57600)>,
    end_hint: Option<BlockNumber>,
)
```

Requirements:

```
assert!(core < core_count);
assert!(targets.iter().map(|x| x.0).is_sorted());
assert_eq!(targets.iter().map(|x| x.0).unique().count(), targets.len());
assert_eq!(targets.iter().map(|x| x.1).sum(), 57600);
```

Where:
- `core_count` is assumed to be the sole parameter in the last received `notify_core_count` message.

Instructs the Relay-chain to ensure that the core indexed as `core` is utilised for a number of assignments in specific ratios given by `assignment` starting as soon after `begin` as possible. Core assignments take the form of a `CoreAssignment` value which can either task the core to a `ParaId` value or indicate that the core should be used in the Instantaneous Pool. Each assignment comes with a ratio value, represented as the numerator of the fraction with a denominator of 57,600.

If `end_hint` is `Some` and the inner is greater than the current block number, then the Relay-chain should optimize in the expectation of receiving a new `assign_core(core, ...)` message at or prior to the block number of the inner value. Specific functionality should remain unchanged regardless of the `end_hint` value.

On the choice of denominator: 57,600 is a very composite number which factors into: 2 ** 8, 3 ** 2, 5 ** 2. By using it as the denominator we allow for various useful fractions to be perfectly represented including thirds, quarters, fifths, tenths, 80ths, percent and 256ths.

### DMP Message Types

#### `notify_core_count`

Prototype:

```
fn notify_core_count(
    count: u16,
)
```

Indicate that from this block onwards, the range of acceptable values of the `core` parameter of `assign_core` message is `[0, count)`. `assign_core` will be a no-op if provided with a value for `core` outside of this range.

#### `notify_revenue_info`

Prototype:

```
fn notify_revenue_info(
    until: BlockNumber,
    revenue: Option<Balance>,
)
```

Provide the amount of revenue accumulated from Instantaneous Coretime Sales from Relay-chain block number `last_until` to `until`, not including `until` itself. `last_until` is defined as being the `until` argument of the last `notify_revenue` message sent, or zero for the first call. If `revenue` is `None`, this indicates that the information is no longer available.

This explicitly disregards the possibility of multiple parachains requesting and being notified of revenue information. The Relay-chain must be configured to ensure that only a single revenue information destination exists.

### Realistic Limits of the Usage

For `request_revenue_info`, a successful request should be possible if `when` is no less than the Relay-chain block number on arrival of the message less 100,000.

For `assign_core`, a successful request should be possible if `begin` is no less than the Relay-chain block  number on arrival of the message plus 10 and `workload` contains no more than 100 items.

## Performance, Ergonomics and Compatibility

No specific considerations.

## Testing, Security and Privacy

Standard Polkadot testing and security auditing applies.

The proposal introduces no new privacy concerns.

## Future Directions and Related Material

RFC-1 proposes a means of determining allocation of Coretime using this interface.

RFC-3 proposes a means of implementing the high-level allocations within the Relay-chain.

## Drawbacks, Alternatives and Unknowns

None at present.

## Prior Art and References

None.
