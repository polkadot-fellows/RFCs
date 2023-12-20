# RFC-0026: Sassafras Consensus Protocol

|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| **Start Date**  | September 06, 2023                                               |
| **Description** | Sassafras consensus protocol description and structures          | 
| **Authors**     | Davide Galassi                                                   |


## Abstract

Sassafras is a novel consensus protocol designed to address the recurring
fork-related challenges encountered in other lottery-based protocols.

The protocol aims to create a mapping between each epoch's slots and the
validators set while ensuring that the identity of validators assigned to
the slots remains undisclosed until the slot is actively claimed during block
production.

## 1. Motivation

Sassafras Protocol has been rigorously detailed in a comprehensive
[research paper](https://eprint.iacr.org/2023/031.pdf) authored by the
[Web3 foundation](https://web3.foundation) research team.

This RFC is primarily intended to detail the critical implementation aspects
vital for ensuring interoperability and to clarify certain aspects that are
left open by the research paper and thus subject to interpretation during
implementation.

### 1.1. Relevance to Implementors

This RFC focuses on providing implementors with the necessary insights into the
protocol's operation.

In instances of inconsistency between this document and the research paper,
this RFC should be considered authoritative to eliminate ambiguities and ensure
interoperability.

### 1.2. Supporting Sassafras for Polkadot

Beyond promoting interoperability, this RFC also aims to facilitate the
implementation of Sassafras within the Polkadot ecosystem.

Although the specifics of deployment strategies are beyond the scope of this
document, it lays the groundwork for the integration of Sassafras into the
Polkadot network.


## 2. Stakeholders

### 2.1. Blockchain Developers

Developers responsible for creating blockchains who intend to leverage the
benefits offered by the Sassafras Protocol.

### 2.2. Polkadot Ecosystem Contributors

Developers contributing to the Polkadot ecosystem, both relay-chain and
para-chains.

The protocol will have a central role in the next generation block authoring
consensus systems.


## 3. Notation and Convention

This section outlines the notation and conventions adopted throughout this
document to ensure clarity and consistency.

### 3.1. Data Structures Definitions and Encoding

Data structures are primarily defined using standard [ASN.1](https://en.wikipedia.org/wiki/ASN.1),
syntax with few exceptions:
- Fixed width integer types are not explicitly defined by ASN.1 standard.
  Within this document, `U<n>` denotes a `n`-bit unsigned integer.

Unless explicitly noted, all types must be serialized using
[SCALE](https://github.com/paritytech/parity-scale-codec) codec.

To ensure interoperability of serialized structures, the order of the fields
must match the structures definitions found within this document.

### 3.2. Pseudo-Code

It is advantageous to make use of code snippets as part of the protocol
description. As a convention, the code is formatted in a style similar to
*Rust*, and can make use of the following set of predefined functions:

- `BYTES(x: T)`: returns an `OCTET_STRING` that represents the raw byte array of
  the object x with type T.
  - If `T` is a `VisibleString` (ASCII string), it returns the sequence
    of octets of its ASCII representation.
  - If `T` is `U<n>`, it returns the little-endian encoding of the integer
    `U<n>` as `n/8` octets.

- `U<n>(x: OCTET_STRING)`: returns a `U<n>` interpreting `x` as the
  little-endian encoding of a `n` bits unsigned integer.

- `SCALE(x: T)`: returns an `OCTET_STRING` representing the SCALE encoding of
  `x` with type `T`.

- `BLAKE2(n: U32, x: OCTET_STRING)`: returns the standard *Blake2b* `n`
   bytes hash of `x` as an `OCTET_STRING` (note this is not equivalent to the
   truncation of the full 64 bytes *Blake2b* hash).

- `CONCAT(x₀: OCTET_STRING, ..., xₖ: OCTET_STRING)`: returns the concatenation
  of the inputs as an `OCTET_STRING`.

- `LENGTH(x: OCTET_STRING)`: returns the number of octets in `x` as an `U32`.

### 3.3. Incremental Introduction of Types and Functions

More types and helper functions are introduced incrementally as they become
relevant within the document's context.

We find this approach more agile, especially given that the set of types used is
not overly complex.


## 4. Protocol Introduction

The timeline is segmented into a sequentially ordered sequence of **slots**.
This entire sequence of slots is then further partitioned into distinct segments
known as **epochs**.

The Sassafras protocol aims to map each slot within an epoch to the designated
validators for that epoch, utilizing a ticketing system.

The protocol operation can be roughly divided into five phases:

### 4.1. Submission of Candidate Tickets

Each of the validators associated to the target epoch generates and submits
a set of candidate tickets to the blockchain. Every ticket is bundled with an
anonymous proof of validity.

### 4.2. Validation of Candidate Tickets

Each candidate ticket undergoes a validation process for the associated validity
proof and compliance with other protocol-specific constraints.

### 4.3. Tickets and Slots Binding

After collecting all valid candidate tickets, a deterministic method is used to
uniquely associate a subset of these tickets with the slots of the target epoch.

### 4.4. Claim of Ticket Ownership

During the block production phase of the target epoch, validators are required
to demonstrate their ownership of tickets. This step discloses the identity of
the ticket owners.

### 4.5. Validation of Ticket Ownership

During block verification, the claim of ticket ownership is validated.


## 5. Bandersnatch VRFs Cryptographic Primitives

This chapter provides a high-level overview of the Bandersnatch VRF primitive as
it relates to the Sassafras protocol.

It's important to note that this section is not intended to serve as an
exhaustive exploration of the mathematically intensive foundations of the
cryptographic primitive. Rather, its primary aim is to offer a concise and
accessible explanation of the primitive's role and usage which is relevant
within the scope of this RFC.

For an in-depth explanation, refer to the Ring-VRF
[paper](https://eprint.iacr.org/2023/002.pdf) authored by the Web3 foundation
research team.

### 5.1. VRF Input

The VRF Input, denoted as `VrfInput`, is constructed by combining a domain
identifier with arbitrary data through the `vrf_input` function:

```rust
    fn vrf_input(domain: OCTET_STRING, data: OCTET_STRING) -> VrfInput;
```

The specific implementation details of this function are intentionally omitted.
A reference implementation is provided by the
[`bandersnatch_vrfs`](https://github.com/w3f/ring-vrf/tree/master/bandersnatch_vrfs) 
project.

<TODO>
The above link points to some temporary code (Transcript label set to "TemporaryDoNotDeploy").
Also replace with docs.rs link once published to crates.io.
</TODO>

Helper function to construct a `VrfInput` from a sequence of `data` items:

```rust
    fn vrf_input_from_items(domain: OCTET_STRING, items: SEQUENCE_OF OCTET_STRING) -> VrfInput {
        let data = OCTET_STRING(SIZE = 0); // empty octet string
        for item in items {
            data.append(item);
            data.append(LENGTH(item) as U8);
        }
        return vrf_input(domain, data);
    }
```

Note that each item length is safely casted to an `U8` as:
1. In the context of this protocol all items lengths are less than 256.
2. The function is internal and not designed for generic use.

### 5.2. VRF PreOutput

Functionally, the `VrfPreOutput` can be considered as a *seed* for a PRNG to
produce an arbitrary number of output bytes.

It is computed as function of a `VrfInput` and a `BandersnatchSecretKey`.

Two different approaches can be used to generate it: as a standalone object
or as part of a signature. While the resulting `VrfPreOutput` is identical
in both cases, the legitimacy of the latter can be confirmed by verifying the
signature using the `BandersnatchPublicKey` of the expected signer.

When constructed as a standalone object, `VrfPreOutput` is primarily employed
in situations where the secret key owner needs to check if the generated output
bytes fulfill some context specific criteria before applying the signature.

To facilitate the construction, the following helper function is provided:

```rust
    fn vrf_pre_output(secret: BandernatchSecretKey, input: VrfInput) -> VrfPreOutput;
```

An additional helper function is provided for producing an arbitrary number of
output bytes from `VrfInput` and `VrfPreOutput`:

```rust
    fn vrf_bytes(len: U32, input: VrfInput, pre_output: VrfPreOuput) -> OCTET_STRING;
```

Similar to the `vrf_input` function, the details about the implementation
of these functions is omitted. Reference implementations are provided by the
[`dleq_vrfs`](https://github.com/w3f/ring-vrf/tree/master/dleq_vrfs) project
- [`vrf_pre_output`](https://docs.rs/dleq_vrf/0.0.1/dleq_vrf/keys/struct.SecretKey.html#method.vrf_preout)
- [`vrf_bytes`](https://docs.rs/dleq_vrf/0.0.1/dleq_vrf/vrf/struct.VrfInOut.html#method.vrf_preoutput_bytes)

### 5.3. VRF Signature Data

This section outlines the data to be signed utilizing the VRF primitive:

```rust
    VrfSignatureData ::= SEQUENCE {
        transcript: Transcript,
        inputs: SEQUENCE_OF VrfInput
    }
```

Where:
- `transcript`: a [`Transcript`](https://docs.rs/ark-transcript/0.0.1/ark_transcript/struct.Transcript.html)
  instance. In practice, this is a *special* hash of some protocol-specific data
  to sign which doesn't influence the `VrfPreOutput`.
- `inputs`: sequence of `VrfInputs` to be signed.

To simplify the construction of `VrfSignatureData` objects, a helper function is defined:

```rust  
    fn vrf_signature_data(
        transcript_label: OCTET_STRING,
        transcript_data: SEQUENCE_OF OCTET_STRING,
        inputs: SEQUENCE_OF VrfInput
    ) -> VrfSignatureData {
        let mut transcript = Transcript::new_labeled(transcript_label);
        for data in transcript_data {
            transcript.append(data);
        }
        VrfSignatureData { transcript, inputs }
    }
```

### 5.4. VRF Signature

Bandersnatch VRF offers two signature flavors:
- *plain* signature: much like a traditional *Schnorr* signature,
- *ring* signature: leverages a *zk-SNARK* to allows for anonymous signatures
  using a key from a predefined set of enabled keys, known as the ring.

#### 5.4.1. Plain VRF Signature

This section describes the signature process for `VrfSignatureData` using the
*plain* signature flavor.

```rust
    PlainSignature ::= OCTET_STRING;

    VrfSignature ::= SEQUENCE {
        signature: PlainSignature,
        pre_outputs: SEQUENCE-OF VrfPreOutput
    }
```

Where:
- `signature`: the actual plain signature.
- `pre_outputs`: sequence of `VrfPreOutput`s corresponding to the `VrfInput`s
  found within the `VrfSignatureData`.

Helper function to construct `VrfPlainSignature` from `VrfSignatureData`:

```rust
    BandersnatchSecretKey ::= OCTET_STRING;

    fn vrf_sign(
        secret: BandernatchSecretKey,
        signature_data: VrfSignatureData
    ) -> VrfSignature
```

Helper function for signature verification returning a `BOOLEAN` value
indicating the validity of the signature (`true` on success):

```rust
    BandersnatchPublicKey ::= OCTET_STRING;

    fn vrf_verify(
        public: BandersnatchPublicKey,
        signature: VrfSignature
    ) -> BOOLEAN;
```

In this document, the types `BandersnatchSecretKey`, `BandersnatchPublicKey`
and `PlainSignature` are intentionally left undefined. Their definitions can be
found in the `bandersnatch_vrfs` reference implementation.

#### 5.4.2. Ring VRF Signature

This section describes the signature process for `VrfSignatureData` using the
*ring* signature flavor.

```rust
    RingSignature ::= OCTET_STRING;

    RingVrfSignature ::= SEQUENCE {
        signature: RingSignature,
        pre_outputs: SEQUENCE_OF VrfPreOutput
    }
```

- `signature`: the actual ring signature.
- `pre_outputs`: sequence of `VrfPreOutput`s corresponding to the `VrfInput`s
  found within the `VrfSignatureData`.

Helper function to construct `RingVrfSignature` from `VrfSignatureData`:

```rust
    BandersnatchRingProverKey ::= OCTET_STRING;
    
    fn ring_vrf_sign(
        secret: BandersnatchRingProverKey,
        signature_data: VrfSignatureData,
    ) -> RingVrfSignature;
```

Helper function for signature verification returning a `BOOLEAN` value
indicating the validity of the signature (`true` on success).

```rust
    BandersnatchRingVerifierKey ::= OCTET_STRING;

    fn ring_vrf_verify(
        verifier: BandersnatchRingVerifierKey,
        signature: RingVrfSignature,
    ) -> BOOLEAN;
```

Note that this function doesn't require the signer's public key.

In this document, the types `BandersnatchRingProverKey`,
`BandersnatchRingVerifierKey`, and `RingSignature` are intentionally left
undefined. Their definitions can be found in the `bandersnatch_vrfs` reference
implementation.


## 6. Sassafras Protocol

### 6.1. Epoch's First Block

For epoch `N`, the first block produced must include a descriptor for some of
the subsequent epoch (`N+1`) parameters. This descriptor is defined as:

```rust
    NextEpochDescriptor ::= SEQUENCE {
        randomness: OCTET_STRING(SIZE(32)),
        authorities: SEQUENCE_OF BandersnatchPublicKey,
        configuration: ProtocolConfiguration OPTIONAL
    }
```

Where:
- `randomness`: 32-bytes pseudo random value.
- `authorities`: list of authorities.
- `configuration`: optional protocol configuration.

This descriptor must be encoded using the `SCALE` encoding system and embedded
in the block header's digest log. The identifier for the digest element is
`BYTES("SASS")`.

A special case arises for the first block for epoch `0`, which each node produces
independently during the genesis phase. In this case, the `NextEpochDescriptor`
relative to epoch `1` is shared within the second block, as outlined in section
[6.1.3](#613-startup-parameters).

#### 6.1.1. Epoch Randomness

The randomness in the `NextEpochDescriptor` `randomness` is computed as:

```rust
    randomness = BLAKE2(32, CONCAT(randomness_accumulator, BYTES(next_epoch.index)));
```

Here, `randomness_accumulator` refers to a 32-byte `OCTET_STRING` stored
on-chain and computed through a process that incorporates verifiable random
elements from all previously imported blocks. The exact procedure is described
in section [6.7](#67-randomness-accumulator).

#### 6.1.2. Protocol Configuration

The `ProtocolConfiguration` primarily influences certain checks carried out
during tickets validation. It is defined as:

```rust
    ProtocolConfiguration ::= SEQUENCE {
        attempts_number: U32,
        redundancy_factor: U32
    }
```

Where:
- `attempts_number`: maximum number of tickets that each authority for the next
  epoch is allowed to submit.
- `redundancy_factor`: expected ratio between epoch's slots and the cumulative
  number of tickets which can be submitted by the set of epoch validators.

The `attempts_number` influences the anonymity of block producers. As all
published tickets have a **public** attempt number less than `attempts_number`,
all the tickets which share the attempt number value must belong to different
block producers, which reduces anonymity late as we approach the epoch tail.
Bigger values guarantee more anonymity but also more computation.

Details about how exactly these parameters drives the ticket validity
probability can be found in section [6.2.2](#622-tickets-threshold).

`ProtocolConfiguration` values can be adjusted via a dedicated on-chain call
which should have origin set to `Root`. Any proposed changes to
`ProtocolConfiguration` that are submitted in epoch `K` will be included in the
`NextEpochDescriptor` at the start of epoch `K+1` and will come into effect in
epoch `K+2`.

#### 6.1.3. Startup Parameters

Some of the initial parameters for the first epoch, Epoch `#0`, are set through
the genesis configuration, which is defined as:

```rust
    GenesisConfig ::= SEQUENCE {
        authorities: SEQUENCE_OF BandersnatchPublicKey,
        configuration: ProtocolConfiguration,
    }
```

The on-chain randomness accumulator is initialized only **after** the genesis
block is produced. It starts with the hash of the genesis block:

```rust
    randomness_accumulator = genesis_hash
```

Since block `#0` is generated locally by each node as part of the genesis
process, the first block that a validator explicitly produces for Epoch
`#0` is block `#1`. Therefore, block `#1` is required to contain the
`NextEpochDescriptor` for the following epoch, Epoch `#1`.

The `NextEpochDescriptor` for Epoch `#1`:
- `randomness`: computed using the `randomness_accumulator` established
  post-genesis, as mentioned above.
- `authorities`: the same as those specified in the genesis configuration.
- `configuration`: not set (i.e., `None`), implying the reuse of the
  one found in the genesis configuration.

### 6.2. Creation and Submission of Candidate Tickets

After the beginning of a new epoch `N`, each validator associated to the next
epoch (`N+1`) constructs a set of tickets which may be eligible ([6.2.2](#622-tickets-threshold))
to be submitted on-chain. These tickets aim to secure ownership of one or more
slots in the upcoming epoch `N+1`.

Each validator is allowed to submit a maximum number of tickets, as specified by
the `attempts_number` field in the `ProtocolConfiguration` for the next epoch.

The ideal timing for a validator to start creating the tickets is subject to
strategy. A recommended approach is to initiate tickets creation once the block
containing the `NextEpochDescriptor` is either probabilistically or, preferably,
deterministically finalized. This timing is suggested to prevent to waste
resources on tickets that might become obsolete if a different chain branch
is finally chosen as the best one by the distributed system.

However, validators are also advised to avoid submitting tickets too late,
as tickets submitted during the second half of the epoch must be discarded.

#### 6.2.1. Ticket Identifier Value

Each ticket has an associated 128-bit unique identifier defined as:

```rust
    TicketId ::= U128;
```

The value of the `TicketId` is determined by the output of the Bandersnatch VRF
with the following input:

```rust
    ticket_id_vrf_input = vrf_input_from_items(
        BYTES("sassafras-ticket-v1.0"),
        [ 
            next_epoch.randomness,
            BYTES(next_epoch.index),
            BYTES(attempt_index)
        ]
    );

    ticket_id_vrf_pre_output = vrf_pre_output(AUTHORITY_SECRET_KEY, ticket_id_vrf_input);

    ticket_bytes = vrf_bytes(16, ticket_id_vrf_input, ticket_id_vrf_pre_output);
    ticket_id = U128(ticket_bytes);
```

Where:
- `next_epoch.randomness`: randomness associated to the target epoch.
- `next_epoch.index`: index of the target epoch as a `U64`.
- `attempt_index`: value going from `0` to `attempts_number` as a `U32`.

#### 6.2.2. Tickets Threshold

A `TicketId` value is valid if its value is less than the ticket threshold:

    T = (r·s)/(a·v)

Where:
- `v`: epoch's authorities (aka validators) number
- `s`: epoch's slots number
- `r`: redundancy factor
- `a`: attempts number
- `T`: ticket threshold value (`0 ≤ T ≤ 1`)

##### 6.2.2.1 Formula Derivation

In an epoch with `s` slots, the goal is to achieve an expected number of tickets
for block production equal to `r·s`.

It's crucial to ensure that the probability of having fewer than `s` winning
tickets is very low, even in scenarios where up to `1/3` of the authorities
might be offline.

To accomplish this, we first define the winning probability of a single ticket
as `T = (r·s)/(a·v)`.

Let `n` be the actual number of participating validators, where `v·2/3 ≤ n ≤ v`.

These `n` validators each make `a` attempts, for a total of `a·n` attempts.

Let `X` be the random variable associated to the number of winning tickets, then
its expected value is:

    E[X] = T·a·n = (r·s·n)/v

By setting `r = 2`, we get

    s·4/3 ≤ E[X] ≤ s·2

Using *Bernestein's inequality* we get `Pr[X < s] ≤ e^(-s/21)`.

For instance, with `s = 600` this results in `Pr[X < s] < 4·10⁻¹³`.
Consequently, this approach offers considerable tolerance for offline nodes and
ensures that all slots are likely to be filled with tickets.

For more details about threshold formula please refer to the 
[probabilities and parameters](https://research.web3.foundation/Polkadot/protocols/block-production/SASSAFRAS#probabilities-and-parameters)
paragraph in the Web3 foundation description of the protocol.

#### 6.2.3. Ticket Body

Every candidate ticket identifier has an associated body, defined as:

```rust
    TicketBody ::= SEQUENCE {
        attempt_index: U32,
        erased_pub: Ed25519PublicKey,
        revealed_pub: Ed25519PublicKey
    }
```

Where:
- `attempt_index`: attempt index used to generate the associated `TicketId`.
- `erased_pub`: Ed25519 ephemeral public key which gets erased as soon as the
  ticket is claimed. This key can be used to encrypt data for the validator.
- `revealed_pub`: Ed25519 ephemeral public key which gets exposed as soon as the
  ticket is claimed.

The process of generating an erased key pair is intentionally left undefined,
allowing the implementor the freedom to choose the most suitable strategy.

Revealed key pair is generated using the bytes produced by the VRF with input
parameters equal to those employed in `TicketId` generation, only the label
is different.

```rust
    revealed_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-revealed-v1.0"),
        data: [ 
            next_epoch.randomness,
            BYTES(next_epoch.index),
            BYTES(attempt_index)
        ]
    );

    revealed_vrf_pre_output = vrf_pre_output(AUTHORITY_SECRET_KEY, revealed_vrf_input);

    revealed_seed = vrf_bytes(32, revealed_vrf_input, revealed_vrf_pre_output);
    revealed_pub = ed25519_secret_from_seed(revealed_seed).public();
```

Where:
- `next_epoch.randomness`: randomness associated to the target epoch.
- `next_epoch.index`: index of the target epoch as a `U64`.
- `attempt_index`: value going from `0` to `attempts_number` as a `U32`.

The ephemeral public keys are also used for claiming the tickets on block production.
Refer to section [6.5](#65-claim-of-ticket-ownership-during-block-production) for details.

#### 6.2.4. Ring Signature Production

`TicketBody` must be signed using the Bandersnatch ring VRF flavor ([5.4.2](#542-ring-vrf-signature)).

```rust
    sign_data = vrf_signature_data(
        transcript_label: BYTES("sassafras-ticket-body-v1.0"),
        transcript_data: [
            SCALE(ticket_body)
        ],
        inputs: [
            ticket_id_vrf_input
        ]
    )
  
    ring_signature = ring_vrf_sign(AUTHORITY_SECRET_KEY, RING_PROVER_KEY, sign_data)
```

`RING_PROVER_KEY` object is constructed using the set of public keys which
belong to the target epoch's authorities and the *zk-SNARK* context parameters
(for more details refer to the
[bandersnatch_vrfs](https://github.com/w3f/ring-vrf/blob/18614458ca4cb335c88d4e710c13906a76f51e43/bandersnatch_vrfs/src/ring.rs#L91-L93)
reference implementation).

The body and the ring signature are combined in the `TicketEnvelope` structure:

```rust
    TicketEnvelope ::= SEQUENCE {
        ticket_body: TicketBody,
        ring_signature: RingVrfSignature
    }   
```

All the envelopes corresponding to valid tickets can be submitted on-chain via a
dedicated on-chain call (extrinsic).

### 6.3. Validation of candidate tickets

All the actions in the steps described by this paragraph are executed by
on-chain code.

Validation rules:
- Tickets submissions must occur within a block part of the first half of the epoch.
- Ring signature is verified using the on-chain `RING_VERIFIER_KEY`.
- Ticket identifier is locally (re)computed from the `VrfPreOutput` contained in the
  `RingVrfSignature` and its value is checked to be less than the tickets' threshold.

Valid tickets bodies are all persisted on-chain.

### 6.4. Ticket-Slot Binding

Before the beginning of the next epoch, the on-chain list of tickets must be
associated with the next epoch's slots such that there must be at most one
ticket per slot.

The assignment process happens in the second half of the submission epoch and
follows these steps:
- Sorting: The complete list of tickets is sorted based on their `TicketId`
  value, with smaller values coming first.
- Trimming: In scenarios where there are more tickets than available slots, the
  list is trimmed to fit the epoch's slots by removing the larger value.
- Assignment: Tickets are assigned to the epoch's slots following an
  *outside-in* strategy.

#### 6.4.1. Outside-In Assignment

Given an ordered sequence of tickets `[t0, t1, t2, ..., tk]` to be assigned to
`n` slots, where `n ≥ k`, the tickets are allocated according to the following
strategy:

```
    slot-index  : [  0,  1,  2, ............ , n ]
    tickets     : [ t1, t3, t5, ... , t4, t2, t0 ]
```

Here `slot-index` is a relative value computed as:

    slot-index = absolute_slot - epoch_start_slot

The association between each ticket and a slot is recorded on-chain and thus
is public. What remains confidential is the identity of the ticket's author, and
consequently, who possesses the authority to claim the corresponding slot. This
information is known only to the author of the ticket.

In case the number of available tickets is less than the number of epoch slots,
some *orphan* slots in the middle of the epoch will remain unbounded to any
ticket. For claiming strategy refer to [6.5.2](652-secondary-claim-method).

### 6.5. Slot Claim Production

With tickets bound to epoch slots, every validator acquires information about
the slots for which they are supposed to produce a block.

The procedure for slot claiming depends on whether a given slot has an
associated ticket according to the on-chain state.

If a slot is associated with a ticket, the primary authoring method is used.
Conversely, the protocol resorts to the secondary method as a fallback.

#### 6.5.1. Primary Method

Let `ticket_body` be the `TicketBody` that has been committed to the on-chain
state, `curr_epoch` denote an object containing information about the current
epoch, and `slot` represent the slot number (absolute).

Follows the construction of `VrfSignatureData`:

```rust
    randomness_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-randomness-v1.0"),
        data: [
            curr_epoch.randomness,
            BYTES(curr_epoch.index),
            BYTES(slot)
        ]
    );

    revealed_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-revealed-v1.0"),
        data: [
            curr_epoch.randomness,
            BYTES(curr_epoch.index),
            BYTES(ticket_body.attempt_index)
        ]
    );
    
    sign_data = vrf_signature_data(
        transcript_label: BYTES("sassafras-claim-v1.0"),
        transcript_data: [
            SCALE(ticket_body)
        ],
        inputs: [
            randomness_vrf_input,
            revealed_vrf_input
        ]
    );
```

##### 6.5.1.1. Ephemeral Key Claim

*Fiat-Shamir* transform is used to obtain a 32-byte challenge associated with
the `VrfSignData` transcript.

Validators employ the secret key associated with `erased_pub`, which has been
committed in the `TicketBody`, to sign the challenge.

```rust
    challenge = sign_data.transcript.challenge();
    erased_signature = ed25519_sign(ERASED_SECRET_KEY, challenge);
```

As ticket's ownership can be claimed by reconstructing the `revealed_pub` entry
of the committed `TicketBody`, this step is considered optional.

<TODO>
Is this step really necessary?
- Isn't better to keep it simple if this step doesn't offer any extra security?
- We already have a strong method to claim ticket ownership using the vrf output
- What if a validator provides both the proofs?
  More weight for the branch (i.e. used to decide what is the best branch by validators)?
  E.g. 
  - primary method + ed25519 erased signature => score 2
  - primary method => score 1
  - fallback method => score 0
</TODO>

#### 6.5.2. Secondary Method

By noting that the authorities registered on-chain are kept in an ordered list,
the index of the authority which has the privilege to claim an orphan slot is:

```rust
    index_bytes = BLAKE2(4, CONCAT(epoch_randomness, BYTES(slot)));
    index = U32(index_bytes) mod authorities_number;
```

Given `randomness_vrf_input` constructed as shown for the primary method ([6.5.1](#primary-method)),
the `VrfSignatureData` is constructed as:

```rust
    sign_data = vrf_signature_data(
        transcript_label: BYTES("sassafras-claim-v1.0"),
        transcript_data: [ ],
        inputs: [
            randomness_vrf_input
        ]
    )
```

#### 6.5.3. Slot Claim Object

The `SlotClaim` structure is used to contain all the necessary information to
assess ownership of a slot.

```rust
    SlotClaim ::= SEQUENCE {
        authority_index: U32,
        slot: U64,
        signature: VrfSignature,
        erased_signature: Ed25519Signature OPTIONAL
    }
```

The claim is constructed as follows:

```rust
    signature = vrf_sign(AUTHORITY_SECRET_KEY, sign_data);

    claim = SlotClaim {
        authority_index,
        slot,
        signature,
        erased_signature
    }
```

Where:
- `authority_index`: index of the block author in the on-chain authorities list.
- `slot`: slot number (absolute, not relative to the epoch start)
- `signature`: signature relative to the `sign_data` constructed via the
   primary [6.5.1](#primary-method) or secondary ([6.5.2](#secondary-method)) method.
- `erased_signature`: optional signature providing an additional proof of ticket
  ownership ([6.5.1.1](#6511-ed25519-erased-ephemeral-key-claim).

The signature includes one or two `VrfPreOutputs`.
- The first is always present and is used to generate per-block randomness
  to feed the randomness accumulator ([6.7](#67-randomness-accumulator)).
- The second is included if the slot is bound to a ticket. This is relevant to
  claim ticket ownership ([6.6.1](#661-primary-method)).

The `claim` object is *SCALE* encoded and sent in the block's header digest log.

### 6.6. Slot Claim Verification

The signature within the `SlotClaim` is verified using a `VrfSignData`
constructed as specified in [6.5](#65-slot-claim-production).

```rust
    public_key = authorities[claim.authority_index];

    result = vrf_verify(public_key, sign_data, claim.signature);
    assert(result == true);
```

With:
- `authorities`: list of authorities for the epoch, as recorded on-chain.
- `sign_data`: data that has been signed, constructed as specified in [6.5](#65-slot-claim-production).

If signature verification is successful, the validation process then diverges
based on whether the slot is associated with a ticket according to the on-chain
state.

For slots tied to a ticket, the primary verification method is employed. Otherwise,
the secondary method is utilized.

### 6.6.1. Primary Method

This method verifies ticket ownership using the second `VrfPreOutput` from the
`SlotClaim` signature

The process involves comparing the `revealed_pub` key from the committed
`TicketBody` with a reconstructed key using the `VrfPreOutput` and the expected
`VrfInput`. A mismatch indicates an illegitimate claim.

```rust
    revealed_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-revealed-v1.0"),
        data: [
            curr_epoch.randomness,
            BYTES(curr_epoch.index),
            BYTES(ticket_body.attempt_index)
        ]
    );

    reveled_vrf_pre_output = claim.signature.pre_outputs[1];

    revealed_seed = vrf_bytes(32, revealed_vrf_input, revealed_vrf_pre_output);
    revealed_pub = ed25519_secret_from_seed(revealed_seed).public();
    assert(revealed_pub == ticket_body.revealed_pub);
```

##### 6.6.1.1. Ephemeral Key Signature Check

If the `erased_signature` is present in `SlotClaim`, the `erased_pub` within the
committed `TicketBody` key is used to verify it.

The signed challenge is generated as outlined in section [6.5.1.1](#6511-ephemeral-key-claim).

```rust
    challenge = sign_data.transcript.challenge();
    result = ed25519_verify(ticket_body.erased_pub, challenge, claim.erased_signature);
    assert(result == true);
```

#### 6.6.2. Secondary Method

If the slot doesn't have any associated ticket then the validator index contained in
the claim should match the one given by the rule outlined in section [6.5.2](#652-secondary-method).

### 6.7. Randomness Accumulator

The first `VrfPreOutput` which ships within the block's `SlotClaim` signature
is mandatory and must be used as entropy source for the randomness which gets
accumulated on-chain **after** block transactions execution.

Given `claim` the instance of `SlotClaim` found within the block header, and
`randomness_accumulator` the current value for the randomness accumulator, the
`randomness_accumulator` value is updated as follows:

```rust
    randomness_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-randomness-v1.0"),
        data: [
            curr_epoch.randomness,
            BYTES(curr_epoch.index),
            BYTES(slot)
        ]
    );

    randomness_vrf_pre_output = claim.signature.pre_outputs[0];
    randomness = vrf_bytes(32, randomness_vrf_input, randomness_vrf_pre_output);

    randomness_accumulator = BLAKE2(32, CONCAT(randomness_accumulator, randomness));
```

The `randomness_accumulator` never resets and is a continuously evolving value.
It primarily serves as a basis for calculating the randomness associated to the
epochs as outlined on section [6.1](#61-epochs-first-block), but custom usages
from the user are not excluded.


## 7. Drawbacks

None

## 8. Testing, Security, and Privacy

It is critical that implementations of this RFC undergo thorough testing on
test networks.

A security audit may be desirable to ensure the implementation does not
introduce unwanted side effects.

## 9. Performance, Ergonomics, and Compatibility

### 9.1. Performance

Adopting Sassafras consensus marks a significant improvement in reducing the
frequency of short-lived forks.

Forks are eliminated by design. Forks may only result from network disruptions
or protocol attacks. In such cases, the choice of which fork to follow upon
recovery is clear-cut, with only one valid option.

### 9.2. Ergonomics

No specific considerations.

### 9.3. Compatibility

The adoption of Sassafras affects the native client and thus can't be introduced
just via a runtime upgrade.

A deployment strategy should be carefully engineered for live networks.

This subject is left open for a dedicated RFC.


## 10. Prior Art and References

- [Web3 Foundation research page](https://research.web3.foundation/Polkadot/protocols/block-production/SASSAFRAS)
- [Sassafras research paper](https://eprint.iacr.org/2023/031.pdf)
- [Ring-VRF research paper](https://eprint.iacr.org/2023/002.pdf)
- [Sassafras reference implementation tracking issue](https://github.com/paritytech/substrate/issues/11515)
- [Sassafras reference implementation main PR](https://github.com/paritytech/substrate/pull/11879)
- [Bandersnatch VRFS reference implementation](https://github.com/w3f/ring-vrf/tree/master/bandersnatch_vrfs)

<TODO replace bandersnatch-vrfs with docs.rs link once published />

## 11. Unresolved Questions

None


## 12. Future Directions and Related Material

While this RFC lays the groundwork and outlines the core aspects of the
protocol, several crucial topics remain to be addressed in future RFCs.
These include:

### 12.1. Interactions with On-Chain Code

- **Outbound Interfaces**: Interfaces that the host environment provides to the
  on-chain code, typically known as *Host Functions*.

- **Unrecorded Inbound Interfaces**. Interfaces that the on-chain code provides
  to the host code, typically known as *Runtime APIs*.

- **Transactional Inbound Interfaces**. Interfaces that the on-chain code provides
  to the world to alter the chain state, typically known as *Transactions*
  (or *extrinsics* in the *Polkadot* ecosystem)

### 12.2. Deployment Strategies

- **Protocol Migration**. Exploring how this protocol can seamlessly replace an
  already operational instance of another protocol. Future RFCs should focus on
  deployment strategies to facilitate a smooth transition.

### 12.3. ZK-SNARK SRS Initialization

- **Procedure**: Determining the procedure for the *zk-SNARK* SRS (Structured
  Reference String) initialization. Future RFCs should provide insights into
  whether this process should include an ad-hoc initialization ceremony or if
  we can reuse an SRS from another ecosystem (e.g. Zcash or Ethereum).

- **Sharing with Para-chains**: Considering the complexity of the process, we
  must understand whether the SRS is shared with system para-chains or
  maintained independently.

### 12.4. Anonymous Submission of Tickets.

- **Mixnet Integration**: Submitting tickets directly can pose a risk of
  potential deanonymization through traffic analysis. Subsequent RFCs should
  investigate the potential for incorporating Mixnet protocol or other
  privacy-enhancing mechanisms to address this concern.
