# RFC-xx: Sassafras Consensus Protocol

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | September 03, 2023                                                                          |
| **Description** | Sassafras consensus protocol description and structures                                     | 
| **Authors**     | Davide Galassi                                                                              |


## Abstract

Sassafras is a novel consensus protocol designed to address the recurring
fork-related challenges encountered in other lottery-based protocols, such as
Babe.

Sassafras aims to establish a unique association between each epoch's slots
and the validators, ensuring that there will be one and only one validator
per slot.

The protocol ensures the anonymity of the validator associated to a slot until
the slot is not claimed at block production time.


## 1. Motivation


Sassafras Protocol has been extensively documented in a comprehensive
[research paper](https://eprint.iacr.org/2023/031.pdf). However, this RFC serves
the purpose of conveying essential implementation details that are crucial for
interoperability and clarifying aspects left open for implementation discretion.

### 1.1. Relevance to Implementors

This RFC focuses on providing implementors with the necessary insights into the
protocol's operation. It takes precedence over the research paper in cases where
discrepancies arise between the two documents.

(TODO: remove this)
Example: In this RFC, ticket claims occur in the epoch immediately following
issuance, whereas the original protocol description specifies a two-epoch gap.
The approach outlined in this RFC should be followed.

### 1.2. Supporting Sassafras for Polkadot

In addition to fostering interoperability, another objective of this RFC is to
facilitate the implementation of Sassafras within the Polkadot ecosystem. While
the specifics of deployment mechanics are beyond the scope of this document, it
paves the way for integrating Sassafras into the Polkadot network.


## 2. Stakeholders

### 2.1 Developers of Relay-Chains and Para-Chains

Developers responsible for creating relay-chains and para-chains within the
Polkadot ecosystem who intend to leverage the benefits offered by the Sassafras
Protocol.

### 2.2 Developers of Polkadot Relay-Chain

Developers contributing to the Polkadot relay-chain, which plays a pivotal role
in facilitating the interoperability and functionality of the Sassafras Protocol
within the broader Polkadot network.

## 3. Notation and Convention

This section outlines the notation and conventions used throughout the document
to ensure clarity and consistency.

### 3.1. Data Structure Definitions

Data structures are primarily defined using [ASN.1](https://en.wikipedia.org/wiki/ASN.1),
with a few exceptions:
- Integer types are not explicitly defined in ASN.1 and `Un` types should be
  interpreted as n-bit unsigned integers.

To ensure that serialized data structures can be used interchangeably, it's
important to consider the arrangement of fields in their definitions.

In cases where no specific instructions are given, structures should be
serialized using [SCALE](https://github.com/paritytech/parity-scale-codec).

### 3.2. Pseudo-Code

Through this document it is advantageous to make use of code snippets as part
of the comprehensive description. These code snippets shall adhere to the
subsequent conventions:

- Code snippets are presented in a Rust-like pseudo-code format.

- The function `SCALE(x: T)` returns the `SCALE` encoding of the variable `x`
  with type `T`.

- The function `BYTES(x: T)` returns an `OCTET STRING` which represents the raw
  byte array representation of the object `x` with type `T`.
  - if `T` is `VisibleString` (aka *ascii* string): it returns the sequence of
    bytes of its *ascii* representation.
  - if `T` is `Un`: it returns the little-endian encoding of the integer `Un`
    as `n` bytes.

- The function `Un(x: OCTET STRING)` returns a `Un` using the little-endian
  encoding of the integer `x`

- The function `TRANSCRIPT(x)` represents the construction of a transcript
  object as defined by [`ark-transcript`](https://docs.rs/ark-transcript/0.0.1/ark_transcript/)
  library.

### 3.3. Incremental Introduction of Types and Functions

Types and helper functions will be introduced incrementally as they become
relevant within the document's context.

We find this approach more agile, especially given that the set of types used is
not extensive or overly complex.

This incremental presentation enhances readability and comprehension.


## 4. Protocol Introduction

The Sassafras Protocol employs a binding mechanism between validators and slots
through the use of a **ticket**.

The protocol is organized into five discrete and asynchronous phases:

### 4.1. Submission of Candidate Tickets

Validators generate and submit their candidate tickets along with validity
proofs to the blockchain. The validity proof ensures that the tickets are
legitimate while maintaining the anonymity of the authorship.

### 4.2. Validation of Candidate Tickets

Submitted candidate tickets undergo a validation process to verify their
authenticity, integrity and compliance with other protocol-specific rules.

### 4.3. Tickets and Slots Binding

After collecting all candidate tickets, a deterministic method is employed to
associate some of these tickets with specific slots.

### 4.4. Claim of Ticket Ownership

Validators assert ownership of tickets during the block production phase. This
step establishes a secure binding between validators and their respective slots.

### 4.5. Validation of Ticket Ownership

During block verification, the claims of ticket ownership are rigorously
validated to uphold the protocol's integrity.


## 5. Bandernatch VRFs Cryptographic Primitives

This chapter provides a high-level overview of the Bandersnatch VRF primitive as
it relates to the Sassafras protocol.

It's important to note that this section is not intended to serve as an
exhaustive exploration of the mathematically intensive foundations of the
cryptographic primitive. Instead, its primary purpose is to offer a concise and
comprehensible interpretation of the primitive within the context of this RFC.

For a more detailed and mathematical understanding of Ring-VRFs, we recommend
referring to the Ring-VRF research [paper](https://eprint.iacr.org/2023/002.pdf).

### 5.1. VRF Input

The VRF Input, denoted as `VrfInput`, is constructed using a domain and some
arbitrary data using the `vrf_input(domain: OCTET STRING, buf: OCTET STRING)`
function. This function is left opaque here and can be read in the actual
reference implementation.

The VRF Input, denoted as `VrfInput`, is constructed by combining a domain identifier
with arbitrary data using the `vrf_input` function:

```rust
    fn vrf_input(domain: OCTET_STRING, buf: OCTET_STRING) -> VrfInput;
```

While the specific implementation details of this function are intentionally
omitted here, you can find the complete implementation in the
[`bandersnatch_vrfs`](https://github.com/w3f/ring-vrf/blob/18614458ca4cb335c88d4e710c13906a76f51e43/bandersnatch_vrfs/src/lib.rs#L57) 
reference implementation.

Helper function to construct a `VrfInput` from a sequence of `data` items:

```rust
    fn vrf_input_from_items(domain: OCTET_STRING, data: SEQUENCE_OF OCTET_STRING) -> VrfInput {
        buf = OCTET_STRING(SIZE(0));
        for item in data {
            buf.append(item);
            buf.append(length(item) as U8);
        }
        return vrf_input(domain, buf);
    }
```

### 5.2. VRF Output

Given a `VrfInput` object, the corresponding `VrfOutput`, also referred to as
`VrfPreOutput`, is computed using a Bandersnatch secret key.

A `VrfOutput` can be created in two ways: as a standalone object or as part of a
VRF signature. In both scenarios, the resulting `VrfOutput` remains the same, but
the primary difference lies in the inclusion of a signature in the latter, which
serves to confirm its validity.

In practice, the `VrfOutput` functions as a *seed* to produce a variable number
of pseudo-random bytes. These bytes are considered 'verified' when `VrfOutput` is
accompanied by a signature.

When used as a standalone object, `VrfOutput` is primarily employed in situations
where the protocol necessitates to check the generated bytes according to some
protocol specific criteria before applying the signature.

To facilitate the construction of `VrfOutput` from a secret key and `VrfInput`,
the following helper function is used:

```rust
    fn vrf_output(secret: BandernatchSecretKey, input: VrfInput) -> VrfOutput;
```

Additionally, a helper function is provided for producing `len` bytes from
`VrfInput` and `VrfOutput`:

```rust
    fn vrf_bytes(vrf_input: VrfInput, vrf_output: VrfOuput, len: U32) -> OCTET_STRING;
```

Just like the `VrfInput` support function, we have intentionally excluded the
detailed implementation of this function in this document. However, you can
see the complete implementation in the `dleq_vrfs` reference implementation:
- [`vrf_output`](https://github.com/w3f/ring-vrf/blob/18614458ca4cb335c88d4e710c13906a76f51e43/dleq_vrf/src/traits.rs#L75-L77)
- [`vrf_bytes`](https://github.com/w3f/ring-vrf/blob/18614458ca4cb335c88d4e710c13906a76f51e43/dleq_vrf/src/vrf.rs#L211-L214)

### 5.3. VRF Signature Data

This section defines the data that is to be signed using the VRF primitive:

```rust
    VrfSignatureData ::= SEQUENCE {
        transcript: Transcript,
        vrf_input: SEQUENCE_OF VrfInput 
    }
```

- `transcript`: represents a `ark-transcript` object.
- `vrf_input`: sequence of `VrfInputs` to be signed.

To simplify the construction of a `VrfSignatureData` object, a helper function is provided:

```rust
    TranscriptData ::= OCTET_STRING;
    
    fn vrf_signature_data(
        transcript_label: OCTET_STRING,
        transcript_data: SEQUENCE_OF TranscriptData,
        vrf_inputs: SEQUENCE_OF VrfInput
    ) -> VrfSignatureData {
        transcript = TRANSCRIPT(transcript_label);
        for data in transcript_data {
            transcript.append(data);
        }
        return VrfSignatureData { transcript, vrf_inputs }
    }
```

### 5.4. VRF Signature

Bandersnatch VRF offers two signature options: plain signature, which in
practice is like a *Schnorr* signature, or Ring signature. The Ring signature
option allows for anonymous signatures using a key from a predefined set of
enabled keys, known as the ring.

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

- `signature`: represents the actual signature (opaque).
- `outputs`: a sequence of `VrfOutput`s corresponding to the `VrfInput`s values.

Helper function to create a `VrfSignature` from `VrfSignatureData`:

```rust
    fn vrf_sign(
        secret: BandernatchSecretKey,
        signature_data: VrfSignatureData
    ) -> VrfSignature
```

Helper function for validating the signature and returning a Boolean value
indicating the validity of the signature (`True` if it's valid):

```rust
    fn vrf_verify(
        public: BandersnatchPublicKey,
        signature: VrfSignature
    ) -> Boolean;
```

In this document, the types `BandersnatchSecretKey`, `BandersnatchPublicKey`
and `PlainSignature` are intentionally left undefined as are not relevant. Their
definitions can be found in the `bandersnatch_vrfs` reference implementation.

#### 5.3.2. Ring VRF Signature

This section deals with the signature process for `VrfSignatureData` using the
Bandersnatch Ring signature flavor.

```rust
    RingSignature ::= OCTET_STRING;

    RingVrfSignature ::= SEQUENCE {
        signature: RingSignature,
        ring_proof: RingProof,
        outputs: SEQUENCE_OF VrfOutput
    }
```

- `signature`: represents the actual signature (opaque).
- `ring_proof`: denotes the proof of ring membership.
- `outputs`: sequence of `VrfOutput` objects corresponding to the `VrfInput` values.

Helper function to create a `RingVrfSignature` from `VrfSignatureData`:

```rust
    fn ring_vrf_sign(
        secret: BandersnatchSecretKey,
        signature_data: VrfSignatureData,
        prover: RingProver
    ) -> RingVrfSignature;
```

Helper function for validating the signature and returning a Boolean value
indicating the validity of the signature (`True` if it's valid).
It's important to note that this function does not require the signer's public key.

```rust
    fn ring_vrf_verify(
        signature: RingVrfSignature,
        verifier: RingVerifier
    ) -> Boolean;
```

In this document, the types `BandersnatchSecretKey`, `BandersnatchPublicKey`,
`RingSignature`, `RingProof`, `RingProver` and `RingVerifier` are intentionally
left undefined as are not relevant. Their definitions can be found in the
`bandersnatch_vrfs` reference implementation.


## 6. Sassafras Protocol

### 6.1 Epoch's First Block

The first block produced for an epoch `N` is required to include the descriptor
for the next epoch `N+1`.

The descriptor of next epoch is the `NextEpochDescriptor`.
   
```rust
    AuthorityId ::= BandersnatchPublicKey;

    Randomness ::= OCTET_STRING(SIZE(32));

    NextEpochDescriptor ::= SEQUENCE {
        authorities: SEQUENCE_OF AuthorityId,
        randomness: Randomness,
        configuration: ProtocolConfiguration OPTIONAL
    }
```

- `authorities`: list of authorities for the next epoch.
- `randomness`: randomness value associated to the next epoch.
- `configuration`: next epoch optional protocol configuration.

The `NextEpochDescriptor` must be `SCALE` encoded and embedded in the block
header digest data.

The identifier for the digest element is `BYTES("SASS")`.

**Security Consideration**: Instances of `NextEpochDescriptor` are generated through
on-chain code whenever a block is identified as the first of an epoch.
Consequently, every node executing the block has the capability to verify if
the descriptor generated during block execution matches the one produced by the
block author, which is stored in the digest data.

#### 6.1.1 Epoch Randomness

Each epoch has an associated randomness value defined by the
`NextEpochDescriptor` `Randomness` element.

The first block of epoch `N` contains the randomness associated to the next epoch `N+1`.

Randomness for epoch `N+1` is computed using the VRF output values which are associated
to each block of epoch `N-1`.

Assuming block `Bi` is produced during epoch `N-1`. Then the randomness for epoch `N+1`
is incrementally generated as `RandomnessAccumulator = Blake2(Bi.VrfOut)'`.

The first block produced for epoch `N` will propose as epoch `N+1` randomness the value
of `RandomnessAccumulator` as found after the production of the last block associated
to epoch `N-1`.

#### 6.1.2. Protocol Configuration

The `ProtocolConfiguration` primarily influences certain checks carried out
during ticket validation. It is defined as follows:

```rust
    ProtocolConfiguration ::= SEQUENCE {
        attempts_number: U32,
        redundancy_factor: U32
    }
```

- `attempts_number`: number of tickets that can be submitted by each next-epoch authority.
- `redundancy_factor`: factor that enhances the likelihood of a candidate ticket
  being deemed valid according to some protocol specific checks.

Further details regarding this configuration can be found in the section
dedicated to candidate ticket validation (ticket-id threshold computation).

`ProtocolConfiguration` values can be adjusted via a dedicated extrinsic which should have origin set to `Root`.
A valid configuration proposal submitted on epoch `K` will be propagated in
the `NextEpochDescriptor` at the begin of epoch `K+1` and will be effectively
enacted on epoch `K+2`.

A new `ProtocolConfiguration` can be submitted using a dedicated extrinsic,
with the requirement that its origin is set to `Root`. If a valid proposal is
submitted during epoch `N-1`, it will be embedded into the `NextEpochDescriptor`
at the beginning of epoch `N`.

### 6.2. Creation and Submission of Candidate Tickets

As a shorthand notation, in this section we will refer to one of the next epoch
validators simply as 'the validator'.

Upon the beginning of a new epoch `N`, the validator will create a set of
'tickets' to be submitted on-chain. These tickets aim to secure ownership of one
of the slots in the upcoming epoch `N+1`.

Each validator is allowed to submit a maximum number of tickets whose value is
found in the next epoch `ProtocolConfiguration` `attempts_number` field.

Each ticket has an associated unique identifier, denoted as `TicketId`.

```rust
    TicketId ::= U128
```

#### 6.2.1. Ticket Identifier Value

The value of the `TicketId` is determined through the output of the Bandersnatch
VRF, using the following inputs:

- Epoch `N+1` randomness: obtained from the `NextEpochDescriptor`.
- Epoch `N+1` index: tracked by the Sassafras on-chain code.
- Attempt index: a value from `0` to `attempts_number`.

```rust
    randomness = Randomness(..)
    epoch_index = U64(..);
    attempt_index = U32(..);

    ticket_id_vrf_input = vrf_input_from_items(
        BYTES("sassafras-ticket-v1.0"),
        [ randomness, BYTES(epoch), BYTES(attempt) ]
    );

    bytes = vrf_bytes(SECRET_KEY, ticket_id_vrf_input, 16);
    ticket_id = U128(bytes);
```

#### 6.2.2. Tickets Threshold

A `TicketId` value is considered valid if it is less than the ticket threshold.

Parameters:
- `v`: the number of authorities (aka validators) in the epoch
- `s`: number of slots in the epoch
- `r`: the redundancy factor
- `a`: number of attempts
- `T`: ticket threshold value (`0 ≤ T ≤ 1`)

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
[Probabilities and parameters](https://research.web3.foundation/Polkadot/protocols/block-production/SASSAFRAS#probabilities-and-parameters)
paragraph of the *layman description* of Sassafras protocol.

#### 6.2.3. Ticket Body

For every candidate ticket an associated ticket-body is constructed.

```rust
    EphemeralPublicKey ::= Ed25519PublicKey

    TicketBody ::= SEQUENCE {
        attempt_index: AttemptIndex,
        erased_pub: EphemeralPublicKey,
        revealed_pub: EphemeralPublicKey
    }
```

- `attempt_index`: attempt index used to generate the associated ticket_id.
- `erased_pub`: Ed25519 ephemeral public key which is invalidated as soon as the
  ticket is claimed.
- `revealed_pub`: Ed25519 ephemeral public key which is enabled as soon as the
  ticket is claimed.

Erased key pair generation is left unspecified and free to the implementor.

Revealed key pair is instead generated using bytes produced by the VRF with
input similar to the one used for ticket-id generation, only the label is different.

```rust
    vrf_input = vrf_input_from_items(
        BYTES("sassafras-erased-seed-v1.0"),
        [ randomness, BYTES(epoch), BYTES(attempt) ]
    );

    seed = vrf_bytes(SECRET_KEY, vrf_input, 32);
    revealed_pub = EphemeralSecret(seed).public();
```

The usage of the `EphemeralPublicKey`s will be clarified in the ticket claiming section

#### 6.2.4. Ring Signature Production

`TicketBody` must be signed using the Bandersnatch Ring-VRF flavor.

```rust
    sign_data = vrf_signature_data(
        transcript_label: BYTES("sassafras-ticket-body-v1.0"),
        transcript_data: [ SCALE(ticket_body) ],
        vrf_inputs: [ ticket_id_vrf_input ]
    )
  
    ring_signature = ring_vrf_sign(SECRET_KEY, sign_data, RING_PROVER)
```

The body and the ring signature are bundled together in the `TicketEnvelope`

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

The tickets are received via a dedicated unsigned extrinsic call.

Generic validation rules:
- Tickets submissions must occur within the first half of the epoch.
  (TODO: I expect this is to give time to the chain finality consensus to finalize
   the on-chain tickets before next epoch starts)
- The transaction source must be one of the current session validators.

Ticket specific validation rules:
- Ring signature is verified using the on-chain `RingVerifier`.
- Ticket identifier is computed from the (verified) `VrfOutput` contained in the
  ring signature and its value is checked to be less than the ticket-threshold.

Valid tickets bodies are persisted on-chain.

### 6.4. Ticket-Slot assignment

Before the beginning of the next epoch, i.e. the epoch in which the tickets are
supposed to be claimed, the on-chain list of tickets must be associated with the
next epoch's slots.

The assignment process can happen any time in the second half of the submission
epoch, before the beginning of the next epoch.

There must be at most one ticket per slot.

- Initially, the complete list of tickets is sorted based on their ticket-id,
  with smaller values coming first.
- In cases where there are more tickets than available slots, the list is pruned
  by removing the larger value.
- Tickets are then assigned to the slots using an outside-in assignment strategy.

**Outside-In Assignment**

Given an ordered sequence of tickets `[t0, t1, t2, ..., tk]` to be assigned to
`n` slots, where `n ≥ k`, the tickets are allocated according to the following
strategy:

    slot-index  : [ 0,  1,  2, ............ , n ]
	  tickets     : [ t1, t3, t5, ... , t4, t2, t0 ].

Here `slot-index` is a relative value computed as `epoch_start_slot - epoch_slot`.

#### 6.4.1 Fallback Assignment

In cases where `k` is less than `n`, some (*orphan*) slots in the middle of the
epoch will remain unassigned by any ticket. In such instances, these slots are
allocated using a fallback assignment method resembling the *AURA* protocol.

The authorities set which is persisted on-chain stores the authorities with some
order. The authority index which has the right to claim a slot is computed as:

```rust
    authority_index = blake2_64(SCALE(epoch_randomness, slot)) mod authorities_number;
```

### 6.5. Claim of ticket ownership during block production

Once that tickets are bounded to the epoch slots, each validator becomes aware
for which slots he can author a block.

Slots are primarily claimed via VRF output.

The author of a block must embed in the block header digest a `SlotClaim` entry which
has enough information to claim the ownership of the slot.

```rust
    SlotClaim ::= SEQUENCE {
        authority_index: U32,
        slot: U64,
        vrf_signature: VrfSignature,
        ticket_claim: EphemeralSignature OPTIONAL
    }
```

- `authority_index`: index of the block author in the on-chain authorities list.
- `slot`: absolute monotonic slot number from genesis (note this is not the index for a slot in the epoch)
- `vrf_signature`: signature embedding one or two `VrfOutputs`.
   One is always present and is used to generate per-block randomness.
   The second is present if the slot has an associated ticket and is used to claim ticket ownership.
- `ticket_claim`: optional additional proof of ticket ownership.
   Is a signature of some challenge which can be verified using the `erased_public` `EphemeralPublicKey`
   committed via the `TicketBody`.

TODO: what is the point of ticket_claim if we already have a method to claim the ticket?

#### 6.5.1. Primary Claim Method

The `VrfSignatureData` to produce the `SlotClaim` signature is constructed as:

```rust
    fn slot_claim_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-slot-claim-v1.0"),
        data: [randomness, BYTES(epoch), BYTES(attempt)]
    );

    fn revealed_key_vrf_input = vrf_input_from_items(
        domain: BYTES("sassafras-revealed-key-v1.0"),
        data: [ TODO ]
    );
    
    signature_data = vrf_signature_data(
        transcript_label: BYTES("sassafras-slot-claim-transcript-v1.0"),
        transcript_data: [ SCALE(ticket_body) ],
        vrf_inputs: [ slot_claim_vrf_input, revealed_key_vrf_input ]
    );
```

#### 6.5.2. Secondary Claim Method

If the slot doesn't have any associated ticket then the validator is the one
with index equal to the rule exposed in paragraph [6.4.1].

The `VrfSignatureData` to produce the `SlotClaim` signature is constructed as:

```rust
    signature_data = vrf_signature_data(
        transcript_label: BYTES("sassafras-slot-claim-transcript-v1.0"),
        transcript_data: [ ],
        vrf_inputs: [ slot_claim_vrf_input ]
    )
```

### 6.6. Validation of the claim during block verification

TODO


## Drawbacks

TODO

Description of recognized drawbacks to the approach given in the RFC.
Non-exhaustively, drawbacks relating to performance, ergonomics, user experience, security, or privacy.

## Testing, Security, and Privacy

TODO

Describe the the impact of the proposal on these three high-importance areas - how implementations can be tested for adherence, effects that the proposal has on security and privacy per-se, as well as any possible implementation pitfalls which should be clearly avoided.

## Performance, Ergonomics, and Compatibility

TODO

Describe the impact of the proposal on the exposed functionality of Polkadot.

### Performance

TODO. Is this an optimization or a necessary pessimization? What steps have been taken to minimize additional overhead?

Sassafras consensus usage is a huge step forward in short-lived forks reduction.

### Ergonomics

If the proposal alters exposed interfaces to developers or end-users, which types of usage patterns have been optimized for?

### Compatibility

The introduction of this consensus mechanism impacts native client code and thus can't be introduced via a runtime upgrade.

Upgrading strategy should not be discussed here and must be discussed in a separately RFC.


## Prior Art and References

- Web3 Foundation research page: https://research.web3.foundation/Polkadot/protocols/block-production/SASSAFRAS
- Sassafras whitepaper: https://eprint.iacr.org/2023/031.pdf
- Ring-VRF whitepaper: https://eprint.iacr.org/2023/002.pdf
- Sassafras reference implementation tracking issue: https://github.com/paritytech/substrate/issues/11515
- Sassafras reference implementation main PR: https://github.com/paritytech/substrate/pull/11879

- TODO: ASN.1

## Unresolved Questions

None

## Future Directions and Related Material

This RFC covers the foundations and the core of the protocol.

Future RFCs should cover the following additional topics which makes the protocol complete and secure.

- Deployment strategy.
  - How this protocol can replace an already running instance of another one?
- ZK-SNARK SRS initialization ceremony.
  - Should this process performed before sassafras deployment and how?
  - As the process is quite involved, is the SRS shared with the parachains?
- Anonymous submission of on-chain tickets.
  - Are we going to leverage Mixnet?
  - ...
