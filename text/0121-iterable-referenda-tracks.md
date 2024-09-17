# RFC-0121: Iterable Referenda Tracks

|                 |                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| **Start Date**  | 17 September 2024                                                                                       |
| **Description** | Allow dynamic modifications of referenda tracks at runtime without the need for a full runtime upgrade. |
| **Authors**     | Pablo Dorado, Daniel Olano                                                                              |

## Summary

The protocol change introduces flexibility in the governance structure by enabling the referenda
track list to be modified dynamically at runtime. This is achieved by replacing static slices in
`TracksInfo` with iterators, facilitating storage-based track management. As a result, governance
tracks can be modified or added based on real-time decisions and without requiring runtime upgrades.

## Motivation

Polkadot's governance system is designed to be adaptive and decentralized, but modifying the
referenda tracks (which determine decision-making paths for proposals) has historically required
runtime upgrades. This poses an operational challenge, delaying governance changes until an upgrade
is scheduled and executed. The new system provides the flexibility needed to adjust tracks
dynamically, reflecting real-time changes in governance needs without the latency and risks
associated with runtime upgrades. This reduces governance bottlenecks and allows for quicker
adaptation to emergent scenarios.

## Stakeholders

- **Network stakeholders**: the change means reduced coordination effort for track adjustments.
- **Governance participants**: this enables more responsive decision-making pathways.

## Explanation

The protocol modification replaces the current static slice method used for storing referenda tracks
with an iterator-based approach that allows tracks to be managed dynamically using chain storage.
Governance participants can define and modify referenda tracks as needed, which are then accessed
through runtime rather than being hardcoded in the protocol. This system ensures that tracks are
adjustable at any time, reducing upgrade-related complexities and introducing agility in how
governance tracks are applied. This modification does not disrupt existing governance mechanisms but
rather enhances them by increasing adaptability.

In terms of technical structure, `TracksInfo::tracks` will now return iterators, making it possible
to alter track configurations based on storage data rather than static definitions. This opens up
possibilities for new track types and governance configurations to be deployed without the need for
upgrades that might take up weeks.

## Drawbacks

The most significant drawback is the increased complexity for developers managing track configurations
via storage-based iterators, which require careful handling to avoid misuse or inefficiencies.

Additionally, this flexibility could introduce risks if track configurations are modified improperly
during runtime, potentially leading to governance instabilities.

## Testing, Security, and Privacy

To ensure security, the change must be tested in testnet environments first (Paseo, Westend),
particularly in scenarios where multiple track changes happen concurrently. Potential
vulnerabilities in governance adjustments must be addressed to prevent abuse.

The proposal doesn't introduce privacy risks but increases the need for ensuring that any runtime
changes do not inadvertently lead to insecure governance structures.

Comprehensive tests should be conducted to validate correct track modifications in different
governance scenarios.

## Performance, Ergonomics, and Compatibility

### Performance

The proposal optimizes governance track management by avoiding the overhead of runtime upgrades,
reducing downtime, and eliminating the need for full consensus on upgrades. However, there is a
slight performance cost related to runtime access to storage-based iterators, though this is
mitigated by the overall system efficiency gains.

### Ergonomics

Developers and governance actors benefit from simplified governance processes but must account for
the technical complexity of managing iterator-based track configurations.

Tools may need to be developed to help streamline track adjustments in runtime.

### Compatibility

The change is backward compatible with existing governance operations, and does not require developers
to adjust how they interact with referenda tracks.

A migration is required to convert existing statically-defined tracks to dynamic storage-based
configurations without disruption.

## Prior Art and References

This dynamic governance track approach builds on previous work around Polkadot's on-chain governance
and leverages standard iterator patterns in Rust programming to improve runtime flexibility.
Comparable solutions in other governance networks were examined, but this proposal uniquely tailors
them to Polkadot’s decentralized, runtime-upgradable architecture.

## Unresolved Questions

- How to handle governance transitions for currently ongoing referenda when changing configuration
  parameters of an existing track? Ideally, most tracks should not have to go through this change,
  but some tactics might be applied (like a proposal that reduces the ongoing queue before a major
  change and then executes the change, after a reasonable period of time has elapsed and no ongoing
  referenda exists for that track).

## Future Directions and Related Material

There are already two proposed solutions for both the implementation and

- This [Pull Request][gh:2072] proposes changing `pallet-referenda`'s `TracksInfo` to make `tracks`
  return an iterator.
- There is already a proposed implementation of [`pallet-referenda-tracks`][gh:frame-contrib], which
  stores the configurations, and implements `TracksInfo` using the iterator approach.

[gh:2072]: https://github.com/paritytech/polkadot-sdk/pull/2072
[gh:frame-contrib]: https://github.com/virto-network/frame-contrib/tree/main/pallets/referenda-tracks
