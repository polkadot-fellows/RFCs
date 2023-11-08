# RFC-0033: CoreJam System Chain on EVM L2s with OP Stack

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 5 November 2023                               |
| **Description** | CoreJam System Chain on EVM L2s with OP Stack |
| **Authors**     | Sourabh Niyogi                                |

## Summary

CoreJam (RFC [#31](https://github.com/polkadot-fellows/RFCs/pull/31)) offers a significant refactorization of the blockchain state transition function with its map-reduce architecture, starting with a Polkadot/Substrate 2.0 foundation.   This proposal adapts the CoreJam architecture to EVM L2s, specifically utilizing [OP Stack](https://stack.optimism.io/) + Solidity instead of Polkadot/Substrate.  The endpoint being proposed is a _CoreJam System Chain on Ethereum L2_.   Almost all CoreJam concepts from #31 are retained (but none of Polkadot 1.0's primary "product" of parachains), where CoreJam's Rust interfaces are replaced with Solidity/EVM Contracts + OP Stack's Golang.  

In this adaptation of "Collect-Refine-Join-Accumulate", a Solidity/EVM Smart Contract has two primary entry-points: `refine` and `accumulate`.  Work packages are processed "in-core" (and thus parallelized) via `refine`, and the refined outputs of this processing are gathered together and an on-chain state-machine progressed according to `accumulate`.

For pedagogical reasons, the write up below retains much of the original language.  

## Motivation

* CoreJam impact in Ethereum and other EVM L1s
* Provide an on-ramp to CoreJam developers already familiar with Solidity
* Reduced Time-to-market of CoreJam in OP Stack relative to Polkadot 2.0 Engineering

From a usability and impact perspective, having CoreJam's map-reduce in Ethereum expands the set of CoreJam developers from a small but growing number Substrate+Rust developers solely in the Polkadot ecosystem to a large but growing number of Solidity developers in a larger number of EVM ecosystems beyond Polkadot alone.  Provided that Polkadot executes on its high throughput DA (proportional to number of cores), minimal relay chain scalability, and genuine L1 decentralization, it is believed Polkadot may benefit from an increasing number of CoreJam developers onboarded from Ethereum and other EVM Chains through this adaptation.

## Requirements

In order of importance:

1. This proposal must be compatible with Solidity+Ethereum to have developer and ultimately, user impact.
2. The CoreJam implementation should be practical, needing minimal changes to OP Stack.
3. Utilization of CoreJam must be permissionless and maintain the same security model of Optimistic Rollups.
4. There should be a path for the CoreJam System Chain, despite its ORU L2 setting, to support permissionless ScBG nodes and ScBA nodes.

## Stakeholders

1. Solidity/EVM Smart Contract developers already building on EVM L1+L2 Chains needing the scalability of map-reduce.
2. Anyone wanting to create decentralised/unstoppable/resilient applications.
3. Anyone with exposure to the token economies of EVM Chains, specifically Ethereum.
4. If funded by the Polkadot Treasury, DOT Stakeholders supporting this adaptation

## Explanation

**CoreJam is a general model for utilization of Cores.  It is a mechanism by which Work Packages are communicated, authorized, computed and verified, and their results gathered, combined and accumulated into particular parts of the CoreJam chain's state.**

###  CoreJam in Polkadot Relay Chain vs CoreJam System Chain on ETH/.. L2

All of CoreJams interrelated concepts: *Work Package*, *Service*, *Work Item*, *Work Output*, *Work Result*, *Work Report*, *Guarantee* and *Service Trie* are situated within OP Stack.

| CoreJam model                | Context |
| --- | --- |
| *CoreJam EVM L2 Chain*       | Primary block-chain |
| *Work Package*               | Untrusted data provided to ScBG |
| *Work Item*                  | State-transition inputs and witness |
| *Work Output*                | State-transition consequence |
| *Work Report*                | Target of attestation |
| *(Work Package) Attestation* | Output signed in attestation |
| *Reporting*                  | Placement of Attestation on-chain |
| *Integration*                | Irreversible transition of state |
| *Builder*                    | Creator of data worthy of Attestation |

The following two groups of participants are coordinated with OP Stack nodes:

- *ScBG*: System-chain Backing Group, a grouping of System-chain validators who act as the initial guarantors over the result of some computation done off-chain.  These are OP Stack Nodes runing the "Map" Collect-Refine using Solidity/EVM Contracts.
- *ScBA*: System-chain Block Author, the author of some particular block on the  CoreJam System-chain, an EVM L2 ORU also using OP Stack, and run "Reduce" Join-Accumulate using Solidity/EVM Contracts

Unlike Polkadot and Kusama, the CoreJam System Chain (contemplated on Ethereum at L2, and potentially other EVM Chains) is not a relay chain: it does not offer parachain security or a messaging protocol (UMP/DMP/HRMP) between parachains.  For this reason, CoreJam's RcBG and RcBA are just ScBG and ScBA.  

Optimistic rollups are called "optimistic" because they assume that transactions are usually valid and only require on-chain settlement on Ethereum L1 in the event of a dispute.  Fault proofs have been developed for OP Stack in 2023, described [here](https://github.com/ethereum-optimism/optimism/blob/develop/specs/fault-proof.md) which has been brought to Goerli testnet.  ORUs currently store the L2 data in L1 using Call Data, but it is widely expected that EIP-4844's blob transactions will require small adaptations to this.  This Ethereum DA capability is expected to have a short window of around 30 days, long enough for a fault proof to be submitted.

CoreJam makes significant use of Data Availability (DA) resources in both the map/refine and reduce/accumulate steps.  In a Polkadot setting, CoreJam on Polkadot would use Polkadot's own DA on the Relay Chain.  However, with the CoreJam System as an Ethereum L2 ORU, it would be necessary to rely on Ethereum's blob transactions for DA instead for the critical `accumulate` "on-chain" step.  (For the "refine" step, this is not necessary.)   It is expected that OP Stack's fault proof system would be extended to support EIP-4844.

As Polkadot DA is believed to be significantly higher throughput and linear in the number of cores, this sets up the Ethereum as a place as an "on-ramp" for CoreJam application developers.  

### Overview

The essence of CoreJam is to run a map-reduce-like process with:
 * `refine` mapping Work Items into Work Results "in-core" by ScBG nodes
 * `accumulate` mapping Work Results into "on-chain" by the ScBA, given

This can be done permissionlessly in Solidity/EVM Smart Contracts with the following interface:

```solidity
interface CoreJamService {
    struct Context {
        uint256 block_number;
        bytes32 header_hash;
        bytes32 prerequisite;
    }

    struct WorkItem {
        uint32 service;
        bytes payload;
    }

    struct WorkResult {
        uint32 service;
        bytes32 itemHash;
        bytes result;
        uint256 gas;
    }

    struct WorkPackage {
        Authorization authorization;
        Context context;
        WorkItem[] items;
    }

    // ********* IN-CORE: Any ScBG can call this -- key design question is how work packages get assigned to cores!
    function isAuthorized(WorkPackage package, uint32 coreIndex) external view returns (bool);
    // applyRefine maps a WorkItem into a WorkResult
    function applyRefine(WorkItem item) external pure returns (WorkResult memory);
    // refine maps a package containing work items into work results using applyRefine
    function refine(WorkPackage package) external pure returns (WorkResult[] memory);

    // ********* ON-CHAIN: accumulate is called by the system chain block author (ScBA) given work report attestation
    function accumulate(WorkResult[] results) external;
    // TODO: prune - removes conflicting items
}

contract MyCoreJamService is CoreJamService {
    modifier onlySCBA() {
        // restrict accumulate to SCBA only
        _;
    }

    function applyRefine(WorkItem calldata item) external pure override returns (WorkResult memory) {
    }

    function refine(WorkPackage calldata package) external pure override returns (WorkResult[] memory) {
    }

    function accumulate(Tuple[] calldata results) external override onlySCBA() {
        // Process authorization and workResults as needed...
        // Note: CoreJam's transfer / on transfer is accomplished with a internal contract to another accumulate
    }
}
```


The core insight of CoreJam is that the following map-reduce refactorization  efficiently addresses the underlying dependency graph of what can be computed in what order better than smart contracts alone, separating what can be parallelised in the `refine` step from what cannot be parallelised in the `accumulate` step
* the "in-core"  Collect-Refine (with Smart Contract entry point`refine`) supports mass parallelization and can be done with a _scalable_ distributed nodes (ScBG) organized by "core index",
* the "on-chain" `accumulate` done by CoreJam System Chain ScBA, fundamentally bottlenecked by the system chain

The above is a first-pass adaptation matching RFC #31, which aims for full generality of Work Package.  Work is organized in Work Packages, and in this adaptation, Service is EVM Contract on the ETH L2 whose work items are first preprocessed with cheap decentralized compute power.  We anticipate revising the above to support streamlined Service construction.  Work Items are a pair where the first item, `service`, itself identifies a pairing of code and state known as a *Service*; and the second item, `payload`, is a block of data which, through the aforementioned code, mutates said state in some presumably useful way. Under ordinary circumstances, a CoreJam developer will deploy a CoreJamService along with a mechanism to add Work Items by users.

A *Work Package* is an *Authorization* together with a series of *Work Items* and a context, limited in plurality, versioned and with a maximum encoded size. The Context includes an optional reference to a Work Package (`WorkPackageHash`) which limits the relative order of the Work Package (see **Work Package Ordering**, later).  In EVM Optimistic Rollup (ORU) context by mapping the 3 components:
* Authorization - this just a contract address with a `isAuthorized` interface
* Context - this is simplified in an EVM ORU to be just a block number and block hash.  This is possible because EVM L2 ORUs in OP Stack are fundamentally centralized sequencers, at least for now.  
* Prerequisite - TBD.  (The number of prerequisites of a Work Package is limited to at most one. However, we cannot trivially control the number of dependents in the same way, nor would we necessarily wish to since it would open up a griefing vector for misbehaving Work Package Builders who interrupt a sequence by introducing their own Work Packages with a prerequisite which is within another's sequence.)

A Service IS a smart contract stored on-chain and transitioned only using on-chain logic, strictly and deterministically constrained, holding funds and call into each other synchronously.  However, the Service's `accumulate` function cannot be transacted with and is only called by either the ScBA or a inter-service calling.  Otherwise, all input data (and state progression) must come as the result of a Work Item.   A Work Item is a blob of data meant for a particular Service and crafted by some source external to consensus, which can be a user or another Service.  It may be thought of as akin to a transaction or internal contract call.  

The Work Item is first processed *in-core* through `refine`, which is to say an OP Stack node chosen in a System Chain Backing Group (ScBG), yielding a *Work Result*.  It is this Work Result which is collated together with others of the same service and Accumulated into the Service on-chain.

Though this process happens entirely in consensus, there are two main consensus environments at play, _in-core_ and _on-chain_. We therefore partition the progress into two pairs of stages: Collect & Refine and Join & Accumulate.

### Processing stages of a Work Package

A Work Package has several stages of consensus computation associated with its processing, which happen as the system becomes more certain that it represents a correct and useful transition of its Service.

While a Work Package is being built, the *ScBG* must have access to the CoreJam System-chain state in order to supply a specific *Context*. The Context dictates a certain *Scope* for the Work Package which is used by the Initial Validation to limit which System-chain blocks it may be processed on to a small sequence of a specific fork (which is yet to be built, presumably). We define the System-chain height at this point to be `T`.

The first consensus computation to be done is the Work Package having its Authorization checked in-core, hosted by the System-chain Backing Group.  If it is determined to be authorized, then the same environment hosts the Refinement of the Work Package into a series of Work Results. This concludes the bulk of the computation that the Work Package represents. We would assume that the System-chain's height at this point is shortly after the authoring time, `T+r` where `r` could be as low as zero.

The second consensus computation happens on-chain at the behest of the System-chain Block Author of the time `T+r+i`, where `i` is generally zero or one, the time taken for the Work Results to be transported from within the Core to get to the gateway of being on-chain. The computation done essentially just ensures that the Work Package is still in scope and that the prerequisite it relies upon (if any) has been submitted ahead of it. This is called the on-chain *Reporting* and initiates the *Availability Protocol* for this Work Package once System-chain Validators synchronize to the block. This protocol guarantees that the Work Package will be made available for as long as we allow disputes over its validity to be made.

At some point later `T+r+i+a` (where `a` is the time to distribute the fragments of the Work Package and report their archival to the next System-chain Block Author) the Availability Protocol has concluded and the System-chain Block Author of the time brings this information on-chain in the form of a bitfield in which an entry flips from zero to one. At this point we can say that the Work Report's Package is *Available*.

Finally, at some point later still `T+r+i+a+o`, the Results of the Work Package are aggregated into groups of Services, and then *Pruned* and *Accumulated* into the common state of the System-chain. This process is known as *Integration* (in the fixed-function parachains model, this is known as "inclusion") and is irreversible within any given fork. Additional latency from being made *Available* to being *Integrated* (i.e. the `o` component) may be incurred due to ordering requirements, though it is expected to be zero in the variant of this proposal to be implemented initially.

### Collect-Refine

The first two stages of the CoreJam process are *Collect* and *Refine*. *Collect* refers to the collection and authorization of Work Packages (collections of items together with an authorization) to utilize a ScBG Core. *Refine* refers to the performance of computation according to the Work Packages in order to yield *Work Results*. Finally, each Backing Group member attests to a Work Package yielding a series of Work Results and these Attestations form the basis for bringing the Results on-chain and integrating them into the Service's state which happens in the following stages.

#### Collection and `isAuthorized`

Collection is the means of a Backing Group member attaining a Work Package which is authorized to be performed on their assigned Core at the current time. Authorization is a prerequisite for a Work Package to be included on-chain. Computation of Work Packages which are not Authorized is not rewarded. Incorrectly attesting that a Work Package is authorized is a disputable offence and can result in substantial punishment.

On arrival of a Work Package, after the initial decoding, a first check is that the `context` field is valid. This must reference a header hash of a known block which may yet be finalized and the additional fields must correspond to the data of that block.

The *Authorizer* entry point  of:

```solidity
function isAuthorized(WorkPackage calldata package, uint32 coreIndex) external view returns (bool);
```

is executed by a ScBG node in a _metered VM_ and subject to a modest system-wide limitation on execution time. If it overruns this limit or panics on some input, it is considered equivalent to returning `false`. While it is mostly stateless (e.g. isolated from any System-chain state) it is provided with the package's `context` field in order to give information about a recent System-chain block. This allows it to be provided with a concise proof over some recent System-chain state.

A single `Authorizer` value is associated with the index of the Core at a particular System-chain block and limits in some way what Work Packages may be legally processed by that Core.

The need of ScBG nodes to be rewarded for doing work competes with that of the procurers of work to be certain to get work done which is useful to them.  With CoreJam, ScBG nodes have little ability to identify a high-quality Work Package builder and the permissionless design means a greater expectation of flawed code executing in-core. Because of this, we make a slightly modified approach: Work Packages must have a valid Authorization, i.e.  `isAuthorized` returns `true` when provided with the Work Package. However, Validators get rewarded for *any* such authorized Work Package, even one which ultimately panics or overruns on its evaluation.

This ensures that ScBG nodes do a strictly limited amount of work before knowing whether they will be rewarded and are able to discontinue and attempt other candidates earlier than would otherwise be the case. There is the possibility of wasting computational resources by processing Work Packages which result in error, but well-written authorization procedures can mitigate this risk by making a prior validation of the Work Items.

### Refine

The `refine` function is implemented as an entry-point inside a Service Contract Address:

```solidity
function refine(PackageInfo packageInfo) external pure returns (WorkResult[] memory)
```

Both `refine` and `isAuthorized` are only ever executed in-core.  Within this environment, we need to ensure that we can interrupt computation not long after some well-specified limit and deterministically determine when an invocation of the VM exhausts this limit. Since the exact point at which interruption of computation need not be deterministic, it is expected to be executed by a streaming JIT transpiler with a means of approximate and overshooting interruption coupled with deterministic metering.

When applying `refine` from the client code, we must allow for the possibility that the VM exits unexpectedly or does not end. Validators are always rewarded for computing properly authorized Work Packages, including those which include such broken Work Items. But they must be able to report their broken state into the System-chain in order to collect their reward. Thus we define a type `WorkResult`:

```solidity
enum WorkError {
    None,
    Timeout,
    Panic
}

struct WorkResult {
    uint32 service;
    bytes32 item_hash;
    WorkError  error;
    bytes result;
    uint256 gas_used;
}

function applyRefine(CoreJam.WorkItem memory item) external pure returns (CoreJam.WorkResult memory);
```

The amount of gas used in executing the `refine` function is noted in the `WorkResult` value, and this is used later in order to help apportion remaining gas in the Join-Accumulate process to the Services whose items appear in the Work Packages.

```golang
/// Secure reference to a Work Package.
type WorkPackageSpec struct {
  /// The hash of the SCALE encoded `EncodedWorkPackage`.
	Hash WorkPackageHash
  /// The erasure root of the SCALE encoded `EncodedWorkPackage`.
	Root ErasureRoot
  /// The length in bytes of SCALE encoded `EncodedWorkPackage`.
	Len  uint32
}

/// The specification of the underlying Work Package.
type WorkReport struct {
	PackageId WorkPackageId
  /// The context of the underlying Work Package.
	Context   Context
  /// The Core index under which the Work Package was Refined to generate the Report.
	CoreIndex CoreIndex
  /// The results of the evaluation of the Items in the underlying Work Package.
	Results   []WorkResult // MaxWorkItemsInPackage
}

/// Multiple signatures are consolidated into a single Attestation in a space-efficient
/// manner using a `Bitmap` to succinctly express which validators have attested.
type Attestation struct {
  /// The Work Report which is being attested.
	Report      WorkReport
  /// Which validators from the group have a signature in `attestations`.
	Validators  *bitmap.Bitmap
  /// The signatures of the ScBG members set out in `validators` whose message is the
  /// hash of the `report`. The order of the signatures is the same order as the validators appear in `validators`.
	Attestations []Signature
}
```

Each System-chain block, every Backing Group representing a Core which is assigned work provides a series of Work Results coherent with an authorized Work Package. Validators are rewarded when they take part in their Group and process such a Work Package. Thus, together with some information concerning their execution context, they sign a *Report* concerning the work done and the results of it. This is also known as a *Candidate*. This signed Report is called an *Attestation*, and is provided to the System-chain block author. If no such Attestation is provided (or if the System-chain block author refuses to introduce it for Reporting), then that Backing Group is not rewarded for that block.

WorkReports are gossiped among ScBG nodes (OP Stack nodes, using op-geth's libp2p-based messaging) to form a sufficient number attestations, which arrive at the ScBa.   In an OP Stack setting, a set of OP Stack nodes all can validate the activity of the ScBA, which are chosen via some process to be part of a ScBG.  See RFC #3 and discussion of design alternatives, one of which should be adapted for this purpose and placed in a OP Stack setting.

### Join-Accumulate

Join-Accumulate is the second major stage of computation and is independent from Collect-Refine. Unlike with the computation in Collect-Refine which happens contemporaneously within one of many isolated cores, the consensus computation of Join-Accumulate is both entirely synchronous with all other computation of its stage and operates within (and has access to) the same shared state-machine.

Being *on-chain* (rather than *in-core* as with Collect-Refine), information and computation done in the Join-Accumulate stage is carried out (initially) by the Block Author and the resultant block evaluated by all Validators and full-nodes. Because of this, and unlike in-core computation, it has full access to the System-chain's state.

The Join-Accumulate stage may be seen as a synchronized counterpart to the parallelised Collect-Refine stage. It may be used to integrate the work done from the context of an isolated VM into a self-consistent singleton world model. In concrete terms this means ensuring that the independent work components, which cannot have been aware of each other during the Collect-Refine stage, do not conflict in some way. Less dramatically, this stage may be used to enforce ordering or provide a synchronisation point. Finally, this stage may be a sensible place to manage asynchronous interactions between subcomponents of a Service or even different Services and oversee message queue transitions.

#### Reporting and Integration

There are two main phases of on-chain logic before a Work Package's ramifications are irreversibly assimilated into the state of the (current fork of the) System-chain. The first is where the Work Package is *Reported* on-chain. This is proposed through an extrinsic introduced by the ScBA and implies the successful outcome of some *Initial Validation* (described next). This kicks-off an off-chain process of *Availability* which, if successful, culminates in a second extrinsic being introduced on-chain shortly afterwards specifying that the Availability requirements of the Work Report are met.

Since this is an asynchronous process, there are no ordering guarantees on Work Reports' Availability requirements being fulfilled. There may or may not be provision for adding further delays at this point to ensure that Work Reports are processed according to strict ordering. See *Work Package Ordering*, later, for more discussion here.

Once both Availability and any additional requirements are met (including ordering and dependencies, but possibly also including reevaluation of some of the Initial Validation checks), then the second phase is executed which is known as *Integration*. This is the irreversible application of Work Report consequences into the Service's State Trie and (via certain permissionless host functions) the wider state of the System-chain. Work Results are segregated into groups based on their Service, joined into a `Vec` and passed through the immutable Prune function and into the mutable Accumulate function.

#### Initial Validation

There are a number of Initial Validation requirements which the ScBA must do in order to ensure no time is wasted on further, possibly costly, computation. Since the same tests are done on-chain, then for a Block Author to expect to make a valid block these tests must be done prior to actually placing the Attestations in the System-chain Block Body.

Firstly, any given Work Report must have enough signatures in the Attestation to be considered for Reporting on-chain. Only one Work Report may be considered for Reporting from each ScBG per block.

Secondly, any Work Reports introduced by the ScBA must be *Recent*, at a height is less than `RECENT_BLOCKS` (eg 16) from the block which the ScBA is now authoring.

Thirdly, dependent elements of the Context (`context.block_number`) must correctly correspond to those on-chain for the block corresponding to the provided `context.header_hash`. For this to be possible, the System-chain is expected to track Recent blocks in a queue.

Fourthly, the ScBA may not attempt to report multiple Work Reports for the same Work Package. Since Work Reports become inherently invalid once they are no longer *Recent*, then this check may be simplified to ensuring that there are no Work Reports of the same Work Package within any *Recent* blocks.

Finally, the ScBA may not register Work Reports whose prerequisite is not itself Reported in *Recent* blocks.

In order to ensure all of the above tests are honored by the ScBA, a block which contains Work Reports which fail any of these tests shall panic on import. The System-chain's on-chain logic will thus include these checks in order to ensure that they are honoured by the ScBA.  The ScBA should track *Recent Reports*, and retain all Work Package hashes which were Reported in the *Recent* blocks.

The ScBA must keep an up to date set of which Work Packages have already been Reported in order to avoid accidentally attempting to introduce a duplicate Work Package or one whose prerequisite has not been fulfilled. Since the currently authored block is considered *Recent*, Work Reports introduced earlier in the same block do satisfy the prerequisite of Work Packages introduced later.

While it will generally be the case that ScBGs know precisely which Work Reports will have been introduced at the point that their Attestation arrives with the ScBA by keeping the head of the System-chain in sync, it will not always be possible. Therefore, ScBGs will never be punished for providing an Attestation which fails any of these tests; the Attestation will simply be kept until either:

1. it stops being *Recent*;
2. it becomes Reported on-chain; or
3. some other Attestation of the same Work Package becomes Reported on-chain.

#### Availability

Once the Work Report of a Work Package is Reported on-chain, the Work Package itself must be made *Available* through the off-chain Availability Protocol, which ensures that any dispute over the correctness of the Work Report can be easily objectively judged by all validators.  Being off-chain this is _not_ block-synchronized and any given Work Package may take one or more blocks to be made Available or may even fail.

Only once a Work Report's Work Package is made Available the processing continue with the next steps of Joining and Accumulation.
We will follow RFC #31's soft-ordering.

#### Gas Provisioning

Join-Accumulate is, as the name suggests, comprised of two subordinate stages. Both stages involve executing code inside a VM on-chain. Thus code must be executed in a *metered* format, meaning it must be able to be executed in a sandboxed and deterministic fashion but also with a means of providing an upper limit on the amount of gas it may consume and a guarantee that this limit will never be breached.

Practically speaking, we may allow a similar VM execution metering system similar to that for the `refine` execution, whereby we do not require a strictly deterministic means of interrupting, but do require deterministic metering and only approximate interruption. This would mean that full-nodes and System-chain validators could be made to execute some additional margin worth of computation without payment, though any attack could easily be mitigated by attaching a fixed cost (either economically or in gas terms) to an VM invocation.

Each Service defines some requirements it has regarding the provision of on-chain gas. Since all on-chain gas requirements must be respected of all processed Work Packages, it is important that each Work Report does not imply using more gas than its fair portion of the total available, and in doing so provides enough gas to its constituent items to meet their requirements.

```rust
struct WorkItemGasRequirements {
    prune: uint256,
    accumulate: uint256,
}
type GasRequirements = StorageMap<Service, WorkItemGasRequirements>;
```

Each Service has two gas requirements associated with it corresponding to the two pieces of permissionless on-chain Service logic and represent the amount of gas allotted for each Work Item of this service within in a Work Package assigned to a Core.

The total amount of gas utilizable by each Work Package (`gas_per_package`) is specified as:

```rust
gas_per_package = system_block_gas * safety_margin / max_cores
```

`safety_margin` ensures that other System-chain system processes can happen and important transactions can be processed and is likely to be around 75%.

A Work Report is only valid if all gas liabilities of all Work Items to be Accumulated fit within this limit:

```rust
let total_gas_requirement = work_statement
    .items
    .map(|item| gas_requirements[item.service])
    .sum(|requirements| requirements.prune + requirements.accumulate);
total_gas_requirement <= gas_per_package
```

Because of this, Work Report builders must be aware of any upcoming alterations to `max_cores` and build Statements which are in accordance with it not at present but also in the near future when it may have changed.

### Accumulate

The next phase, which happens on-chain, is Accumulate. This governs the amalgamation of the Work Package Outputs calculated during the Refinement stage into the System-chain's overall state and in particular into the various Child Tries of the Services whose Items were refined. Crucially, since the Refinement happened in-core, and since all in-core logic must be disputable and therefore its inputs made *Available* for all future disputers, Accumulation of a Work Package may only take place *after* the Availability process for it has completed.

The function signature to the `accumulate` entry-point in the Service's code blob is:

```solidity
function accumulate(CoreJam.Tuple[] memory results) external;
```

The logic in `accumulate` may need to know how the various Work Items arrived into a processed Work Package. Since a Work Package could have multiple Work Items of the same Service, it makes sense to have a separate inner `Vec` for Work Items sharing the Authorization (by virtue of being in the same Work Package).

Work Items are identified by their Keccak hash, known at the *Item Hash* (`ItemHash`). We provide both the Authorization of the Package and the constituent Work Item Hashes and their Results in order to allow the `refine` logic to take appropriate action in the case that an invalid Work Item was submitted (i.e. one which caused its Refine operation to panic or time-out).

There is an amount of gas which it is allowed to use before being forcibly terminated and any non-committed state changes lost. The lowest amount of gas provided to `accumulate` is defined as the number of `WorkResult` values passed in `results` to `accumulate` multiplied by the `accumulate` field of the Service's gas requirements.

However, the actual amount of gas may be substantially more. Each Work Package is allotted a specific amount of gas for all on-chain activity (`gas_per_package` above) and has a gas liability defined by the gas requirements of all Work Items it contains (`total_gas_requirement` above). Any gas remaining after the liability (i.e. `gas_per_package - total_gas_requirement`) may be apportioned to the Services of Items within the Report on a pro-rata basis according to the amount of gas they utilized during `refine`. Any gas unutilized by Classes within one Package may be carried over to the next Package and utilized there.

Read-access to the System-chain state is allowed with EVM Precompiles.  No direct write access may be provided since `accumulate` is untrusted code.

Since `accumulate` is permissionless and untrusted code, we must ensure that its child trie does not grow to degrade the System-chain's overall performance or place untenable requirements on the storage of full-nodes. To this goal, we require an account sovereign to the Service to be holding an amount of funds proportional to the overall storage footprint of its Child Trie. `set_work_storage` may return an error should the balance requirement not be met.

Host functions are provided allowing any state changes to be committed at fail-safe checkpoints to provide resilience in case of gas overrun (or even buggy code which panics). The amount of gas remaining may also be queried without setting a checkpoint. `Gas` is expressed in a regular fashion for a solo-chain (i.e. one-dimensional).

The `accumulate` of one service may call `accumulate` of another service via internal contract call, which may also transfer a  `value` into their account.  

### CoreJam Storage API + EIP-4844

To reference large, immutable and long-term data payloads both in-core (`refine`) and on-chain (`accumulate`), we expose a *CoreJam Storage API*, accessible to untrusted code through Solidity library and to trusted System-chain code via a Golang interface. Internally, data is stored with a reference count so that two separate usages of `store` need not be concerned about the other.
Every piece of data stored for an untrusted caller requires a sizeable deposit. When used by untrusted code via a host function, the `depositor` would be set to an account controlled by the executing code.

```golang
type Storage interface {
  /// Immutable function to attempt to determine the preimage for the given `hash`.
	Lookup(hash common.Hash) []byte
  /// Allow a particular preimage to be `provide`d.  Once provided, this will be available through `lookup` until `unrequest` is called.
	Request(hash common.Hash, len int) bool
  /// Remove request that some data be made available. If the data was never
  /// available or the data will remain available due to another request,
  /// then `false` is returned and `expunge` may be called immediately.
  /// Otherwise, `true` is returned and `expunge` may be called in
  /// 24 hours.
	Unrequest(hash common.Hash) bool
  // Functions used by implementations of untrusted functions; such as
  // extrinsics or host functions.
  /// Place a deposit in order to allow a particular preimage to be `provide`d.
  /// Once provided, this will be available through `lookup` until
  /// `unrequest_untrusted` is called.
	RequestUntrusted(depositor AccountID, hash common.Hash, len int)
  /// Remove request that some data be made available. If the data was never
  /// available or the data will remain available due to another request,
  /// then `false` is returned and `expunge_untrusted` may be called immediately.
  /// Otherwise, `true` is returned and `expunge_untrusted` may be called in
  /// 24 hours.
	UnrequestUntrusted(depositor AccountID, hash common.Hash) bool
  // Permissionless items utilizable directly by an extrinsic or task.

  /// Provide the preimage of some requested hash. Returns `Some` if its hash
  /// was requested; `None` otherwise.
  ///
  /// Usually utilized by an extrinsic and is free if `Some` is returned.
	Provide(preimage []byte) (common.Hash, bool)

  /// Potentially remove the preimage of `hash` from the chain when it was
  /// unrequested using `unrequest`. `Ok` is returned iff the operation is
  /// valid.
  ///
  /// Usually utilized by a task and is free if it returns `Ok`.
	Expunge(hash common.Hash) error
  /// Return the deposit associated with the removal of the request by
  /// `depositor` using `unrequest_untrusted`. Potentially
  /// remove the preimage of `hash` from the chain also.  `Ok` is returned
  /// iff the operation is valid.
  ///
  /// Usually utilized by a task and is free if it returns `Ok`.
	ExpungeUntrusted(depositor AccountID, hash common.Hash) error
  /// Equivalent to `request` followed immediately by `provide`.
	Store(data []byte) common.Hash
}
```

New OVM opcodes for each function are as follows:

| OVM Opcode | Go Interface | Description |
|------------|--------------|-------------|
| `APLOOKUP` | `Lookup(hash common.Hash) []byte` |  Looks up the provided hash in the storage and returns the corresponding value as a byte array. If the hash is not found, returns None. |
| `APREQ` | `RequestUntrusted(depositor AccountID, hash common.Hash, len int)` |  Places a deposit to request the specified hash with a given length to be made available in the storage. This function is used by untrusted sources.
| `APUNREQ` | `UnrequestUntrusted(depositor AccountID, hash common.Hash) bool` |  Removes the request for the specified hash made by the specified depositor. If the request is successfully removed, returns true. Otherwise, returns false. |
| `APPROVIDE` | `Provide(preimage []byte) (common.Hash, bool)` | Provides the preimage data. If the preimage corresponds to a previously requested hash, returns the hash. Otherwise, returns None. |
| `APEXP` | `ExpungeUntrusted(depositor AccountID, hash common.Hash) error` |  Removes the specified hash and its corresponding data from the storage, based on a request made by the specified depositor. Returns Ok(()) if the operation is successful, an error otherwise. |
| `APSTORE` | `Store(data []byte) common.Hash` | Stores the provided data in the storage and returns the hash of the stored data.  |

Removing data happens in a two-phase procedure; first the data is unrequested, signalling that calling `lookup` on its hash may no longer work (it may still work if there are other requests active). 24 hours following this, the data is expunged with a second call which, actually removes the data from the chain assuming no other requests for it are active.  Only once expunge is called successfuly is the deposit returned. If the data was never provided, or is additional requests are still active, then expunge may be called immediately after a successful unrequest.

The  Storage API should be connectable to Ethereum [EIP-4844](https://www.eip4844.com/) with Blob Transactions.   While `accumulate` calls would be included in OP Stack Blob transactions, the veracity of the `refine` requires that the WorkItems (which may be large in number) must also be executable on Ethereum L1, requiring the `refine` inputs to be included.  Fault proofs for both `refine` "in-core" and `accumulate` "on-chain" calls are necessary.

Ethereum's solution of 32 kB/sec of throughput post Dencun (part 2) and 1.3 MB/sec full danksharding should be relevant.  Note that this is significantly lower than Polkadot DA's 66-133MiB/s (assuming 100-200 cores), which presumably would be used for both `refine` and `accumulate`.  

### Work Package Ordering

We target the soft-ordering variant: providing ordering only on a *best-effort* basis, whereby Work Reports respect the ordering requested in their Work Packages as much as possible, but it is not guaranteed. Work Reports may be Accumulated before, or even entirely without, their prerequisites. We refer to this *Soft-Ordering*. The alternative is to provide a guarantee that the Results of Work Packages will always be Accumulated no earlier than the Result of any prerequisite Work Package. As we are unable to alter the Availability Protocol, this is achieved through on-chain queuing and deferred Accumulation.

Initial Validation are made on-chain prior to the Availability Protocol begins for any given Work Package. This ensures that the Work Package is still in scope. However, this does not ensure that the Work Package is still in scope at the point that the Work Results are actually Accumulated. It is as yet unclear whether this is especially problematic.

### Fees

Fees are ETH on L2, bridged from Ethereum L1.  OP Stack models the L1 fees explicitly.   While both the ScBG `refine` and ScBA `accumulate` are both metered in gas usage, the relatively scarce nature of the `accumulate` stage demands a massive premium over the `refine`.  

## Performance, Ergonomics and Compatibility, Notes on Implementation in OP Stack

Ethereum L2 Users of a Service on the CoreJam System Chain should be able to submit transactions that result in Work Items causing Work Packages.  CoreJam's map-reduce architecture is most valuable when significant portions of gas consumption would have been expensive to do in `accumulate` may be done at lower gas with fewer compute resources in `refine`.  

We envision an initial version of this proposal with modifications to the OP Stack:

1.  We require a Work Package scheduling system that can orchestrate a distributed array of "cores".  This in turn requires a mapping between Work Packages/Services and Core Index, with implementable ScBG strategy, following [Dynamic Backing Groups: Preparing Cores for Agile Scheduling](https://forum.polkadot.network/t/dynamic-backing-groups-preparing-cores-for-agile-scheduling/3629/10) and RFC #3.
2. We require metering ScBG and ScBA and charging the user in "Instantaneous" ETH in a manner consistent with the relative scarcity of each resource, and compensating the cores for their contributions.  It may be essential to adopt the Bulk CoreTime model for services instead for efficiency.
3. We require extending the [Optimistic Virtual Machine] Availability Protocol in OP Stack, using KAGOME's erasure coding or similar, using Go C++ bindings.  
4. We require OP Stack fault proofs extended to use EIP-4844 blobs to accommodate the above

## Testing, Security and Privacy

ORUs derive their security largely from fault proofs, where we expect to rely on OP Stack's Fault Proof / Dispute game, developed by Optimism.

The fault proof mechanism must be extended to accommodate EIP-4844, not just for blocks but for the `refine` work result output.  It is necessary to extend the OP Stack Fault proof game.

The precise details of Work Reports / Attestation from "in core" nodes where Attestation / Work Reports can be run by a large number of nodes participating in ScBGs needs a precise signature scheme.

The fundamental work product is not Solidity contracts, but representative pedagogical service contracts merit expert attention.

Testing norms have been established in OP Stack, which must be matched OP Stack implementation.

The proposal introduces no new privacy concerns.

## Future Directions and Related Material

It is highly desirable to:
1. build multiple services demonstrating scaling performance of the CoreJam architecture in Services
2. measure performance of Availability Protocol as a function of # of cores in the CoreJam System Chain

## Drawbacks, Alternatives and Unknowns

1. In the case of composite Work Packages, allowing synchronous (and therefore causal) interactions between the Work Items. If this were to be the case, then some sort of synchronisation sentinel would be needed to ensure that should one subpackage result without the expected effects on its Service State (by virtue of the `accumulate` outcome for that subpackage), that the `accumulate` of any causally entangled subpackages takes appropriate account for this (i.e. by dropping it and not effecting any changes from it).

2. Work Items may need some degree of coordination to be useful by the `accumulate` function of their Service. To a large extent this is outside of the scope of this proposal's computation model by design. Through the authorization framework we assert that it is the concern of the Service and not of the System-chain validators themselves.

## Prior Art and References

This is an adaptation of RFC #31.  We are grateful for useful feedback from both the Polkadot and Ethereum community.
