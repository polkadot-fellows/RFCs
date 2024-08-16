# RFC-0114: Introduce `secp256r1_ecdsa_verify_prehashed` Host Function to verify `NIST-P256` elliptic curve signatures
|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 16 August 2024                                                                    |
| **Description** | Host function to verify `NIST-P256` elliptic curve signatures.                                                                    |
| **Authors**     | Rodrigo Quelhas                                                                                            |

## Summary
This RFC proposes a new host function, `secp256r1_ecdsa_verify_prehashed`, for verifying `NIST-P256` signatures. The function takes as input the message hash, `r` and `s` components of the signature, and the `x` and `y` coordinates of the public key. By providing this function, runtime authors can leverage a more efficient verification mechanism for "secp256r1" elliptic curve signatures, reducing computational costs and improving overall performance.

## Motivation
“secp256r1” elliptic curve is a standardized curve by NIST which has the same calculations by different input parameters with “secp256k1” elliptic curve. The cost of combined attacks and the security conditions are almost the same for both curves. Adding a host function can provide signature verifications using the “secp256r1” elliptic curve in the runtime and multi-faceted benefits can occur. One important factor is that this curve is widely used and supported in many modern devices such as Apple’s Secure Enclave, Webauthn, Android Keychain which proves the user adoption. Additionally, the introduction of this host function could enable valuable features in the account abstraction which allows more efficient and flexible management of accounts by transaction signs in mobile devices.
Most of the modern devices and applications rely on the “secp256r1” elliptic curve. The addition of this host function enables a more efficient verification of device native transaction signing mechanisms. For example:

1. **Apple's Secure Enclave:** There is a separate “Trusted Execution Environment” in Apple hardware which can sign arbitrary messages and can only be accessed by biometric identification.
2. **Webauthn:** Web Authentication (WebAuthn) is a web standard published by the World Wide Web Consortium (W3C). WebAuthn aims to standardize an interface for authenticating users to web-based applications and services using public-key cryptography. It is being used by almost all of the modern web browsers.
3. **Android Keystore:** Android Keystore is an API that manages the private keys and signing methods. The private keys are not processed while using Keystore as the applications’ signing method. Also, it can be done in the “Trusted Execution Environment” in the microchip.
4. **Passkeys:** Passkeys is utilizing FIDO Alliance and W3C standards. It replaces passwords with cryptographic key-pairs which is also can be used for the elliptic curve cryptography.

## Stakeholders
- **Parachain Teams:** They MUST include this host function in their runtime and node.

## Explanation
This RFC proposes a new host function for runtime authors to leverage a more efficient verification mechanism for "secp256r1" elliptic curve signatures.

Proposed host function signature:
```rust
fn ext_secp256r1_ecdsa_verify_prehashed_version_1(
    sig: &[u8; 64],
    msg: &[u8; 32],
    pub_key: &[u8; 64],
) -> bool;
```
The host function MUST return `true` if the signature is valid or `false` otherwise.

## Drawbacks

N/A

## Testing, Security, and Privacy

### Security

The changes are not directly affecting the protocol security, parachains are not enforced to use the host function.

## Performance, Ergonomics, and Compatibility
### Performance

N/A

### Ergonomics
The host function proposed in this RFC allows parachain runtime developers to use a more efficient verification mechanism for "secp256r1" elliptic curve signatures.

### Compatibility
Parachain teams will need to include this host function to upgrade.

## Prior Art and References
- Pull Request including [RIP-7212](https://github.com/ethereum/RIPs/blob/master/RIPS/rip-7212.md) in Moonbeam: [Add secp256r1 precompile](https://github.com/moonbeam-foundation/moonbeam/pull/2859).
- Pull Request including proposed host function: [IN PROGRESS]().
