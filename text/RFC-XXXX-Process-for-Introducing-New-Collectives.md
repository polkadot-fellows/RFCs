# RFC-0000: Process for Adding New System Collectives

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| **Start Date**  | 24 July 2023                                                                  |
| **Description** | A process for adding new (and removing existing) system collectives.          |
| **Authors**     | Joe Petrowski                                                                 |

## Summary

Since the introduction of the Collectives parachain, many groups have expressed interest in forming
new -- or migrating existing groups into -- on-chain collectives. While adding a new collective is
relatively simple from a technical standpoint, the Fellowship will need to merge new pallets into
the Collectives parachain for each new collective. This RFC proposes a means for the network to
ratify a new collective, thus instructing the Fellowship to instate it in the runtime.

## Motivation

Many groups have expressed interest in representing collectives on-chain. Some of these include:

- Parachain technical fellowship (new)
- Fellowship(s) for media, education, and evangelism (new)
- Polkadot Ambassador Program (existing)
- Anti-Scam Team (existing)

Collectives that form part of the core Polkadot protocol should have a mandate to serve the
Polkadot network. However, as part of the Polkadot protocol, the Fellowship, in its capacity of
maintaining system runtimes, will need to include modules and configurations for each collective.

Once a group has developed a value proposition for the Polkadot network, it should have a clear
path to having its collective accepted on-chain as part of the protocol. Acceptance should direct
the Fellowship to include the new collective with a given initial configuration into the runtime.
However, the network, not the Fellowship, should ultimately decide which collectives are in the
interest of the network.

## Stakeholders

- Polkadot stakeholders who would like to organize on-chain.
- Technical Fellowship, in its role of maintaining system runtimes.

## Explanation

The group that wishes to operate an on-chain collective should publish the following information:

- Charter, including the collective's mandate and how it benefits Polkadot. This would be similar
  to the
  [Fellowship Manifesto](https://github.com/polkadot-fellows/manifesto/blob/0c3df46/manifesto.pdf).
- Seeding recommendation.
- Member types, i.e. should members be individuals or organizations.
- Member management strategy, i.e. how do members join and get promoted, if applicable.
- How much, if at all, members should get paid in salary.
- Any special origins this Collective should have outside its self. For example, the Fellowship
  can whitelist calls for referenda via the `WhitelistOrigin`.

This information could all be in a single document or, for example, a GitHub repository.

After publication, members should seek feedback from the community and Technical Fellowship, and
make any revisions needed. When the collective believes the proposal is ready, they should bring a
remark with the text `APPROVE_COLLECTIVE("{collective name}, {commitment}")` to a Root origin
referendum. The proposer should provide instructions for generating `commitment`. The passing of
this referendum would be unequivocal direction to the Fellowship that this collective should be
part of the Polkadot runtime.

Note: There is no need for a `REJECT` referendum. Proposals that have not been approved are simply
not included in the runtime.

### Removing Collectives

If someone believes that an existing collective is not acting in the interest of the network or in
accordance with its charter, they should likewise have a means to instruct the Fellowship to
_remove_ that collective from Polkadot.

An on-chain remark from the Root origin with the text
`REMOVE_COLLECTIVE("{collective name}, {para ID}, [{pallet indices}]")` would instruct the
Fellowship to remove the collective via the listed pallet indices on `paraId`. Should someone want
to construct such a remark, they should have a reasonable expectation that a member of the
Fellowship would help them identify the pallet indices associated with a given collective, whether
or not the Fellowship member agrees with removal.

Collective removal may also come with other governance calls, for example voiding any scheduled
Treasury spends that would fund the given collective.

## Drawbacks

Passing a Root origin referendum is slow. However, given the network's investment (in terms of code
maintenance and salaries) in a new collective, this is an appropriate step.

## Testing, Security, and Privacy

No impacts.

## Performance, Ergonomics, and Compatibility

Generally all new collectives will be in the Collectives parachain. Thus, performance impacts
should strictly be limited to this parachain and not affect others. As the majority of logic for
collectives is generalized and reusable, we expect most collectives to be instances of similar
subsets of modules. That is, new collectives should generally be compatible with UIs and other
services that provide collective-related functionality, with little modifications to support new
ones.

## Prior Art and References

The launch of the Technical Fellowship, see the
[initial forum post](https://forum.polkadot.network/t/calling-polkadot-core-developers/506).

## Unresolved Questions

None at this time.
