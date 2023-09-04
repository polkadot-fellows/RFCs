# RFC-0022: Adopt Encointer Runtime

|                 |                                                       |
| --------------- |-------------------------------------------------------|
| **Start Date**  | Aug 22nd 2023                                         |
| **Description** | Permanently move the Encointer runtime into the Fellowship runtimes repo. |
| **Authors**     | @brenzi                                               |

## Summary

Encointer is a system chain on Kusama since Jan 2022 and has been developed and maintained by the Encointer association. This RFC proposes to treat Encointer like any other system chain and include it in the fellowship repo with [this PR](https://github.com/polkadot-fellows/runtimes/pull/17).

## Motivation

Encointer does not seek to be in control of its runtime repository. As a decentralized system, the fellowship has a more suitable structure to maintain a system chain runtime repo than the Encointer association does.

Also, Encointer aims to update its runtime in batches with other system chains in order to have consistency for interoperability across system chains. 

## Stakeholders

* Fellowship: streamlined reviews of system chain runtime upgrades
* Kusama Network: Tokenholders can easily see the changes of all system chains in one place.
* Encointer Association: Further decentralization of the Encointer Network necessities like devops.
* Encointer devs: Being able to work directly in the Fellowship runtimes repo to streamline and synergize with other developers. 

## Explanation

There are no details to elaborate on. It's just about the location of our runtime code. 
[Our PR](https://github.com/polkadot-fellows/runtimes/pull/17) has all details.

Noteworthy: All Encointer-specific pallets will still be located in encointer's repo for the time being: https://github.com/encointer/pallets 

## Drawbacks

Other than all other system chains, development and maintenance of the Encointer Network is mainly financed by the KSM Treasury and possibly the DOT Treasury in the future. Encointer is dedicated to maintaining its network and runtime code for as long as possible, but there is a dependency on funding which is not in the hands of the fellowship. The only risk in the context of funding, however, is that the Encointer runtime will see less frequent updates if there's less funding. 

## Testing, Security, and Privacy

No changes to the existing system are proposed. Only changes to how maintenance is organized

## Performance, Ergonomics, and Compatibility

No changes

## Prior Art and References

[Existing Encointer runtime repo](https://github.com/encointer/encointer-parachain/tree/master/polkadot-parachains/encointer-runtime)

## Unresolved Questions

None identified

## Future Directions and Related Material

More info on Encointer: [encointer.org](https://encointer.org)
