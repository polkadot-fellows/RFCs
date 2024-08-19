# RFCs

This repository contains a number of Requests for Comment (RFCs) detailing proposed changes to the technical implementation of the Polkadot network. These RFCs are for the discussion and design of features which have been submitted for consideration to the developer Fellowship of Polkadot, as well as targets for the Fellowship's on-chain bodies to signal approval or disapproval of.

The RFCs can be [viewed here](https://polkadot-fellows.github.io/RFCs/).
The status of individual RFCs can be tracked [here](https://spiced-longship-f1a.notion.site/abbeb769972f4aa0afbfe41cac4544f1?v=9d8f94b22b62479d938db5401e4563a9).

## Scope

According to the [Fellowship Manifesto](https://github.com/polkadot-fellows/manifesto/blob/0c3df46d76625980b8b48742cb86f4d8fa6dda8d/manifesto.pdf), members of the Polkadot Fellowship are responsible for expertise in the strict description(s) and/or implementation(s) of these areas of contribution:
 * the internals of all functional Polkadot node implementations;
 * cryptographic data-structures, algorithms, languages and APIs required for the continued upkeep of the Polkadot (Main) Network;
 * consensus algorithms concerning the Relay-chain (BABE \& GRANDPA);
 * trust-free bridges relying on said consensus algorithms (planned to be) utilised by system chains;
 * parachain consensus;
 * cross-chain message passing (XCMP, HRMP, DMP \& UMP);
 * the Polkadot libp2p-based peer networking protocol;
 * the Polkadot topology strategies;
 * chain synchronisation strategies utilised by Polkadot;
 * the Polkadot business-logic (aka the 'runtime');
 * pallets utilised by the Polkadot (Main) Network and its system chains;
 * the internals of the frame pallet framework;
 * runtime and host APIs;
 * the XCM specification and realisation;
 * standard RPCs;
 * user-interface code required to practically execute upgrades to the Polkadot (Main) Network; and
 * code or technology required by, and utilised primarily for, any code or technology already included.

These RFCs are scoped to the subset of these concerns which must be held consistent across all implementations. Various implementation details, such as internal node algorithms, programming languages, or database formats are out of scope. Non-exhaustively, changes to network protocol descriptions, runtime logic and runtime public interfaces, inherents, transaction formats should be discussed via RFCs.

## Significance

These RFCs are in practice only a signaling mechanism to determine and indicate the Fellowship's design and architecture preferences and to coordinate discussion and social consensus on architectures and designs according to open-source principles.

The Fellowship holds only the powers vested in it by Polkadot's governance, which are limited to the expression of expert opinion and the ability to move proposals to more lenient governance tracks when necessary. It is not an arbiter of the "correctness" of any particular runtime or node implementation, and the practical meaning of these RFCs follows as a consequence of its limited powers. 

For any RFC concerning runtime logic or interfaces, the Fellowship's capabilities are bounded by relay-chain governance, which is the ultimate decider of what code is adopted for block processing. As such, these RFCs are only loosely binding - the chains' governance has no obligation to accept the features as implemented and may accept features which have not gone through the RFC process. When it comes to node-side areas of expertise, the Fellowship's vote is more strongly binding, as the governance systems of the chains can't determine the environment the runtime is executed within, and in practice all node implementations should conform to some foundational standards in order to communicate.

Merged RFCs are only an indication of support for a specific design, not a commitment to an implementation of a feature on any particular timeframe or roadmap ordering.

## Process

The RFC process is open to all contributors. Anyone may open an RFC or provide comments on open RFCs.

To open an RFC, follow these steps:
  * Copy the `0000-template.md` file into the `text` folder and rename to match the title of the RFC
  * Fill out the RFC template and open a PR.
  * Rename the file to correspond to the GitHub pull request number and update the "RFC PR" field in the file.

The Fellowship will decide, via an on-chain voting mechanism including members III-Dan or above, when to approve and merge RFCs. It does so by issuing an on-chain remark with the body `RFC_APPROVE(xxxx, h)` from the `Fellows` origin on the Polkadot Collectives blockchain, where xxxx is the number of the RFC and h is the blake2-256 hash of the raw proposal text. Once this remark has been made, the PR can be merged. This on-chain process is designed to be resilient to where the RFCs are hosted and in what format, so it can be migrated away from GitHub in the future. The fellowship should not approve more than one RFC with the same number.

The Fellowship may also decide to reject an RFC by issuing a remark with the text `RFC_REJECT(xxxx, h)`. This is a formality to provide clarity on when PRs (or their analogue on non-GitHub platforms) may be closed. PRs may be closed by their author, as well. PRs may be closed when sufficiently stale, as well - after a period of 1 year without acceptance.

Problems, requirements, and descriptions in RFC text should be stated using the following definitions of terms, roughly as laid out in [IETF RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119):
  * The terms "MUST", "MUST NOT", "SHALL", "SHALL NOT", or "REQUIRED" mean that the requirement is fixed and must be adhered to by implementations. These statements should be limited to those required for interoperability and security.
  * The terms "SHOULD", "RECOMMENDED", "SHOULD NOT", or "NOT RECOMMENDED" mean that there are only limited valid circumstances in which a requirement may be ignored.
  * The terms "MAY" or "OPTIONAL" mean that the requirement is optional, though interoperability between implementations making different choices in this respect is required.

## Bots

[![RFC Cron](https://github.com/polkadot-fellows/RFCs/actions/workflows/rfc-referenda-notifications.yml/badge.svg)](https://github.com/polkadot-fellows/RFCs/actions/workflows/rfc-referenda-notifications.yml)

The repository provides a bot for:

* Proposing RFCs on chain in a referenda to let the fellowship vote on the RFC. The referenda can only be created by accounts that are part of the fellowship.
* Processing (merging or closing) the PR after the on-chain referendum gets confirmed.

To use the bot you need to write the following comment into a pull request:

``` text
/rfc (help|propose|process)
```

It takes a moment and then the bot should answer with a comment with more instructions on how to proceed.

## Communication channels

The Fellowship is using Matrix for communication. Right now there exists two channels:

- [Polkadot Technical Fellowship Channel](https://matrix.to/#/#fellowship-members:parity.io): The channel for all Fellowship members to discuss. To get voice rights, you need to be part of the Fellowship. However, the channel is readable by anyone.
- [Polkadot Technical Fellowship - Open Channel](https://matrix.to/#/#fellowship-open-channel:parity.io): Open channel for anyone. Should be used to reach out to the Fellowship e.g. to request review or help on a topic.
