# RFC-0033: Kusama Network 2.0: The Hybrid Chain Network  

|  |  |
|--|--|
| **Start Date** | 9 October 2023 |
| **Description** | Evolve Kusama 2.0 to be a Hybrid Relay Chain, specifically with Smart Contracts on the Relay Chain, elevating Kusama to the level of Ethereum.  |
| **Authors** | Sourabh Niyogi  |

## Summary

Polkadot+Kusama should pursue different usability and scalability:

1. Polkadot 2.0 should be a [Minimal Relay Chain](https://github.com/polkadot-fellows/RFCs/pull/32), maximizing cores/resources for maximum scalability of CoreJam + CorePlay's asynchronous-first patterns

2. Kusama 2.0 should be a [Hybrid Relay Chain](https://www.rob.tech/blog/hybrid-chains/), prioritizing developer+user friendliness over scalability with full backwards compatibility with 1.0 Blockchain technology: EVM+WASM Smart Contracts

This solution elevates Kusama to the level of Ethereum while giving developers on-ramps to Polkadot's new scalability solutions.

## Motivation

Polkadot 1.0's approach to scalability since inception has been as a platform for heterogenous shards or "app chains".   Asynchronous interoperability between shards was enabled through XCM through the relay chain, including two teams (Moonbeam/Moonriver, Astar/Shiden) who successfully led Substrate-first EVM (+ WASM) Smart Contract dev platforms in 2020-2023, promoting them widely to a large user and developer community.   Almost all other chains ignored smart contract usage entirely, in favor of Substrate pallets.   Still, when not using XCM asynchronous patterns (used largely just for cross-chain asset transfers), both sorts of approaches rely on developers pursuing a blockchain-centric state transition way of operating: everything has to be done within one block with sync patterns, whether using EVM/WASM Smart Contracts or Substrate Pallets.

In Polkadot 2.0, the state transition function is refactored by bringing asynchronous patterns to the center with CoreJam's Map-Reduce/Collect-Refine-Join-Accumulate (CJRA) + CorePlay Actor programming models.  This will take most of 2024 to develop, while most blockchain technology will continue to live on with 1.0 EVM Contracts, which have non-existent treatment of async patterns: messaging is bolted on by networks like Axelar and LayerZero.

While Polkadot aims to be a massively scalable map reduce computer, in most cases, developers do NOT need scalability right away -- it is widely recognized that both devs+users find the multichain factorization unnecessarily complex, while technologists know that complexity is required for scalability.  Few parachains have scaled their user base to more than a few hundred user per day, resulting in very poor "blockspace" usage.  We are left with a puzzle: if Polkadot technology is fundamentally the world's best solution to async/sync patterns at the heart of the state transition function, but embodies complex patterns, how do we give developers an on-ramp?

Rob Habermerier's [Hybrid Chains](https://www.rob.tech/blog/hybrid-chains/) provide the answer:

![](https://europe1.discourse-cdn.com/standard21/uploads/polkadot2/original/2X/7/7cca3339cc4eb1ab3971d6fe10280d4469510ea3.png)

By adding Smart Contracts to the Kusama Relay Chain, developers can scale from sync-first "old" blockchain technology to "new" in this spectrum:

1. full sync patterns in Smart Contracts on the Relay Chain.  _This pattern is manifested in Ethereum but has never been seen in Polkadot or Kusama._
2. full sync patterns in Smart Contracts on a Parachain.  _This pattern is seen in Astar + Moonbeam._
3. full sync patterns in Substrate pallets on a Parachain.  _This pattern is seen in all other parachains._
4. hybrid sync + async patterns in Smart Contracts on a Relay Chain.  _This pattern is manifested in Ethereum with Axelar/LayerZero._
5. hybrid sync + async patterns in CoreJam + CorePlay.  _This pattern is under active development and will appear in Kusama 2.0 + Polkadot 2.0._
6. hybrid sync + async patterns in Substrate Pallets.  _This pattern is seen in all other parachains._

Developers can _start_ at any point in the above spectrum and move upwards as their needs for scale increase, culminating in CoreJam/CorePlay and Substrate pallets in app chains.

For "core" efficiency reasons, it is highly undesirable to load sync patterns (whether Smart Contracts or Substrate pallets) onto the Relay Chain: [RFC #32 Minimal Relay Chain](https://github.com/polkadot-fellows/RFCs/pull/32) takes this the logical extreme, moving Balances, Staking, Identity, Governance off of Polkadot, with Polkadot founder @gavofyork's strong conviction that  "The Relay-chain should do one thing and do it well.  That means being the head of a secure decentralised multicore computer. Sticking an EVM smart contract in there and/or continuing to allow end-user-application-level transactions and general interaction goes directly against this mantra."  

So, this proposal takes Kusama 2.0 to the other extreme of Polkadot 2.0, and

_Elevates Kusama to the level of Ethereum._

By putting EVM+WASM Smart Contracts on the Relay Chain, Kusama can simultaneously pursue both leading ecosystem's path to scalability:

1. Ethereum: [Scalability from rollups](https://ethereum-magicians.org/t/a-rollup-centric-ethereum-roadmap/4698) _and_
2. Polkadot: [CoreJam](https://github.com/polkadot-fellows/RFCs/pull/31) and [Coreplay](https://github.com/polkadot-fellows/RFCs/blob/gav-coreplay/text/coreplay.md)


* Developers can program EVM Contracts directly on Kusama just as they do on Ethereum.  But not Polkadot.
* Developers can work on EVM L2 Stacks (e.g. OP Stack) that live on top of Kusama instead of Ethereum.  But not Polkadot.
* Developers can work on appchains that does not exist on Ethereum, with highly scalable async+sync patterns.  On both Polkadot and Kusama.
* Developers can work on Corejam/Coreplay that does not exist on Ethereum, with highly scalable async+sync patterns.  On both Polkadot and Kusama.


## Stakeholders

- EVM Smart Contract Platforms: Shiden+Moonriver
- EVM Smart Contract Developers and Users
- ink!/WASM Contract Developers
- Core protocol and XCM format developers
- Tooling, block explorer, and UI developers
- CoreJam/Coreplay developers

## Proposal

### 1. Add `ethereum` + `contracts` Pallet to Kusama Relay Chain

The `ethereum` pallet is to support drop-in EVM Contract Deployment on Kusama itself as well as EVM L2 Network deployment (OP Stack Contracts, Arbitrum Contracts, StarkNet Contracts and others) that depend on L1 EVM Contracts.  

The `contracts` pallet is to support drop-in WASM Contracts.

### 2. Impose per-block weight limits of 50% for `ethereum` + `contracts`

The 50% limit is proposed so that Kusama may continue to fulfill security obligations to its Bulk Coretime customers.  It is believed that 10% would be too small to be taken seriously by new and existing EVM L2 Business owners (when compared to Ethereum) while 50% is ample empirically.  Significantly higher than 50% (or having no limit) could cannibalize BCC and threaten new ICC customers.  

### 3. Adjust Storage Costs on Kusama to provide an 2-5x cost difference over Ethereum L2 Chains [eg Base] backed by Kusama

For EVM L2s built on Kusama  to remain competitive with Ethereum's EIP-4844, it is proposed that Kusama's storage costs be set to be low enough so as to have non-Substrate Kusama EVM L2 user costs be visibly lower than an Ethereum EVM L2.  

### 4. Match Moonbeam+Astar precompiles, but keep Existential Deposits as is.

The [precompiles](https://docs.astar.network/docs/build/EVM/precompiles/) of Astar and  [xcDOT](https://docs.astar.network/docs/learn/interoperability/asset-list/) are necessary to support drop-in replacement for KSM withdrawal/deposits.

### 5. Adjust Kusama Messaging to endorse it as a Hybrid Relay Chain

Instead of Kusama being a _canary_ network, messaging should be adjusted that it is a Hybrid Chain, fully elevated to the level of Ethereum.


## Explanation

### Interfaces

We imagine CoreJam's Collect/Refine/Join/Accumulate architecture could interface with EVM Contracts.

### Deployment

* Rococo - December 2023
* Kusama - Spring 2024

## Testing, Security, and Privacy

The `ethereum` pallet has been well explored by Moonbeam/Moonriver + Astar/Shiden already.  

It may be highly desirable to maintain a existential deposit on Kusama for security.  

## Performance, Ergonomics, and Compatibility

### Performance

By enabling EVM + WASM Contracts on the relay chain, new *long-term* storage requirements are important to satisfy to EVM L2 Business Owners.   This long-term storage may justify a storage chain in the future.     A hybrid short-term and long-term storage solution is already present in Ethereum's EIP-4844, and it is likely necessary for Kusama to be informed by its performance characteristics for competitiveness.

### Ergonomics

EVM Contract Developers and Users should be able to interact with Kusama EVM Contracts in the same way as they do as they do on Ethereum and Astar.  The degree to which this must strictly be adhered to is a matter of debate.  

WASM Contract Developers and Users should be able to interact with Kusama WASM Contracts in the same way as they do as they do on Astar.  

### Compatibility

This proposal is compatible with PR #32 Minimal Relay Chain, if that applies to Polkadot only.

Instead of Polkadot Fellows deciding between the minimalism relay chain vs hybrid chains, this proposal puts Polkadot and Kusama on two different paths in usage, but not in any technical underpinnings.

It is not clear how a new Storage Chain and CoreJam's Storage API relates to this proposal.

## Prior Art and References

Numerous EVM L2 Chains exist already, here are the leading ones:  
- [OP Stack](https://github.com/ethereum-optimism/optimism/blob/develop/packages/contracts-bedrock/src/L1/L1StandardBridge.sol)
- [zkSync Era](https://github.com/matter-labs/era-contracts/tree/main)
- [Arbitrum Stack](https://docs.arbitrum.io/for-devs/useful-addresses)  
- StarkNet

Several competing DA stacks exist:
- [ethStorage](https://eth-store.w3eth.io/#/)  
- [Eigenlayer](https://docs.mantle.xyz/network/introduction/concepts/data-availability)  used by Mantle


## Major Unresolved Questions

* Is Kusama DA technically capable of supporting permanent long-term storage needs of EVM L2 rollups?  What is the connection to storage chains?

* How can CoreJam + Coreplay relate to EVM + WASM Contract Interpretation and provide developers a smooth migration path?

## Future Directions and Related Material

Here is a detailed [Proposal to develop OP Stack On Kusama](https://github.com/colorfulnotion/optimism/blob/develop/README.md)

Assuming Optimistic rollups can be backed by Polkadot security, we believe ZK Rollups would be natural to develop as well.

The `contracts` pallet should be added for completeness.
