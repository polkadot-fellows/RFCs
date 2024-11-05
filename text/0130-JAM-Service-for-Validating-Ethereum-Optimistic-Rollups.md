
# RFC-0130: JAM Validity + DA Services for Ethereum Optimistic Rollups and Ethereum

|                 |                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 26 October 2024 (Updated: November 5, 2024)                            |
| **Description** | JAM Service for Validating Optimistic Rollups and Ethereum |
| **Authors**     | Sourabh Niyogi                                |
| **Abstract**    | JAM’s mission as a _rollup host_ can be extended from validating Polkadot rollups to validating Ethereum optimistic rollups (ORUs) as well as Ethereum itself.  We outline a design for a JAM Service to validating ORUs + Ethereum using a similar approach to Polkadot rollups anticipated in the CoreChains service. The design involves verifying state witnesses against account balances, nonces, code, and storage, and then using this state to re-execute block transactions, all within the service's `refine` operation; then, these validated ETH L1+L2 blocks are stored on-chain in service's `accumulate` operation. This JAM service is readily implementable with already available tools that fits seamlessly into JAM’s refine-accumulate service architecture: (a) Geth’s Consensus API, which outputs state witnesses for Ethereum and its dominant ORU ecosystems (OP Stack and Arbitrum Nitro), and (b) Rust-based EVM interpreter `revm` that should be compilable to PolkaVM with `polkatool`.    This allows Ethereum+ETH L2 ORU users to benefit from JAM’s high computational and storage throughput. The JAM service enables rollup operators to choose JAM Services over other rollup service providers or to enhance their use of Ethereum for improved Web3 user experience, ultimately to provide validity proofs faster.  Furthermore, Ethereum itself can be validated by the same JAM service, providing additional verification for ORU L2 commitments posted to Ethereum across all Ethereum forks. |

## Background

The Gray Paper suggests a design for applying the same audit protocol from Polkadot's parachain validation service to ETH rollups: "_Smart-contract state may be held in a coherent format on the JAM chain so long as any updates are made through the 15kb/core/sec work results, which would need to contain only the hashes of the altered contracts’ state roots._" This proposal concretely outlines a JAM service to do this for two top non-Polkadot optimistic rollup platforms: [OP Stack](https://stack.optimism.io/) and [ArbOS](https://docs.arbitrum.io/how-arbitrum-works/arbos/introduction) as well as, ostentatiously, Ethereum itself.

Optimistic rollups use centralized sequencers and have no forks, creating an illusion of fast finality while actually relying on delayed fraud proofs. Optimistic rollups are termed "optimistic" because they assume transactions are valid by default, requiring fraud proofs on Ethereum L1 if a dispute arises. Currently, ORUs store L2 data on ETH L1, using EIP-4844's blob transactions or similar DA alternatives, just long enough to allow for fraud proof submission.  This approach, however, incurs a cost: a 7-day exit window to accommodate fraud proofs. JAM Service can reduce the dependence on this long exit window by validating L2 optimistic rollups as well as the L1.  

## Motivation

JAM is intended to host rollups rather than serve end users directly.

A  JAM service to validate Optimistic Rollups and Ethereum will expand JAM's service scope to  and enhance their appeal with JAM's high throughput capabilities for both DA and computational resources.   

Increasing the total addressable market for rollups to include non-Polkadot rollups will increase CoreTime demand, making JAM attractive to both existing and new optimistic rollups with higher cross-validation.  

A JAM Service that can certify ORUs state transitions as being **valid** and **available**  can deliver ecosystem participants (e.g. CEXs, bridge operators, stablecoin issuers) potentially improved user experiences that is _marketable_.  With popular CEXes (Coinbase, Kraken) adopting OP Stack, any improvement is highly visible to retail users, making ETH ORUs "Secured by Polkadot JAM Chain".


## Requirements

1. Securing optimistic rollups with a JAM Service should be practical and require minimal changes by the ORU operator.
2. Securing Polkadot rollups with a JAM Service should **not** be affected.

## Stakeholders

1. Optimistic Rollup Operators seeking low-latency high throughput validation services and very high throughput DA
2. Web3 developers wanting to create applications on optimistic rollups secured by JAM
3. DOT Holders aiming to increase CoreTime demand from non-Polkadot rollups

# JAM Service Design for Validating ETH L2 ORUs + Ethereum

## Overview

Ethereum L1 and ETH L2 Rollups produce a sequence of blocks ${\bf B}$ with headers ${\bf H}$. The header ${\bf H}$ contains a parent header hash ${\bf H}_p$ and a state root ${\bf H}_{r}$, which represents the global state after applying all block transactions. The transactions trie root is unnecessary; validating the state trie root alone is sufficient for validating rollups.  

This JAM Service strategy, as hinted in the JAM Gray Paper, aggregates **state witnesses** in a chain of work packages.  The `refine` operation takes these state witnesses of an optimistic rollup's blocks and verifies them against the prior block's state root ${\bf H}_r$.  

The rollup operator submits headers, blocks and state witnesses in a chain of work packages $...,  p_{n-1}, p_{n}, p_{n+1}, ...$ corresponding to the rollup chain, which may typically but not necessarily form a chain.    The strategy advocated is to  _preemptively_ validate all blocks in  possible forks under the assumption that cores (and CoreTime) are plentiful, rather than seek a canonical finalized chain head.  Instead of relying on a *promise* that each state root is correct unless proven otherwise with ORU fraud proofs, JAM validates a block using state witnesses for each and validates the posterior state root ${\bf H}_r$ by reexecuting the block's transactions.

In JAM, the 2 key operations are `refine` and `accumulate`:
1. The `refine` operation happens "off-chain" with a small subset of validators (2 or 3) via an almost entirely *stateless* computation based the contents of the work package:
	- (a) validating state witness proofs $\Pi$ against the *prior* state root ${\bf H}_r$:
		- account balances
		- account nonces
		- contract code
		- storage values
	- (b) given the block's transactions (and potential incoming deposits from L1 and withdrawals to L1), applying each the transaction generating a new posterior state root ${\bf H}_r$, which if it matches that contained in ${\bf H}$, is a **proof of validity.**

	The Consensus API of `geth` , used in popular optimistic rollup platforms of OP Stack and Arbitrum Nitro, are well-suited  to generate the state witnesses, and enables 1(a).

	A EVM interpreter (`revm`) compiled in PolkaVM using `polkatool` enables 1(b).  

   The results of `refine` are inputs to `accumulate` -- representing a set of valid blocks.

2. The `accumulate` simply stores which block hashes/header hashes have been validated, solicits the block and header for storage in JAM DA.  

The primary goal is to have L2 ORUs and L1 Ethereum blocks fully available in JAM DA and modeled as "valid", even if those blocks are tentative / non-canonical.  This enables JAM to certify blocks as being valid as fast as possible in the finalized on the JAM Chain *on any fork*.

A secondary goal is to establish finality against  L1 using the state roots posted from L2 on L1, but we put this secondary goal aside for now as Ethereum finality (12.8 minutes) is generally slower than JAM finality (1-2 mins).  This secondary goal can definitely be supported by the Attestations from the Beacon chain, given ordered accumulation and these attestations, JAM finalize the entirely of Ethereum's rollups handily.

## Refine:

#### Key Input: Work Packages

Using the `newPayloadWithWitnessV4`  method of  `ConsensusAPI` added in Sept 2024, comprehensive state witnesses  in this [commit](https://github.com/ethereum/go-ethereum/commit/9326a118c7c074a6c719b381033845c47c1168f5) enables JAM to be validate blocks full nodes of Ethereum, OP Stack and ArbOS in a **stateless** way.    

Since OP Stack and ArbOS basically use historically leading `geth` to power their own execution engine, the ConsensusAPI of `geth` can be used to get a [Stateless witness](https://github.com/ethereum/go-ethereum/blob/master/core/state/statedb.go#L139) during tracing within the [core/tracing package of StateDB](https://github.com/ethereum/go-ethereum/blob/master/core/tracing/hooks.go#L40-L49).  At a high level, this Consensus API has  a set of [State Change Hooks](https://github.com/ethereum/go-ethereum/blob/master/core/tracing/hooks.go#L192-L195) that are called for [OnBalanceChange, OnNonceChange, OnCodeChange, OnStorageChange hooks](https://github.com/ethereum/go-ethereum/blob/master/core/tracing/hooks.go#L157-L167) during a replay of block execution, which culminates in [InsertBlockWithoutSetHead returning a set of state witness proofs](https://github.com/ethereum/go-ethereum/blob/master/eth/catalyst/api.go#L929).    The end result is a state witnesses / proofs $\Pi$ of storage values that can be verified in against the prior block's state root ${\bf H}_r$.

Then, given a block ${\bf B}$ and these verified proofs $\Pi$ (verified against the prior state root ${\bf H}_r$, a complete state transition to validate a new posterior state root contained within ${\bf B}$ can be thoroughly conducted.  A well-tested and highly stable Rust EVM interpreter [revm](https://github.com/bluealloy/revm) should be compilable to PolkaVM with `polkatool` (see [Building JAM Services in Rust](https://forum.polkadot.network/t/building-jam-services-in-rust/10161)).  Then, using the provided _verified_ `state_witnesses` the revm "in-memory" database can be set up with `AccountInfo` nonce, balance, and code (see [here](https://github.com/bluealloy/revm/blob/bbc8d81dbe2a6a4d184e32fa540e1c4e248a65c9/crates/statetest-types/src/account_info.rs#L9-L15)) as well as storage items, conceptually like:
```
use revm::{Database, EVM, AccountInfo, U256, B160};

fn initialize_evm_with_state(evm: &mut EVM<impl Database>, state_witnesses: HashMap<B160, AccountInfo>) {
    // Set up each account's state in the EVM's database.
    for (address, account_info) in state_witnesses {
        // Insert nonce/balance/code
        evm.database().insert_account(address, account_info);
	    // Insert storage if available
	    for (storage_key, storage_value) in account_info.storage {
	        evm.database().insert_storage(address, storage_key, storage_value);
	    }
	}
}
```

With the prior state fully initialized in memory via `initialize_evm_with_state`, we run through the EVM execution of the transactions of the block.  Each transaction will interact with the pre-loaded state witnesses in the database.  Because `revm` is very well maintained and stable, it already supports the latest [Ethereum State Transition tests](https://github.com/ethereum/tests/tree/develop/GeneralStateTests) for individual transactions and given a block of transactions (or indeed a chain of blocks) can  compute the posterior state root ${\bf H}_r$ for that block (or a chain of blocks).   The block is valid if the block execution of `revm` results in the same state root ${\bf H}_r$ as contained in the header ${\bf H}$ and in the block ${\bf B}$ (or a chain of blocks).  If it does, the `refine` code outputs both hashes, which will be solicited on chain in `accumulate` (and can be supplied by anyone, whether the ORU or some third-party).

In JAM's `refine` code, work package content is as follows:

| JAM Refine               | Content |
| --- | --- |
| *Work Package* $p_n \in \mathbb{P}$     | Data submitted by ORU operator for validation of $N$ blocks, not necessarily in a chain, potentially multiple blocks at different block heights |
| *Payload* ${\bf y}$     | Chain ID (e.g., 10, 42161, etc.), start and end block numbers expected in extrinsics |
| *Extrinsics* $\bar{{\bf x}}$   | Header Hash $H({\bf H})$ , Block Hash $H({\bf B})$, Header ${\bf H}$, block  ${\bf B}$, and State Witnesses $\Pi$ against _prior_ state root ${\bf H}_r$ for each block |
| *Work Items* ${\bf w} \in \mathbb{I}$   | $N$ _Prior_ state roots ${\bf H}_r$, one for each extrinsic ${\bf x} \in \bar{\bf x}$ |
| *Work Result* ${\bf r}$    | Tuples $(i,t,H({\bf H}),H({\bf B}))$ of Block number $i$, timestamp $t$, header hash and block hash  |

Refine's operations are as follows:

1. **Authorize**.   Check for authorization ${\bf o}$.  
2. **Verify State Witnesses.**  For each element ${\bf x} \equiv (H({\bf H}), H({\bf B}), {\bf H}, {\bf B}, \Pi)$ in extrinsics $\bar{{\bf x}}$ and the prior state root ${\bf H}_r$ in the work item:
    - Verify each state witness $\pi \in \Pi$ and initialize `AccountInfo` objects for all verified proofs $a_{b}, a_{n}, a_c, a_{s}(k,v)$ for balance, nonce and storage proofs
    - If any proof $\pi \in \Pi$ fails verification, skip to the next extrinsic, considering the block _invalid_.  
    - If all proofs $\pi \in \Pi$ pass verification, proceed to next step.
3. **Apply Transactions.** Initialize  `revm`  with the value of `AccountInfo` to apply all transactions For the block transactions ${\bf B}_T$ , , and derive the  chain, with ${\bf H}_p$ matching the previous extrinsic $H({\bf H})$, except for the first header, which must match the previous 2.
    - Use the state root ${\bf H}_r$, .
4. **Output Worked Results: Verified Proof of Validity.**. For each validated block, output a tuple $(i, t, H({\bf H}), H({\bf B}))$ of block number $i$, the block timestamp $t$, and the two hashes in the extrinsic ${\bf x} \in \bar{\bf x}$:  $H({\bf H})$ and $H({\bf B})$.  

The refine process uses *no* host functions (not even `historical_lookup`) as chain-hood of the blocks is not pursued within `refine`.   As detailed in GP, work results in guaranteed work reports from the above `refine` are assured, audited, and judged following the ELVES protocol. JAM finalizes its audited blocks via GRANDPA voting and can be exported to other chains with BEEFY.

Optimistic rollups, including OP Stack and ArbOS, use Ethereum's Merkle Patricia Trie to commit to state data on each block.  See [this architecture diagram](https://i.sstatic.net/OdfkP.jpg) for a refresher.  The state root ${\bf H}_r$ is a cryptographic commitment to the entire rollup state at that block height.  The state witness from the rollups API enable the ORU to prove that specific storage values exist against the prior state root.  

Due to `refine` use of a EVM interpreting compiling to PolkaVM, this is basically reexecuting the block.  The state witnesses $\Pi$ enable `refine` to be stateless, consistent with JAM/ELVES design principles.

For simplicity, we consider _100%_ of state witnesses from a single block, with zero consideration to the extremely likely possibility that the blocks may form a chain with no forks.  Given a chain of blocks, a more compressed approach would be to only include  $\pi \in \Pi$ that actually new storage values in the chain of blocks.  This would enable a reduced work package size as well as a smaller number of proof verifications in `refine`.   We set this obvious optimization aside for now.

## Accumulate

The `accumulate` operation is an entirely synchronous *on-chain* operation performed by all JAM Validators (rather than *in-core* as with `refine`). Computation is carried out first by the JAM Block Author and the newly authored block sent to all Validators.   

In this JAM Service Design, the `accumulate` operation indexes the tuple from `refine` by block number and solicits both the block  and header data.  When provided (by the ORU but potentially anyone), this ensures that ETH L1+L2 data necessary to validate ETH L1+ORU L2s is fully available in JAM DA.   At this time, we do not concern ourselves with chain-hood and finality, and instead model all L1 + L2 forks.  However, we use a simple $f$ parameter to limit to the on-chain storage to blocks within a certain time range, putatively 28 days.

#### On-chain Storage of Rollup State

For simplicity, for each blockchain we have a separate service with a unique chain_id (e.g Ethereum 1, Optimism 10, Base 8453, Arbitrum 42161, etc.) with its own service storage.   The service stores on-chain service storage the following key components:
* all blocks and headers, which are solicited to be added to JAM DA via `solicit` and after a 28 day window, removed from JAM DA via `forget`.  Blocks and headers held in preimage storage in ${\bf a}_{\bf p}$ ; preimage availability in JAM DA is represented in lookup storage ${\bf a}_{\bf l}$ via the preimage hash of both the block hash $H({\bf B})$ and header hash  $H({\bf H})$.
* an index of block numbers $i$ into tuples of block hash, header hash and timestamp ($t, H({\bf H}), H({\bf B}))$, held in storage ${\bf a}_s$, potentially more than one per block number
* a simple $f$ parameter to support `forget` operations

The function of the above on-chain service storage is to represent **both** of the following:
*  the `refine` validation has successfully completed for a set of blocks _and_
*  the block and headers are available in JAM's DA

as well as bound storage costs to a reasonable level using $f$.

#### Key Process

| JAM Accumulate               | Content |
| --- | --- |
| *Work Results*  | Tuple of $(i, t, H({\bf H}), H({\bf B}))$, see `refine` |

1. For each block number $i$ in the tuple, perform the following operations:
    - `solicit` is called for both hashes in the work results.  The ORU operator is expected to provide both preimages but any community member could do so.  
	- `read`  is called for block number $i$ to check if there are any previous blocks stored
	-  if there aren't, initialize the value for $i$ to be $(H({\bf H}), H({\bf B}))$
	-  if there are, append an additional two hashes $(H({\bf H}), H({\bf B}))$
	- `write` the updated value, which may be multiple pairs of hashes if there are forks for the chain.

2. To bound storage growth to just the validated blocks that are within a certain window of around 28 days, we also:
	- `read`  $f$  from service key 0, which holds $(i,t)$, the oldest block $i$ that has been solicited and the time $t$ it was solicited, but may now be outside the window of 28 days
	- if $t$ is older than 28 days, then if ${\bf a}_l$ is *Available* (note there are 2 states) then issue `forget` and advance $(i,t)$
	- repeat the above until either the oldest block is less than 28 days ago or gas is nearly exhausted
    -  `write` $f$ back to storage if changed

3. Accumulation output is the newest blockhash $H({\bf  B})$ solicited in step 1, which is included in the BEEFY root in JAM's Recent History.

Under normal operations, the above process will result in a full set of validated blocks and header preimages being in JAM's DA layer.  An external observer of the JAM Chain can, for the last 28 days, check for validity of the chain in any fork, whether finalized or unfinalized on ETH L1 or ETH L2 ORU.

### Transfer

Transfer details concerning fees of storage balance are not considered at this time. A full model appears to necessitate a clear interface between JAM and CoreTime as well as a model of how this service can support a single vs. multiple Chain IDs. Naturally, all service fees would be in DOT rather than ETH on L2.

Multiple service instantiations under different CoreTime leases may be envisioned for each rollup, but a set of homogenous ORU rollups to support sync/async models by the same ORU operator could also be supported.

### Beefy

Following the BEEFY protocol, JAM's own state trie aggregates work packages' accumulate roots into its own recent history $\beta$, signed by JAM validators. BEEFY’s model allows JAM's state to be verified on Ethereum and other external chains without needing all JAM Chain data on the external chain.
All rollups, whether built on Substrate or optimistic turned cynical, are committed into this state, supporting cross-ecosystem proofs using Merkle trees as today.

To support this goal, the accumulate result is the last block hash, last header hash, or last state root as suitable to match Polkadot rollup behavior.

### Service PoC Implementation

This JAM Service can be implemented in Rust using `polkatool` and tested on a [JAM Testnet](https://github.com/jam-duna/jamtestnet)  by early JAM implementers.

With a full node of Ethereum, Optimism, Base, and Arbitrum, real-world work packages can be developed and tested offline and then in real-time with a dozen cores at most.

### Gas + Storage Considerations

JAM's gas parameters for PVM instructions and host calls have not been fully developed yet. Combining the CoreChain and this Ethereum+ORU validation services will provide valuable data for determining these parameters.

The gas required for `refine` is proportional to:
* the size of $\Pi$  submitted in a work package
* the amount of gas used by ${\bf B}_T$, which is embedded in the ${\bf B}$ itself

The proof generation of $\Pi$ is not part of refine and do not involve the sequencer directly; instead this would be done by a neighboring community validator node.  In addition, I/O of reading/writing state tries are believed to dominate ordinary ORU operation but are also part  in the refine operation.  

The gas required for `accumulate` is proportional to the number of blocks verified in `refine` , which result in `read` , `write` , and `solicit` and `forget` operations. It is believed that accumulate's gas cost is nominal and poses no significant issue. However, storage rent issues common to all blockchain storage applies to the preimages, which is explicitly tallied in service ${\bf a}$. Fortunately, this is upper-bounded by the number of blocks generated in a 28-day period.  

## Compatibility

#### CoreTime

Instead of ETH, rollups would require DOT for CoreTime to secure their rollup. However, rollups are not locked into JAM and may freely enter and exit the JAM ecosystem since work packages do not need to start at genesis.

Different rollups may need to scale their core usage based on rollup activity. JAM's connectivity to CoreTime is expected to handle this effectively.

#### Hashing

Currently, preimages are specified to use the Blake2b hash, while Ethereum rollup block hashes utilize Keccak256.  This is an application level concern trivially solved by the preimage provider responding to preimage announcements by Blake2b hash instead of Keccak256.

## Testing, Security, and Privacy

The described service requires expert review from security experts familiar with JAM, ELVES, and Ethereum.

The ELVES and JAM protocols are expected to undergo audit with the 1.0 ratification of JAM.

It is believed that the use of `revm` is safe due to its extensive coverage of Ethereum State + Block tests, but this may require careful review.

The `polkatool` compiler has not battletested by comparision.

The Consensus API generating state witnesses is likely mature but a relatively new addition to the `geth` code base.

The proposal introduces no new privacy concerns.


## Future Directions and Related Material

It is natural to bring in finality from Ethereum using Attestations from the Beacon chain to finalize validated blocks as they become available from Ethereum and ETH ORU L2s enabled by this type of service.   A "ETH Beacon Service" bringing in the Altair Light Client data would enable the Ethereum Service, all ETH ORUs to compute the canonical chain.  This would use the "Ordered Accumulation" capabilities of JAM, reduce the storage footprint to just those blocks that are actually finalized in the L2 against an Ethereum finalized checkpoint.

As JAM implementers move towards conformant implementations in 2025, which support gas modeling and justify performance improvements, a proper model of storage costs and fees will be necessary.

JAM enables a semi-coherent model for non-Polkadot rollups, starting with optimistic rollups as described here. A similar service may be envisioned for mature ZK rollup ecosystems, though there is not as much more in `refine` than to verify the ZKRU proof.    A JAM messaging service between ORUs and ZKRUs may be highly desirable.   This can be done in a separate service or simply by adding in `transfer` code with `read` and `write` operations in service storage incoming and outgoing mailboxes.

The growth of optimistic rollup platforms, led by OP Stack with CEXes (Coinbase and Kraken) and ArbOS, threatens JAM's viability as a rollup host. Achieving JAM's rollup host goals may require urgency to match the speed at which these network effects emerge.

On the other hand, if JAM Services are developed and put in production in 2025,  JAM Services can validate all of Ethereum as well as Polkadot rollups.

## Drawbacks, Alternatives, and Unknowns

Alongside Ethereum DA (via EIP-4844), numerous DA alternatives for rollups exist: Avail, Celestia, Eigenlayer.  ORUs rely primarily on fraud proofs, but they require a lengthy 7-day window for these "fraud proofs." The cynical rollup model offers significant UX improvements by eliminating this "exit window," commonly 7 days.

This JAM Service does not turn optimistic rollups into cynical rollups.  A method to do so is not known.   

## Acknowledgements

We are deeply grateful for the ongoing encouragement and feedback from Polkadot heavyweights (Rob Habermeier, Alistair Stewart, Jeff Burdges, Bastian Kocher),  Polkadot fellows, fellow JAM Implementers/Service Builders, and the broader community.
