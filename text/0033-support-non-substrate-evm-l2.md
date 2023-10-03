# RFC-0033: Support Non-Substrate EVM L2 Networks

|  |  |
|--|--|
| **Start Date** | 3 October 2023 |
| **Description** | Support Non-Substrate EVM L2 Networks using Polkadot Data Availability by adding EVM/WASM Contracts Pallets to Polkadot Relay Chain, limited to 10+20=30% of blockspace  |
| **Authors** | Sourabh Niyogi  |


## Summary

Polkadot+Kusama should support the possibility of having up to 10-30% of its blockspace weight allocatable to EVM and WASM Smart Contracts.   This is not for Polkadot to be a yet another EVM Chain, but specifically to:
1. support the use of Polkadot's Data Availability resources to non-Substrate [largely EVM] L2 Networks, which will bring in additional demand for DOT and through those networks, new users and developers
2. (assuming CoreJam Work Packages have some direct relation to EVM Contracts + WASM Contract *Interpretation*)  support Polkadot 2.0 experimentation in its transformation into a “map reduce” computer and bring in new classes of CoreJam+CorePlay developers in addressing synchronous/asynchronous composability

## Motivation

Polkadot 1.0's approach to scalability since inception has been as a platform for heterogenous shards or "app chains".   Asynchronous interoperability between shards was enabled through XCM through the relay chain, including two teams (Moonbeam/Moonriver, Astar/Shiden) who successfully led Substrate-first EVM Chains in 2020-2023, promoting EVM + WASM Contract platforms widely to a large user and developer community.   Contemporaneously, in 2020-2023, Ethereum developed a [roll-up centric roadmap](https://ethereum-magicians.org/t/a-rollup-centric-ethereum-roadmap/4698).   The dominant use of Ethereum's L2 rollups has been to replicate Ethereum's capability at lower costs, enabled by:
* using Ethereum as a storage layer, recording the L2 activity to be able to derive 100% of the L2 state and support fraud proof 
* using EVM Contracts deployed on L1 Ethereum and L2 chain to manage asset transfers
* using (rarely used but necessary) EVM Contracts fraud + ZK proofs on L1 to manage security of the L2 chain.

The success of these Ethereum L2 rollups by common measures (TVL) are seen on [L2Beat](https://l2beat.com/scaling/summary) and can be seen to exceed to 100% of Polkadot parachains with similar age and functionality (Moonbeam + Astar).   The bottom line is that Arbitrum and Optimism and many OP Stack chains now dominate with over 85% of TVL that is 100x that of Polkadot, including Base (built on OP Stack) launched in July 2023.   The compute cost improvements relative to Ethereum L1 are immediately visible, while storage gas costs (1 gas per byte) remain.   Ethereum's [EIP-4844](https://www.eip4844.com/) introduces a new "Blob" transaction type to Ethereum that enables L2 data to be persisted in the beacon node for a short period of time, and is expected to reduce the storage cost of a L2 Transaction (recorded on L1) by 3-8x.  

This proposal is about having Polkadot's DA layer serve as a resource for non-Substrate L2 networks to use.   It is believed that:
1. Polkadot DA is already likely technically superior to Ethereum's EIP-4844 solution and can offer users and non-Substrate L2 Stack devs competitive storage and end users lower costs than Ethereum L1;  
2. Astar + Moonbeam's efforts in 2021-2023 paved the way for EVM+WASM Contracts to be deployed on the relay chain in 2024;
3. CoreJam's CRJA will correctly treat synchronous (contract) and asynchronous (XCM) composability patterns in Polkadot 2.0 in the next 12-18 months

The sizing of Ethereum L2 using Ethereum can be culled from [BigQuery Public Datasets](https://twitter.com/Polkadot/status/1707052392712212676) with: 
```
SELECT  count(*), to_address, sum(length(input))/(2000000000)  as  gbPerMonth, sum(length(input))/(3600*24*30*2000000000)  as  kbPerSecond  FROM  `bigquery-public-data.crypto_ethereum.transactions`  WHERE  TIMESTAMP_TRUNC(block_timestamp, DAY)  >=  TIMESTAMP("2023-09-01")  and  TIMESTAMP_TRUNC(block_timestamp, DAY)  <=  TIMESTAMP("2023-09-30")  group  by  to_address  order  by  l  desc  limit  10000```
```

The results of Ethereum L1 September 2023 activity are compiled [here](https://docs.google.com/spreadsheets/d/1ng2-dfPxCKCelI8_OmdqTnezYWHM0hODVarQNd7-oCU/edit#gid=1164282259).  Here is a summary of the top 14 (in approximate storage bytes) Ethereum L2-related activity from that compilation:

| Contract                                             | numTxs/mo | GB/mo | K/s  | Approx % |
|------------------------------------------------------|-----------|-------|------|----------|
| [Arbitrum: Sequencer Inbox](https://etherscan.io/address/0x1c479675ad559dc151f6ec7ed3fbf8cee79582b6)                  | 27,839     | 2.75  | 1.06 | 8.67%    |
| [Optimism: Sequencer](https://etherscan.io/address/0xff00000000000000000000000000000000000010)                        | 22,966     | 2.22  | 0.86 | 7.01%    |
| [Zksync Era: Validator Timelock](https://etherscan.io/address/0x3db52ce065f728011ac6732222270b3f2360d919)             | 114,460    | 6.66  | 2.57 | 21.01%   |
| [Base: Batch Inbox](https://etherscan.io/address/0xff00000000000000000000000000000000008453)                         | 47,240     | 2.81  | 1.08 | 8.85%    |
| [StarkNet: SHARP](https://etherscan.io/address/0xfd14567eaf9ba941cb8c8a94eec14831ca7fd1b4)                            | 202,389    | 6.00  | 2.32 | 18.93%   |
| [StarkNet](https://etherscan.io/address/0xc662c410c0ecf747543f5ba90660f6abebd9c8c4)                                | 93,340     | 0.13  | 0.05 | 0.42%    |
| [StarkNet: FriStatementContract](https://etherscan.io/address/0x3e6118da317f7a433031f03bb71ab870d87dd2dd)         | 5,940      | 0.07  | 0.03 | 0.23%    |
| [Starkware: Sharp Verifier](https://etherscan.io/address/0x47312450b3ac8b5b8e247a6bb6d523e7605bdb60)           | 790       | 0.06  | 0.02 | 0.20%    |
| [Linea: L1 Message Service](https://etherscan.io/address/0xd19d4b5d358258f05d7b411e21a1460d11b0876f)                | 136,648    | 2.30  | 0.89 | 7.25%    |
| [Polygon: Polygon zkEVM Proxy](https://etherscan.io/address/0x5132a183e9f3cb7c848b0aac5ae0c4f0491b7ab2)           | 6,383      | 0.46  | 0.18 | 1.46%    |
| [Mantle](https://etherscan.io/address/0xd1328c9167e0693b689b5aa5a024379d4e437858)    | 2,427      | 0.23  | 0.09 | 0.72%    |
| [Zksync](https://etherscan.io/address/0xabea9132b05a70803a4e85094fd0e1800777fbef)    | 86,694     | 0.16  | 0.06 | 0.51%    |
| [Zksync](https://etherscan.io/address/0xf8a16864d8de145a266a534174305f881ee2315e)     | 8,264      | 0.14  | 0.06 | 0.45%    |
| [Zksync](https://etherscan.io/address/0x32400084c286cf3e17e7b677ea9583e60a000324)    | 357,981    | 0.11  | 0.04 | 0.33%    |
| **Top 14 Contracts from L2s**                         | **1,113,361**   | **24.12** | **9.30** | **76.05%**   |
| **All Contracts**                                   |              | **31.71** |       |      |          |



The above 14 Contracts make up **over 76%** of the input data bytes, handily surpassing the volumes of the well-known Ethereum contracts (from uniswap, 1inch, blur, etc.).  It is *this* source of robust storage demand that Polkadot should tap into and extend security from Substrate chains to non-Substrate chains.

According to this [Polkadot DA vs competition](https://forum.polkadot.network/t/polkadot-da-vs-competition/3403) discussion from @pepyakin + @bkchr, Polkadot can _presently_ support 0.83KiB/s per core, which at 100 cores implies 83-166 MiB/s.   Thus, if I understand this discussion correctly,  Polkadot can _trivially_ support Ethereum's present storage throughput of 12.25K/s, and handily support 100x of growth for non-Substrate EVM L2s like the ones above.   If this is correct, then Polkadot DA is a diamond in the rough, just waiting to be used for EVM L2 scalability.   

However, a high throughput Polkadot's Data Availability layer is not enough to support non-Substrate EVM L2 networks.  EVM Contract functionality must be deployed on Polkadot as well to support:
* deposits from L1 => L2 and withdrawals from L2 => L1
* fraud proofs (e.g. in Optimism and Base) + validity proofs  (e.g. in zkSync Era and StarkNet)

Both DA + EVM Contract functionality are for non-Substrate EVM L2 Businesses to run entirely on Polkadot (in the same way as Moonbeam and Astar have and did until Astar zkEVM).  Fortunately, Polkadot leading parachains Moonbeam and Astar already have explored EVM thoroughly in a Substrate architecture, enabling the `ethereum` pallet to be used on the Polkadot Relay Chain.  

We do not propose that Polkadot become yet another EVM Chain for users and arbitrary Smart Contract developers.  Instead, we propose that Polkadot _supports_ non-Substrate EVM L2s, just as it always done -- the difference is an expansion in focus from Substrate-only L2s to include non-Substrate L2s.
  
This addition, it is hoped, may also support Polkadot 2.0’s “Map Reduce”/Collect-Refine-Join-Accumulate architecture, which envisions a different way of addressing synchronous + asynchronous composability other than Ethereum's historical synchronous-first approach and Polkadot's asynchrous-first approach to scalability.   By adding both EVM+WASM Contract pallets in 2024 coincident with CoreJam we enable both revenue growth and user/developer growth.

## Stakeholders

- Current and Prospective EVM L2 Chain Business Owners 
- EVM L2 Stack Owners
- Substrate-native Parachains Smart Contract Platforms (Moonbeam, Astar)
- Substrate-native Parachains 
- Core protocol and XCM format developers
- Chain-as-Service companies
- Tooling, block explorer, and UI developers
- CoreJam/Coreplay developers
- EVM and ink!/WASM Contract Developers 

## Proposal 

### 1. Add `ethereum` Pallet to Relay Chain

This is to support drop-in EVM Contract Deployment of:
* OP Stack Contracts 
* Arbitrum Contracts
* StarkNet Contracts
* ... others that depend on L1 EVM Contracts

for:
* L1-L2 Bridges 
* Rollup Fraud proofs
* ZK Validity proofs 
 
### 2. Add `contracts` Pallet to Relay Chain

This is to support WASM Contract equivalents of the above, which we would hope enjoy improved efficiency relative to their EVM Contract counterparts.  However, this is secondary in importance until the connection to CoreJam Work Packages is realized.

### 3. Impose per-block weight limits of 30% for `ethereum` and `contracts` in aggregate, and 10% for `ethereum` and 20% `contracts`  specifically

This approach to having a limited amount of blockspace allocated for smart contracts is suggested by Polkadot senior fellows:
1.  @rphmeier [here](https://www.rob.tech/blog/hybrid-chains/) "What the hybrid-chain approach is likely to look like in practice is application-specific logic deployed alongside smart contracts, **with a limited amount of blockspace allocated to smart contracts**. Given that contracts would only be able to consume some of the resources per-block, the absolute costs of gas would be higher relative to chains that focus entirely on smart contracts, all else equal." 
2.  @joe [here](https://forum.polkadot.network/t/permissioned-pallet-contracts-deployment-to-asset-hub-for-defi-primitives/3908/3) "For interactions that absolutely  **must be synchronous**  … then we could explore the idea of hybrid blockspace where  **we set aside say 10% of the blockspace for contract execution** If there is a lot of demand for this tranche of blockspace, then the gas price will increase a lot, motivating contract developers to migrate to a contract chain or rethink their application architecture to work asynchronously."   

The 30% limit is proposed so that Polkadot may continue to fulfill security obligations to its Bulk Coretime customers.  It is believed that 10% would be too small to be taken seriously by new and existing EVM L2 Business owners (when compared to Ethereum) while 30% is ample empirically.  Significantly higher than 50% (or having no limit) would cannibalize BCC and threaten new ICC customers.

The 10% limit on `ethereum` and 20% limit on `contracts` is to incentivize higher performance translations of L1 EVM Contracts to be done with WASM Contracts instead.    It is not clear if these higher performance WASM Contract translations are worth translating, especially given the critical importance of fraud proofs, relative immature of ink! vs Solidity (perceived or real).

This can be equally weighted (15%/15%) or omitted altogether, especially if difficult to implement technically, or stand as the primary mechanism.   

However, something like the total being around 30% should be non-negotiable.

### 4. Adjust Storage Costs on Polkadot to provide an 2-5x cost difference over Ethereum L2 Chains [Base] backed by Polkadot DA/Security but 25-50% higher than Moonbeam+Astar.

It is widely expected in both Ethereum and Polkadot ecosystems that everyday users will interact with L2s rather than L1.   However, for EVM L2s built on Polkadot DA to remain competitive with Ethereum's EIP-4844, it is proposed that Polkadot's DA to having storage costs be set to be low enough so as to have non-Substrate Polkadot EVM L2 user costs be visibly lower than an Ethereum EVM L2.   On the other hand, end user pricing for Polkadot L1 activity should be higher than both Astar and Moonbeam.  This treats Polkadot as a storage wholesaler competing with Ethereum but not Astar and Moonbeam as retailer.  

In Ethereum, storage costs for L1 is 1 gas per byte.  [Here](https://etherscan.io/tx/0xef2ea6e6a980c05a80e5b03ef60a070415e1f53edb01001d25fdb9841c3c7fd6) is a October 2023 Optimism L2=>L1 (0.0271 ETH, $45.09) writing 115,733 bytes, representing approximately 100-200 Optimism transactions at an average of $.22-.45/tx like [this](https://optimistic.etherscan.io/tx/0x64defec295aebad526a925d198a0ed63bcae2de40556c383281c4fd095dd2360).   

In Polkadot, at present, using the `preimage.notePreimage` the exact 115,733 bytes costs 11.58 DOT (@$4.12 = $47.59), which does not offer the order of magnitude improvements desired.

With Protodanksharding in EIP-4844 expected to offer a different kind of storage on Execution/Beacon layer, it is expected to be 3-8x lower.  So for Polkadot to aim for a competitive pricing, a 10x reduction ($4.50) should be sought for.

Needless to say, this sort of permissionless storage is directly analogous to the permissioned storage of AWS S3 vs GCP GS:  It is necessary to conduct the same kind of commodities storage pricing in DOT vs ETH, perceived in users mind in USD terms.   If a storage chain or alternate Storage API is required to meet the L2 end users pricing perception, a concrete proposal is needed to meet the EVM L2 Business Owners goals that serve those users.

At the end of the day, EVM L2 Chain Owners need pricing consistency from their suppliers to run a healthy business that L2 users can depend on.   A good supply chain is not overly dependent on one supplier.  An ideal outcome could be that EVM L2 costs is not dominated by a single L1 costs as it now but run on multiple storage systems so that true resilience is achieved.   In the meantime, we need Polkadot DA to be 10x lower on its own.

### 5. Match Moonbeam+Astar precompiles, but keep Existential Deposits as is.

The [precompiles](https://docs.astar.network/docs/build/EVM/precompiles/) of Astar and  [xcDOT](https://docs.astar.network/docs/learn/interoperability/asset-list/) are necessary to support drop-in replacement for DOT withdrawal/deposits.     It is not desirable for Polkadot to be the home of thousands of ERC20 assets but the xcDOT case must be covered.  Otherwise, a permissionless design (not requiring governance) that is compatible with Assethub is desired but requires a more sophisticated plan of how XCM could be situated.   

Moonbeam is currently facing significant storage bloat due to having no storage deposit.  Having the 1 DOT Existential Deposit would trivially address this.  

Polkadot fellows have significant deep knowledge of how Ethereum's gas model is superficially too simple and would benefit from a higher dimensional model of weights (see [here](https://forum.polkadot.network/t/weight-v2-discussion-and-updates/227/5)).   A engineering path to bring in a more sophisticated model targeting the EVM L2 Stack developer may be desirable.

## Explanation

### Interfaces

We assume the Balances pallet will continue to exist to support drop-in replacement of EVM L1 Contracts.  

We imagine CoreJam's Collect/Refine/Join/Accumulate architecture should interface with  both EVM+WASM Contracts.

### Deployment

The importance of Polkadot DA being used for EVM L2 is critical to pursue with high urgency to have high impact in 2024.  Here is an adhoc timeline:

* Rococo - December 2023
* Kusama - Spring 2024
* Polkadot - Summer 2024

## Cultural Change: Synchronous and Asynchronous Patterns, and the Role of EVM + WASM Smart Contracts

There is a tremendous amount of anti-EVM feelings in the Polkadot community over any use of Ethereum technology that is not running on a Substrate stack.   It is not that hard to see how beautifully connected Astar + Moonbeam are to Polkadot Relay Chain, relatively to how kludgily Arbitrum + Optimism + Base are connected to Ethereum chain.  Polkadot's XCM is visibly better than similarly kludgy messaging systems in Ethereum.  First and foremost, for this proposal to succeed, **cultural change is needed**.  Leadership of Polkadot must dispel Substrate-first tribalism (or similar Rust/ink!/WASM tribalism vs Solidity/EVM) and *welcome* non-Substrate activity in all its forms.  This is very easy for outsiders (like myself) and extremely hard for insiders.

On a more technical level, Polkadot architecture has systematically adopted the following choices:
1. a very specific thesis that having multiple asynchronous chains (system chains or parachain) is the way to address scalability;
2. a systematic taste for "separation of concerns", widely adopted in software engineering,  motivating a whole parachain for { assets (Asset Hub), identity (Encointer), staking, storage ... }   

You can see this drive in PR #32's Proposal for Minimal Relay, which even proposes to remove *Balances* from the relay chain and put it into Asset Hub.   Such a move would significantly increase the complexity of deployment of EVM L2 chains and require async patterns for everything.   

The simplicity of Ethereum's synchronous-first programming model is now up against the complexity of Polkadot's asynchronous-first programming model.   

CoreJam "Map reduce" programming model, being developed by Polkadot founders+senior fellows, will force a reconciliation between these two artificial extremes:
*  Ethereum's synchronous-first model, embodied in EVM Contracts on L1+L2
*  Polkadot's asynchronous-first model, embodied in [PR #32 - Minimal Relay](https://github.com/polkadot-fellows/RFCs/pull/32) 

Technologists (as least me, as a relative outsider with little tribal allegiance) know that Ethereum's synchronous-first model tends towards scalability failure (L2s become mostly disconnected islands, themselves incapable of scaling due to the lack of composable async), while Polkadot's asynchronous-first model tends toward unusability (users and developers must figure out what is going on many chains).     

If we open Polkadot up to non-Substrate L2 activity aggressively, this will enable Polkadot to experience real user + developer growth on these new non-Substrate L2 chains.  Anything less probably will cause Polkadot to be like Apple Lisa, Amiga, NeXT in the 1980s and early 90s: great technology, pursued with great engineering and product taste, but ultimately never obtaining the kind of ubiquitous computer imagined relative to Windows PCs and Macs that dominated and survived to the present day.   
 
To be clear, this proposal is not about turning Polkadot into yet another EVM chain.  Instead, I believe Rob Habermeier's appeal to **hybrid chains** is the pragmatically correct answer for Polkadot in the near future:   

![](https://europe1.discourse-cdn.com/standard21/uploads/polkadot2/original/2X/7/7cca3339cc4eb1ab3971d6fe10280d4469510ea3.png)

If we take Rob's advice of "All chains should have smart contracts" seriously, then the Polkadot Relay Chain should include Smart Contracts.   L2 Stack Developers (in a wide variety of rollup architectures from OP Stack to a new ZK rollup stack) should be able to use Polkadot's DA + EVM+WASM Contract platform freely as a hybrid chain.  Rather than overengineer something for a specific rollup stack, Polkadot should offer the best DA it can with competitive storage, offer the best VMs to support L2 Stack Developers generally.   

Rather than aggressively stub out everything into N system chains and force unnecessary async patterns, I believe Polkadot should thoroughly develop its solution to synchronous + asynchronous composability at the center of CoreJam's Map reduce architecture, and extend it to EVM Contract Interpretation which enjoy a mature large developer community outside Substrate.   Assuming cultural change is possible, by opening the door to non-Substrate ecosystems, we should bring in new users through the L2 stacks (entirely EVM now, but potentially other VMs in the future) and position Polkadot as being more technology neutral between Substrate vs non-Substrate, EVM vs WASM, ink! vs Coreplay, or whatever.    
 

## Testing, Security, and Privacy

Standard audit/review  would be appropriate for Polkadot-deployed L1 EVM Contracts.     

OP Stack is the lowest complexity EVM L2 Chain and appears to be enjoying some network effects in 2023.

An OP Deployment could be explored with Shibuya/Shiden/Astar, Moonbase/Moonriver/Moonbeam in parallel to a Rococo+Westend/Kusama/Polkadot.  

Other L2 stacks could be explored. 

## Performance, Ergonomics, and Compatibility

### Performance

Significant parametric choices are being made that will have long term consequences.   By enabling EVM + WASM Contracts on the relay chain, new *long-term* storage requirements are important to satisfy to EVM L2 Business Owners.   This long-term storage may justify a storage chain in the future.     A hybrid short-term and long-term storage solution is already present in Ethereum's EIP-4844, and it is likely necessary for Polkadot to be informed by its performance characteristics for competitiveness.  Polkadot fellows should be able to offer specific plans for success. 

### Ergonomics 

EVM + WASM  Contract Developers should be able to interact with Polkadot EVM Contracts in the same way as they do as they do on Astar.    

### Compatibility

This proposal is incompatible with PR #32 Minimal Relay Chain.

It is not clear how a new Storage Chain and CoreJam's Storage API  relates to this.

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

* Is the Polkadot DA technically capable of supporting permanent long-term storage needs of rollups?  If so, should it be allocated to EVM L2 Chains?    What is the connection to storage chains?

 * Can Polkadot Fellows decide between the minimalism relay chain vs hybrid chains?  What is the connection to storage chains and how to manage short-term (24hr - 2 weeks) and long-term storage (full derivation of an L2 from L1 storage)?

* How does CoreJam's map-reduce architecture (that addresses synch/async patterns) relate to EVM + WASM Contracts "sync" pattern? 
  
* Will Polkadot fellows able to overcome their tribal instincts and well-informed technical biases against Ethereum and support non-Substrate EVM Chains and enable Polkadot to support its own revenue growth, user growth and developer user growth?  
 
## Future Directions and Related Material

Assuming Optimistic rollups can be backed by Polkadot security, we believe ZK Rollups would be natural to develop as well.  This would treat EVM L2 Chains largely identical to the way Ethereum L1 treats its L2 chains: relatively disconnected islands with centralized bridges (CCTP) and slow kludgy messaging protocols like LayerZero and Axelar trying to mediate between them.

However, a more exciting outcome that may be more transformational and revolutionary is to connect [CoreJam' map-reduce CRJA architecture](https://github.com/polkadot-fellows/RFCs/blob/gav-corejam/text/0031-corejam.md)  and XCM to connect multiple non-Substrate EVM L2 Chains as well as the Substrate L2 Chains.   It is hoped that XCM and this programming model can be combined in 2024 for Polkadot's solution to permission compute/storage capability to enjoy the recognition and impact it so clearly deserves.
