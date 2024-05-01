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


## 3. Notation

This section outlines the notation and conventions adopted throughout this
document to ensure clarity and consistency.

### 3.1. Data Structures Definitions

Data structures are primarily defined using standard [ASN.1](https://en.wikipedia.org/wiki/ASN.1),
syntax with few exceptions

To ensure interoperability of serialized structures, the order of the fields
must match the structures definitions found within this document.

### 3.2. Types Alias

We define some type alias to make ASN.1 syntax more intuitive.

- Unsigned integer: `Unsigned ::= INTEGER (0..MAX)`
- n bits unsigned integer: `Unsigned<n> ::= INTEGER (0..2^n - 1)`
    - 8 bits unsigned integer (octet) `Unsigned8 ::= Unsigned<8>`
    - 32 bits unsigned integer: `Unsigned32 ::= Unsigned<32>`
    - 64 bits unsigned integer: `Unsigned64 ::= Unsigned<64>`
- Non-homogeneous sequence (struct/tuple): `Sequence ::= SEQUENCE`
- Homogeneous sequence (vector): `Sequence<T> ::= SEQUENCE OF T`
    E.g. `Sequence<Unsigned> ::= SEQUENCE OF Unsigned`
- Fixed length homogeneous sequence: `Sequence<T,n> ::= Sequence<T> (SIZE(n))`
- Octet string alias: `OctetString ::= Sequence<Unsigned8>`
- Fixed length octet string: `OctetString<n> ::= Sequence<Unsigned8, n>`
- Optional value: `Option<T> ::= T OPTIONAL`

### 3.2. Pseudo-Code

It is advantageous to make use of code snippets as part of the protocol
description. As a convention, the code is formatted in a style similar to
*Rust*, and can make use of the following set of predefined functions:

Syntax:

- `ENCODE(x: T) -> OctetString`: encodes `x` as an `OctetString` using
  [SCALE](https://github.com/paritytech/parity-scale-codec) codec.

- `DECODE<T>(x: OctetString) -> T`: decodes `x` as a value with type `T` using
  [SCALE](https://github.com/paritytech/parity-scale-codec) codec.

- `BLAKE2(n: Unsigned, x: OctetString) -> OctetString<n>`: standard *Blake2b* hash.

- `CONCAT(x₀: OctetString, ..., xₖ: OctetString) -> OctetString`: concatenate the
  inputs octets.

- `LENGTH(x: Sequence) -> Unsigned`: returns the number of elements in `x`.

- `GET(seq: Sequence<T>, i: Unsigned) -> T`: returns the i-th element of a sequence.

- `PUSH(seq: Sequence<T>, x: T)`: append `x` as the new last element of the sequence.

- `POP(seq: Sequence<T>) -> T`: extract and returns the last element of a sequence.

### 3.3. Incremental Introduction of Types and Functions

More types and helper functions are introduced incrementally as they become
relevant within the document's context.


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


## 5. Bandersnatch VRFs Cryptographic Primitives

It's important to note that this section is not intended to serve as an
exhaustive exploration of the mathematically intensive foundations of the
cryptographic primitive. Rather, its primary aim is to offer a concise and
accessible explanation of the primitive's role and usage which is relevant
within the scope of this RFC.

For an in-depth explanation, refer to the Bandersnatch VRF
[spec](https://github.com/davxy/bandersnatch-vrfs-spec)

Bandersnatch VRF can be used in two flavors:
- *Bare* VRF: extends the IETF ECVRF [RFC 9381](https://datatracker.ietf.org/doc/rfc9381/),
- *Ring* VRF: provides anonymous signatures by leveraging a *zk-SNARK*.

Together with the *input*, which determines the signed VRF *output*, both the
flavors offer the capability to sign some arbitrary additional data (`extra`)
which doesn't contribute to the VRF output.

### 5.1 Plain VRF Interface

Function to construct a `VrfSignature`.

```rust
    fn vrf_sign(
        secret: BandernatchSecretKey,
        input: OctetString,
        extra: OctetString,
    ) -> VrfSignature
```

Function for signature verification returning a Boolean value indicating the
validity of the signature (`1` on success):

```rust
    fn vrf_verify(
        public: PublicKey,
        input: OctetString,
        extra: OctetString,
        signature: VrfSignature
    ) -> Unsigned<1>;
```

Function to derive the VRF output from input and secret:

```rust
    fn vrf_output(
        secret: BandernatchSecretKey,
        input: OctetString,
    ) -> OctetString<32>;
```

Function to derive the VRF output from a signature:

```rust
    fn vrf_signed_output(
        signature: VrfSignature,
    ) -> OctetString<32>;
```

Note that the following condition is always satisfied:

```rust
    let signature = vrf_sign(secret, input, extra);
    vrf_output(secret, input) == vrf_signed_output(signature)
```

In this document, the types `SecretKey`, `PublicKey` and `VrfSignature` are
intentionally left undefined. Their definitions can be found in the Bandersnatch
VRF specification and related documents.

#### 5.4.2. Ring VRF Interface

Function to construct `RingVrfSignature`.

```rust
    fn ring_vrf_sign(
        secret: SecretKey,
        prover: RingProverKey,
        input: OctetString,
        extra: OctetString,
    ) -> RingVrfSignature;
```

Function for signature verification returning a Boolean value
indicating the validity of the signature (`1` on success).
Note that this function doesn't require the signer's public key.

```rust
    fn ring_vrf_verify(
        verifier: RingVerifierKey,
        input: OctetString,
        extra: OctetString,
        signature: RingVrfSignature,
    ) -> Unsigned<1>;
```

Function to derive the VRF output from a ring signature:

```rust
    fn ring_vrf_signed_output(
        signature: RingVrfSignature,
    ) -> OctetString<32>;
```

Note that the following condition is always satisfied:

```rust
    let signature = vrf_sign(secret, input, extra);
    let ring_signature = ring_vrf_sign(secret, prover, input, extra);
    vrf_signed_output(plain_signature) == ring_vrf_signed_output(ring_signature);
```

In this document, the types `RingProverKey`, `RingVerifierKey`, and
`RingSignature` are intentionally left undefined. Their definitions can be found
in the Bandersnatch VRF specification and related documents.


## 6. Sassafras Protocol

#### 6.1. Protocol Configuration

The `ProtocolConfiguration` is constant and primarily influences certain checks
carried out during tickets validation. It is defined as:

```rust
    ProtocolConfiguration ::= Sequence {
        epoch_length: Unsigned32,
        attempts_number: Unsigned8,
        redundancy_factor: Unsigned8,
    }
```

Where:
- `epoch_length`: number of slots for each epoch.
- `attempts_number`: maximum number of tickets that each validator for the next
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

### 6.2. Header Digest Log

Each block's header contains a `Digest`, which is a sequence of `DigestItems`
where the protocol is allowed to append any information required for correct
progress.

The structures are defined to be quite generic and usable by other subsystems:

```rust
    DigestItem ::= Sequence {
        id: OctetString<4>,
        data: OctetString
    }

    Digest ::= Sequence<DigestItem>
```

For Sassafras related `DiegestItem`s the `id` is set to the constant ASCII string `"SASS"`.

### 6.3. On-Chain Randomness

On-Chain, we maintain a sequence with four randomness entries.

```rust
    RandomnessBuffer ::= Sequence<OctetString<32>, 4>
```

During epoch `N`

- The first entry of the buffer is the current randomness accumulator value
  and incorporates verifiable random elements from all previously executed
  blocks. The exact accumulation procedure is described in section
  [6.7](#67-randomness-accumulator).

- The second entry of the buffer is the snapshot of the accumulator after the
  execution of the last block of epoch `N-1`.

- The third entry of the buffer is the snapshot of the accumulator after the
  execution of the last block of epoch `N-2`.

- The fourth entry of the buffer is the snapshot of the accumulator after the
  execution of the last block of epoch `N-3`.

The buffer is entries are updated **after** block execution.

### 6.4. Epoch's First Block

The first block produced during an epoch `N` must include a descriptor for some
of the subsequent epoch (`N+1`) parameters. This descriptor is defined as:

```rust
    NextEpochDescriptor ::= Sequence {
        randomness: OctetString<32>,
        authorities: Sequence<PublicKey>,
    }
```

Where:
- `randomness`: last randomness accumulator snapshot, which must be equivalent
  to `GET(RandomnessBuffer, 1)` **after** block execution.
- `authorities`: list of validators scheduled for next epoch.

This descriptor is `SCALE` encoded and embedded in the block header's digest
log.

A special case arises for the first block of epoch `0`, which each node produces
independently during the genesis phase. In this case, the `NextEpochDescriptor`
relative to epoch `1` is shared within the second block, as outlined in section
[6.4.1](#641-startup-parameters).

#### 6.4.1. Startup Parameters

Some of the initial parameters for the first epoch, Epoch `#0`, are set through
the genesis configuration, which is defined as:

```rust
    GenesisConfig ::= Sequence {
        authorities: Sequence<PublicKey>,
    }
```

The on-chain randomness accumulator is initialized only **after** the genesis
block is produced, and its value is set to the hash of the genesis block.

Since block `#0` is generated locally by each node as part of the genesis
process, the first block that a validator explicitly produces for Epoch
`#0` is block `#1`. Therefore, block `#1` is required to contain the
`NextEpochDescriptor` for the following epoch, Epoch `#1`.

The `NextEpochDescriptor` for Epoch `#1`:
- `randomness`: computed using the `randomness_accumulator` established
  post-genesis, as mentioned above.
- `authorities`: the same as those specified in the genesis configuration.

### 6.5. Offchain Tickets Creation and Submission

During epoch `N`, each validator associated to epoch `N+2` constructs a set of
tickets which may be eligible ([6.5.2](#652-tickets-threshold)) to be delivered
to on-chain proxies, which are the validators scheduled for epoch `N+1`.

These tickets are constructed using the on-chain randomness snapshot taken
**after** the execution of the last block of epoch `N-1` together with other
parameters and aims to secure ownership of one or more slots of epoch `N+2`.

Each validator is allowed to submit a maximum number of tickets, constrained by
`attempts_number` field of the `ProtocolConfiguration`.

The ideal timing for the candidate validator to start constructing the tickets
is subject to strategy. A recommended approach is to initiate tickets creation
once the last block of epoch `N-1` is either probabilistically or, even better,
deterministically finalized. This delay is suggested to prevent wasting
resources creating tickets that might become unusable if a different chain
branch is chosen as the canonical one.

As said, proxies collect tickets during epoch `N` and when epoch `N+1` begins
the collected tickets are submitted on-chain.
TODO (inherents/ unsigned ext?).

#### 6.5.1. Ticket Identifier

Each ticket has an associated identifier defined as:

```rust
    TicketId ::= OctetString<32>;
```

The value of the `TicketId` is completely determined by the output of the
Bandersnatch VRF with the following **unbiasable** input:

```rust
    let ticket_vrf_input = CONCAT(
        BYTES("sassafras_ticket"),
        GET(randomness_buffer, 1),
        BYTES(attempt_index)
    );

    let ticket_id = vrf_output(AUTHORITY_SECRET_KEY, ticket_vrf_input);
```

Where:
- `randomness_buffer`: on-chain `RandomnessBuffer` instance, in particular we
   use the snapshot after the execution of previous epoch's last block.
- `attempt_index`: value going from `0` to the configuration `attempts_number - 1`.

#### 6.5.2. Tickets Threshold

A `TicketId` value is valid for on-chain submission if its value, when interpreted
as a big-endian 256-bit integer normalized as a float within the range `[0..1]`,
is less than the ticket threshold computed as:

    T = (r·s)/(a·v)

Where:
- `v`: epoch's validators number
- `s`: epoch's slots number
- `r`: redundancy factor
- `a`: attempts number
- `T`: ticket threshold value (`0 ≤ T ≤ 1`)

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

#### 6.5.3. Ticket Body

Every ticket candidate has an associated body, defined as:

```rust
    TicketBody ::= Sequence {
        attempt_index: Unsigned8,
        opaque: OctetString,
    }
```

Where:
- `attempt_index`: index used to generate the associated `TicketId`.
- `opaque`: additional data for user-defined applications.

#### 6.5.4. Ticket Signature

`TicketBody` must be signed using the Bandersnatch Ring VRF flavor ([5.4.2](#542-ring-vrf-interface)).

```rust
    let signature = ring_vrf_sign(
        secret_key,
        ring_prover_key
        ticket_vrf_input,
        ENCODE(ticket_body),
    );
```

`ring_prover_key` object is constructed using the set of public keys which
belong to the target epoch's validators and the *zk-SNARK* context parameters
(for more details refer to the Bandersnatch VRFs specification).

Finally, the body and the ring signature are combined within the `TicketEnvelope`:

```rust
    TicketEnvelope ::= Sequence {
        ticket_body: TicketBody,
        ring_signature: RingVrfSignature
    }   
```

### 6.6. Onchain Tickets Validation

All the actions in the steps described by this paragraph are executed by
on-chain code.

Validation rules:

1. Ring signature is verified using the on-chain `ring_verifier_key` derived by the
   static ring context parameters and the next epoch validators public keys.

2. Ticket identifier is locally recomputed from the `RingVrfSignature` and its value
   is checked to be less than the tickets' threshold.

3. Tickets submissions can't occur within a block part of the *epoch's tail*, which
   are a given number of the slots at the end of the epoch. The tail length is a
   configuration value (e.g. 1/6 of epoch length) part of the configuration.
   This constraint is to give time to the on-chain tickets to be probabilistically
   (or even better deterministically) finalized and thus further reduce the fork chances.

4. All tickets which are proposed within a block must be valid and all of them
   must end up in the on-chain queue. That is, no submitted ticket should be
   discarded. 

5. No duplicates are allowed.

If at least one of the checks fails then the block must be discarded.

Valid tickets bodies, together with the ticket identifiers, are all persisted on-chain
and kept incrementally sorted according to the `TicketId` interpreted as a 256-bit
big-endian unsigned integer.

Pseudo-code for ticket validation for steps 1 and 2:

```rust
    let ticket_vrf_input = CONCAT(
        BYTES("sassafras_ticket"),
        GET(randomness_buffer, 2),
        BYTES(envelope.body.attempt_index)
    );

    let result = ring_vrf_verify(
        verifier,
        ticket_vrf_input,
        ENCODE(ticket_body),
        envelope.ring_signature
    );
    assert(result == 1);

    let ticket_id = ring_vrf_signed_output(envelope.ring_signature);
    assert(ticket_id < ticket_threshold);
```

### 6.7. Ticket-Slot Binding

Before the beginning of the claiming phase (i.e. what we've called the target
epoch), the on-chain list of tickets must be associated with the next epoch's
slots such that there must be at most one ticket per slot.

Given an ordered sequence of tickets `[t₀, t₁, ..., tₙ]` to be assigned to
`n` slots, the tickets are allocated according to the following **outside-in**
strategy:

```
    slot_index  : [  0,  1,  2,  3 ,  ... ]
    tickets     : [ t₀, tₙ, t₁, tₙ₋₁, ... ]
```

Here `slot-index` is a relative value computed as:

    slot_index = slot - epoch_start_slot

The association between each ticket and a slot is recorded on-chain and thus
is public. What remains confidential is the identity of the ticket's author, and
consequently, who possesses the validator to claim the corresponding slot. This
information is known only to the author of the ticket.

If the number of published tickets is less than the number of epoch slots,
some *orphan* slots in the end of the epoch will remain unbounded to any ticket.
For claiming strategy refer to [6.8.2](#682-secondary-method).
Note that this situation always apply to the first epochs after genesis.

### 6.8. Slot Claim

With tickets bound to epoch slots, every validator acquires information about
the slots for which they are supposed to produce a block.

The procedure for slot claiming depends on whether a given slot has an
associated ticket according to the on-chain state.

If a slot is associated with a ticket, the primary authoring method is used.
Conversely, the protocol resorts to the secondary method as a fallback.

#### 6.8.1. Primary Method

We can proceed to claim a slot using the primary method if we are the
legit owner of the ticket associated to the given slot.

Let `randomness_buffer` be the instance of `RandomnessBuffer` stored in the
chain state and `ticket_body` be the `TicketBody` that is associated to the
slot to claim, the VRF input for slot claiming is constructed as:

```rust
    let seal_vrf_input = CONCAT(
        BYTES("sassafras_ticket"),
        GET(randomness_buffer, 3),
        BYTES(ticket_body.attempt_index)
    );
```

This `seal_vrf_input`, when signed with the correct validator secret key must
generate the same `TicketId` associated on-chain to the target slot.

#### 6.8.2. Secondary Method

Given that the authorities registered on-chain are kept in an ordered list,
the index of the validator which has the privilege to claim an *orphan* slot
is given by the following procedure:

```rust
    let hash_input = CONCAT(
        GET(randomness_buffer, 2),
        relative_slot_index,
    );
    let hash = BLAKE2(hash_input);
    let index_bytes = CONCAT(GET(hash, 0), GET(hash, 1), GET(hash, 2), GET(hash, 3));
    let index = DECODE<Unsigned32>(index_bytes) % LENGTH(authorities);
```

With `relative_slot_index` the slot offset relative to the epoch's start and `authorities`
the `Sequence` of current epoch validators.

Let `randomness_buffer` be the instance of `RandomnessBuffer` stored in on-chain state
then the VRF input for slot claiming is constructed as:

```rust
    let seal_vrf_input = CONCAT(
        BYTES("sassafras_fallback"),
        GET(randomness_buffer, 3),
    );
```

#### 6.8.3. Claim Data

The slot claim data is a digest entry which contains additional information
which is required by the protocol in order to verify the block:

```rust
    ClaimData ::= Sequence {
        slot: Unsigned32,
        validator_index: Unsigned32,
        randomness_source: VrfSignature,
    }
```

- `slot`: the slot number
- `validator_index`: block's author index relative to the on-chain validators sequence.
- `randomness_source`: VRF signature used to generate per-block randomness.

Given the `seal_vrf_input` constructed using the primary or secondary method,
the claim is derived as follows:

```rust
    let randomness_vrf_input = CONCAT(
        BYTES("sassafras_randomness"),
        vrf_output(AUTHORITY_SECRET_KEY, seal_vrf_input)
    );

    let randomness_source = vrf_sign(
        AUTHORITY_SECRET_KEY,
        randomness_vrf_input,
        []
    );

    let claim = ClaimData {
        slot,
        validator_index,
        randomness_source,
    }
```

The `claim` object is *SCALE* encoded and pushed into the header digest log.

#### 6.8.4. Block Seal

A block is sealed as follows:

```rust
    let unsealed_header_bytes = ENCODE(header);

    let seal = vrf_sign(
        AUTHORITY_SECRET_KEY,
        seal_vrf_input,
        unsealed_header_bytes
    );

    PUSH(header.digest, ENCODE(seal));
```

With `header` the block's header without the seal digest log entry.

The `seal` object is a `VrfSignature` instance, which is *SCALE* encoded and
pushed as the last entry of the block's header digest log.

### 6.9. Slot Claim Verification

The last entry is extracted from the header digest log, and is interpreted as
the seal `VrfSignature`. The unsealed header is then SCALE encoded in order to
be verified.

The next entry is extracted from the header digest log, and is interpreted as a
`ClaimData` instance.

The validity of the signatures is then verified using as the public key the 
validator key corresponding to the `validator_index` found in the `ClaimData`,
together with the VRF input (which depends on primary/secondary method) and
additional data expected to have been used by the block author.

```rust
    let seal_signature = DECODE<VrfSignature>(POP(header.digest));
    let unsealed_header_bytes = ENCODE(header);
    let claim_data = DECODE<ClaimData>(POP(header.digest));

    let public_key = GET(authorities, claim_data.validator_index);

    let result = vrf_verify(
        public_key,
        seal_vrf_input,
        unsealed_header_bytes,
        seal_signature
    );
    assert(result == 1);

    let randomness_vrf_input = vrf_signed_output(seal_signature);

    let result = vrf_verify(
        public_key,
        randomness_vrf_input,
        [],
        claim_data.randomness_source
    );
    assert(result == 1);
```

With:
- `header`: the block's header.
- `authorities`: sequence of authorities for the epoch, as recorded on-chain.
- `seal_vrf_input`: VRF seal input data constructed as specified in [6.8](#68-slot-claiming).

If signatures verification is successful, then the verification process diverges
based on whether the slot is associated with a ticket according to the on-chain
state.

### 6.9.1. Primary Method

For slots tied to a ticket, the primary verification method is employed.
This method verifies ticket ownership using the `TicketId` associated to the slot.

```rust
    let ticket_id = vrf_signed_output(seal_signature);
    assert(ticket_id == expected_ticket_id);
```

With `expected_ticket_id` the ticket identifier committed on-chain together
with the associated `ticket_body`.

#### 6.9.2. Secondary Method

If the slot doesn't have any associated ticket then the validator index contained in
the claim data must match the one given by the procedure outlined in section
[6.8.2](#682-secondary-method).

### 6.10. Randomness Accumulator

The randomness accumulator is updated using the `randomness_source` signature found
within the `ClaimData` object.

In particular, fresh randomness is derived and accumulated **after** block
execution as follows:

```rust
    let fresh_randomness = vrf_signed_output(claim.randomness_source);  

    let prev_accumulator = POP(randomness_buffer);
    let curr_accumulator = BLAKE2(CONCAT(randomness_accumulator, fresh_randomness));
    PUSH(randomness_buffer, curr_accumulator);
```


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

- [Sassafras layman introduction](https://research.web3.foundation/Polkadot/protocols/block-production/SASSAFRAS)
- [Sassafras research paper](https://eprint.iacr.org/2023/031.pdf)
- [Bandersnatch VRFs specification](https://github.com/davxy/bandersnatch-vrfs-spec).
- [Bandersnatch VRFs reference implementation](https://github.com/davxy/ark-ec-vrfs).
- [W3F Ring VRF research paper](https://eprint.iacr.org/2023/002.pdf)
- [Sassafras reference implementation tracking issue](https://github.com/paritytech/substrate/issues/11515)
- [Sassafras reference implementation main PR](https://github.com/paritytech/substrate/pull/11879)


## 11. Unresolved Questions

None


## 12. Future Directions and Related Material

While this RFC lays the groundwork and outlines the core aspects of the
protocol, several crucial topics remain to be addressed in future RFCs.

### 12.1. Interactions with On-Chain Code

- **Outbound Interfaces**: Interfaces that the host environment provides to the
  on-chain code, typically known as *Host Functions*.

- **Unrecorded Inbound Interfaces**. Interfaces that the on-chain code provides
  to the host environment, typically known as *Runtime APIs*.

- **Transactional Inbound Interfaces**. Interfaces that the on-chain code provides
  to the world to alter the chain state, typically known as *Transactions*
  (or *extrinsics* in the *Polkadot* ecosystem)

### 12.2. Deployment Strategies

- **Protocol Migration**. Exploring how this protocol can seamlessly replace an
  already operational instance of another protocol. Future RFCs may focus on
  deployment strategies to facilitate a smooth transition.

### 12.3. ZK-SNARK URS Initialization

- **Procedure**: Determining the procedure for the *zk-SNARK* URS (Universal
  Reference String) initialization. Future RFCs may provide insights into
  whether this process should include an ad-hoc initialization ceremony or if
  we can reuse an SRS from another ecosystem (e.g. Zcash or Ethereum).

### 12.4. Anonymous Submission of Tickets.

- **Mixnet Integration**: Submitting tickets directly to the relay/proxy can
  pose a risk of potential deanonymization through traffic analysis. Subsequent
  RFCs may investigate the potential for incorporating Mixnet protocol or
  other privacy-enhancing mechanisms to address this concern.
