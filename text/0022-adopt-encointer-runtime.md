# RFC-0022: Adopt Encointer Runtime

|                 |                                                                           |
| --------------- |---------------------------------------------------------------------------|
| **Start Date**  | Aug 22nd 2023                                                             |
| **Description** | Permanently move the Encointer runtime into the Fellowship runtimes repo. |
| **Authors**     | @brenzi for Encointer Association, 8000 Zurich, switzerland               |

## Summary

Encointer is a system chain on Kusama since Jan 2022 and has been developed and maintained by the Encointer association. This RFC proposes to treat Encointer like any other system chain and include it in the fellowship repo with [this PR](https://github.com/polkadot-fellows/runtimes/pull/17).

## Motivation

Encointer does not seek to be in control of its runtime repository. As a decentralized system, the fellowship has a more suitable structure to maintain a system chain runtime repo than the Encointer association does.

Also, Encointer aims to update its runtime in batches with other system chains in order to have consistency for interoperability across system chains. 

## Stakeholders

* Fellowship: Will continue to take upon them the review and auditing work for the Encointer runtime, but the process is streamlined with other system chains and therefore less time-consuming compared to the separate repo and CI process we currently have.
* Kusama Network: Tokenholders can easily see the changes of all system chains in one place.
* Encointer Association: Further decentralization of the Encointer Network necessities like devops.
* Encointer devs: Being able to work directly in the Fellowship runtimes repo to streamline and synergize with other developers. 

## Explanation

[Our PR](https://github.com/polkadot-fellows/runtimes/pull/17) has all details about our runtime and how we would move it into the fellowship repo.

Noteworthy: All Encointer-specific pallets will still be located in encointer's repo for the time being: https://github.com/encointer/pallets 

It will still be the duty of the Encointer team to keep its runtime up to date and provide adequate test fixtures. So far, Encointer pallets have proven to be very stable and the runtime only needed to be updated every few months. 
However, frequent dependency bumps with Polkadot releases would be beneficial for interoperability and could be streamlined with other system chains collectively by the fellowship. This would allow to upgrade all system chains jointly (including Encointer) regularly with a batch referendum 

Further notes:
* Encointer currently releases none of its crates on crates.io
* Encointer does not carry out external auditing of its runtime nor pallets. It would be beneficial but not a requirement from our side if Encointer could join the auditing process of other system chains. 

## Drawbacks

Other than all other system chains, development and maintenance of the Encointer Network is mainly financed by the KSM Treasury and possibly the DOT Treasury in the future. Encointer is dedicated to maintaining its network and runtime code for as long as possible, but there is a dependency on funding which is not in the hands of the fellowship. The only risk in the context of funding, however, is that the Encointer runtime will see less frequent updates if there's less funding. 

## Testing, Security, and Privacy

No changes to the existing system are proposed. Only changes to how maintenance is organized.

## Performance, Ergonomics, and Compatibility

No changes

## Prior Art and References

[Existing Encointer runtime repo](https://github.com/encointer/encointer-parachain/tree/master/polkadot-parachains/encointer-runtime)

## Unresolved Questions

None identified

## Future Directions and Related Material

More info on Encointer: [encointer.org](https://encointer.org)
