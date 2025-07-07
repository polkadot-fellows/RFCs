# RFC-0151: Crowdsourced Decision Deposits

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | July 7th, 2025                                                                    |
| **Description** | Allow decision deposits to be crowdsourced.                                                                    |
| **Authors**     | polka.dom & Phunky                                                                                           |

## Summary

This RFC proposes changes to `pallet-referenda` that would allow for many people to contribute to a single referendum's decision deposit.

## Motivation

### Backdrop

Currently there are two types of deposits that must be placed for an OpenGov referendum to begin its deciding stage - the submission deposit, which is [miniscule](https://github.com/polkadot-fellows/runtimes/blob/34ecb949660704ccf139a06afb075c6a729b1295/relay/polkadot/src/governance/mod.rs#L53), and the decision deposit. Each of these can only be placed lump sum by a single account.  

### The Issue

The decision deposit can be (by design) quite large, reaching values up to [100k DOT](https://github.com/polkadot-fellows/runtimes/blob/34ecb949660704ccf139a06afb075c6a729b1295/relay/polkadot/src/governance/tracks.rs#L77) on the relay chain. Perhaps unsurprisingly, it can be observed that we are incurring voter signal loss due to this high barrier of entry, seen [here](https://polkadot.subsquare.io/referenda/1394) and [here](https://x.com/alice_und_bob/status/1930615911649567055). 

The primary motivation of this RFC is then to reduce that signal loss while still retaining high security assumptions.

## Stakeholders

`Governance Actors`: All actors in governance would be affected by this RFC, as it changes the dynamics of our federal and local voting systems.

`Runtime Developers`: Runtime developers will need to update their sdk version and enact a runtime migration.

`DApp Developers`: App developers will need to integrate the new changes into their UI/UX.

`Technical Writers`: A rewrite of existing documentation is not needed, but documentation for the new features would be warranted.

## Explanation

The changes to `pallet-referenda` would be as follows:

- A referendum's status must be modified to include a list of [deposits](https://github.com/paritytech/polkadot-sdk/blob/56234513d1d1b3cc9fb85fcc1a9735ab9df22ef2/substrate/frame/referenda/src/types.rs#L134) instead of just [one](https://github.com/paritytech/polkadot-sdk/blob/56234513d1d1b3cc9fb85fcc1a9735ab9df22ef2/substrate/frame/referenda/src/types.rs#L319).

- An additional extrinsic for contributing partially to a decision deposit should be created. Retrofitting the existing one would work as well, but at the cost of more breaking changes.

- The [kill](https://github.com/paritytech/polkadot-sdk/blob/56234513d1d1b3cc9fb85fcc1a9735ab9df22ef2/substrate/frame/referenda/src/lib.rs#L616-L630) and [refund_decision_deposit](https://github.com/paritytech/polkadot-sdk/blob/56234513d1d1b3cc9fb85fcc1a9735ab9df22ef2/substrate/frame/referenda/src/lib.rs#L561-L581) extrinsics must be updated to deal with a list of deposits.

- New [per-track info](https://github.com/paritytech/polkadot-sdk/blob/56234513d1d1b3cc9fb85fcc1a9735ab9df22ef2/substrate/frame/referenda/src/types.rs#L193-L215) fields for the `minimum amount contributable` and the `maximum amount of contributors` must be added. The minimum contributable helps with griefing (see below), and the maximum contributors keeps the storage/compute bounded.

- The last available slot for contribution must reserved only for those contributing what amount is remaining. This is to prevent griefing.

- Any amount contributed greater than the remaining amount required should not be locked/used.

- New errors must be created for `max contributors reached` and `contribution under the minimum`.

- A new event for `partial decision deposit placed` should be created. The [current event](https://github.com/paritytech/polkadot-sdk/blob/56234513d1d1b3cc9fb85fcc1a9735ab9df22ef2/substrate/frame/referenda/src/lib.rs#L307-L314) could be used, but may be confusing as it's known to mean the full amount.


## Drawbacks

See performance section.

## Testing, Security, and Privacy

This RFC opens up referenda to a griefing attack if improperly structured. It goes as follows - Alice opens a referendum, Bob creates `n = MaxContributors` faux accounts and fills all contributor spots with dust contributions, ensuring a referendum never achieves it's full decision deposit and in turn never makes it to the deciding phase.

One can avoid anything catastrophic by reserving the final contributor spot only for those contributing the remaining amount, but it is more difficult to keep antagonists from wasting contributor spots in general. A simple route is to make `minimum contribution = decision deposit / max contributors`; however, that might leave the barrier to contributing still too high. The tuning of this, or perhaps some unseen fix, is an open question.

## Performance, Ergonomics, and Compatibility

### Performance

The decision deposit field would take up potentially `max_contributors` times more storage/PoV. However, with the [decision deposit](https://github.com/paritytech/polkadot-sdk/blob/master/substrate/frame/referenda/src/types.rs#L134-L137) being just a handful of bytes, this should be manageable. Similarly the `kill` and `refund_decision_deposit` extrinsics would become `max_contributors` times more compute intensive. All other metrics would be conserved or nominal.

### Ergonomics

This RFC will make our referenda pipeline more ergonomic and open.

### Compatibility

DApps would need to account for the new decision deposit structure and potentially the new extrinsic if they so choose. In addition, for runtime developers, a storage migration is necessary to convert the old [ReferendumStatus](https://github.com/paritytech/polkadot-sdk/blob/56234513d1d1b3cc9fb85fcc1a9735ab9df22ef2/substrate/frame/referenda/src/types.rs#L295-L328) to the [new](https://github.com/PolkadotDom/polkadot-sdk/blob/2bee79f90c92ac1cf8fad12dbfcc93a7d3b948de/substrate/frame/referenda/src/types.rs#L320-L356).

## Prior Art and References

N/A

## Unresolved Questions

N/A

## Future Directions and Related Material

Find the current WIP [here](https://github.com/PolkadotDom/polkadot-sdk/tree/dom/crowdsource-decision-deposit/substrate/frame/referenda/src).

Considering Governance will soon be in a smart contracts environment, this change could be further augmented through contracts.
