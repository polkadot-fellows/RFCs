# RFC-0163: Elliptic Curves Host Functions

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 21 January 2026                                                                             |
| **Description** | Host functions for elliptic curve operations in Polkadot runtimes                           |
| **Authors**     | Davide Galassi                                                                              |

## Summary

This RFC proposes a set of host functions for performing computationally intensive elliptic curve
operations in Polkadot runtimes. These host functions enable efficient execution of cryptographic
primitives that would otherwise be significantly expensive when executed in the runtime.

The proposal covers the following elliptic curves:
- **BLS12-381**: Pairing-friendly curve widely used for BLS signatures and zkSNARKs
- **Ed-on-BLS12-381-Bandersnatch**: Twisted Edwards curve for in-circuit operations within BLS12-381 zkSNARKs

**TODO**: Which additional curves should be included in this first iteration (e.g. Ed25519, BLS12-377, etc)?

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
- Threshold signatures and distributed key generation
- KZG polynomial commitments (Data Availability Sampling, Verkle trees)
- Any other advanced cryptographic protocols requiring pairings

### Problems

1. **Performance**: Elliptic curve operations in the runtime can be significantly slower than native
   execution, making many cryptographic protocols impractical for on-chain verification.
2. **Standardization**: Without standardized host functions, each team ends up implementing its own
   solutions, leading to fragmentation and potential security vulnerabilities.
3. **Interoperability**: Different runtimes using incompatible curve implementations cannot
   efficiently verify each other's cryptographic proofs.

### Requirements

1. The host functions MUST provide tangible performance improvements over pure runtime execution.
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
use cases in the broader cryptographic ecosystem. The functions are implemented in the `sp-crypto-ec-utils`
crate or the Polkadot-SDK and exposed via Substrate's runtime interface mechanism.

### Common Operations

The following operations are provided for the supported curves. Not all operations are available
for all curves (e.g., pairing operations are only available for pairing-friendly curves).

- `multi_miller_loop(g1_points: Vec<G1>, g2_points: Vec<G2>) -> T`
  - Computes the multi-Miller loop for pairing operations.
  - Takes vectors of G1 and G2 affine points.
  - The two input vectors are expected to have the same length.
  - Returns target field element.

- `final_exponentiation(target: T) -> T`
  - Completes the pairing computation by performing final exponentiation on a target field element.
  - Returns target field element.

- `msm(bases: Vec<G>, scalars: Vec<F>) -> G`
  - Multi-scalar multiplication.
  - Takes vectors of affine points G and elements of the group's prime order scalar field F.
  - Returns an element of G.
  - Efficiently computes `sum(scalar_i * base_i)`.
  - The two input vectors are expected to have the same length.

- `mul(base: G, scalar: I) -> G`
  - Single point multiplication.
  - Computes `scalar * base`.
  - Takes an affine point G and an unbounded big integer scalar I.
  - Returns an element of G.

For pairing-friendly curves with distinct G1 and G2 groups, `msm` and `mul` are provided separately
for each group (e.g., `msm_g1`, `msm_g2`).

### Curve Specifications

**TODO**: Finalize the set of curves to include based on ecosystem needs.
**TODO**: Should Polkadot and Kusama expose different curve sets? Consider exposing a broader set on Kusama for experimentation.

#### BLS12-381

BLS12-381 is a pairing-friendly elliptic curve that has become the de facto standard for BLS
signatures and many zkSNARK systems. It offers approximately 128 bits of security.

**Typical Applications:**
- **BLS Signatures**: BLS signatures support efficient aggregation, allowing thousands of
  signatures to be verified as one.
- **zkSNARK Verification**: Groth16 and other pairing-based proof systems use BLS12-381 for
  proof verification.
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

**Host Functions (Short Weierstrass form):**
- `ed_on_bls12_381_bandersnatch_msm_sw`
- `ed_on_bls12_381_bandersnatch_mul_sw`

### Implementation Details

#### Conventions

##### Serialization Codec

All [Arkworks](https://github.com/arkworks-rs) types passed on the runtime/host boundary are serialized
using [ArkScale](https://github.com/parity-tech/ark-scale), a SCALE encoding wrapper for Arkworks types.
ArkScale internally uses Arkworks' `CanonicalSerialize`/`CanonicalDeserialize` traits, ensuring
compatibility with the broader Arkworks ecosystem.

The codec is configured with the following settings:
- **Not validated**: Points are not validated on deserialization for performance (caller responsibility)
- **Not compressed**: Uncompressed point representation for faster deserialization

##### Scalar Encoding

Scalars are encoded in little endian. This is the encoding used by Arkworks and has been maintained for simplicity.

##### Point Encoding

All elliptic curve points are encoded in **affine form** as coordinate pairs `(x, y)`.
Coordinates are scalars representing elements of the curve's base field.
This applies to both input and output parameters across all host functions.
Affine representation has been chosen for:
- Simplicity and interoperability with external systems and other libraries
- Reduced serialization overhead compared to projective coordinates
- Direct usability without requiring coordinate conversion after the operation

##### Return Values

All host functions return `Result<Vec<u8>, ()>`, where:
- On success, the `Ok` variant contains the result encoded using the ArkScale codec as described above
- On error, the `Err` variant contains an empty unit type `()`

#### Feature Flags

Each curve is gated behind a feature flag to allow selective compilation:

```toml
[features]
bls12-381 = [...]
ed-on-bls12-381-bandersnatch = [...]
all-curves = ["bls12-381", "ed-on-bls12-381-bandersnatch", ...]
```

### Usage Example (Runtime)

```rust
use sp_crypto_ec_utils::bls12_381::{G1Affine, G2Affine};

// Verify a BLS signature (simplified)
//
// Compute e(signature, G2_generator) == e(public_key, message_hash)
// Using the pairing check: e(sig, G2) * e(-pk, H(m)) == 1
fn verify_bls_signature(
    public_key: G1Affine,  // G1 point
    message_hash: G2Affine, // G2 point (hashed to curve)
    signature: G1Affine,   // G1 point
) -> bool {

    let miller_result = bls12_381::multi_miller_loop(
        &[signature.encode(), negate(public_key).encode()],
        &[G2_GENERATOR.encode(), message_hash.encode()],
    );

    let pairing_result = bls12_381::final_exponentiation(&miller_result).decode();

    pairing_result == Gt::one()
}
```

## Drawbacks

1. **Maintenance Overhead**: Each curve adds multiple host functions, increasing the maintenance
   burden and expanding the attack surface.
2. **Upgrade Coordination**: Changes to host functions require coordinated runtime and node upgrades.
3. **Library Dependency**: The implementation relies on Arkworks, which has not undergone formal
   security audits.
4. **Curve Selection**: Future cryptographic advances may deprecate some curves or require new ones,
   potentially leading to API churn.

## Testing, Security and Privacy

### Testing

Unit tests for all host functions for comparison against upstream Arkworks implementation.

### Security Considerations

The Arkworks libraries have not undergone formal security audits.
Production deployments should consider independent security review.

### Privacy

This proposal does not introduce new privacy concerns.

## Drawbacks

1. **Maintenance Overhead**: Each curve adds multiple host functions, increasing the maintenance
   burden and expanding the attack surface.
2. **Upgrade Coordination**: Changes to host functions require coordinated runtime and node upgrades.
3. **Library Dependency**: The implementation relies on Arkworks, which has not undergone formal
   security audits.
4. **Curve Selection**: Future cryptographic advances may deprecate some curves or require new ones,
   potentially leading to API churn.

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

The implementation is based on the Arkworks library ecosystem, which is widely used.
The serialization format is designed for compatibility with other Arkworks-based implementations.

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

- Which curves should be included in this initial proposal?
- Should Polkadot and Kusama have different curve availability?

## Future Directions and Related Material

**Additional Curves**: Future RFCs may propose host functions for additional curves as
ecosystem needs evolve (e.g., Pasta curves for Halo2-based systems).
