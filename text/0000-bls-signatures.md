# RFC-0000: Add host functions to produce and verify BLS signatures

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2025-10-14                                                                                  |
| **Description** | Introduce BLS12-381 host function                                                           |
| **Author**      | Someone Unknown                                                                             |

## Summary

Introduce new host functions allowing runtimes to generate BLS12-381 keys, signatures, and proofs of possession.

## Credits

BLS implementation and initial host functions implementation are authored by Seyed Hosseini and co-authored by Davide Galassi.

## Interaction with other RFCs

This RFC respects the runtime-side memory allocation strategy that will be introduced by [RFC-145](https://github.com/polkadot-fellows/RFCs/pull/145).

## Motivation

New functions are required to equip BEEFY with BLS signatures, which are essential for the accountable light client protocol.

## Stakeholders

Runtime developers who will be able to use the new signature types.

## Explanation

This RFC proposes introducing new host functions as follows.

### ext_crypto_bls381_generate

Generates a BLS12-381 key for the given key type using an optional `seed`, stores it in the keystore, and returns a corresponding public key.

#### Prototype

```wat
(func $ext_crypto_bls381_generate_version_1
 (param $id i32) (param $seed i64) (param $out i32))
```

#### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid;
* `seed` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a SCALE-encoded Option value ([Definition 200](https://spec.polkadot.network/id-cryptography-encoding#defn-option-type)) containing a BIP-39 seed which must be valid UTF-8. The function will panic if the seed is not a valid UTF-8;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to an output buffer, 144 bytes long, where the public key will be written.

### ext_crypto_bls381_generate_proof_of_possession

Generates a BLS12-381 Proof Of Possession for a given public key and owner identifier.

#### Prototype

```wat
(func $ext_crypto_bls381_generate_proof_of_possession_version_1
 (param $id i32) (param $pub_key i32) (param $owner i64) (param $out i32) (result i64))
```

#### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid;
* `pub_key` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a public key, 144 bytes long;
* `owner` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to an opaque owner identifier;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to an output buffer, 224 bytes long, where the proof of possession will be written.

#### Result

The function returns `0` on success. On error, `-1` is returned, and the output buffer should be considered uninitialized.

### ext_crypto_bls381_num_public_keys

Retrieves the number of BLS12-381 keys of the given type available in the keystore.

#### Prototype

```wat
(func $ext_crypto_bls381_num_public_keys_version_1
 (param $id i32) (result i32))
```

#### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid.

#### Result

The result represents a (possibly zero) number of keys of the given type known to the keystore.

### ext_crypto_bls381_public_key

Retrieves a BLS12-381 public key of a given type at a given index from the keystore.

#### Prototype

```wat
(func $ext_crypto_bls381_public_key_version_1
 (param $id i32) (param $index i32) (param $out))
```

#### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid;
* `index` is an index of the key in the keystore. If the index is out of bounds (determined by the value returned by the `ext_crypto_bls381_num_public_keys` function), the function will panic;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to an output buffer, 144 bytes long, where the key will be written.

### ext_crypto_bls381_sign

Signs an input message using a given BLS12-381 key.

#### Prototype

```wat
(func $ext_crypto_bls381_sign_version_1
 (param $id i32) (param $pub_key i32) (param $msg i64) (param $out i64) (result i64))
```

#### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid;
* `pub_key` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to public key bytes (as returned by `ext_crypto_bls381_public_key` function);
* `msg` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a message that is to be signed;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to an output buffer, 112 bytes long, where the signature will be written.

#### Result

The function returns `0` on success. On error, `-1` is returned, and the output buffer should be considered uninitialized.

### ext_crypto_ecdsa_bls381_generate

Generates a combination ECDSA & BLS12-381 key for a given key type using an optional `seed`, stores it in the keystore, and returns the corresponding public key.

#### Prototype

```wat
(func $ext_crypto_ecdsa_bls381_generate_version_1
 (param $id i32) (param $seed i64) (param $out i32))
```

#### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid;
* `seed` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a SCALE-encoded Option value ([Definition 200](https://spec.polkadot.network/id-cryptography-encoding#defn-option-type)) containing a BIP-39 seed which must be valid UTF-8. The function will panic if the seed is not a valid UTF-8;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to an output buffer, 177 bytes long, where the public key will be written.

### ext_crypto_ecdsa_bls381_num_public_keys

Retrieves the number of ECDSA & BLS12-381 keys of a given type available in the keystore.

#### Prototype

```wat
(func $ext_crypto_ecdsa_bls381_num_public_keys_version_1
 (param $id i32) (result i32))
```

#### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid.

#### Result

The result represents a (possibly zero) number of keys of the given type known to the keystore.

### ext_crypto_ecdsa_bls381_public_key

Retrieves an ECDSA & BLS12-381 public key of a given type at a given index from the keystore.

#### Prototype

```wat
(func $ext_crypto_ecdsa_bls381_public_key_version_1
 (param $id i32) (param $index i32) (param $out))
```

#### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid;
* `index` is an index of the key in the keystore. If the index is out of bounds (determined by the value returned by the `ext_crypto_ecdsa_bls381_num_public_keys` function), the function will panic;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to an output buffer, 177 bytes long, where the key will be written.

### ext_crypto_ecdsa_bls381_sign

Signs an input message using a given ECDSA & BLS12-381 key.

#### Prototype

```wat
(func $ext_crypto_ecdsa_bls381_sign_version_1
 (param $id i32) (param $pub_key i32) (param $msg i64) (param $out i64) (result i64))
```

#### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid;
* `pub_key` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to public key bytes (as returned by `ext_crypto_ecdsa_bls381_public_key` function);
* `msg` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a message that is to be signed;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to an output buffer, 177 bytes long, where the signature will be written.

#### Result

The function returns `0` on success. On error, `-1` is returned, and the output buffer should be considered uninitialized.

### ext_crypto_ecdsa_bls381_sign_with_keccak256

Hashes a message using Keccak256 and then signs it using the ECDSA algorithm. It does not affect the behavior of the BLS12-381 component. Generates a BLS12-381 signature according to the IETF standard.

#### Prototype

```wat
(func $ext_crypto_ecdsa_bls381_sign_with_keccak256_version_1
 (param $id i32) (param $pub_key i32) (param $msg i64) (param $out i64) (result i64))
```

#### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid;
* `pub_key` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to public key bytes (as returned by `ext_crypto_ecdsa_bls381_public_key` function);
* `msg` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a message that is to be signed;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to an output buffer, 177 bytes long, where the signature will be written.

#### Result

The function returns `0` on success. On error, `-1` is returned, and the output buffer should be considered uninitialized.
