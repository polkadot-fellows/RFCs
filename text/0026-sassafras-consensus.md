# RFC-0026: Sassafras Consensus Protocol

|                 |                                                                  |
| --------------- | ---------------------------------------------------------------- |
| **Start Date**  | September 06, 2023                                               |
| **Description** | Sassafras consensus protocol specification                       | 
| **Authors**     | Davide Galassi                                                   |


## Abstract

Sassafras is a novel consensus protocol designed to address the recurring
fork-related challenges encountered in other lottery-based protocols.

The protocol aims to create a mapping between each epoch's slots and the
authorities set while ensuring that the identity of authorities assigned to
the slots remains undisclosed until the slot is actively claimed during block
production.


## 1. Motivation

Sassafras Protocol has been rigorously described in a comprehensive
[research paper](https://eprint.iacr.org/2023/031.pdf) authored by the
[Web3 Foundation](https://web3.foundation) research team.

This RFC is primarily intended to detail the critical implementation aspects
vital for ensuring interoperability and to clarify certain aspects that are
left open by the research paper and thus subject to interpretation during
implementation.

### 1.1. Relevance to Implementors

This RFC focuses on providing implementors with the necessary insights into the
core protocol's operation.

In instances of inconsistency between this document and the research paper,
this RFC should be considered authoritative to eliminate ambiguities and ensure
interoperability.

### 1.2. Supporting Sassafras for Polkadot

Beyond promoting interoperability, this RFC also aims to facilitate the
implementation of Sassafras within the greater Polkadot ecosystem.

Although the specifics of deployment strategies are beyond the scope of this
document, it lays the groundwork for the integration of Sassafras.


## 2. Stakeholders

The protocol has a central role in the next generation block authoring consensus
systems.

### 2.1. Blockchain Core Developers

Developers responsible for creating blockchains who intend to leverage the
benefits offered by the Sassafras Protocol.

### 2.2. Polkadot Ecosystem Contributors

Developers contributing to the Polkadot ecosystem, both relay-chain and
para-chains.


## 3. Notation

This section outlines the notation adopted throughout this document to ensure
clarity and consistency.

### 3.1. Data Structures Definitions

Data structures are mostly defined using standard [ASN.1](https://www.itu.int/en/ITU-T/asn1/Pages/introduction.aspx)
syntax with few exceptions.

To ensure interoperability of serialized structures, the order of the fields
must match the definitions found within this specification.

### 3.2. Types Alias

- Unsigned integer: `Unsigned ::= INTEGER (0..MAX)`
- n-bit unsigned integer: `Unsigned<n> ::= INTEGER (0..2^n - 1)`
    - 8-bit unsigned integer (octet) `Unsigned8 ::= Unsigned<8>`
    - 32-bit unsigned integer: `Unsigned32 ::= Unsigned<32>`
    - 64-bit unsigned integer: `Unsigned64 ::= Unsigned<64>`
- Non-homogeneous sequence (struct/tuple): `Sequence ::= SEQUENCE`
- Variable length homogeneous sequence (vector): `Sequence<T> ::= SEQUENCE OF T`
- Fixed length homogeneous sequence (array): `Sequence<T,n> ::= Sequence<T> (SIZE(n))`
- Variable length octet-string: `OctetString ::= Sequence<Unsigned8>`
- Fixed length octet-string: `OctetString<n> ::= Sequence<Unsigned8, n>`

### 3.2. Pseudo-Code

It is convenient to make use of code snippets as part of the protocol
description. As a convention, the code is formatted in a style similar to
*Rust*, and can make use of the following set of predefined procedures:

#### Sequences

- `CONCAT(x₀: OctetString, ..., xₖ: OctetString) -> OctetString`: Concatenates the
  input octet-strings as a new octet string.

- `LENGTH(s: Sequence) -> Unsigned`: The number of elements in the sequence `s`.

- `GET(s: Sequence<T>, i: Unsigned) -> T`: The `i`-th element of the sequence `s`.

- `PUSH(s: Sequence<T>, x: T)`: Appends `x` as the new last element of the sequence `s`.

- `POP(s: Sequence<T>) -> T`: extract and returns the last element of the sequence `s`.

#### Codec

- `ENCODE(x: T) -> OctetString`: Encodes `x` as an `OctetString` according to
  [SCALE](https://github.com/paritytech/parity-scale-codec) codec.

- `DECODE<T>(x: OctetString) -> T`: Decodes `x` as a type `T` object according
  to [SCALE](https://github.com/paritytech/parity-scale-codec) codec.

#### Other

- `BLAKE2(x: OctetString) -> OctetString<32>`: Standard *Blake2b* hash
  of `x` with 256-bit digest.

### 3.3. Incremental Introduction of Types and Functions

More types and helper functions are introduced incrementally as they become
relevant within the document's context.


## 4. Protocol Introduction

The timeline is segmented into a sequentially ordered sequence of **slots**.
This entire sequence of slots is further partitioned into distinct segments
known as **epochs**.

Sassafras aims to map each slot within a *target epoch* to the authorities
scheduled for that epoch, utilizing a ticketing system.

The core protocol operation can be roughly divided into four phases.

### 4.1. Submission of Candidate Tickets

Each authority scheduled for the target epoch generates and shares a set of
candidate tickets. Every ticket has an *unbiasable* pseudo random score and is
bundled with an anonymous proof of validity.

### 4.2. Validation of Candidate Tickets

Each candidate ticket undergoes a validation process for the associated validity
proof and compliance with other protocol-specific constraints. Valid tickets
are persisted on-chain.

### 4.3. Tickets Slots Binding

After collecting all valid candidate tickets and before the beginning of the
*target epoch*, a deterministic method is used to uniquely associate a subset of
these tickets to the slots of the *target epoch*.

### 4.4. Claim of Ticket Ownership

During block production phase of *target epoch*, the author is required to prove
ownership of the ticket associated to the block's slot. This step discloses the
identity of the ticket owner.


## 5. Bandersnatch VRFs Cryptographic Primitives

This section is not intended to serve as an exhaustive exploration of the
mathematically intensive foundations of the cryptographic primitive. Rather, its
primary aim is to offer a concise and accessible explanation of the primitives
role and interface which is relevant within the scope of the protocol. For a more
detailed explanation, refer to the [Bandersnatch VRFs](https://github.com/davxy/bandersnatch-vrfs-spec)
technical specification

Bandersnatch VRF comes in two variants:
- *Bare* VRF: Extension to the IETF ECVRF [RFC 9381](https://datatracker.ietf.org/doc/rfc9381/),
- *Ring* VRF: Anonymous signatures leveraging *zk-SNARK*.

Together with the *input*, which determines the VRF *output*, both variants
offer the capability to sign some arbitrary additional data (*extra*) which
doesn't contribute to the VRF output.

### 5.1 Bare VRF Interface

VRF signature construction.

```rust
    fn vrf_sign(
        secret: SecretKey,
        input: OctetString,
        extra: OctetString,
    ) -> VrfSignature
```

VRF signature verification. Returns a Boolean indicating the validity of the
signature (`1` on success).

```rust
    fn vrf_verify(
        public: PublicKey,
        input: OctetString,
        extra: OctetString,
        signature: VrfSignature
    ) -> Unsigned<1>;
```

VRF *output* derivation from *input* and *secret*.

```rust
    fn vrf_output(
        secret: SecretKey,
        input: OctetString,
    ) -> OctetString<32>;
```

VRF *output* derivation from a VRF signature.

```rust
    fn vrf_signed_output(
        signature: VrfSignature,
    ) -> OctetString<32>;
```

The following condition is always satisfied:

```rust
    let signature = vrf_sign(secret, input, extra);
    vrf_output(secret, input) == vrf_signed_output(signature)
```

`SecretKey`, `PublicKey` and `VrfSignature` types are intentionally left
undefined. Their definitions can be found in the Bandersnatch VRF specification
and related documents.

#### 5.4.2. Ring VRF Interface

Ring VRF signature construction.

```rust
    fn ring_vrf_sign(
        secret: SecretKey,
        prover: RingProver,
        input: OctetString,
        extra: OctetString,
    ) -> RingVrfSignature;
```

Ring VRF signature verification. Returns a Boolean indicating the validity
of the signature (`1` on success). Note that verification doesn't require the
signer's public key.

```rust
    fn ring_vrf_verify(
        verifier: RingVerifier,
        input: OctetString,
        extra: OctetString,
        signature: RingVrfSignature,
    ) -> Unsigned<1>;
```

VRF *output* derivation from a ring VRF *signature*.

```rust
    fn ring_vrf_signed_output(
        signature: RingVrfSignature,
    ) -> OctetString<32>;
```

The following condition is always satisfied:

```rust
    let signature = vrf_sign(secret, input, extra);
    let ring_signature = ring_vrf_sign(secret, prover, input, extra);
    vrf_signed_output(signature) == ring_vrf_signed_output(ring_signature);
```

`RingProver`, `RingVerifier`, and `RingVrfSignature` are intentionally left
undefined. Their definitions can be found in the Bandersnatch VRF specification
and related documents.


## 6. Sassafras Protocol

#### 6.1. Protocol Configuration

The `ProtocolConfiguration` type contains some parameters to tweak the
protocol behavior and primarily influences certain checks carried out during
tickets validation. It is defined as:

```rust
    ProtocolConfiguration ::= Sequence {
        epoch_length: Unsigned32,
        attempts_number: Unsigned8,
        redundancy_factor: Unsigned8,
    }
```

Where:
- `epoch_length`: Number of slots for each epoch.
- `attempts_number`: Maximum number of tickets that each authority is allowed to submit.
- `redundancy_factor`: Expected ratio between the cumulative number of valid
  tickets which can be submitted by the scheduled authorities and the epoch's
  duration in slots.

The `attempts_number` influences the anonymity of block producers. As all
published tickets have a **public** attempt number less than `attempts_number`,
all the tickets which share the attempt number value must belong to different
block producers, which reduces anonymity late as we approach the epoch tail.
Bigger values guarantee more anonymity but also more computation.

Details about how these parameters drive the tickets validity probability can be
found in section [6.5.2](#652-tickets-threshold).

### 6.2. Header Digest Log

Each block header contains a `Digest` log, which is defined as an ordered
sequence of `DigestItem`s:

```rust
    DigestItem ::= Sequence {
        id: OctetString<4>,
        data: OctetString
    }

    Digest ::= Sequence<DigestItem>
```

The `Digest` sequence is used to propagate information required for the
correct protocol progress. Outside the protocol's context, the information
within each `DigestItem` is opaque and maps to some SCALE-encoded
protocol-specific structure.

For Sassafras related items, the `DiegestItem`s `id` is set to the ASCII
string `"SASS"`

Possible digest items for Sassafras:
- Epoch change signal: Information about next epoch. This is mandatory for the
  first block of a new epoch.
- Epoch tickets signal: Sequence of tickets for claiming slots in the next
  epoch. This is mandatory for the first block in the *epoch's tail*
- Slot claim info: Additional data required for block verification. This is mandatory
  for each block and must be the second-to-last entry in the log.
- Seal: Block signature added by the block author. This is mandatory for each block
  and must be the last entry in the log.

If any digest entry is unexpected, not found where mandatory or found in the
wrong position, then the block is considered invalid.

### 6.3. On-Chain Randomness

A sequence of four randomness entries is maintained on-chain.

```rust
    RandomnessBuffer ::= Sequence<OctetString<32>, 4>
```

During epoch `N`:

- The first entry is the current *randomness accumulator* and incorporates
  verifiable random elements from all previously executed blocks. The
  accumulation procedure is described in section [6.10](#610-randomness-accumulator).

- The second entry is the snapshot of the accumulator **before** the execution
  of the first block of epoch `N`. This is the randomness used for tickets
  targeting epoch `N+2`.

- The third entry is the snapshot of the accumulator **before** the execution
  of the first block of epoch `N-1`. This is the randomness used for tickets
  targeting epoch `N+1` (the next epoch).

- The third entry is the snapshot of the accumulator **before** the execution
  of the first block of epoch `N-2`. This is the randomness used for tickets
  targeting epoch `N` (the current epoch).

The buffer's entries are updated **after** each block execution.

### 6.4. Epoch Change Signal

The first block produced during epoch `N` must include a descriptor for some
of the parameters to be used by the subsequent epoch (`N+1`).

This signal descriptor is defined as:

```rust
    NextEpochDescriptor ::= Sequence {
        randomness: OctetString<32>,
        authorities: Sequence<PublicKey>,
    }
```

Where:
- `randomness`: Randomness accumulator snapshot relevant for validation of
  next epoch blocks. In other words, randomness used to construct the tickets
  targeting epoch `N+1`.
- `authorities`: List of authorities scheduled for next epoch.

This descriptor is `SCALE` encoded and embedded in a `DigestItem`.

#### 6.4.1. Startup Parameters

Some of the initial parameters used by the first epoch (`#0`), are set through
the genesis configuration, which is defined as:

```rust
    GenesisConfig ::= Sequence {
        authorities: Sequence<PublicKey>,
    }
```

The on-chain `RandomnessBuffer` is initialized **after** the genesis block
construction. The first buffer entry is set as the *Blake2b* hash of the genesis
block, each of the other entries is set as the *Blake2b* hash of the previous entry.

Since block `#0` is generated by each node as part of the genesis process, the
first block that an authority explicitly produces for epoch `#0` is block `#1`.
Therefore, block `#1` is required to contain the `NextEpochDescriptor` for the
following epoch.

`NextEpochDescriptor` for epoch `#1`:
- `randomness`: Third entry (index 2) of the randomness buffer.
- `authorities`: The same sequence as specified in the genesis configuration.

### 6.5. Tickets Creation and Submission

During epoch `N`, each authority scheduled for epoch `N+2` constructs a set
of tickets which may be eligible ([6.5.2](#652-tickets-threshold)) for on-chain
submission.

These tickets are constructed using the on-chain randomness snapshot taken
**before** the execution of the first block of epoch `N` together with other
parameters and aims to secure ownership of one or more slots of epoch `N+2`
(*target epoch*).

Each authority is allowed to submit a maximum number of tickets, constrained by
`attempts_number` field of the `ProtocolConfiguration`.

The ideal timing for the candidate authority to start constructing the tickets
is subject to strategy. A recommended approach is to initiate tickets creation
once the last block of epoch `N-1` is either probabilistically or, even better,
deterministically finalized. This delay is suggested to prevent wasting
resources creating tickets that will be unusable if a different chain branch is
chosen as canonical.

Tickets generated during epoch `N` are shared with the *tickets relayers*,
which are the authorities scheduled for epoch `N+1`. Relayers validate and
collect (off-chain) the tickets targeting epoch `N+2`.

When epoch `N+1` starts, collected tickets are submitted on-chain by relayers
as *inherent extrinsics*, a special type of transaction inserted by the block
author at the beginning of the block's transactions sequence.

#### 6.5.1. Ticket Identifier

Each ticket has an associated identifier defined as:

```rust
    TicketId ::= OctetString<32>;
```

The value of `TicketId` is completely determined by the output of Bandersnatch
VRFs given the following **unbiasable** input:

```rust
    let ticket_vrf_input = CONCAT(
        BYTES("sassafras_ticket_seal"),
        target_epoch_randomness,
        BYTES(attempt)
    );

    let ticket_id = vrf_output(authority_secret_key, ticket_vrf_input);
```

Where:
- `target_epoch_randomness`: element of `RandomnessBuffer` which contains the
  randomness for the epoch the ticket is targeting.
- `attempt`: value going from `0` to the configured `attempts_number - 1`.

#### 6.5.2. Tickets Threshold

A ticket is valid for on-chain submission if its `TicketId` value, when
interpreted as a big-endian 256-bit integer normalized as a float within the
range `[0..1]`, is less than the ticket threshold computed as:

    T = (r·s)/(a·v)

Where:
- `v`: epoch's authorities number
- `s`: epoch's slots number
- `r`: redundancy factor
- `a`: attempts number

In an epoch with `s` slots, the goal is to achieve an expected number of valid
tickets equal to `r·s`.

It's crucial to ensure that the probability of having fewer than `s` winning
tickets is very low, even in scenarios where up to `1/3` of the authorities
might be offline. To accomplish this, we first define the winning probability of
a single ticket as `T = (r·s)/(a·v)`.

Let `n` be the **actual** number of participating authorities, where `v·2/3 ≤ n ≤ v`.
These `n` authorities each make `a` attempts, for a total of `a·n` attempts.

Let `X` be the random variable associated to the number of winning tickets, then
its expected value is `E[X] = T·a·n = (r·s·n)/v`. By setting `r = 2`, we get
`s·4/3 ≤ E[X] ≤ s·2`. Using *Bernestein's inequality* we get `Pr[X < s] ≤ e^(-s/21)`.

For instance, with `s = 600` this results in `Pr[X < s] < 4·10⁻¹³`.
Consequently, this approach offers considerable tolerance for offline nodes and
ensures that all slots are likely to be filled with tickets.

For more details about threshold formula refer to
[probabilities and parameters](https://research.web3.foundation/Polkadot/protocols/block-production/SASSAFRAS#probabilities-and-parameters)
paragraph in the Web3 Foundation description of the protocol.

#### 6.5.3. Ticket Envelope

Each ticket candidate is represented by a `TicketEnvelope`:

```rust
    TicketEnvelope ::= Sequence {
        attempt: Unsigned8,
        extra: OctetString,
        signature: RingVrfSignature
    }   
```

Where:
- `attempt`: Index associated to the ticket.
- `extra`: Additional data available for user-defined applications.
- `signature`: Ring VRF signature of the envelope data (`attempt` and `extra`).

Envelope data is signed using Bandersnatch Ring VRF ([5.4.2](#542-ring-vrf-interface)).

```rust
    let signature = ring_vrf_sign(
        secret_key,
        ring_prover
        ticket_vrf_input,
        extra,
    );
```

With `ticket_vrf_input` defined as in [6.5.1](#651-ticket-identifier).

### 6.6. On-chain Tickets Validation

Validation rules:

1. Ring VRF signature is verified using the `ring_verifier` derived by the
   constant ring context parameters (SNARK SRS) and the next epoch authorities
   public keys.

2. `TicketId` is locally computed from the `RingVrfSignature` and its value
   is checked to be less than tickets' threshold.

3. On-chain tickets submission can't occur within a block part of the
   *epoch's tail*, which encompasses a configurable number of slots at the end
   of the epoch. This constraint is to give time to persisted on-chain tickets
   to be probabilistically (or even better deterministically) finalized and thus
   to further reduce the fork chances at the beginning of the target epoch.

4. All tickets which are proposed within a block must be valid and all of them
   must end up being persisted on-chain. Because the total number of tickets
   persisted on-chain is limited by to the epoch's length, this may require to
   drop some of the previously persisted tickets. We remove tickets with greater
   `TicketId` value first.

5. No tickets duplicates are allowed.

If at least one of the checks fails then the block must be considered invalid.

Pseudo-code for ticket validation for steps 1 and 2:

```rust
    let ticket_vrf_input = CONCAT(
        BYTES("sassafras_ticket_seal"),
        target_epoch_randomness,
        BYTES(envelope.attempt)
    );

    let result = ring_vrf_verify(
        ring_verifier,
        ticket_vrf_input,
        envelope.extra,
        envelope.ring_signature
    );
    ASSERT(result == 1);

    let ticket_id = ring_vrf_signed_output(envelope.ring_signature);
    ASSERT(ticket_id < ticket_threshold);
```

Valid tickets are persisted on-chain in a bounded sorted sequence of
`TicketBody` objects. Items within this sequence are sorted according to
their `TicketId`, interpreted as a 256-bit big-endian unsigned integer.

```rust
    TicketBody ::= Sequence {
        id: TicketId,
        attempt: Unsigned8,
        extra: OctetString,
    }

    Tickets ::= Sequence<TicketBody>
```

The on-chain tickets sequence length bound is set equal to the epoch length
in slots according to the protocol configuration.

### 6.7. Ticket-Slot Binding

Before the beginning of the *target epoch*, the on-chain sequence of tickets
must be associated to epoch's slots such that there is at most one ticket per
slot.

Given an ordered sequence of tickets `[t₀, t₁, ..., tₙ]`, the tickets are
associated according to the following **outside-in** strategy:

```
    slot_index  : [  0,  1,  2,  3 ,  ... ]
    tickets     : [ t₀, tₙ, t₁, tₙ₋₁, ... ]
```

Here `slot_index` is the slot number relative to the epoch's first slot:
`slot_index = slot - epoch_first_slot`.

The association between tickets and a slots is recorded on-chain and thus
is public. What remains confidential is the ticket's author identity, and
consequently, who is enabled to claim the corresponding slot. This information
is known only to the ticket's author.

If the number of published tickets is less than the number of epoch's slots,
some *orphan* slots at the end of the epoch will remain unbounded to any ticket.
For *orphan* slots claiming strategy refer to [6.8.2](#682-secondary-method).
Note that this fallback situation always apply to the first two epochs after genesis.

### 6.8. Slot Claim

With tickets bounded to the *target epoch* slots, every designated authority
acquires the information about the slots for which they are required to produce
a block.

The procedure for slot claiming depends on whether a given slot has an
associated ticket according to the on-chain state. If a slot has an associated
ticket, then the primary authoring method is used. Conversely, the protocol
resorts to the secondary method as a fallback.

#### 6.8.1. Primary Method

An authority, can claim a slot using the primary method if it is the legit
owner of the ticket associated to the given slot.

Let `target_epoch_randomness` be the entry in `RandomnessBuffer` relative to
the epoch the block is targeting and `attempt` be the attempt used to construct
the ticket associated to the slot to claim, the VRF input for slot claiming is
constructed as:

```rust
    let seal_vrf_input = CONCAT(
        BYTES("sassafras_ticket_seal"),
        target_epoch_randomness,
        BYTES(attempt)
    );
```

The `seal_vrf_input`, when signed with the correct authority secret key, must
generate the same `TicketId` which has been associated to the target slot
according to the on-chain state.

#### 6.8.2. Secondary Method

Given that the authorities scheduled for the *target epoch* are kept on-chain in
an ordered sequence, the index of the authority which has the privilege to claim an
*orphan* slot is given by the following procedure:

```rust
    let hash_input = CONCAT(
        target_epoch_randomness,
        ENCODE(relative_slot_index),
    );
    let hash = BLAKE2(hash_input);
    let index_bytes = CONCAT(GET(hash, 0), GET(hash, 1), GET(hash, 2), GET(hash, 3));
    let index = DECODE<Unsigned32>(index_bytes) % LENGTH(authorities);
```

With `relative_slot_index` the slot offset relative to the target epoch's start
and `authorities` the sequence of target epoch authorities.

```rust
    let seal_vrf_input = CONCAT(
        BYTES("sassafras_fallback_seal"),
        target_epoch_randomness
    );
```

#### 6.8.3. Claim Data

`ClaimData` is a digest entry which contains additional information required by
the protocol to verify the block:

```rust
    ClaimData ::= Sequence {
        slot: Unsigned32,
        authority_index: Unsigned32,
        randomness_source: VrfSignature,
    }
```

- `slot`: The slot number
- `authority_index`: Block's author index relative to the on-chain authorities sequence.
- `randomness_source`: VRF signature used to generate per-block randomness.

Given the `seal_vrf_input` constructed using the primary or secondary method,
the randomness source signature is generated as follows:

```rust
    let randomness_vrf_input = CONCAT(
        BYTES("sassafras_randomness"),
        vrf_output(authority_secret_key, seal_vrf_input)
    );

    let randomness_source = vrf_sign(
        authority_secret_key,
        randomness_vrf_input,
        []
    );

    let claim = SlotClaim {
        slot,
        authority_index,
        randomness_source
    };

    PUSH(block_header.digest, ENCODE(claim));
```

The `ClaimData` object is *SCALE* encoded and pushed as the second-to-last
element of the header digest log.

#### 6.8.4. Block Seal

A block is finally sealed as follows:

```rust
    let unsealed_header_byets = ENCODE(block_header);

    let seal = vrf_sign(
        authority_secret_key,
        seal_vrf_input,
        unsealed_header_bytes
    );

    PUSH(block_header.digest, ENCODE(seal));
```

With `block_header` the block's header without the seal digest log entry.

The `seal` object is a `VrfSignature`, which is *SCALE* encoded and pushed as
the **last** entry of the header digest log.

### 6.9. Slot Claim Verification

The last entry is extracted from the header digest log, and is SCALE decoded as
a `VrfSignature` object. The unsealed header is then SCALE encoded in order to be
verified.

The next entry is extracted from the header digest log, and is SCALE decoded as
a `ClaimData` object.

The validity of the two signatures is assessed using as the authority public key
corresponding to the `authority_index` found in the `ClaimData`, together with
the VRF input (which depends on primary/secondary method) and additional data
used by the block author.

```rust
    let seal_signature = DECODE<VrfSignature>(POP(header.digest));
    let unsealed_header_bytes = ENCODE(header);
    let claim_data = DECODE<ClaimData>(POP(header.digest));

    let authority_public_key = GET(authorities, claim_data.authority_index);

    // Verify seal signature
    let result = vrf_verify(
        authority_public_key,
        seal_vrf_input,
        unsealed_header_bytes,
        seal_signature
    );
    ASSERT(result == 1);

    let randomness_vrf_input = CONCAT(
        BYTES("sassafras_randomness"),
        vrf_signed_output(seal_signature)
    );

    // Verify per-block entropy source signature
    let result = vrf_verify(
        authority_public_key,
        randomness_vrf_input,
        [],
        claim_data.randomness_source
    );
    ASSERT(result == 1);
```

With:
- `header`: The block's header.
- `authorities`: Sequence of authorities for the target epoch, as recorded on-chain.
- `seal_vrf_input`: VRF input data constructed as specified in [6.8](#68-slot-claim).

If signatures verification is successful, then the verification process diverges
based on whether the slot is associated with a ticket according to the on-chain
state.

### 6.9.1. Primary Method

For slots tied to a ticket, the primary verification method is employed.
This method verifies ticket ownership using the `TicketId` associated to the
slot.

```rust
    let ticket_id = vrf_signed_output(seal_signature);
    ASSERT(ticket_id == expected_ticket_id);
```

With `expected_ticket_id` the ticket identifier committed on-chain in the
associated `TicketBody`.

#### 6.9.2. Secondary Method

If the slot doesn't have any associated ticket, then the `authority_index`
contained in the `ClaimData` must match the one returned by the procedure
outlined in section [6.8.2](#682-secondary-method).

### 6.10. Randomness Accumulator

The randomness accumulator is updated using the `randomness_source` signature
found within the `ClaimData` object. In particular, fresh randomness is derived
and accumulated **after** block execution as follows:

```rust
    let fresh_randomness = vrf_signed_output(claim.randomness_source);  
    randomness_buffer[0] = BLAKE2(CONCAT(randomness_buffer[0], fresh_randomness));
```


## 7. Drawbacks

None

## 8. Testing, Security, and Privacy

It is critical that implementations of this RFC undergo thorough rigorous
testing. A security audit may be desirable to ensure the implementation does not
introduce emergent side effects.

## 9. Performance, Ergonomics, and Compatibility

### 9.1. Performance

Adopting Sassafras consensus marks a significant improvement in reducing the
frequency of short-lived forks which are eliminated by design.

Forks may only result from network disruption or protocol attacks. In such
cases, the choice of which fork to follow upon recovery is clear-cut, with only
one valid option.

### 9.2. Ergonomics

No specific considerations.

### 9.3. Compatibility

The adoption of Sassafras affects the native client and thus can't be introduced
via a "simple" runtime upgrade.

A deployment strategy should be carefully engineered for live networks. This
subject is left open for a dedicated RFC.


## 10. Prior Art and References

- [Sassafras layman introduction](https://research.web3.foundation/Polkadot/protocols/block-production/SASSAFRAS)
- [Sassafras research paper](https://eprint.iacr.org/2023/031.pdf)
- [Bandersnatch VRFs specification](https://github.com/davxy/bandersnatch-vrfs-spec)
- [Bandersnatch VRFs reference implementation](https://github.com/davxy/ark-ec-vrfs)
- [W3F Ring VRF research paper](https://eprint.iacr.org/2023/002.pdf)
- [Sassafras reference implementation tracking issue](https://github.com/paritytech/substrate/issues/11515)
- [Sassafras reference implementation main PR](https://github.com/paritytech/substrate/pull/11879)


## 11. Unresolved Questions

None


## 12. Future Directions and Related Material

While this RFC lays the groundwork and outlines the core aspects of the
protocol, several crucial topics remain to be addressed in future RFCs.

### 12.1. Interactions with On-Chain Code

- **Storage**: Types, organization and genesis configuration.

- **Host interface**: Interface that the hosting environment exposes to on-chain
  code (also known as *host functions*).

- **Unrecorded on-chain interface**. Interface that on-chain code exposes to the
  hosting environment (also known as *runtime API*).

- **Transactional on-chain interface**. Interface that on-chain code exposes
  to the World to alter the state (also known as *transactions* or
  *extrinsics* in the *Polkadot* ecosystem).

### 12.2. Deployment Strategies

- **Protocol Migration**. Investigate of how Sassafras can seamlessly replace
an already operational instance of another protocol. Future RFCs may focus on
deployment strategies to facilitate a smooth transition.

### 12.3. ZK-SNARK Parameters

- **Parameters Setup**: Determine the setup procedure for the *zk-SNARK* SRS
  (Structured Reference String) initialization. Future RFCs may provide insights
  into whether this process should include an ad-hoc initialization ceremony or
  if we can reuse an SRS from another ecosystem (e.g. Zcash or Ethereum).

### 12.4. Anonymous Submission of Tickets.

- **Mixnet Integration**: Submitting tickets directly to the relay can pose a
  risk of potential deanonymization through traffic analysis. Subsequent RFCs
  may investigate the potential for incorporating *mix network* protocol or
  other privacy-enhancing mechanisms to address this concern.
