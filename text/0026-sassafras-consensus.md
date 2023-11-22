# RFC-0026: Sassafras Consensus Protocol

|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| **Start Date**  | September 06, 2023                                               |
| **Description** | Sassafras consensus protocol description and structures          | 
| **Authors**     | Davide Galassi                                                   |


## Abstract

Sassafras is a novel consensus protocol designed to address the recurring
fork-related challenges encountered in other lottery-based protocols.

Sassafras aims to establish a unique association between each epoch's slots and
the validators, ensuring that there is one and only one validator per slot.

The protocol ensures the anonymity of the validator associated to a slot until
the slot is not claimed at block production time.


## 1. Motivation

Sassafras Protocol has been extensively documented in a comprehensive
[research paper](https://eprint.iacr.org/2023/031.pdf). This RFC serves the
purpose of conveying most of the essential implementation details that are
crucial for interoperability and clarifying aspects left open for implementation
discretion.

### 1.1. Relevance to Implementors

This RFC focuses on providing implementors with the necessary insights into the
protocol's operation.

To avoid ambiguities and interoperability issues, this document takes precedence
over the research paper in cases where discrepancies arise between the two.

### 1.2. Supporting Sassafras for Polkadot

In addition to fostering interoperability, another objective of this RFC is to
facilitate the implementation of Sassafras within the Polkadot ecosystem. While
the specifics of deployment mechanics are beyond the scope of this document, it
paves the way for integrating Sassafras into the Polkadot network.


## 2. Stakeholders

### 2.1. Developers of Blockchains

Developers responsible for creating blockchains who intend to leverage the
benefits offered by the Sassafras Protocol.

### 2.2. Contributors to the Polkadot Ecosystem

Developers contributing to the Polkadot ecosystem, both relay-chain and para-chains.
The protocol will have a central role in the next generation Polkadot relay chain
block authoring system.


## 3. Notation and Convention

This section outlines the notation and conventions used throughout the document
to ensure clarity and consistency.

### 3.1. Data Structures Definitions and Encoding

Data structures are primarily defined using [ASN.1](https://en.wikipedia.org/wiki/ASN.1),
with a few exceptions:
- Integer types are not explicitly defined in ASN.1 and in the context of
  this document `U<n>` should be interpreted as a `n`-bit unsigned integers

If no context-specific instructions are given, all types must be serialized
using [SCALE](https://github.com/paritytech/parity-scale-codec) codec.

To ensure interoperability of serialized structures, the order of the single
fields is required to match the structures definitions found in this document.

### 3.2. Pseudo-Code

Through this document it is advantageous to make use of code snippets as part
of the comprehensive description. These snippets shall adhere to the subsequent
conventions:

- For simplicity, code snippets are presented in a *Rust-like* pseudo-code format.

- The function `BYTES(x: T)` returns an `OCTET_STRING` representing the raw
  byte array representation of the object `x` with type `T`.
  - if `T` is `VisibleString` (i.e. an *ascii* string): it returns the sequence
    of octets of its *ascii* representation.
  - if `T` is `U<n>`: it returns the little-endian encoding of the integer
    `U<n>` as `n/8` octets.

- The function `U<n>(x: OCTET_STRING)` returns a `U<n>` interpreting `x` as
  the little-endian encoding of a `n` bits unsigned integer.

- The function `SCALE(x: T)` returns an `OCTET_STRING` representing the
  [`SCALE`](https://github.com/paritytech/parity-scale-codec) encoding of
  `x` with type `T`.

- The function `BLAKE2(n: U32, x: OCTET_STRING)` returns `n` bytes of the
  standard *blake2b* hash of `x` as an `OCTET_STRING`.

- The function `CONCAT(x₀: OCTET_STRING, ..., xₖ: OCTET_STRING)` returns the
  concatenation of the inputs as an `OCTET_STRING`.

- The function `LENGTH(x: OCTET_STRING)` returns a `U32` representing the
  number of octets in `x`.

### 3.3. Incremental Introduction of Types and Functions

Types and helper functions will be introduced incrementally as they become
relevant within the document's context.

We find this approach more agile, especially given that the set of types used is
not extensive or overly complex.

This incremental presentation enhances readability and comprehension.


## 4. Protocol Introduction

Timeline is partitioned in epochs, epochs are partitioned in slots.

The Sassafras protocol employs a binding mechanism between validators and slots
through the use of a ticketing system.

The protocol can be divided into five discrete and asynchronous phases:

### 4.1. Submission of Candidate Tickets

Validators generate and submit their candidate tickets to the blockchain. Each
ticket comes with an anonymous validity proof.

### 4.2. Validation of Candidate Tickets

Each candidate tickets undergo a validation process for the associated validity
proof and compliance with other protocol-specific constraints.

### 4.3. Tickets and Slots Binding

After collecting all candidate tickets, a deterministic method is employed to
uniquely associate a subset of these tickets to the next epoch slots.

### 4.4. Claim of Ticket Ownership

Validators prove ownership of tickets during the block production phase. This
step establishes a secure binding between validators and their respective slots.

### 4.5. Validation of Ticket Ownership

During block verification, the claims of ticket ownership are validated to
uphold the protocol's integrity.


## 5. Bandernatch VRFs Cryptographic Primitives

This chapter provides a high-level overview of the Bandersnatch VRF primitive as
it relates to the Sassafras protocol.

It's important to note that this section is not intended to serve as an
exhaustive exploration of the mathematically intensive foundations of the
cryptographic primitive. Instead, its primary purpose is to offer a concise and
comprehensible interpretation of the primitive within the context of this RFC.

For a more detailed understanding we recommend referring to the Ring-VRF
research [paper](https://eprint.iacr.org/2023/002.pdf) from W3F.

### 5.1. VRF Input

The VRF Input, denoted as `VrfInput`, is constructed by combining a domain identifier
with arbitrary data using the `vrf_input` function:

```rust
    fn vrf_input(domain: OCTET_STRING, buf: OCTET_STRING) -> VrfInput;
```

The specific implementation details of this function are intentionally omitted
here, you can find a complete reference implementation in the
[`bandersnatch_vrfs`](https://github.com/w3f/ring-vrf/blob/18614458ca4cb335c88d4e710c13906a76f51e43/bandersnatch_vrfs/src/lib.rs#L57) 
project.

Helper function to construct a `VrfInput` from a sequence of `data` items:

```rust
    fn vrf_input_from_items(domain: OCTET_STRING, data: SEQUENCE_OF OCTET_STRING) -> VrfInput {
        buf = OCTET_STRING(SIZE(0));
        for item in data {
            buf.append(item);
            buf.append(LENGTH(item) as U8);
        }
        return vrf_input(domain, buf);
    }
```

Note that we cast the length of each item to a `U8`. In the context of the
protocol we never have to append strings longer than 255. The function is
internal and not designed to be generic.

<TODO>
Or we should provide a generic one in bandersnatch primitive wrapper to be
used in other contexts? 
</TODO>

### 5.2. VRF Output

A `VrfOutput` in this context is computed in function of a `VrfInput` and a
`BandersnatchSecretKey`.

A `VrfOutput` can be created in two ways: as a standalone object or as part of a
VRF signature. In both scenarios, the resulting `VrfOutput` remains the same, but
the primary difference lies in the inclusion of a signature in the latter, which
serves to confirm its validity.

In practice, the `VrfOutput` is a verifiable *seed* to produce a variable number
of pseudo-random bytes. These bytes are considered valid when `VrfOutput` is
accompanied by a valid signature.

When constructed as a standalone object, `VrfOutput` is primarily employed
in situations where the secret key owner needs to check if the generated
pseudo-random bytes fulfill some criteria before applying the signature.

To facilitate the construction of `VrfOutput` from a secret key and `VrfInput`,
the following helper function is provided:

```rust
    fn vrf_output(secret: BandernatchSecretKey, input: VrfInput) -> VrfOutput;
```

Additionally, a helper function is provided for producing `len` bytes from
`VrfInput` and `VrfOutput`:

```rust
    fn vrf_bytes(len: U32, input: VrfInput, output: VrfOuput) -> OCTET_STRING;
```

Just like the `VrfInput` support function, we have intentionally excluded the
detailed implementation of this function in this document. A reference implementation
is provided in the `dleq_vrfs` library:
- [`vrf_output`](https://github.com/w3f/ring-vrf/blob/18614458ca4cb335c88d4e710c13906a76f51e43/dleq_vrf/src/traits.rs#L75-L77)
- [`vrf_bytes`](https://github.com/w3f/ring-vrf/blob/18614458ca4cb335c88d4e710c13906a76f51e43/dleq_vrf/src/vrf.rs#L211-L214)

### 5.3. VRF Signature Data

This section defines the data to be signed using the VRF primitive:

```rust
    VrfSignatureData ::= SEQUENCE {
        transcript: Transcript,
        inputs: SEQUENCE_OF VrfInput
    }
```

- `transcript`: an [`ark-transcript`](https://docs.rs/ark-transcript/latest/ark_transcript/)
  object. In practice, this is a *special* hash of some protocol-specific data
  to sign which should not influence the `VrfOutput`.
- `inputs`: sequence of `VrfInputs` to be signed.

To simplify the construction of a `VrfSignatureData` object, a helper function is provided:

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
- *plain* signature, which is much like a traditional *Schnorr* signature,
- *ring* signature which leverages a *zk-SNARK* to allows for anonymous signatures
  using a key from a predefined set of enabled keys, known as the ring.

#### 5.4.1. Plain VRF Signature

This section describes the signature process for `VrfSignatureData` using the
plain Bandersnatch signature flavor.

```rust
    PlainSignature ::= OCTET_STRING;

    VrfSignature ::= SEQUENCE {
        signature: PlainSignature,
        outputs: SEQUENCE-OF VrfOutput
    }
```

- `signature`: the actual signature.
- `outputs`: a sequence of `VrfOutput`s corresponding to the `VrfInput`s values.

Helper function to create a `VrfPlainSignature` from `VrfSignatureData`:

```rust
    BandersnatchSecretKey ::= OCTET_STRING;

    fn vrf_sign(
        secret: BandernatchSecretKey,
        signature_data: VrfSignatureData
    ) -> VrfSignature
```

Helper function for validating the signature and returning a `BOOLEAN` value
indicating the validity of the signature.

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

This section deals with the signature process for `VrfSignatureData` using the
Bandersnatch ring signature flavor.

```rust
    RingSignature ::= OCTET_STRING;

    RingVrfSignature ::= SEQUENCE {
        signature: RingSignature,
        outputs: SEQUENCE_OF VrfOutput
    }
```

- `signature`: the actual signature.
- `outputs`: sequence of `VrfOutput` objects corresponding to the `VrfInput` values.

Helper function to create a `RingVrfSignature` from `VrfSignatureData`:

```rust
    BandersnatchRingProverKey ::= OCTET_STRING;
    
    fn ring_vrf_sign(
        secret: BandersnatchRingProverKey,
        signature_data: VrfSignatureData,
    ) -> RingVrfSignature;
```

Helper function for validating the signature and returning a `BOOLEAN`
indicating the validity of the signature (`True` if it's valid). It's important
to note that this function does not require the signer's public key.

```rust
    BandersnatchRingVerifierKey ::= OCTET_STRING;

    fn ring_vrf_verify(
        verifier: BandersnatchRingVerifierKey,
        signature: RingVrfSignature,
    ) -> BOOLEAN;
```

In this document, the types `BandersnatchRingProverKey`,
`BandersnatchRingVerifierKey`, and `RingSignature` are intentionally left
undefined. Their definitions can be found in the `bandersnatch_vrfs` reference
implementation.


## 6. Sassafras Protocol

### 6.1. Epoch's First Block

The first block produced for epoch `N` is required to include the descriptor for
the next epoch `N+1`.

The descriptor for next epoch is `NextEpochDescriptor`.
   
```rust
    AuthorityId ::= BandersnatchPublicKey;

    Randomness ::= OCTET_STRING(SIZE(32));

    NextEpochDescriptor ::= SEQUENCE {
        randomness: Randomness,
        authorities: SEQUENCE_OF AuthorityId,
        configuration: ProtocolConfiguration OPTIONAL
    }
```

- `randomness`: randomness value.
- `authorities`: list of authorities.
- `configuration`: optional protocol configuration.

The `NextEpochDescriptor` must be `SCALE` encoded and embedded in the block
header digest log.

The identifier for the digest element is `BYTES("SASS")`.

**Security Consideration**: Instances of `NextEpochDescriptor` are generated
through on-chain code whenever a block is identified as the first of an epoch.
Consequently, every node executing the block should verify that the descriptor
locally generated during block execution matches the one produced by the block
author, which is found in the digest data before block import.

#### 6.1.1. Epoch Randomness

Each block ships with some entropy source in the form of bandersnatch
`VrfOutput`. Per block randomness is accumulated in the protocol's on-chain
`accumulator` **after** block import.

The exact procedure to accumulate per-block randomness is described in detail
later, in the [randomness accumulator](#67-randomness-accumulator) paragraph.

Next epoch `randomness` is computed as:

```rust
    next_epoch_randomness = BLAKE2(32, CONCAT(accumulator, next_epoch_index));
```

#### 6.1.2. Protocol Configuration

The `ProtocolConfiguration` primarily influences certain checks carried out
during tickets validation. It is defined as follows:

```rust
    ProtocolConfiguration ::= SEQUENCE {
        attempts_number: U32,
        redundancy_factor: U32
    }
```

- `attempts_number`: max number of tickets that can be submitted by each
  next epoch authority.
- `redundancy_factor`: controls the expected number of extra tickets produced
  beyond `epoch_length`.

The attempts number influences the anonymity of block producers. As all
published tickets have a **public** attempt number less than `attempts_number`,
all the tickets which share the attempt number value must belong to different
block producers, which reduces anonymity late in the epoch.

We do not mind `max_attempts < epoch_length` though because this loss of
anonymity already becomes small when `attempts_number = 64` or `128` and larger
values requires more computation.

Details about how exactly these parameters drives the ticket validity
probability can be found in the section dedicated to candidate ticket validation
against [threshold](0026-sassafras-consensus.md#622-tickets-threshold).

`ProtocolConfiguration` values can be adjusted via a dedicated extrinsic which
should have origin set to `Root`. A valid configuration proposal submitted on
epoch `K` will be propagated in the `NextEpochDescriptor` at the beginning of
epoch `K+1` and will be effectively enacted on epoch `K+2`.

#### 6.1.3. Startup Parameters

Some parameters for first epoch (index = 0) are configurable via genesis configuration.

```rust
    GenesisConfig ::= SEQUENCE {
        authorities: SEQUENCE_OF AuthorityId,
        configuration: ProtocolConfiguration OPTIONAL
    }
```

Randomness for first epoch is set to all zeros.

As block #0 is locally produced by every node by processing the genesis configuration,
the first block explicitly produced by a validator for the first epoch is block #1.

Block #1 must embed the `NextEpochDescriptor` for next epoch. This is
constructed re-using the same values used for the first epoch.

### 6.2. Creation and Submission of Candidate Tickets

As a shorthand notation, in this section we refer to one of the next epoch
validators as 'the validator'.

Upon the beginning of a new epoch `N`, the validator will construct a set of
'tickets' to be submitted on-chain. These tickets aim to secure ownership of one
or more slots in the upcoming epoch `N+1`.

Each validator is allowed to submit a maximum number of tickets whose value is
found in the next epoch `ProtocolConfiguration` `attempts_number` field.

The expected ratio between the attempts and the number of tickets which are
assigned to the next epoch slots is driven by the
[ticket threshold](0026-sassafras-consensus.md#622-tickets-threshold).

Each ticket has an associated unique identifier, denoted as `TicketId`.

```rust
    TicketId ::= U128
```

#### 6.2.1. Ticket Identifier Value

The value of the `TicketId` is determined by the output of the Bandersnatch VRF
when using the following inputs:

- Next epoch randomness: `Randomness` obtained from the `NextEpochDescriptor`.
- Next epoch index: `U64` computed as epoch start slot divided epoch duration.
- Attempt index: `U32` value going from `0` to `attempts_number`.

Let `next_epoch` be an object with the information associated to the next epoch.

```rust
    ticket_id_vrf_input = vrf_input_from_items(
        BYTES("sassafras-ticket-v1.0"),
        [ 
            next_epoch.randomness,
            BYTES(next_epoch.epoch_index),
            BYTES(attempt_index)
        ]
    );

    ticket_id_vrf_output = vrf_output(AUTHORITY_SECRET_KEY, ticket_id_vrf_input);

    ticket_bytes = vrf_bytes(16, ticket_id_vrf_input, ticket_id_vrf_output);
    ticket_id = U128(ticket_bytes);
```

#### 6.2.2. Tickets Threshold

A `TicketId` value is valid if its value is less than the ticket threshold.

    T = (r·s)/(a·v)

Where:
- `v`: the number of authorities (aka validators) in the epoch
- `s`: number of slots in the epoch
- `r`: the redundancy factor
- `a`: number of attempts
- `T`: ticket threshold value (`0 ≤ T ≤ 1`)

##### 6.2.2.1 Formula Derivation

For an epoch of `s` slots we want to have a number of tickets in expectation for
block production equal to the `r·s`.

We need that there is a very small probability of their being less than `s`
winning tickets, even if up to `1/3` of authorities are offline.

First we set the probability of a ticket winning as `T = (r·s)/(a·v)`.

Let `n` be the number of validators who actually participate and so `v·2/3 ≤ n ≤ v`.

These `n` validators make `a` attempts each, for a total of `a·n` attempts.

Let `X` be the random variable associated to the number of winning tickets, then
its expected value is:

    E[X] = T·a·n = (r·s·n)/v

By setting `r = 2`, we get

    s·4/3 ≤ E[X] ≤ s·2

Using *Bernestein's inequality* we get `Pr[X < s] ≤ exp(-s/21)`.

For `s = 600` this gives `Pr[X < s] < 4·10⁻¹³`, and thus we end up with a great
tolerance over offline nodes and we end-up filling all the slots with tickets
with high probability.

For more details about threshold formula please refer to the 
[probabilities and parameters](https://research.web3.foundation/Polkadot/protocols/block-production/SASSAFRAS#probabilities-and-parameters)
paragraph of the w3f description of the protocol.

#### 6.2.3. Ticket Body

Every candidate ticket identifier has an associated body.

```rust
    TicketBody ::= SEQUENCE {
        attempt_index: U32,
        erased_pub: Ed25519PublicKey,
        revealed_pub: Ed25519PublicKey
    }
```

- `attempt_index`: attempt index used to generate the associated `TicketId`.
- `erased_pub`: Ed25519 ephemeral public key which gets erased as soon as the
  ticket is claimed.
- `revealed_pub`: Ed25519 ephemeral public key which gets exposed as soon as the
  ticket is claimed.

The process of generating an erased key pair is intentionally left undefined,
allowing the implementor the freedom to choose the most suitable strategy.

Revealed key pair is generated using bytes produced by the VRF with input
parameters equal to those employed in `TicketId` generation, only the label
is different.

Let `next_epoch` be an object with the information associated to the next epoch:

```rust
    revealed_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-revealed-v1.0"),
        data: [ 
            next_epoch.randomness,
            BYTES(next_epoch.epoch_index),
            BYTES(attempt_index)
        ]
    );

    revealed_vrf_output = vrf_output(AUTHORITY_SECRET_KEY, revealed_vrf_input);

    revealed_seed = vrf_bytes(32, revealed_vrf_input, revealed_vrf_output);
    revealed_pub = ed25519_secret_from_seed(revealed_seed).public();
```

The usage of the ephemeral public keys will be clarified in the [ticket claiming](#65-claim-of-ticket-ownership-during-block-production) section.

#### 6.2.4. Ring Signature Production

`TicketBody` must be signed using the Bandersnatch [ring VRF](#542-ring-vrf-signature) flavor.

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
  
    ring_signature = ring_vrf_sign(RING_PROVER_KEY, sign_data)
```

`RING_PROVER` object is constructed using the authority secret key, the set
public keys which belong to the next epoch authorities and the *zk-SNARK*
context parameters (more details in the
[bandersnatch_vrfs](https://github.com/w3f/ring-vrf/blob/18614458ca4cb335c88d4e710c13906a76f51e43/bandersnatch_vrfs/src/ring.rs#L91-L93)
reference implementation).

The body and the ring signature are combined in the `TicketEnvelope`:

```rust
    TicketEnvelope ::= SEQUENCE {
        ticket_body: TicketBody,
        ring_signature: RingVrfSignature
    }   
```

All the ticket envelopes corresponding to valid tickets are submitted on-chain
via a dedicated unsigned extrinsic.

### 6.3. Validation of candidate tickets

All the actions in the steps described by this paragraph are executed by
on-chain code.

The tickets are received via a dedicated extrinsic call.

Generic validation rules:
- Tickets submissions must occur within the first half of the epoch.
  (TODO: I expect this is to give time to the chain finality consensus to finalize
  the on-chain tickets before next epoch starts)
- For unsigned extrinsics, it must be submitted by one of the current session
  validators.

Ticket specific validation rules:
- Ring signature is verified using the on-chain `BandersnatchRingVerifierKey`.
- Ticket identifier is locally computed from the `VrfOutput` contained in the
  `RingVrfSignature` and its value is checked to be less than the ticket-threshold.

Valid tickets bodies are persisted on-chain.

### 6.4. Ticket-Slot assignment

Before the beginning of the next epoch, the on-chain list of tickets must be
associated with the next epoch's slots.

The assignment process happens in the second half of the submission epoch.

In the end, there must be at most one ticket per slot.

- Initially, the complete list of tickets is sorted based on their ticket-id,
  with smaller values coming first.
- In cases where there are more tickets than available slots, the list is pruned
  by removing the larger value.
- Tickets are then assigned to the slots using an *outside-in* assignment strategy.

#### 6.4.1. Outside-In Assignment

Given an ordered sequence of tickets `[t0, t1, t2, ..., tk]` to be assigned to
`n` slots, where `n ≥ k`, the tickets are allocated according to the following
strategy:

```
    slot-index  : [  0,  1,  2, ............ , n ]
    tickets     : [ t1, t3, t5, ... , t4, t2, t0 ]
```

Here `slot-index` is a relative value computed as:

    slot-index = absolute_slot_index - epoch_start_slot

The association between each ticket and a slot is recorded on-chain and thus
is public. What remains confidential is the identity of the ticket *owner*, and
consequently, who possesses the authority to claim the corresponding slot. This
information is known only to the author of the ticket.

#### 6.4.2. Fallback Assignment

In case the number of available tickets is less than the number of epoch slots,
some (*orphan*) slots in the middle of the epoch will remain unbounded to any
ticket.

In such situation, these unassigned slots are allocated using a fallback
assignment strategy.

The authorities registered on-chain are kept in a sorted buffer. The index of
the authority which has the privilege to claim an unbounded slot is calculated
as follows:

```rust
    index_bytes = BLAKE2(4, SCALE( (epoch_randomness, slot) ));
    index = U32(index_bytes) mod authorities_number;
```

<TODO>
What about using `epoch_randomness_accumulator` instead of `epoch_randomness`?
The accumulator is updated using the randomness which ships with every block, thus
we know who is the author of block N only after block N-1 has been imported.
Is a bit more Dos resistant.
</TODO>

### 6.5. Claim of ticket ownership during block production

With tickets bound to epoch slots, every validator acquires information about
the slots for which they are supposed to produce a block.

The procedure for block authoring varies based on whether a given slot has an
associated ticket according to the on-chain state.

If a slot is associated with a ticket, we will employ the primary authoring
method. Conversely, if the slot lacks an associated ticket, we will resort to
the secondary authoring method as a fallback.

#### 6.5.1. Primary Claim Method

Let `ticket_body` represent the `TicketBody` that has been committed to the on-
chain state, `curr_epoch` denote an object containing information about the
current epoch, and `slot` represent the absolute monotonic slot number.

Follows the construction of `VrfSignatureData`:

```rust
    randomness_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-randomness-v1.0"),
        data: [
            curr_epoch.randomness,
            BYTES(curr_epoch.epoch_index),
            BYTES(slot)
        ]
    );

    revealed_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-revealed-v1.0"),
        data: [
            curr_epoch.randomness,
            BYTES(curr_epoch.epoch_index),
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

The inclusion of `revealed_vrf_input` will generate a `VrfSignature` with a
`VrfOutput` allowing the verifier to reconstruct a `revealed_pub` key
which is expected to be equal to the one committed into the `TicketBody`.

##### 6.5.1.1. (Optional) Ed25519 Erased Ephemeral Key Claim

As the ticket ownership can be claimed by reconstructing the `revealed_pub`
entry of the ticket, this  step is purely optional and serves only to enforce
the claim.

<TODO>
Is this step really necessary?
- Isn't better to keep it simple if this step doesn't offer any extra security?
- We already have a strong method to claim ticket ownership.
</TODO>

The *Fiat-Shamir* transform is used to obtain a 32-byte challenge associated
with the `VrfSignData` transcript.

Validators employ the secret key associated with `erased_pub`, which has been
committed in the `TicketBody`, to sign this challenge.

```rust
    challenge = sign_data.transcript.challenge();
    erased_signature = ed25519_sign(ERASED_SECRET_KEY, challenge)
```

#### 6.5.2. Secondary Claim Method

If the slot doesn't have any associated ticket then the validator is the one
with index equal to the rule exposed in paragraph [6.4.2](642-fallback-assignment).

Given `randomness_vrf_input` constructed as shown for the primary method, the
`VrfSignatureData` is constructed as:

```rust
    sign_data = vrf_signature_data(
        transcript_label: BYTES("sassafras-slot-claim-transcript-v1.0"),
        transcript_data: [ ],
        inputs: [
            randomness_vrf_input
        ]
    )
```

#### 6.5.3. Slot Claim object

To establish ownership of a slot, the block author must construct a `SlotClaim` object
which contains all the necessary information to assert ownership of the slot.

```rust
    SlotClaim ::= SEQUENCE {
        authority_index: U32,
        slot: U64,
        signature: VrfSignature,
        erased_signature: Ed25519Signature OPTIONAL
    }
```

- `authority_index`: index of the block author in the on-chain authorities list.

- `slot`: absolute slot number (not relative with respect to the epoch start)

- `signature`: signature that includes one or two `VrfOutputs`.
  - The first `VrfOutput` is always present and is used to generate per-block
    randomness. This is used to claim ticket ownership.
  - The second `VrfOutput` is included if the slot is associated with a ticket.
    This is relevant to claim ticket ownership.

- `erased_signature`: optional signature providing an additional proof of ticket
  ownership (see 6.5.1.1).

```rust
    signature = vrf_sign(AUTHORITY_SECRET_KEY, sign_data);

    claim = SlotClaim {
        authority_index,
        slot,
        signature,
        erased_signature
    }
```

The `claim` object is *SCALE* encoded and sent in the block's header digest log.

### 6.6. Validation of the claim during block verification

Validation of `SlotClaim` object found in the block's header.

The procedure depends on whether the slot has an associated ticket or not
according to the on-chain state.

If there is a ticket linked to the slot, the primary verification method will be
used; otherwise, the protocol resorts to the secondary one.

In both scenarios, the signature within the `SlotClaim` is verified using
a `VrfSignData` constructed as specified by paragraph 6.5.

Given `claim` an instance of `SlotClaim`:

```rust
    public_key = AUTHORITIES[claim.authority_index];

    vrf_verify(public_key, sign_data, claim.signature);
```

If signature verification fails then the claim is not legit.

### 6.6.1. Primary Claim Method Verification

This verification is performed to confirm ticket ownership and is performed
utilizing the second `VrfOutput` contained within the `SlotClaim` `signature`.

By using the `VrfOutput` object together with the associated expected `VrfInput`
the verifier should be able to reconstruct the `revealed_pub` key committed in
the `TicketBody`. If there is a mismatch, the claim is not legit.

```rust
    revealed_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-revealed-v1.0"),
        data: [
            curr_epoch.randomness,
            BYTES(curr_epoch.epoch_index),
            BYTES(ticket_body.attempt_index)
        ]
    );

    reveled_vrf_output = claim.signature.outputs[1];

    revealed_seed = vrf_bytes(32, revealed_vrf_input, revealed_vrf_output);
    revealed_pub = ed25519_secret_from_seed(revealed_seed).public();

    assert(revealed_pub == ticket_body.revealed_pub);
```

##### 6.6.1.1. (Optional) Ephemeral Key Signature Check

If the `erased_signature` element within the `SlotClaim` is present the
`erased_pub` key is used to verify it.

The signed challenge is generated with identical steps as outlined in section
6.5.1.1.

```rust
    challenge = sign_data.transcript.challenge();
    result = ed25519_verify(ticket_body.erased_pub, challenge, claim.erased_signature);

    assert(result == true);
```

#### 6.6.2. Secondary Claim Method Verification

If the slot doesn't have any associated ticket then the validator index contained in
the claim should match the one given by the rule outlined in section [6.4.2](642-fallback-assignment).

### 6.7. Randomness Accumulator

The first `VrfOutput` which ships with the block's `SlotClaim` `signature`
is mandatory and must be used as the entropy source for the randomness which
gets accumulated on-chain **after** block processing.

Given `claim` the instance of `SlotClaim` within the block header, and
`accumulator` the current value for the current epoch randomness accumulator,
the `accumulator` value is updated as follows:

```rust
    randomness_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-randomness-v1.0"),
        data: [
            curr_epoch.randomness,
            BYTES(curr_epoch.epoch_index),
            BYTES(slot)
        ]
    );

    randomness_vrf_output = claim.signature.outputs[0];

    randomness = vrf_bytes(32, randomness_vrf_input, randomness_vrf_output);

    accumulator = BLAKE2(32, CONCAT(accumulator, randomness));
```

The updated `accumulator` value is stored on-chain.

The randomess accumulated during epoch `N` will be used, at the start of the
next epoch (`N+1`), as an input to compute the `NextEpochDescriptor`
`randomness` element (see section 6.1). 

As outlined throughout the document, epoch randomness value secures various
protocol-specific functions, including ticket generation and assignment of
fallback slots (refer to section 6.4.2). Additionally, users may utilize this
value for other purposes as needed.


## 7. Drawbacks

None

## 8. Testing, Security, and Privacy

The reference implementation for this RFC will be tested on testnets first.

An audit may be required to ensure the implementation does not introduce unwanted side effects

## 9. Performance, Ergonomics, and Compatibility

### 9.1. Performance

The utilization of Sassafras consensus represents a significant advancement in
the mitigation of short-lived fork occurrences.

Generation of forks are not possible when following the protocol and the only source
of forks is network partitioning. In this case, on recovery, the decision of
which fork to follow is not opinionated and there is only one choice.

### 9.2. Ergonomics

No specific considerations.

### 9.3. Compatibility

The adoption of Sassafras impacts native client code and thus can't be
introduced via a simple runtime upgrade.

A deployment strategy should be carefully engineered for live networks.

This subject is left open for a dedicated RFC.


## 10. Prior Art and References

- Web3 Foundation research page: https://research.web3.foundation/Polkadot/protocols/block-production/SASSAFRAS
- Sassafras whitepaper: https://eprint.iacr.org/2023/031.pdf
- Ring-VRF whitepaper: https://eprint.iacr.org/2023/002.pdf
- Sassafras reference implementation tracking issue: https://github.com/paritytech/substrate/issues/11515
- Sassafras reference implementation main PR: https://github.com/paritytech/substrate/pull/11879


## 11. Unresolved Questions

None


## 12. Future Directions and Related Material

While this RFC lays the groundwork and outlines the core aspects of the
protocol, several crucial topics remain to be addressed in future RFCs to ensure
the protocol's completeness and security.

These topics include:

### 12.1. Interactions with the Runtime

- **Outbound Interface**. Interfaces exposed by the host which are required by the runtime.
  These are commonly dubbed *Host Functions*.

- **Unrecorded Inboud Interfaces**. Interfaces exposed by the runtime which are required by the host.
  These are commonly dubbed *Runtime APIs*.

- **Transactional Inboud Interfaces**. Interfaces exposed by the runtime which alter the state.
  These are commonly dubbed *Extrinsics* and *Inherents*.

### 12.2. Deployment Strategies

- **Protocol Migration**. Exploring how this protocol can seamlessly replace
  an already operational instance of another protocol is essential. Future RFCs
  should delve into the deployment strategy, including considerations for a smooth
  transition process.

### 12.3. ZK-SNARK SRS Initialization Ceremony.

- **Timing and Procedure**: Determining the timing and procedure for the ZK-SNARK
  SRS (Structured Reference String) initialization ceremony. Future RFCs should
  provide insights into whether this process should be performed before the
  deployment of Sassafras and the steps involved.

- **Sharing with Parachains**: Considering the complexity of the ceremony, we
  must understand whether the SRS is shared with parachains or maintained
  independently.

### 12.4. Anonymous Submission of Tickets.

- **Mixnet Integration**: Submitting tickets directly can pose a risk of
  potential deanonymization through traffic analysis. Subsequent RFCs should
  investigate the potential for incorporating Mixnet technology or other
  privacy-enhancing mechanisms to address this concern.
