# RFC-XXXX: Coreplay

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 16 August 2023                                                                                |
| **Description** | Actor interaction environment hosted by Coretime. |
| **Authors**     | Gavin Wood                                                                    |


## Summary

In this proposal I develop the idea of using cores on the Polkadot Ubiquious Computer to host smart contract code directly. The idea of one or more system-maintained secondary storage "disk-chains" is introduced.

The overall computation model bears some resemblance to the traditonal von Neumann machine architecture, with analagies possible to make of timeslicing, cache, main memory, secondary (disk) storage, network I/O and synchronisation primitives.

## Motivation

- Familiar primitives and environment
- Easy deployment
- Less need to consider execution resources for the application developer.
- Facilitates core-parallelism
- Facilitates emergent applications

## Requirements

Avoids need to:
- deploy a blockchain in order to have economically strong logic in Polkadot.
- run collators.
- pay/deposit potentially large amount of funds.
- pay much consideration to tracking weight (placing a `yield` in any significant loop should be sufficient).

Allows Accord-like functionality.
Allows smart-contract-like functionality.
Allows both asynchronous and rich synchronous interaction between economically independent actors.

## Stakeholders

1. Developers of the Polkadot protocol.
1. Engineers wishing to build resilient applications.

## Explanation

### Summary

What I will call here *Para-Tasks* are what we have historically refer to as Parachains/Paras. They:
- Have associated *Task Validation Function* (TVF) code (known as a *Parachain Validation Function* of PVF) which is stored 1:1 with Para-Tasks and is not deduplicated.
- Have associated state known as `HeadData` of type `Vec<u8>` (but which may have restrictions regarding storage limits(?)).
- Have additional state tracking DMP, UMP and XCMP queue status.
- Have no synchronous interactions with other Tasks.
- Have hitherto been scheduled to be alone on their Core.
- Have a Parachain PoV (PPoV) model which achieves validity when the following occurs within a given time limit and without panicking:
  - A WebAssembly environment is initiated whose code is the PVF code blob.
  - A single call into the PVF entry point is made.
- Once a PPoV is canonicalised:
  - The `HeadData` and *MP queue state is updated according to the output of the PVF entry point call.
- A PPoV expires if:
  - The `HeadData` for the Para-Task has changed, and its old value is referenced in the entry-point input either by this PPoV directly or another PPoV which this PPoV's canonicalisation implies is canonicalised.
- Have certain restrictions regarding data sizes and messaging.
- Are quite expensive to create.

PVF code blobs:
- are in WebAssembly.
- have a single entry-point.
- have entry-point inputs of:
  - Previous `HeadData`.
  - The PoV blob.
  - The current Relay-chain block number.
  - The current Relay-chain state root.
- have entry-point outputs of:
  - New `HeadData`.
  - An optional replacement of the Task's Validation Function code.
  - A set of message-blobs to be passed to the Relay-chain.
  - The number of message-blobs sent from the Relay-chain to be dequeued.
  - A set of message-blobs and associated metadata to be sent to other Para-Tasks via XCMP/HRMP.
  - A value indicating which messages sent from other Para-Tasks have been received into the chain.

Q: When there are multiple approved Task candidates for a single Task block, when does the RC know to honour the output messages?
Q: When a host function is used whose servicing leads to re-entry, what does the stack look like? Is there a second stack created? Is it possible to snapshot the memory and VM state?

This document proposes a new kind of Task (rather than the Para-Task), the Actor-Task. These:
- Have an associated *hash* which identifies an *Actor Validation Function* code blob which is stored in a Relay-chain map.
- Have associated 32-byte *State Hash* and a `u64` Sequence.
- Support and rely on being co-scheduled (i.e. scheduled on the same Core at the same RC block) with other Actor-Tasks.
- May have synchronous interactions with other Actor-Tasks which are co-scheduled, and thus excludes the possibility of mutually-exclusive PoVs to be validated since they could create a unresolvable DAG. (In effect, the RC cannot validate multiple branches of an Actor's fork; Actors must have a canonical sequence.)
- Are very cheap to create.
- Assumes that the PoV is an Actor PoV (APoV) which comprises:
  - an *Agenda* segment (a `Vec<AgendaItem>`).
  - a *Slabs* segment (a `Vec<Slab>`)
  - a *Witness* segment (a `Vec<u8>`)
- Assumes that a APoV is valid if:
  - The Agenda contains only entries for the Actor-Tasks which have been co-scheduled and at least one `Service` entry for each such Actor-Task.
  - The Slabs contains exactly one entry for each Actor-Task which is co-scheduled.
  - The `sequence` of each Slab is greater than the last `sequence` associated with that Actor-Task.
  - And the following occurs without panicking or timing out(*):
    - An execution environment is initiated for each of the Actor-Tasks which are scheduled.
    - Each such execution environment is initialized with code according to the Actor-Task's AVF and has memory initialised with the `pre` field of its Slab.
    - A call into the relevant entry-point of the relevant AVF is made for each Agenda item in turn.
    - When done, the `post` field of each Actor-Task's Slab equals the contents of the corresponding execution environment's memory.
  - Successful validation implies possible canonicalisation. This happens when:
    - The PoV has passed all normal checks regarding approvals and backing.
    - Each Slab's `sequence` is exactly one greater than all corresponding Actor-Task's `sequence`s.
    - Each Slab's `pre` hashes to the state hash of the corresponding Actor-Task.
  - Upon the canonicalisation of an Actor PoV:
    - Each Actor-Task which has a Slab in the APoV is updated with the `sequence` and hashes `post` fields of the corresponding Slab in the APoV.
  - A prior validated APoV becomes invalid and expires when:
    - The Sequence of an Actor-Task co-scheduled in the APoV becomes equal to the `sequence` in the `Slab` of the APoV.
    - The Sequence of an Actor-Task co-scheduled in the APoV becomes equal to one fewer than the `sequence` in the `Slab` of the APoV; AND, the State Hash of this Actor-Task is not equal to the hash of the `pre` in the `Slab` of the APoV.

AVF code blobs:
- include metadata describing format and platform (WebAssembly and RISKV are both reasonable formats).
- have two required entry-points:
  - `async fn main(args: Vec<u8>)`
  - `fn call(origin: Option<TaskId>, data: Vec<u8>) -> Result<Vec<u8>, ()>`
- have two recommended inspector entry-points, used by Actor-Sequencers.
  - `fn payout(now: RelayChainBlockNumber) -> RelayChainBalance`
  - `fn dependencies(now: RelayChainBlockNumber) -> Vec<TaskId>`
- Are uploadable independently to the Relay-chain, which may be expensive (but creating an Actor is cheap).

Agenda:
```
struct AgendaItem {
    actor: TaskId,
    entry: Invocation,
}
enum Invocation {
    Service { times: u32 },
    Call { in: Vec<u8>, out: Vec<u8> },
}
struct Slab {
    actor: TaskId,
    sequence: u64,
    pre: Vec<u8>,
    post: Vec<u8>,
}
```

#### * Timing out...

How do we manage continuations?

Can we make a host function which suspends execution, allows for snapshotting and tear-down with a later restoration and resumption?

What about multiple call-stacks (green-threads/fibres)?

Can we just snapshot memory and continue where we left off?

Can we (from a second thread) force the execution environment to pause and drop out? Can we limit execution deterministically other than by requiring `yield`s? In Wasm? In RISCV?

It's probably fine to require the use of "cooperative" async constructs (explicit yeilding, use of `await` &c.), rather than preemptively interrupting execution and snapshotting. But (how) can we do this in Wasm? RISCV?

If there is a mechanism for intercepting and gracefully handling yield/`await`, then timing out can be just as with PVFs. But these are not available to use, then we'll need to preemptively interrupt and snapshot/resume and thus need much more low-level support to constrain how far execution goes.

#### Generalised PoVs

Consider also the possibility of introducing and migrating to "Generalised" PoVs rather than having "hard-coded" Actor PoVs and Parachain PoVs, whereby the logic for handling both PPoVs/APoVs and Para-Tasks/Actor-Tasks are expressed in Wasm as execution patterns on the Relay-chain.

Tasks would need to identify what usage pattern they're associated with, as would PoVs. The metahandler for a GPoV would allow for setting up EEs and fetching code as part of PoV-validation, and provide APIs for accessing Relay-chain state in general. Probably beyond this RFC.



~Ideally, there exists execution metering (though a timeout may be sufficient).~
~Ideally, the execution environment is able to interrupt execution occasionally (though a timeout is likely sufficient).~

### Discussion (might be out of date)

The *Polkadot Coreplay* model is an actor environment hosted direcly on the Polkadot UC. It is based on an assumption that Polkadot Cores are able to execute one or more Tasks in any given Relay-chain Timeslice. In the Coreplay model, these Tasks are *Actors*. Actors are associated with a single Task, in much the same way that a Parachain is also associated with exactly one Task. We identify the class of Tasks which represent Actors as *Actor Tasks*, rather than those which represent Parachains which are *Parachain Tasks*. In the Coretime model, nothing stops there from being other forms of Task, but that is beyond the present scope.

Actors always run synchronously and always on a Polkadot Core. They have a persistent working memory or *State*. Persistence between scheduled executions is guaranteed by Polkadot with a secondary storage mechanism (see later). Actors have a fixed piece of code which governs their valid execution and this is represented within its Task's validation code, deduplicated and stored on the Relay-chain.

The State of an Actor contains a single heap together with one or more execution stacks, allowing for a highly asynchronous multi-fibre programming model. An Actor's code has well-defined entry points:

- `fn service()`
- `fn call(origin: Option<TaskId>, data: Vec<u8>) -> Vec<u8>`
- `fn payout(now: RelayChainBlockNumber) -> RelayChainBalance`
- `fn dependencies(now: RelayChainBlockNumber) -> Vec<TaskId>`

The Polkadot PoV may execute `service` and `call` in any of the scheduled Actors in any order. However, the PoV must ensure that `service` is executed at least once for all scheduled Actors. For `calls`, only the data argument is specified; `origin` is always `None`.

Aside from the differences in prototype, they differ in that `service` executions may yield themselves whereas `call`s must execute synchronously (though nothing stops it returning a higher-level representation of a *future*).

Various host functions are made available to `service` and `call` providing access to some standard information which can be inferred from the rest of the PoV block. This is mostly data external to the Actor Task, but defined by the Relay-chain state. The other calls have no host functions available.

Unlike Parachains, there is no underlying chain to help provide an order to Actor tasks. Actors are scheduled by users who wish to see them continue execution. In much the same way as parathreads were envisioned, Actors may offer payment to any third-party who schedules their execution.

Once the weight becomes fully used, execution halts and the state of all Actors is snapshotted. Execution may never halt inside of a `call`.

A new host function is available `call_actor` to Tasks which accepts a Task Identifer and some data and returns data. It makes the execution of a `call` in the identified Actor with the given data iff it is co-scheduled and returns the result. The Actor Origin of the `call` is the Task Identifier of the Actor who makes the `call_actor` call.

Another new host function exists `coscheduled_tasks` returning a `Vec<TaskId>` allowing Actors who are co-scheduled to discover each other. Some actors may require co-scheduling under certain circumstances. Actors could even require solitary execution.

When implementing the `call` entry point, Actors will likely identify a method and have one of three implemention patterns: inspector (which simply returns some piece of data), sync mutator (which makes some simple change to state and returns quickly, potentially with some data) and async mutator (which just places the message data on a queue for later servicing, possibly returning some reference to the request).

### Block Building

Basically, we need to approach block-building as a cooperative endeavour or it'll become a very tangled affair. We form a consensus on what collators are have primacy to schedule which Actors, so that every Actor has exactly one collator responsible at every RC-block. We might want to allow some collators to have a limited-time affinity with one or more Actors to allow for "overclocking" multi-core sequences. Much as for blockchains, we'd need to be careful to ensure that the collator is well-incentivised (so they actually bother building saturated PoVs/including transactions) and that they get rotated often and randomly (to avoid censorship).

Obviously for actors, transactions/extrinsics are basically just `Call` Agenda entries. Since `call` is sync, the idea is that they're placed in a queue and actually executed later in a call to `service`. If the queue is full (or the message is not sensible) then an error can be returned synchronously.

Calling `service` at least once is a requirement, but the idea is that unlike with regular transactions, `call` per se wouldn't pay out to the collator but rather a following `service` would.


#### Old notes (may be out of date)

- Actor-Collators form a consensus.
- For each RC block, every Actor has at most one *Canonical Collator* (CC).
- CC is agreed as the only collator privileged to include the Actor-Task in their PoV.
- Preference given to collators who promise to provide the most Instantaneous Coretime (i.e. beyond that which is scheduled in Bulk).
- Random seeding of collators implying order to select Actors.
- Collators can "outbid" peers by promising to dedicate more Coretime.
- Real-time auction process to determine Actor-Collator mapping.

*Progress* is not yet defined. Several possible definitions:
- Some arbitrary value decided by the Actor's logic and returned via a API entry point `fn progress() -> u128`.
  - Pro: Extremely flexible.
  - Con: Impossible to predict; work must first be done before it can be determined.
- Weighting count of times `call` and `service` called.
  - Pro: No impl work required in Actor.
  - Con: Impossible to predict how much weight this takes so work must still first be done before it can be determined.

### Interaction with Bulk Coretime

### Relay-chain I/O

### Secondary Storage

There is a concept of a "secondary storage" *Disk-chain*. There may be one or more instances of Disk-chains deployed to the Relay-chain, in much the same way that a regular server may have one or more hard disks.

Disk-chains are system chains which provide high-security, arbitrary-term data availability. They are incentivised within the Polkadot economic framework. One possible model of design would be to follow the zk-proof based PoST used in Filecoin. Disk-chains only provide hash-preimage lookup functionality with a well-known upper bound on the preimage size allowed. Hashes whose preimage is stored are reference-counted and there is a bookkeeping system to ensure any given Task does not utilize more storage than they have reserved and pre-paid for.

Disk-chains are used for two things: firstly, they provide backing for each Actor's *Slab*, or continuation state data. This data is a snapshot of the memory of the WebAssembly execution. Secondly, they act as a resource for storing payloads which may need to be fetched by actors in later executions but which are not necessarily needed in every execution.

### Utility Actors

One may envision a loose class of Actors known as *Utility Actors*. These would be lightweight Actors using deduplicated code, minimal state and no communication channels; therefore very cheap to create, maintain and co-schedule. For example, a *Synchronisation Actor* would retain a set of mappings which would be guaranteed to alter atomically according to a standard ruleset, perhaps reminiscent of a typical mutex/semophore and privilige system. Multiple actors could share read/write access over multiblock continuations based on coscheduling with this at times when they need to lock/unlock. This helps to trivialise multi-block, multi-actor application architectures which are extremely difficult to engineer at present.

### Scaling a Common Use-Case

Since actors can "only" be either co-scheduled or communicated with asynchronously (which is a lot better than at present which is effectively only the latter) certain use-cases, such as an asset ledger, might be difficult to envision. While an asset ledger could be implemented in a single Actor which for a very popular and widely used asset might be scheduled almost continuously, we can start to imagine other architecture possibilities.

One possibility would be to have several different Actors which tracked the same asset; we might call them *Branch Actors* after the terminology banks use whereby every bank account is associated with a particular *branch* of that bank. An account would be identified by the branch index and key. Transfers within a branch might have a smaller fee; transfers between branches would be slower (owing to the need to send an inter-actor notifiation of credit). The existential deposit of accounts within a branch could begin small and increase as the branch reached the limit of accounts it is able to hold.

A more sophisticated system would utilise long-term storage. Accounts would be stored in batches in long-term storage. Transactions would see an *Asset Actor* remove a batch of accounts from long-term storage, record itself as the current administrator of that batch, administer the transactions, possibly posting messages to other Asset Actors to notify of the receipt of funds and retain them until such a time that it needs to withdraw some other batch to optimally execute a transaction.

The advantage with this architecture would be to arbitrarily parallelize the somewhat complex problem of asset transfers, something with which the existing system 

## Performance, Ergonomics and Compatibility

No specific considerations.

## Testing, Security and Privacy

Standard Polkadot testing and security auditing applies.

The proposal introduces no new privacy concerns.

## Future Directions and Related Material


## Drawbacks, Alternatives and Unknowns

None at present.

## Prior Art and References

None.

# Appendix

The analogy:
- polkadot is a city. the city right now has in it only a theatre.
- the theatre has several stages.
-  we might reasonably use the current polkadot logo as a visualisation of polkadot with its single theatre having 6 stages.
- in polkadot's theatre, there are lots of actors.
- stages (not theatres) represent polkadot cores in this analogy
- each actor can be called to a stage to to take part in a play. (an actor is a type of task which can run on a core)
- actors can only take part in one play (and therefore be on one stage) at once.
- plays are of fixed duration (the duration is a timeslice, and this is 6 seconds long).
- the actors then vacate the stage and instantaneously move to their next stage or just sit around backstage being idle if they're not scheduled to take a role in a play. (in this case, a play is a core being scheduled for a timeslice)
- actors can mail postcards to each other (this is the illustration of XCMP).
- when they do, the language they use to write on the postcard is XCM.
- actors can collect their mail from their pigeon hole, which the theatre secures.
- postcards might take a while to be delivered - several stage shows might happen in the meantime.
- when actors appear on stage at the same time, they can interact with each other directly. (tasks scheduled on the same core in the same timeslice can call into each other synchronously).
- actors have an ongoing memory (i.e. in polkadot this will be some number of megabytes)
- actors behave in a certain way (actors also have code associated with them)
- actors always behave in a particular way if presented with the same circumstances when they're in a particular state of mind (actor behaviour are deterministic, based on their current state and their environmental inputs)
- part of the behaviour of actors can be to alter their own behavioural characteristic (actors can be to update their own code)
- by moving between stages and interacting with varying sets of actors, actors can function as glue to create sophisticated emergent entertainment (...emergent applications).
- an actor's memory is limited; if they need to remember something big for a future play, then they can put the information in the theatre's archive and get a tag for it. (there exists a long term data storage system maintained by polkadot into which each actor can insert data)
- actors can ask to have the data retrieved and ready during any future play (the PoV block with which the actor's task is scheduled on a core can include witness data in the form of hash preimages taken from polkadot's data storage system).
- actors must pay for this facility (actors place a deposit in DOT to use the long-term storage)
- actors are sleeping when they're offstage (they don't do anything at all)

On suepr-scaling:
- we'd have multiple theatres in a grid arrangement with the audience (validators) being rotated randomly assigned between them every hour or two.
- we'd introduce the concept of couriers who would deliver mail between theatres (these would be bridges between multiple relay-chains (theatres) using the same superset of validators (audience), and thus are reasonably secure).
- actors would also be couriered between theatres, but they'd obviously be offstage while they're being transported which could take some time.
- actors could only appear on-stage with actors who reside in the same theatre.

On the illustration:
- actors can either be on-stage in a play or off-stage asleep, so i was thinking it's good to have actors be drawn either on a particular stage or in a crowd of sleeping actors off-stage.
- notably, the validators are the audience because they're the ones checking that the actors are behaving correctly
- the sleeping actors and pigeonholes are sat back stage (because the validators don't really need to know about this stuff operationally)
- it's like a huge circular theatre and in the logo there's 6 stages (i.e. six cores), but in reality, there'd be 100s of cores/stages.
