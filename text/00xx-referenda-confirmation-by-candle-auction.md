# RFC-00xx: Referenda Confirmation by Candle Auction

|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| **Start Date**  | 22 March 2024                                                    |
| **Description** | Proposal to decide polls after confirm period via candle auction |
| **Authors**     | Pablo Dorado                                                     |

## Summary

In an attempt to mitigate risks derived from unwanted behaviours around long ongoing periods on
referenda, this proposal describes how to finalize and decide a result of a poll via a
mechanism similar to candle auctions.

## Motivation

Referenda protocol provide permissionless and efficient mechanisms to enable governance actors to
decide the future of the blockchains around Polkadot network. However, they pose a series of risks
derived from the game theory perspective around these mechanisms. One of them being where an actor
uses the the public nature of the tally of a poll as a way of determining the best point in time to
alter a poll in a meaningful way.

While this behaviour is expected based on the current design of the referenda logic, given the
recent extension of ongoing times (up to 1 month), the incentives for a bad actor to cause losses
on a proposer, reflected as wasted cost of opportunity increase, and thus, this otherwise
reasonable outcome becomes an attack vector, a potential risk to mitigate, especially when such
attack can compromise critical guarantees of the protocol (such as its upgradeability).

To mitigate this, the referenda underlying mechanisms should incentive actors to cast their votes
on a poll as early as possible. This proposal's approach suggests using a Candle Auction that will
be determined right after the confirm period finishes, thus decreasing the chances of actors to
alter the results of a poll on confirming state, and instead incentivizing them to cast their votes
earlier, on deciding state.

## Stakeholders

- **Governance actors**: Tokenholders and Collectives that vote on polls that have this mechanism
  enabled should be aware this change affects the outcome of failing a poll on its confirm period.
- **Runtime Developers**: This change requires runtime developers to change configuration
  parameters for the Referenda Pallet.
- **Tooling and UI developers**: Applications that interact with referenda must update to reflect
  the new `Finalizing` state.

## Explanation

Currently, the process of a referendum/poll

```mermaid
flowchart LR
  S[Submit] --> P[Preparing]
  P --> D[Deciding]
  D --> |Passing| C[Confirmation]
  C --> |Failing — while on decision period| D
  D --> |Failing| R[Rejected]
  C --> |Failing — after decision period| R
  C --> A[Approved]
```

This specification proposes including a Finalization state for a poll. This state is described as
the moment after and extends the decision for a couple of blocks, until is safe to consider the VRF
used to determine the candle block is not known before the ongoing period (decision/confirmation)
was over.

```mermaid
flowchart LR
  S[Submit] --> P[Preparing]
  P --> D[Deciding]
  D --> |Passing| C[Confirmation]
  C --> |Failing — while on decision period| D
  D --> |Failing| R[Rejected]
  C --> FF[Finalization]
  FF --> |Candle on/after passing| A[Approved]
  FF --> |Candle on/after failing| R

  style FF fill: #0a0, color: #fff
```

## Drawbacks

<!-- TODO: Add if any -->

## Prior Art and References

> TODO: Mention Prior Art

- `pallet-auction`

## Testing, Security, and Privacy

> TODO: Mention which testing is done (and will be added on the `polkadot-sdk` PR.

## Unresolved Questions

<!-- TODO: Add if any -->

## Future Directions and Related Material

<!-- TODO: Add if any -->
