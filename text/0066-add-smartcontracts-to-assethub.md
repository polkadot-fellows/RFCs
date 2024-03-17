# RFC-0066: Add EVM+ink! Contracts Pallets to Asset Hub for Polkadot

|                 |                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------- |
| **Start Date**  | 14 January 2024                                                                                    |
| **Description** | A proposal to add _EVM_+_ink!_ Contracts to Asset Hub for Polkadot to support **Polkadot Rollups** and larger numbers of _EVM/Coreplay_ smart contract developers and their users on **Polkadot Rollups** _and_ **AssetHub for Polkadot**.  |
| **Authors**     | [Sourabh Niyogi](https://github.com/sourabhniyogi)  |

## Summary

This RFC proposes to add the two dominant smart contract programming languages in the Polkadot ecosystem to AssetHub:
EVM + ink!/Coreplay.  The objective is to increase DOT Revenue by making AssetHub accessible to
(1) Polkadot Rollups;
(2) EVM smart contract programmers;
(3) Coreplay programmers who will benefit from easier-to-use smart contract environments.  
These changes in AssetHub are enabled by key Polkadot 2.0 technologies:
PolkaVM supporting Coreplay, and
hyper data availability in Blobs Chain.  

## Motivation

EVM Contracts are pervasive in the Web3 blockchain ecosystem,
while Polkadot 2.0's Coreplay aims to surpass EVM Contracts in ease-of-use using PolkaVM's RISC architecture.    

Asset Hub for Polkadot does _not_ have smart contract capabilities,
even though dominant stablecoin assets such as USDC and USDT are originated there.  
In addition, in the [RFC #32 - Minimal Relay Chain architecture](https://github.com/polkadot-fellows/RFCs/blob/main/text/0032-minimal-relay.md),
DOT balances are planned to be shifted to Asset Hub, to support Polkadot 2.0's
[CoreJam map-reduce architecture](https://github.com/polkadot-fellows/RFCs/blob/gav-coreplay/text/coreplay.md).   
In this 2.0 architecture, there is no room for synchronous contracts on the Polkadot relay chain --
doing so would waste precious resources that should be dedicated to sync+async composability.   
However, while Polkadot fellows have concluded the Polkadot relay chain should _not_ support
synchronous smart contracts, this is _not_ applicable to AssetHub for Polkadot.

The following sections argue for the need for Smart Contracts on AssetHub.

### Defi+NFT Applications need Smart Contracts on AssetHub

EVM Smart Contract chains within Polkadot and outside are dominated by defi + NFT applications.  While the assetConversion pallet (implementing Uniswap v1) is a _start_ to having some basic defi on AssetHub,
many programmers may be surprised to find that synchronous EVM smart contract capabilities (e.g. uniswap v2+v3) on other chains are not possible on AssetHub.  

Indeed, this is true for _many_ Polkadot parachains, with the exception of the top 2 Polkadot parachains (by marketcap circa early 2024: Moonbeam + Astar) who _do_ include the EVM pallets.  
This leads to a cumbersome Polkadot EVM smart contract programming experience between AssetHub and these 2 Polkadot parachains, making the Polkadot ecosystem hard to work with for asset-related applications from defi to NFTs.  

The ink! defi ecosystem remains nascent, having only Astar as a potential home, and empirically has almost no defi/NFT activity.  Although e.g. uniswap translations have been written,

An AssetHub for Polkadot deployment of EVM and ink! contracts, it is hoped, would likely support new applications for top assets (USDC and USDT) and spur many smart contract developers to develop end user applications with familiar synchronous programming constructs.

### Rollups need Smart Contracts on AssetHub

Polkadot Data Availability technology is extremely promising but underutilized.  
We envision a new class of customer, "Polkadot Rollups" that can utilize Polkadot DA far better than Ethereum and other technology platforms.  
Unlike Ethereum's DA which is capped at a fixed throughput now extending to EIP-4844, Polkadot data availability is [linear in the number of cores](https://forum.polkadot.network/t/polkadot-da-vs-competition/3403).  
This means Polkadot can support a much larger number of rollups than Ethereum _now_, and even more as the number of cores in Polkadot grows.
This performance difference has not been widely appreciated in the blockchain community.

Recently, a "Blobs" chain has been developed to expose Polkadot DA to rollups by senior Polkadot Fellows:
* [ThrumDev](https://github.com/thrumdev/blobs)
* [Blobs on Kusama - ParaID 3338](https://polkadot.js.org/apps/?rpc=wss%3A%2F%2Fblobs.colorfulnotion.com#/chainstate) )
* [Rollkit](https://github.com/thrumdev/blobs/blob/e4c88182442c33f5d81dcfc9cc460dd81eab34a2/docs-site/docs/intro.md#integrations)

A rollup kit is mappable to widely used rollup platforms, such as OP Stack, Arbitrum Orbit or StarkNet Madara.   
A Blobs chain, currently deployed on Kusama (paraID 3338), enables rollups to utilize functionality  _outside_ the Polkadot 1.0 parachain architecture by having rollups submit transactions via a rollup kit abstraction.    The Blobs chain write interface is simple `blobs.submitBlob(namespaceId, blob)` with a matching read interface.  

However, simply sending blobs is not enough to power a rollup.  End users need to interact with a "settlement layer", while rollups require proof systems for security.

Key functionality for _optimistic_ rollups (e.g. OP Stack, Arbitrum Orbit) are:
* enabling the users of the rollup to _deposit_ and _withdraw_ the L1 native token (DOT) into the rollup and from the rollup.  In an AssetHub context:
  - Deposits:  send DOT to the rollup from AssetHub, by calling an EVM Contract function on AssetHub;
  - Withdrawal:  withdraw DOT from the rollup by submitting a EVM transaction on the rollup.   After some of days (e.g. 7 days on OP Stack), the user submits a transaction on AssetHub to claim their DOT, using a Merkle proof.
* enabling interactive fraud proofs. While this has rarely happened in practice, it is critical to rollup security. In an AssetHub context:
  - Anyone monitoring a rollup, using the Blobs chain can access the recent history.
  - When detecting invalid state transitions, anyone can interact with rollup and AssetHub's EVM to generate a fraud proof.  

Analogous functionality exist for ZK-rollup platforms (e.g. Polygon zkEVM, StarkNet Madara), with high potential for using the same Blobs+AssetHub chains.  

While it is possible to have the operations in EVM Contracts translated in FRAME pallets (e.g. an "opstack" pallet), we do not believe a pallet translation confers significant benefits.  
Instead, we believe the translation would require regular updates from the rollup platform, which have proven difficult to implement in practice.

### ink! on AssetHub will lead to CorePlay Developers  on AssetHub

While ink! WASM Smart Contracts have been promising technology, the adoption of ink! WASM Contracts amongst Polkadot parachains has been low, in practice just Astar to date, with nowhere near as many developers.  
This may be due to missing tooling, slow compile times, and/or simply because ink!/Rust is just harder to learn than Solidity, the dominant programming language of EVM Chains.  

Fortunately, ink! can compile to [PolkaVM](https://forum.polkadot.network/t/announcing-polkavm-a-new-risc-v-based-vm-for-smart-contracts-and-possibly-more/3811), a new RISC based VM that has the special capability of suspending and resuming the registers, supporting long-running computations.  
This has the key new promise of making smart contract languages easier to use -- instead of smart contract developers worrying about what can be done within the gas limits of a specific block or a specific transaction, Coreplay smart contracts can be much easier to program on (see [here](https://github.com/bkchr/coreplay-poc)).

We believe AssetHub should support ink! as a precursor to support CorePlay's capabilities as soon as possible.  
To the best of our knowledge, release times of this are [unknown](https://forum.polkadot.network/t/announcing-polkavm-a-new-risc-v-based-vm-for-smart-contracts-and-possibly-more/3811/68) but having ink! inside AssetHub would be natural for Polkadot 2.0.  

## Stakeholders

- **Asset Hub Users**: Those who call any extrinsic on Asset Hub for Polkadot.
- **DOT Token Holders**: Those who hold DOT on any chain in the Polkadot ecosystem.
- **AssetHub Smart Contract Developers**: Those who utilize EVM Smart Contracts, ink! Contracts or Coreplay Contracts on AssetHub.
- **Ethereum Rollups**: Rollups who utilize Ethereum as a settlement layer and interactive fraud proofs or ZK proofs to secure their rollup and utilize Ethereum DA to record transactions, provide security for their rollup, and have rollup users settle on Ethereum.
- **Polkadot Rollups**: Rollups who utilize AssetHub as a settlement layer and interactive fraud proofs or ZK proofs on Assethub and Blobs to record rollup transactions, provide security for their rollup, and have rollup users settle on AssetHub for Polkadot.

## Explanation

### Limit Smart Contract Weight allocation

AssetHub is a major component of the Polkadot 2.0 Minimal Relay Chain architecture.  It is critical that smart contract developers not be able to clog AssetHub's blockspace for other mission critical applications, such as Staking and Governance.  

As such, it is proposed that _at most_ 50% of the available weight in AssetHub for Polkadot blocks be allocated to smart contracts pallets (EVM, ink! and/or Coreplay).   While to date AssetHub has limited usage, it is believed (see [here](https://forum.polkadot.network/t/permissioned-pallet-contracts-deployment-to-asset-hub-for-defi-primitives/3908/3)) that imposing this limit on smart contracts pallet would limit the effect on non-smart contract usage.  A excessively small weight limit like 10% or 20% may limit the attractiveness of Polkadot as a platform for Polkadot rollups and EVM Contracts.  A excessively large weight like 90% or 100% may threaten AssetHub usage.  

In practice, this 50% weight limit would be used for 3 categories of smart contract usage:
* Defi/NFT applications: modern defi EVM Contracts would be expected to go beyond the capabilities of `assetConversion` pallet to support many common ERC20/ERC721/ERC1155 centric applications.  
* Polkadot Rollups users: deposit and withdrawal operations would be expected to dominate here.  Note the operations of recording blocks would be done on the Blobs Chains, while interactive fraud proofs would be extremely rare by comparison.
* Coreplay smart contract usage, at a future time.

We expect the first category to dominate.  If AssetHub smart contract usage increases so as to approach this 50% limit, the gas price will increase significantly. This likely motivates EVM contract developers to migrate to a EVM contract chain and/or rethink their application to work asynchronously within CoreJam, another major Polkadot 2.0 technology.

### Model AssetHub Assets inside EVM Smart Contracts based on Astar

It is essential to make AssetHub assets interface well with EVM Smart Contracts.
Polkadot parachains Astar and Moonbeam have a mapping between assetIDs and "virtual" EVM Contracts.  

* [Astar XCM Asset List](https://docs.astar.network/docs/learn/interoperability/asset-list)
* [Moonbeam XC-20](https://docs.moonbeam.network/builders/interoperability/xcm/xc20/overview/)

We propose that AssetHub support a systemic mapping following Astar:
(a) Native Relay DOT + KSM - should be mapped to `0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF` on AssetHub for Polkadot and AssetHub for Kusama respectively
(b) Other Assethubs assets should map into an EVM address using a `0xffffffff` prefix
https://docs.astar.network/docs/learn/interoperability/xcm/integration/tools#xc20-address

The usage of the above has been made code-complete by Astar:
* [xc-asset-config](https://github.com/AstarNetwork/Astar/tree/master/pallets/xc-asset-config)
* [assets-erc20](https://github.com/AstarNetwork/Astar/tree/master/precompiles/assets-erc20)
* [pallet-assets extensions](https://github.com/AstarNetwork/Astar/tree/master/chain-extensions/pallet-assets)

Polkadot parachains Astar and Moonbeam adopted two very different approaches of how end users interact with EVM Contracts.  
We propose that AssetHub for Polkadot adopt the Astar solution, mirroring it as closely as possible.

## New DOT Revenue Sources  

A substantial motivation in this proposal is to increase demand for DOT via two key chains:
* AssetHub - from defi/NFT users, Polkadot Rollup users and AssetHub Smart Contract Developers
* Blobs - for Polkadot Rollups

### New Revenue from AssetHub EVM Contracts

Enabling EVM Contracts on AssetHub will support DOT revenue from:
* defi/NFT users who use AssetHub directly
* rollup operators who utilize Blobs chain
* rollup users who buy DOT to utilize Polkadot Rollups

### New Revenue for ink!/Coreplay Contracts

Enabling ink! contracts will pave the way to a new class of AssetHub Smart Contract Developers.  
Given PolkaVM's proven reduced compile time and RISC architecture enabling register snapshots, it is natural to utilize these new technical capabilities on a flagship system chain.  
To the extent these capabilities are attractive to smart contract developers, this has the potential for bringing in new DOT revenue from a system chain.

## Drawbacks and Tradeoffs

Supporting EVM Contracts in AssetHub is seen by some as undercutting Polkadot's 1.0 parachain architecture, both special purpose appchains and smart contract developer platform parachains.  
We believe the lack of growth of parachains in the last 12-18 months, and the high potential of CorePlay motivates new options be pursued in system chains.    

Maintaining EVM Contracts on AssetHub may be seen as difficult and may require Substrate engineers to maintain EVM Pallets and manage the xcContracts.   
We believe this cost will be relatively small based on the proven deployment of Astar and Moonbeam.  
The cost will be justified compared to the potential upside of new DOT revenue from defi/NFT applications on AssetHub and the potential for utilizing Polkadot DA for Polkadot rollups.

## Testing, Security, and Privacy

Testing the mapping between assetIDs and EVM Contracts thoroughly will be critical.  

Having a complete working OP Stack chain using AssetHub for Kusama (1000) and Blobs on Kusama (3338) would be highly desirable, but is unlikely to be required.

## Performance, Ergonomics, and Compatibility

### Performance

The weight limit of 50% is expected to be adequate to limit excess smart contract usage at this time.  

Storage bloat is expected to kept to a minimum with the nominal 0.01 Existential Deposit.

### Ergonomics

Note that the existential deposit is not 0 DOT but being lowered from 0.1 DOT to 0.01 DOT, which may pose problems for some developers.   
Many developers routinely deploy their EVM contracts on many different EVM Chains in parallel.  This non-zero ED may pose problems for some developers

The 0.01 DOT (worth $0.075 USD) is unlikely to pose significant issue.

### Compatibility

It is believed that EVM pallet (as deployed on Moonbeam + Astar) is sufficiently compatible with Ethereum, and that the ED of 0.01 DOT pose negligible issues.

The messaging architecture for rollups are not compatible with Polkadot XCM.  
It is not clear if leading rollup platforms (OP Stack, Arbitrum Orbit, Polygon zkEVM)  could be made compatible with XCM.


## Unresolved Questions

It is highly desirable to know the throughput of Polkadot DA with popular rollup architectures OP Stack and Arbitrum Orbit.  
This would enable CEXs and EVM L2 builders to choose Polkadot over Ethereum.

## Future Directions and Related Material

If accepted, this RFC could pave the way for CorePlay on Asset Hub for Polkadot/Kusama, a major component of Polkadot 2.0's smart contract future.  


The importance of precompiles should
