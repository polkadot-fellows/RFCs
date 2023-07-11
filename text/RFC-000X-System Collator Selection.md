# RFC-000X: System Collator Selection

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| **Start Date**  | 07 July 2023                                                                  |
| **Description** | Mechanism for selecting collators of system chains.                           |
| **Authors**     | Joe Petrowski                                                                 |

## Summary

As core functionality moves from the Relay Chain into system chains, so increases the reliance on
the liveness of these chains for the use of the network. It is not economically scalable, nor
necessary from a game-theoretic perspective, to pay collators large rewards. This RFC proposes a
mechanism -- part technical and part social -- for ensuring reliable collator sets that are
resilient to attemps to stop any subsytem of the Polkadot protocol.

## Motivation

In order to guarantee access to Polkadot's system, the collators on its system chains must propose
blocks (provide liveness) and allow all transactions to eventually be included. That is, some
collators may censor transactions, but there must exist one collator in the set who will include a
given transaction. In fact, all collators may censor varying subsets of transactions, but as long
as no transaction is in the intersection of every subset, it will eventually be included. The
objective of this RFC is to propose a mechanism to select such a set on each system chain.

While the network as a whole uses staking (and inflationary rewards) to attract validators,
collators face different challenges in scale and have lower security assumptions than validators.
Regarding scale, there exist many system chains, and it is economically expensive to pay collators
a premium. Likewise, any staked DOT for collation is _not_ staked for validation. Since collator
sets do not need to meet Byzantine Fault Tolerance criteria, staking as the primary mechanism for
collator selection would remove stake that is securing BFT assumptions, making the network less
secure.

Another problem with economic scalability relates to the increasing number of system chains, and
corresponding increase in need for collators (i.e., increase in collator slots). "Good" (highly
available, non-censoring) collators will not want to compete in elections on many chains when they
could use their resources to compete in the more profitable validator election. Such dilution
decreases the required bond on each chain, leaving them vulnerable to takeover by hostile
collator groups.

This RFC proposes a system whereby collation is primarily an infrastructure service, with the
on-chain Treasury reimbursing costs of semi-trusted node operators, referred to as "Invulnerables".
The system need not trust the individual operators, only that as a _set_ they would be resilient to
coordinated attempts to stop a single chain from halting or to censor a particular subset of
transactions.

In the case that users do not trust this set, this RFC also proposes that each chain always have
available collator positions that can be acquired by anyone by placing a bond.

### Requirements

- System MUST have at least one valid collator for every chain.
- System MUST allow anyone to become a collator, provided they `reserve`/`hold` enough DOT.
- System SHOULD select a set of collators with reasonable expectation that the set will not collude
  to censor any subset of transactions.
- Collators selected by governance SHOULD have a reasonable expectation that the Treasury will
  reimburse their operating costs.

## Stakeholders

- Infrastructure providers (people who run validator/collator nodes)
- Polkadot Treasury

## Explanation

This protocol builds on the existing
[Collator Selection pallet](https://github.com/paritytech/cumulus/tree/b15da70/pallets/collator-selection)
and its notion of Invulnerables. Invulnerables are collators (identified by their `AccountId`s) who
will be selected as part of the collator set every session. Operations relating to the management
of the Invulnerables are done through privileged, governance origins. The implementation should
maintain an API for adding and removing Invulnerable collators.

In addition to Invulnerables, there are also open slots for "Candidates". Anyone can register as a
Candidate by placing a fixed bond. However, with a fixed bond and fixed number of slots, there is
an obvious selection problem: The slots fill up without any logic to replace their occupants.

This RFC proposes that the collator selection protocol allow Candidates to increase (and decrease)
their individual bonds, sort the Candidates according to bond, and select the top `N` Candidates.
The selection and changeover should be coordinated by the session manager.

A FRAME pallet already exists for sorting ("bagging") "top N" groups, the
[Bags List pallet](https://github.com/paritytech/substrate/blob/5032b8d/frame/bags-list/src/lib.rs).
This pallet's `SortedListProvider` should be integrated into the session manager of the Collator
Selection pallet.

Despite the lack of apparent economic incentives (i.e., inflation), several reasons exist why one
may want to bond funds to participate in the Candidates election, for example:

- They want to build credibility to be selected as Invulnerable;
- They want to ensure availability of an application, e.g. a stablecoin issuer might run a collator
  on Asset Hub to ensure transactions in its asset are included in blocks;
- They fear censorship themselves, e.g. a voter might think their votes are being censored from
  governance, so they run a collator on the governance chain to include their votes.

Unlike the fixed-bond mechanism that fills up its Candidates, the election mechanism ensures that
anyone can join the collator set by placing the `Nth` highest bond.

### Set Size

In order to achieve the requirements listed under _Motivation_, it is reasonable to have
approximately:

- 20 collators per system chain,
- of which 15 are Invulnerable, and
- five are elected by bond.

## Drawbacks

The primary drawback is a reliance on governance for continued treasury funding of infrastructure
costs for Invulnerable collators.

## Testing, Security, and Privacy

The vast majority of cases can be covered by unit testing. Integration test should ensure that the
Collator Selection `UpdateOrigin`, which has permission to modify the Invulnerables and desired
number of Candidates, can handle updates over XCM from the system's governance location.

## Performance, Ergonomics, and Compatibility

This proposal has very little impact on most users of Polkadot, and should improve the performance
of system chains by reducing the number of missed blocks.

### Performance

As chains have strict PoV size limits, care must be taken in the PoV impact of the session manager.
Appropriate benchmarking and tests should ensure that conservative limits are placed on the number
of Invulnerables and Candidates.

### Ergonomics

The primary group affected is Candidate collators, who, after implementation of this RFC, will need
to compete in a bond-based election rather than a race to claim a Candidate spot.

### Compatibility

This RFC is compatible with the existing implementation and can be handled via upgrades and
migration.

## Prior Art and References

### Written Discussions

- [GitHub: Collator Selection Roadmap](https://github.com/paritytech/roadmap/issues/34)
- [GitHub: Revisit Collator Selection Mechanism](https://github.com/paritytech/cumulus/issues/1159)
- [Polkadot Forum: Economic Model for System Para Collators](https://forum.polkadot.network/t/economic-model-for-system-para-collators/1010)

### Prior Feedback and Input From

- Kian Paimani
- Jeff Burdges
- Rob Habermeier
- SR Labs Auditors
- Current collators including Paranodes, Stake Plus, Turboflakes, Peter Mensik, SIK, and many more.

## Unresolved Questions

None at this time.

## Future Directions and Related Material

There may exist in the future system chains for which this model of collator selection is not
appropriate. These chains should be evaluated on a case-by-case basis.
