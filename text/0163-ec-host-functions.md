# RFC-0163: Elliptic Curves Host Functions

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 21 January 2026                                                                             |
| **Description** | Host functions for elliptic curve operations in Polkadot runtimes                           |
| **Authors**     | Davide Galassi, Jeff Burdges                                                                |

## Summary

We propose a family of host functions for Polkadot runtimes that provide native execution for selected operations upon elliptic curves.

In this RFC, we select 2-4 operations per curve that cover the vast majority of the running time for almost all verifier algorithms in elliptic curve cryptography, while only requiring a small number of hostcall invocations.  We do not provide either field arithmetic or complete cryptographic protocols here, because they would require too many host call invocations or too much host call maintenance, respectively.

The proposal covers the following elliptic curves:
- **BLS12-381**: Pairing-friendly curve widely used for BLS signatures and zkSNARKs
- **Ed-on-BLS12-381-Bandersnatch**: Twisted Edwards curve for in-circuit operations within BLS12-381 zkSNARKs
- **Pallas/Vesta**: The Pasta curves, a 2-cycle enabling efficient recursive SNARK constructions

## Motivation

### Present System

Currently, Polkadot runtimes that need to perform elliptic curve operations must either:

1. Execute these operations entirely within the runtime VM, which is quite slow for complex
   cryptographic computations like pairings and multi-scalar multiplications.
2. Rely on specific host functions that the Polkadot Fellowship has decided to expose, which
   are often highly opinionated and application-specific (e.g. a dedicated signature verification
   host function for a particular curve).

This limitation significantly restricts the types of cryptographic protocols that can be efficiently
implemented in Polkadot runtimes and experimentation, particularly:
- Zero-knowledge proof verification (e.g. Groth16, PLONK with KZG commitments, etc.)
- BLS aggregated signature verification
- Verifiable Random Functions (VRFs) and Ring VRFs
- Aggregation or batching any of these verifications.
- Distributed key generation protocols for threshold signatures.
- Any other advanced cryptographic protocols requiring pairings, like maybe some KZG storage.

### Problems

1. **Performance**: Elliptic curve operations in the runtime can be significantly slower than native
   execution, making many cryptographic protocols impractical for on-chain verification.
2. **Standardization**: Without standardized host functions, each team ends up implementing its own
   solutions, leading to fragmentation and potential security vulnerabilities.
3. **Interoperability**: Different runtimes using incompatible curve implementations cannot
   efficiently verify each other's cryptographic proofs.

### Requirements

1. The host functions MUST provide a significant performance improvement over pure runtime execution.
2. The host functions MUST use standardized serialization formats for interoperability.
3. The implementation MUST be based on well-audited or at least battle-tested cryptographic libraries.
4. The API SHOULD minimize the number of host calls required for common operations.
5. The API SHOULD support batched operations where applicable (e.g., multi-scalar multiplication).

## Stakeholders

- **Runtime developers**: Teams building runtimes that require efficient cryptographic operations.
  Benefit from standardized and performant primitives.
- **zkSNARK projects**: Teams implementing zero-knowledge proof verification. Benefit from
  efficient pairing and MSM operations essential for proof verification.
- **Bridge developers**: Projects building trustless bridges. Benefit from BLS signature
  verification for validating cross-chain consensus proofs.
- **Privacy protocol developers**: Teams building anonymous credentials, ring signatures, or
  confidential transactions. Benefit from efficient curve operations for privacy-preserving constructions.
- **Polkadot Fellowship**: Responsible for maintaining and securing the host function implementations.

## Explanation

### Overview

This proposal introduces host functions for a selected set of elliptic curves, each serving specific
use cases in the broader cryptographic ecosystem. The functions are exposed via the existing Substrate's runtime interface mechanism.

### Common Operations

The following operations are provided for the supported curves. Not all operations are available
for all curves (e.g., pairing operations are only available for pairing-friendly curves).

All functions write their result to an output buffer and return an error code (see Return Values).

- `multi_miller_loop(g1: &[u8], g2: &[u8], out: &mut [u8]) -> u32`
  - Computes the multi-Miller loop for pairing operations.
  - `g1`: encoded `Vec<G1Affine>`.
  - `g2`: encoded `Vec<G2Affine>`.
  - The two input vectors are expected to have identical length.
  - Writes encoded `TargetField` element to `out`.

- `final_exponentiation(in_out: &mut [u8]) -> u32`
  - Completes the pairing computation by performing final exponentiation.
  - `in_out`: encoded `TargetField` element. The type is the same for both input and output,
    so the buffer is reused in place.

- `msm(bases: &[u8], scalars: &[u8], out: &mut [u8]) -> u32`
  - Multi-scalar multiplication. Efficiently computes `sum(scalars_i * bases_i)`.
  - `bases`: encoded `Vec<Affine>`.
  - `scalars`: encoded `Vec<ScalarField>`.
  - The two input vectors are expected to have identical length.
  - Writes encoded `Affine` to `out`.

- `mul(base: &[u8], scalar: &[u8], out: &mut [u8]) -> u32`
  - Single point multiplication.
  - `base`: encoded `Affine`.
  - `scalar`: encoded `BigInteger`.
  - Computes `scalar * base`.
  - Writes encoded `Affine` to `out`.

For pairing-friendly curves with distinct G1 and G2 groups, `msm` and `mul` are provided separately
for each group (e.g., `msm_g1`, `msm_g2`).

We choose these operations because verifier algorithms spend almost all their CPU time within these functions, and verifier algorithms invoke these functions only a small number of times, which makes them perfect targets for host calls.

Although much smaller than the above operations, there do exist other operations that incur some CPU overhead, like serialization and batch normalization, which each require one finite field division.  At present, finite field divisions might not benefit much from SIMD, so the runtime might handle them less badly than heavy curve operations. We cannot yet say that divisions would cost more than the host call overhead, so we leave such operations to the runtime for now.

### Curve Specifications

#### BLS12-381

BLS12-381 is a pairing-friendly elliptic curve that has become the de facto standard for BLS
signatures and many zkSNARK systems. It offers approximately 128 bits of security.

**Typical Applications:**
- **BLS Signatures**: BLS signatures support efficient aggregation, allowing thousands of
  signatures to be verified as one.
- **zkSNARK Verification**: Groth16 and other pairing-based proof systems use BLS12-381.
- **Cross-chain bridges**: Enables verification of consensus proofs from other chains using
  BLS12-381 for trustless bridging.

**Host Functions:**
- `bls12_381_multi_miller_loop`
- `bls12_381_final_exponentiation`
- `bls12_381_msm_g1`
- `bls12_381_msm_g2`
- `bls12_381_mul_g1`
- `bls12_381_mul_g2`

#### Ed-on-BLS12-381-Bandersnatch

Bandersnatch is a twisted Edwards curve defined over the scalar field of BLS12-381. It supports
both twisted Edwards and short Weierstrass representations, offering flexibility for different
use cases.

**Typical Applications:**
- **Verifiable Random Functions**: Efficient VRF constructions for randomness generation.
- **Ring VRFs**: Anonymous VRF outputs with ring signature properties.
- **Ring Signatures**: Efficient ring signature schemes enabling anonymous group membership proofs.

**Host Functions (Twisted Edwards form):**
- `ed_on_bls12_381_bandersnatch_msm`
- `ed_on_bls12_381_bandersnatch_mul`

#### Pallas

Pallas is an elliptic curve that forms a 2-cycle with Vesta, meaning Pallas's base field equals
Vesta's scalar field and vice versa. This property enables efficient recursive proof composition.

**Typical Applications:**
- **Recursive SNARKs**: The Pallas/Vesta 2-cycle enables efficient proof recursion without pairings.
  Pallas serves as the "inner" curve when Vesta is the "outer" curve in recursive constructions.
- **Halo2 Compatibility**: Verification of proofs from [Zcash](https://zcash.github.io/halo2/) and other Halo2-based systems.
- **Kimchi Compatibility**: Verification of proofs from [Mina](https://o1-labs.github.io/proof-systems/specs/pasta) and other Kimchi-based systems.

**Host Functions:**
- `pallas_msm`
- `pallas_mul`

#### Vesta

Vesta is the companion curve to Pallas, completing the 2-cycle. Together they enable recursive
SNARK constructions where proofs over one curve can efficiently verify proofs from the other.

**Typical Applications:**
- See Pallas

**Host Functions:**
- `vesta_msm`
- `vesta_mul`

### Implementation Details

#### Serialization Codec

The encoding format described below follows the conventions adopted by the
upstream [Arkworks](https://github.com/arkworks-rs) library (`CanonicalSerialize`/`CanonicalDeserialize` traits).

##### BigInteger

`BigInteger` is an arbitrary-precision integer, not reduced mod the field order. Used by `mul`
because some operations (cofactor clearing, subgroup membership checks) require multiplying
by values that may equal or exceed the scalar field order.

Encoded as a length-prefixed sequence of `u64` chunks, all in little-endian byte order:
- The first 8 bytes encode the number of chunks as a little-endian `u64`.
- Each subsequent 8-byte block encodes one `u64` chunk in little-endian order.
- Chunks are ordered from least significant to most significant.

##### ScalarField and BaseField Encoding

`ScalarField` (Fr): an element of the curve's **scalar field** (aka *Fr*), reduced mod the field order.
The scalar field order equals the order of the curve's prime subgroup. Used by `msm`.

`BaseField` (Fq): an element of the curve's **base field**, the field over which the curve
equation is defined. Coordinates of curve points are elements of this field.

Both types are serialized as fixed-size little-endian byte arrays. The size is
`ceil(bit_length / 8)` bytes, where `bit_length` is the number of bits in the field modulus.

##### TargetField Encoding

`TargetField` is the target field of a pairing-friendly curve. It is a high-degree extension
of the base field, constructed as a tower of intermediate extensions. For BLS12-381 this is
Fq12, which ultimately consists of 12 Fq elements.

The tower decomposition determines the serialization order. For a 2-3-2 tower:
- Fq2 = 2 Fq elements
- Fq6 = 3 Fq2 = 6 Fq elements
- Fq12 = 2 Fq6 = 12 Fq elements

Elements are serialized by recursively expanding the tower: two Fq6 blocks, each containing
three Fq2 blocks, each containing two Fq elements. Each Fq element is serialized as a
fixed-size little-endian byte array (same rule as BaseField).

##### Affine Point Encoding

All elliptic curve points are encoded as uncompressed **affine** coordinate pairs `(x, y)`,
where each coordinate is a BaseField element. For curves defined over extension fields
(e.g. G2 over Fq2), each coordinate is an extension field element serialized by expanding
its components into BaseField elements.

This applies to both input and output parameters across all host functions.

Decoding validates that the point lies on the curve. If the data does not decode to a valid
curve point, a `MalformedInput` error is returned. Prime subgroup membership is **not** checked.

##### Sequences

Several host functions accept sequences of elements (e.g. `Vec<Affine>` in `msm` and
`multi_miller_loop`). A sequence is encoded as a little-endian `u64` length prefix followed
by that many consecutively encoded elements. Each element is encoded according to its type
(e.g. Affine points use the affine point encoding, ScalarField elements use the field encoding).

##### Example: BLS12-381

Uncompressed serialization sizes for BLS12-381 types.

| Type         | Size (bytes) | Composition                        |
|--------------|--------------|------------------------------------|
| ScalarField  | 32           | 1 Fr element                       |
| BaseField    | 48           | 1 Fq element                       |
| G1 point     | 96           | 2 Fq elements (x, y)              |
| G2 point     | 192          | 2 Fq2 elements (x, y)             |
| TargetField  | 576          | 12 Fq elements (Fq12)             |

- ScalarField (Fr): The group order r is a 255-bit prime, fits in 32 bytes (ceil(255/8) = 32).
- BaseField (Fq): The field modulus q is a 381-bit prime, fits in 48 bytes (ceil(381/8) = 48).
- G1 (over Fq): Affine coordinates (x, y) with both in Fq: 2 * 48 = 96 bytes.
- G2 (over Fq2): G2 is defined over Fq2, the quadratic extension of Fq. Each Fq2 element is a pair of Fq elements (96 bytes). Affine coordinates (x, y) with both in Fq2: 2 * 96 = 192 bytes.
- TargetField (Fq12): 12 Fq elements, serialized following the 2-3-2 tower decomposition
  (see TargetField Encoding above): 12 * 48 = 576 bytes.

#### Return Values

All host functions write their output to a caller-provided buffer and return a result code.
On success, the result is encoded and written to the output buffer.

```rust
enum HostcallResult {
    Success = 0,
    /// Output buffer is too small.
    OutputTooSmall = 1,
    /// Input data decoding failed.
    MalformedInput = 2,
    /// Input sequences have different lengths.
    /// Applies to `msm` and `multi_miller_loop` operations.
    LengthMismatch = 3,
    /// Unknown error.
    Unknown = 255,
}
```

### Usage Example

Simplified BLS12-381 signature verification using types from the `polkadot-sdk`.

The `direct` parameter selects between two usage modes:
- **Direct host calls**: the caller explicitly encodes inputs, invokes the host functions,
  and decodes the result. Encoding/decoding is handled via
  [ark-scale](https://github.com/paritytech/ark-scale), a wrapper library that simplifies
  serialization of Arkworks types.
- **Arkworks compatibility layer**: the `polkadot-sdk` provides types that are API-compatible
  with upstream Arkworks. Under the hood, these types transparently delegate to host calls,
  so the caller uses standard Arkworks APIs without any awareness of the host boundary.

```rust
use ark_ec::pairing::Pairing;
use sp_crypto_ec_utils::bls12_381::{G1Affine, G2Affine, host_calls, Bls12_381};

// Codec for host call boundary: uncompressed, no subgroup validation.
type ArkScaleHostCall<T> = ark_scale::ArkScale<T, { ark_scale::HOST_CALL }>;

type TargetField = <Bls12_381 as Pairing>::TargetField;

// Verify: e(signature, G2_generator) == e(public_key, message_hash)
// Equivalently: e(sig, G2) * e(-pk, H(m)) == 1
fn verify_bls_signature(
    pk: G1Affine,
    msg: G2Affine, // hashed to curve
    sig: G1Affine,
    direct: bool,
) -> bool {
    if direct {
        // Explicitly call host functions and handle encoding/decoding.
        let g1: ArkScaleHostCall<_> = vec![sig, -pk].into();
        let g2: ArkScaleHostCall<_> = vec![G2Affine::generator(), msg].into();
        let mut buf = vec![0u8; ArkScaleHostCall::<TargetField>::max_encoded_len()];
        host_calls::bls12_381_multi_miller_loop(&g1.encode(), &g2.encode(), &mut buf).unwrap();
        host_calls::bls12_381_final_exponentiation(&mut buf).unwrap();
        ArkScaleHostCall::<TargetField>::decode(&mut buf.as_slice()).unwrap().0.is_one()
    } else {
        // Use standard Arkworks API. Host calls are invoked transparently.
        Bls12_381::multi_pairing([sig, -pk], [G2Affine::generator(), msg]).0.is_one()
    }
}
```

## Drawbacks

1. **Maintenance Overhead**: Each curve adds multiple host functions, increasing the maintenance
   burden and expanding the attack surface.
2. **Upgrade Coordination**: Changes to host functions require coordinated runtime and node upgrades.
3. **Curve Selection**: Future cryptographic advances may deprecate some curves or require new ones,
   potentially leading to API churn.
4. **Performance Trade-off**: Granular host functions require multiple host-runtime boundary crossings,
   which introduces overhead compared to *fat* host functions (e.g., a single `verify_bls_signature`)
   that complete the entire operation in one call and can possibly leverage internal parallelization.

## Testing, Security and Privacy

### Testing

Unit tests for all host functions for comparison against upstream Arkworks implementation.

### Security Considerations

The Arkworks libraries have not undergone formal security audits.
Production deployments should consider independent security review.

### Privacy

This proposal does not introduce new privacy concerns.

## Performance, Ergonomics and Compatibility

### Performance

Host functions provide good performance improvement over pure runtime execution for elliptic
curve operations. This enables practical on-chain verification of:
- zkSNARK proofs (Groth16, PLONK, etc)
- Aggregated BLS signatures
- Complex cryptographic protocols

Detailed benchmark results comparing native host function execution versus pure runtime execution,
along with practical integration examples (Groth16 verification, Bandersnatch ring-VRF),
are available in the [Polkadot Arkworks Extensions](https://github.com/davxy/polkadot-arkworks-extensions)
repository.

### Compatibility

The polkadot-sdk implementation is based on the Arkworks library ecosystem, which is widely used.
The serialization format is designed for compatibility with other Arkworks-based implementations.

We considered merging the `final_exponentiation` operation into the `multi_miller_loop`, since they are always used together.  All native cryptographic libraries separate these two operations though, so we'd need wrapper crates to fake not doing this, which increases the maintenance burden. Aside from IBE protocols, we expect pairings would typically be batched across the block, so the overhead of one vs two host call makes little difference, vs the higher maintenance burden required by one host call.

### Migration

Existing custom elliptic curve implementations should migrate to these standardized host functions
to benefit from:
- Improved performance
- Reduced maintenance burden
- Better interoperability

## Prior Art and References

- [Arkworks Library](https://github.com/arkworks-rs)
- [Arkworks Extensions](https://github.com/paritytech/arkworks-extensions) - Arkworks curve extensions with hooks for host function offloading
- [Polkadot Arkworks Extensions](https://github.com/davxy/polkadot-arkworks-extensions) - Integration examples, benchmarks, Groth16 and ring-VRF demos

## Unresolved Questions

None.

## Future Directions and Related Material

**Additional Curves**: Future RFCs may propose host functions for additional curves as
ecosystem needs evolve.
