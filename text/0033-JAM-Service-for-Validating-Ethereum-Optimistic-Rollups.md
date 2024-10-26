
# RFC-0033: JAM Service for Validating Ethereum Optimistic Rollups

|                 |                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 26 October 2024                               |
| **Description** | JAM Service for Securing Ethereum Optimistic Rollups |
| **Authors**     | Sourabh Niyogi                                |
| **Abstract**    | JAM's *rollup host* function can be extended from Polkadot rollups to non-Polkadot rollups. We outline the design of a JAM service capable of securing Ethereum *optimistic* rollups, such as OP Stack and ArbOS. This service transforms optimistic rollups to cynical rollups, allowing users to benefit from the finality and high throughput of JAM, alongside JAM's anticipated messaging service. This JAM service's competitive advantage enables rollup operators to choose JAM/Polkadot over Ethereum or other rollup providers. A precise design for the service's refine-accumulate function is outlined, using tools already available. |

## Background

The Gray Paper suggests a design for applying the same audit protocol from Polkadot's parachain validation service to ETH rollups: "_Smart-contract state may be held in a coherent format on the JAM chain so long as any updates are made through the 15kb/core/sec work results, which would need to contain **only the hashes of the altered contracts’ state roots**._" This proposal concretely addresses two top non-Polkadot optimistic rollup platforms: [OP Stack](https://stack.optimism.io/) and [ArbOS](https://docs.arbitrum.io/how-arbitrum-works/arbos/introduction).

Optimistic rollups use centralized sequencers and have no forks, creating an illusion of fast finality while actually relying on delayed fraud proofs. Optimistic rollups are termed "optimistic" because they assume transactions are valid by default, requiring fraud proofs on Ethereum L1 if a dispute arises. Currently, ORUs store L2 data on ETH L1, using EIP-4844's blob transactions or similar DA alternatives, just long enough to allow for fraud proof submission.

This approach, however, incurs a cost: a 7-day exit window to accommodate fraud proofs. JAM Service can eliminate this long exit window by validating optimistic rollups.

## Motivation

JAM is intended to host rollups rather than serve end users directly.

A secure JAM service for Optimistic Rollups will expand JAM's service scope to include optimistic rollups and enhance their appeal with JAM's finality.

This expanded focus on rollups will increase CoreTime demand, making JAM attractive to both existing and new optimistic rollups by reducing exit windows.

This JAM Service converts optimistic rollups into cynical rollups, delivering a user experience advantage that is marketable. With popular CEXes (Coinbase, Kraken) adopting OP Stack, this improvement is highly visible to retail users, turning ORUs into CRUs "Secured by JAM" for a competitive edge.

## Requirements

1. Securing optimistic rollups with a JAM Service should be practical and require minimal changes by the ORU operator.
2. Securing Polkadot rollups with a JAM Service should **not** be affected.

## Stakeholders

1. Optimistic Rollup Operators seeking shorter exit windows, lower costs, higher scalability, and DA.
2. Web3 developers wanting to create applications on cynical rollups secured by JAM.
3. DOT Holders aiming to increase CoreTime demand.

# JAM Service Design

## Overview

Rollups produce a sequence of blocks ${\bf B}$ with headers ${\bf H}$. The header ${\bf H}$ contains a parent header hash ${\bf H}_p$ and a state root ${\bf H}_{r}$, which represents the global state after applying all block transactions. The transactions trie root is unnecessary here; validating the state trie root alone is sufficient for securing rollups.  

This JAM Service strategy, as hinted in the JAM Gray Paper, aggregates storage proofs of altered smart account/contract states into a chain of work packages. These validate an uninterrupted chain of an optimistic rollup's blocks against the state root ${\bf H}_r$.

Instead of relying on a *promise* that the state root is correct unless proven otherwise, JAM validates it using storage proofs for each contract update across $N$ blocks.

The rollup operator submits headers and Merkle proofs in a chain of work packages $...,  p_{n-1}, p_{n}, p_{n+1}, ...$ corresponding to the rollup chain, grouping $N$ blocks of data in each package. Typically, each work package $p_n$ requires a prerequisite work package $p_{n-1}$.

## Refine:

#### Key Input: Work Packages

In JAM's refine code, work package content is as follows:

| JAM Refine               | Content |
| --- | --- |
| *Work Package* $p_n \in \mathbb{P}$     | Data submitted by ORU operator for validation of blocks $i$ through $j$ |
| *Payload* ${\bf y}$     | Chain ID (e.g., 10, 42161, etc.), start and end block numbers expected in extrinsics |
| *Imported Data Segment* ${\bf i}$     | Last ${\bf H}$ validated by the service in the _previous_ work package $p_{n-1}$  |
| *Extrinsics* $\bar{{\bf x}}$   | Header ${\bf H}$, block hash $H({\bf B})$, and Merkle proofs $\Pi$ detailed below |
| *Work Items* ${\bf w} \in \mathbb{I}$   | Summary of the first and last blocks ($i$ to $j$) |
| *Exported Data Segment* ${\bf e}$    | Last validated ${\bf H}$, used in the _next_ work package $p_{n+1}$ |
| *Work Result* ${\bf r}$    | $N$ header hashes $H({\bf H})$ and $N$ block hashes $H({\bf B})$ |

Refine's operations:

1. Check for authorization ${\bf o}$.
2. Perform `historical_lookup` to fetch the last on-chain state in the anchor block.
3. `Import` the last header ${\bf H}$ and confirm that the imported data segment ${\bf i}$ matches the `historical_lookup`.
4. For each extrinsic header in ${\bf H}$:
    - Ensure that each header forms a chain, with ${\bf H}_p$ matching the previous extrinsic $H({\bf H})$, except for the first header, which must match the previous 2.
    - Using the state root ${\bf H}_r$, validate all Merkle proofs.
5. `Export` the header of the last extrinsic successfully validated.
6. Output the work result, up to $2(j-i+1)$ hashes: two hashes per extrinsic, $H({\bf H})$ and $H({\bf B})$.  

The refine process uses 3 host functions, with the main computation focused on Merkle proof validation.

As detailed in GP, work results in guaranteed work reports are assured, audited, and judged following the ELVES protocol. JAM finalizes its audited blocks via GRANDPA voting, ensuring the rollup’s state can be trusted for subsequent operations.

### Key Validation Process: Storage Proofs

Optimistic rollups, including OP Stack and ArbOS, use Ethereum's Merkle Patricia Trie to commit to state data on each block.  See [this architecture diagram](https://i.sstatic.net/OdfkP.jpg) for an overview.  The state root ${\bf H}_r$ is a cryptographic commitment to the entire rollup state at that block height.  Notably, validation does not calculate the state root ${\bf H_r}$ based on block _transactions_, which would necessitate the entire state of the rollup.  Instead, storage proofs (or "witness data") enable the ORU to prove that specific storage values exist within a particular state root. Only the last witness per contract address is needed in a work package of $N$ blocks.

The central assumption is that if the work package proves all account/contract storage items over $N$ of blocks, which are guaranteed/assured/audited by a subset of JAM validators, then the sequence of state transitions in these blocks is valid.


This chaining of state roots ensures continuity and trust in the rollup secured by this JAM Service:
* Each block’s state root can be verified against the previous state, allowing nodes to validate state changes trustlessly.

* Inclusion in Parent Block Hash: Since each block header ${\bf H}$ includes the previous header hash ${\bf H}_p$ and indirectly references the previous state root ${\bf H}_r$, each block and header also serves as a cryptographic reference to the prior state.

The core operation verifies proofs against the state root, enabling efficient, trustless block sequence validation based solely on headers, which are much smaller than full transaction blocks.

For now, we consider _100%_ of storage keys and values output by the trace of a block.  A more sophisticated approach to sample the set of storage keys based on JAM's public entropy $\eta_3$ may be warranted to limit work packages to within JAM's limits, made available through `historical_lookup` operations.


## Accumulate

The `accumulate` process ensures that all rollup data necessary to validate the rollup is available in JAM DA. Accumulate is an entirely synchronous *on-chain* operation performed by all JAM Validators (rather than *in-core* as with Refine). Computation is carried out first by the JAM Block Author and the newly authored block sent to all Validators.

#### On-chain Storage of Rollup State

The service maintains a summary of fully validated blocks of each chain in 3 service storage keys:
* the first block number $a$ validated with data fully available
* the last block number $b$ validated with data fully available
* a window parameter $w$, modeling the maximum $b-a$

For every block number in this range, the block number has its own key to store the header hash and the block hash.

The function of this data storage represents **both** of the following:
*  the refine validation has been completed **and**
*  the block and header preimages are available in JAM's DA

#### Key Process

| JAM Accumulate               | Content |
| --- | --- |
| *Wrangled Work Results*  | Chain ID (e.g., 10, 42161, etc.), block number start $i$ and end $j$ followed by pairs of $H({\bf H})$ and $H({\bf B})$ |

1. `read` fetch $a, b, w$ based on Chain ID. Validate that $i=b+1$.
2. `solicit` is called for both hashes in the wrangled work results.
3. Advance $b$ by 1 if:
 -  both ${\bf a}_l(H({\bf B}))$ and ${\bf a}_l(H({\bf H}))$ are "available"
 -  the header ${\bf H}$ is contained with ${\bf B}$
5. If $b-a$ exceeds the window $w$, advance $a$ by 1 if both ${\bf a}_l(H({\bf B}))$ and ${\bf a}_l(H({\bf H}))$ are "forget".
6. `write` $a$ and $b$ back to storage.

Necessarily, the ORU operator must provide both preimages for the chain to be considered valid. If any block or header is not made available by the ORU operator, $b$ will not advance.

Under normal operations, the above process will result in a full set of blocks and header preimages being in JAM's DA layer.

Moreover, the `forget` operation ensures that storage is bounded by $w$.

### Transfer

Transfer details concerning fees of storage balance are not considered at this time. A full model appears to necessitate a clear interface between JAM and CoreTime as well as a model of how this service can support a single vs. multiple Chain IDs. Naturally, all service fees would be in DOT rather than ETH on L2.

Multiple service instantiations under different CoreTime leases may be envisioned for each rollup, but a set of homogenous ORU rollups to support sync/async models by the same ORU operator could also be supported.

### Beefy

Following the BEEFY protocol, JAM's own state trie aggregates work packages' accumulate roots into its own recent history $\beta$, signed by JAM validators. BEEFY’s model allows JAM's state to be verified on Ethereum and other external chains without needing all JAM Chain data on the external chain.
All rollups, whether built on Substrate or optimistic turned cynical, are committed into this state, supporting cross-ecosystem proofs using Merkle trees as today.

To support this goal, the accumulate result is the last block hash, last header hash, or last state root as suitable to match Polkadot rollup behavior.

### Service PoC Implementation

This JAM Service can be implemented in Rust using `polkatool` and tested on a JAM Testnet by JAM implementers. A Keccak256 host function is used for expedience, and the preimage hash function will be adjusted to this for PoC.

Real-world work packages can be developed for OP Stack chains like Base and Optimism (currently with 30 blocks/minute) and Arbitrum, which operates at 150 blocks/minute. The results of "trace_block" JSON-RPC calls enable 3 x 1440 work packages per day for these top 3 ETH rollups. This is ample for PoC.

### Gas + Storage Considerations

JAM's gas parameters for PVM instructions and host calls have not been fully developed yet. Combining Polkadot and non-Polkadot rollup services will provide valuable data for determining these parameters.

The gas required for `refine` is proportional to the number of storage proofs submitted in a work package and the average size of each proof. To upper-bound storage proofs, sampling using an entropy state variable $\eta_3$ may be necessary, although accessing it remains unclear.

The gas required for `accumulate` is proportional to the number of solicit and forget operations. It is believed that accumulate's gas cost is nominal and poses no significant issue. However, the storage rent model common to all blockchain storage applies to the preimage, which is explicitly tallied. Fortunately, this is upper-bounded by $w$.

## Compatibility

#### CoreTime

Instead of ETH, rollups would require DOT for CoreTime to secure their rollup. However, rollups are not locked into JAM and may freely enter and exit the JAM ecosystem since work packages do not need to start at genesis.

Different rollups may need to scale their core usage based on rollup activity. JAM's connectivity to CoreTime is expected to handle this effectively.

#### Hashing

Currently, preimages are specified to use the Blake2b hash, while Ethereum rollup block hashes utilize Keccak256.

## Testing, Security, and Privacy

The described service requires expert attention from security experts familiar with JAM, ELVES, and Ethereum.

The ELVES and JAM protocols are expected to undergo audit with the 1.0 ratification of JAM.

The proposal introduces no new privacy concerns.

Raw PVM assembly may be preferred in a production implementation, along with a host function for Keccak256 to minimize issues related to compiler bugs.

## Future Directions and Related Material

Solutions to model other elements in the state trie (account balances and nonces) are not covered in this service design yet.

As JAM implementers move towards conformant implementations in 2025, which support gas modeling and justify performance improvements, a proper model of storage costs and fees will be necessary.

JAM enables a semi-coherent model for non-Polkadot rollups, starting with optimistic rollups as described here. A similar service may be envisioned for mature ZK rollup ecosystems.

An interoperable JAM messaging service between both kinds of non-Polkadot rollups and Polkadot rollups would be highly desirable.

The growth of optimistic rollup platforms, led by OP Stack with CEXes (Coinbase and Kraken) and ArbOS, threatens JAM's viability as a rollup host. Achieving JAM's rollup host goals may require urgency to match the speed at which these network effects emerge.

## Drawbacks, Alternatives, and Unknowns

Alongside Ethereum DA (via EIP-4844), numerous DA alternatives for rollups exist: Avail, Celestia, Eigenlayer. ORUs rely primarily on fraud proofs, but they require a lengthy 7-day window for these "fraud proofs." The cynical rollup model offers significant UX improvements by eliminating this "exit window," commonly 7 days. None of these alternatives provide the same UX enhancement enabled by "cynical" rollups.
