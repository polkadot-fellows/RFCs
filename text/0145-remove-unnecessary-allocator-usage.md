# RFC-0145: Remove the host-side runtime memory allocator

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2025-05-16                                                                                   |
| **Description** | Update the runtime-host interface to no longer make use of a host-side allocator            |
| **Authors**     | Pierre Krieger, Someone Unknown       
                                                      |
## Summary

Update the runtime-host interface so that it no longer uses the host-side allocator.

## Prior Art

The API of these new functions was heavily inspired by the API used by the C programming language.

This RFC is mainly based on [RFC-4](https://github.com/polkadot-fellows/RFCs/pull/4) by @tomaka, which was never adopted, and this RFC supersedes it.

### Changes from RFC-4

* The original RFC required checking if an output buffer address provided to a host function is inside the VM address space range and to stop the runtime execution if that's not the case. That requirement has been removed in this version of the RFC, as in the general case, the host doesn't have exhaustive information about the VM's memory organization. Thus, attempting to write to an out-of-bounds region will result in a "normal" runtime panic.
* Function signatures introduced by [PPP#7](https://github.com/w3f/PPPs/pull/7) have been used in this RFC, as the PPP has already been [properly implemented](https://github.com/paritytech/substrate/pull/11490) and [documented](https://github.com/w3f/polkadot-spec/pull/592/files). However, it has never been officially adopted, nor have its functions been in use.
* Return values were harmonized to `i64` everywhere where they represent either a positive outcome as a positive integer or a negative outcome as a negative error code.
* `ext_offchain_network_peer_id_version_1` now returns a result code instead of silently failing if the network status is unavailable.
* Added new versions of `ext_misc_runtime_version` and `ext_offchain_random_seed`.
* Addressed discussions from the original RFC-4 discussion thread.

## Motivation

The heap allocation of the runtime is currently controlled by the host using a memory allocator on the host side.

The API of many host functions contains buffer allocations. For example, when calling `ext_hashing_twox_256_version_1`, the host allocates a 32-byte buffer using the host allocator, and returns a pointer to this buffer to the runtime. The runtime later has to call `ext_allocator_free_version_1` on this pointer to free the buffer.

Even though no benchmark has been done, it is pretty obvious that this design is very inefficient. To continue with the example of `ext_hashing_twox_256_version_1`, it would be more efficient to instead write the output hash to a buffer allocated by the runtime on its stack and passed by pointer to the function. Allocating a buffer on the stack, in the worst case, consists simply of decreasing a number; in the best case, it is free. Doing so would save many VM memory reads and writes by the allocator, and would save a function call to `ext_allocator_free_version_1`.

Furthermore, the existence of the host-side allocator has become questionable over time. It is implemented in a very naive way, and for determinism and backwards compatibility reasons, it needs to be implemented exactly identically in every client implementation. Runtimes make substantial use of heap memory allocations, and each allocation needs to go through the runtime <-> host boundary twice (once for allocating and once for freeing). Moving the allocator to the runtime side would be a good idea, although it would increase the runtime size. But before the host-side allocator can be deprecated, all the host functions that use it must be updated to avoid using it.

## Stakeholders

No attempt was made to convince stakeholders.

## Explanation

### New definitions

#### <a name="new-def-i"></a>New Definition I: Runtime Optional Positive Integer

The Runtime optional positive integer is a signed 64-bit value. Positive values in the range of [0..2³²) represent corresponding unsigned 32-bit values. The value of `-1` represents a non-existing value (an _absent_ value). All other values are invalid.

#### <a name="new-def-ii"></a>New Definition II: Runtime Optional Pointer-Size

The runtime optional pointer-size has exactly the same definition as runtime pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) with the value of 2⁶⁴-1 representing a non-existing value (an _absent_ value).

### Changes to host functions

#### ext_storage_get

The function is deprecated. Users are encouraged to use `ext_storage_read_version_2` instead.

#### ext_storage_read

The new version 2 is introduced, deprecating `ext_storage_read_version_1`. The new signature is

```wat
(func $ext_storage_read_version_2
    (param $key i64) (param $value_out i64) (param $value_offset i32) (result i64))
```

##### Arguments

* `key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the storage key being read;
* `value_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the value read should be stored. If the buffer is not long enough to accommodate the value, the value is truncated to the length of the buffer;
* `value_offset` is a 32-bit offset from which the value reading should start.

##### Result

The result is an optional positive integer ([New Definition I](#new-def-i)), representing either the full length of the value in storage or the _absence_ of such a value in storage.

##### Changes

The logic of the function is unchanged since the previous version. Only the result representation has changed.

#### ext_storage_clear_prefix

The new version 3 is introduced, deprecating `ext_storage_clear_prefix_version_2`. The new signature is

```wat
(func $ext_storage_clear_prefix_version_3
    (param $maybe_prefix i64) (param $maybe_limit i64) (param $maybe_cursor_in i64)
    (param $maybe_cursor_out i64) (param $backend i32) (param $unique i32) (param $loops i32)
    (result i32))
```

##### Arguments

* `maybe_prefix` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) containing a (possibly empty) storage prefix being cleared;
* `maybe_limit` is an optional positive integer ([New Definition I](#new-def-i)) representing either the maximum number of backend deletions which may happen, or the _absence_ of such a limit. The number of backend iterations may surpass this limit by no more than one;
* `maybe_cursor_in` is an optional pointer-size ([New Definition II](#new-def-ii)) representing the cursor returned by the previous (unfinished) call to this function. It should be _absent_ on the first call;
* `maybe_cursor_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the continuation cursor will optionally be written (see also the Result section);
* `backend` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of items removed from the backend database will be written;
* `unique` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of unique keys removed, taking into account both the backend and the overlay;
* `loops` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of iterations (each requiring a storage seek/read) which were done will be written.

##### Result

The result represents the length of the continuation cursor which was written to the buffer provided in `maybe_cursor_out`. A zero value represents the absence of such a cursor and no need for continuation (the prefix has been completely cleared). If the buffer is not large enough to accommodate the cursor, the latter will be truncated, but the full length of the cursor will always be returned.

##### Changes

The new version adopts [PPP#7](https://github.com/w3f/PPPs/pull/7), hence the significant change in the function interface with respect to the previous version. The reasoning for such a change was provided in the [original proposal discussion](https://github.com/w3f/polkadot-spec/issues/588).

#### ext_storage_root

The new version 3 is introduced, deprecating `ext_storage_root_version_2`. The signature is

```wat
(func $ext_storage_root_version_3
    (param $out i64) (result i32))
```

##### Arguments

* `out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the SCALE-encoded storage root, calculated after committing all the existing operations, will be stored.

##### Results

The result is the length of the output stored in the buffer provided in `out`. If the buffer is not large enough to accommodate the data, the latter will be truncated, but the full length of the output data will always be returned.

##### Changes

The new version adopts [PPP#6](https://github.com/w3f/PPPs/pull/6) deprecating the argument that used to represent the storage version.

#### ext_storage_next_key

The new version 2 is introduced, deprecating `ext_storage_next_key_version_1`. The signature is

```wat
(func $ext_storage_next_key_version_2
    (param $key_in i64) (param $key_out i64) (result i32))
```
##### Changes

The logic of the function is unchanged since the previous version. The signature has changed to align with the new memory allocation strategy.

##### Arguments

* `key_in` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer containing a storage key;
* `key_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to an output buffer where the next key in the storage in the lexicographical order will be written.

##### Result

The result is the length of the output key, or zero if no next key was found. If the buffer provided in `key_out` is not large enough to accommodate the data, the latter will be truncated, but the full length of the output data will always be returned.

#### ext_default_child_storage_get

The function is deprecated. Users are encouraged to use `ext_default_child_storage_read_version_2` instead.

#### ext_default_child_storage_read

The new version 2 is introduced, deprecating `ext_default_child_storage_read_version_1`. The new signature is

```wat
(func $ext_storage_read_version_2
    (param $storage_key i64) (param $key i64) (param $value_out i64) (param $value_offset i32)
    (result i64))
```

##### Arguments

* `storage_key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the child storage key ([Definition 219](https://spec.polkadot.network/chap-host-api#defn-child-storage-type));
* `key` is the storage key being read;
* `value_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the value read should be stored. If the buffer is not long enough to accommodate the value, the value is truncated to the length of the buffer;
* `value_offset` is a 32-bit offset from which the value reading should start.

##### Result

The result is an optional positive integer ([New Definition I](#new-def-i)), representing either the full length of the value in storage or the _absence_ of such a value in storage.

##### Changes

The logic of the function is unchanged since the previous version. Only the result representation has changed.

#### ext_default_child_storage_storage_kill

The new version 4 is introduced, deprecating `ext_default_child_storage_storage_kill_version_3`. The new signature is

```wat
(func $ext_default_child_storage_storage_kill_version_4
    (param $storage_key i64) (param $maybe_limit i64) (param $maybe_cursor_in i64)
    (param $maybe_cursor_out i64) (param $backend i32) (param $unique i32) (param $loops i32)
    (result i32))
```

##### Arguments

* `storage_key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the child storage key ([Definition 219](https://spec.polkadot.network/chap-host-api#defn-child-storage-type));
* `maybe_limit` is an optional positive integer representing either the maximum number of backend deletions which may happen, or the absence of such a limit. The number of backend iterations may surpass this limit by no more than one;
* `maybe_cursor_in` is an optional pointer-size representing the cursor returned by the previous (unfinished) call to this function. It should be _absent_ on the first call;
* `maybe_cursor_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the continuation cursor will optionally be written (see also the Result section);
* `backend` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of items removed from the backend database will be written;
* `unique` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of unique keys removed, taking into account both the backend and the overlay;
* `loops` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of iterations (each requiring a storage seek/read) which were done will be written.

##### Result

The result represents the length of the continuation cursor which was written to the buffer provided in `maybe_cursor_out`. A zero value represents the absence of such a cursor and no need for continuation (the prefix has been completely cleared). If the buffer is not large enough to accommodate the cursor, the latter will be truncated, but the full length of the cursor will always be returned.

##### Changes

The new version adopts [PPP#7](https://github.com/w3f/PPPs/pull/7), hence the significant change in the function interface with respect to the previous version. The reasoning for such a change was provided in the [original proposal discussion](https://github.com/w3f/polkadot-spec/issues/588).

#### ext_default_child_storage_clear_prefix

The new version 3 is introduced, deprecating `ext_default_child_storage_clear_prefix_version_2`. The new signature is

```wat
(func $ext_default_child_storage_clear_prefix_version_3
    (param $storage_key i64) (param $prefix i64) (param $maybe_limit i64)
    (param $maybe_cursor_in i64) (param $maybe_cursor_out i64) (param $backend i32)
    (param $unique i32) (param $loops i32) (result i32))
```

##### Arguments

* `storage_key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the child storage key ([Definition 219](https://spec.polkadot.network/chap-host-api#defn-child-storage-type));
* `prefix` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) containing a storage prefix being cleared;
* `maybe_limit` is an optional positive integer representing either the maximum number of backend deletions which may happen, or the absence of such a limit. The number of backend iterations may surpass this limit by no more than one;
* `maybe_cursor_in` is an optional pointer-size representing the cursor returned by the previous (unfinished) call to this function. It should be _absent_ on the first call;
* `maybe_cursor_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the continuation cursor will optionally be written (see also the Result section);
* `backend` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of items removed from the backend database will be written;
* `unique` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of unique keys removed, taking into account both the backend and the overlay;
* `loops` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of iterations (each requiring a storage seek/read) which were done will be written.

##### Result

The result represents the length of the continuation cursor which was written to the buffer provided in `maybe_cursor_out`. A zero value represents the absence of such a cursor and no need for continuation (the prefix has been completely cleared). If the buffer is not large enough to accommodate the cursor, the latter will be truncated, but the full length of the cursor will always be returned.

##### Changes

The new version adopts [PPP#7](https://github.com/w3f/PPPs/pull/7), hence the significant change in the function interface with respect to the previous version. The reasoning for such a change was provided in the [original proposal discussion](https://github.com/w3f/polkadot-spec/issues/588).

#### ext_default_child_storage_root

The new version 3 is introduced, deprecating `ext_default_child_storage_root_version_2`. The signature is

```wat
(func $ext_default_child_storage_root_version_3
    (param $storage_key i64) (param $out i64) (result i32))
```

##### Arguments

* `storage_key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the child storage key ([Definition 219](https://spec.polkadot.network/chap-host-api#defn-child-storage-type));
* `out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the SCALE-encoded storage root, calculated after committing all the existing operations, will be stored.

##### Results

The result is the length of the output stored in the buffer provided in `out`. If the buffer is not large enough to accommodate the data, the latter will be truncated, but the full length of the output data will always be returned.

##### Changes

The new version adopts [PPP#6](https://github.com/w3f/PPPs/pull/6) deprecating the argument that used to represent the storage version.

#### ext_default_child_storage_next_key

The new version 2 is introduced, deprecating `ext_default_child_storage_next_key_version_1`. The signature is

```wat
(func $ext_default_child_storage_next_key_version_2
    (param $storage_key i64) (param $key_in i64) (param $key_out i64) (result i32))
```

##### Arguments

* `storage_key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the child storage key ([Definition 219](https://spec.polkadot.network/chap-host-api#defn-child-storage-type));
* `key_in` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer containing a storage key;
* `key_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to an output buffer where the next key in the storage in the lexicographical order will be written.

##### Result

The result is the length of the output key, or zero if no next key was found. If the buffer provided in `key_out` is not large enough to accommodate the data, the latter will be truncated, but the full length of the output data will always be returned.

##### Changes

The logic of the function is unchanged since the previous version. The signature has changed to align with the new memory allocation strategy.

#### ext_trie_{blake2|keccak}\_256_\[ordered_]root

The following functions share the same signatures and set of changes:
* `ext_trie_blake2_256_root`
* `ext_trie_blake2_256_ordered_root`
* `ext_trie_keccak_256_root`
* `ext_trie_keccak_256_ordered_root`

For the aforementioned functions, versions 3 were introduced, and the corresponding versions 2 were deprecated. The signature is:

```wat
(func $ext_trie_{blake2|keccak}_256_[ordered_]root_version_3
    (param $input i64) (param $version i32) (param $out i32))
```

##### Arguments

* `input` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the SCALE-encoded vector of the trie key-value pairs;
* `version` is the state version, where `0` denotes V0 and `1` denotes V1 state version. Other state versions may be introduced in the future;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 32-byte buffer, where the calculated trie root will be stored.

##### Changes

The logic of the function is unchanged since the previous version. The signature has changed to align with the new memory allocation strategy.

#### ext_misc_runtime_version

The new version 2 is introduced, deprecating `ext_default_child_storage_next_key_version_1`. The signature is

```wat
(func $ext_misc_runtime_version_version_2
    (param $wasm i64) (param $out i64) (result i64))
```
##### Arguments

* `wasm` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the Wasm blob from which the version information should be extracted;
* `out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the buffer where the SCALE-encoded extracted version information will be stored.

##### Result

The result is an optional positive integer ([New Definition I](#new-def-i)) representing the length of the output data. If the buffer is not large enough to accommodate the data, the latter will be truncated, but the full length of the output data will always be returned. An _absent_ value represents the absence of the version information in the Wasm blob or a failure to read one.

##### Changes

The logic of the function is unchanged since the previous version. The signature has changed to align with the new memory allocation strategy.

#### ext_crypto_{ed25519|sr25519|ecdsa}_public_keys

The following functions are deprecated:
* `ext_crypto_ed25519_public_keys_version_1`
* `ext_crypto_sr25519_public_keys_version_1`
* `ext_crypto_ecdsa_public_keys_version_1`

Users are encouraged to use the new `*_num_public_keys` and `*_public_key` counterparts.

#### ext_crypto_{ed25519|sr25519|ecdsa}_num_public_keys

New functions, all sharing the same signature and logic, are introduced:
* `ext_crypto_ed25519_num_public_keys_version_1`
* `ext_crypto_sr25519_num_public_keys_version_1`
* `ext_crypto_ecdsa_num_public_keys_version_1`

The signature is:

```wat
(func $ext_crypto_{ed25519|sr25519|ecdsa}_num_public_keys
    (param $id i32) (result i32))
```

##### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)).

##### Result

The result represents a (possibly zero) number of keys of the given type known to the keystore.

#### ext_crypto_{ed25519|sr25519|ecdsa}_public_key

New functions, all sharing the same signature and logic, are introduced:
* `ext_crypto_ed25519_public_key_version_1`
* `ext_crypto_sr25519_public_key_version_1`
* `ext_crypto_ecdsa_public_key_version_1`

The signature is:

```wat
(func $ext_crypto_{ed25519|sr25519|ecdsa}_public_key
    (param $id i32) (param $index i32) (param $out))
```

##### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)).
* `index` is the index of the key in the keystore. If the index is out of bounds (determined by the value returned by the respective `_num_public_keys` function) the function will panic;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer of the respective size (depending on key type) where the key will be written.

#### ext_crypto_{ed25519|sr25519|ecdsa}_generate

The following functions share the same signatures and set of changes:
* `ext_crypto_ed25519_generate`
* `ext_crypto_sr25519_generate`
* `ext_crypto_ecdsa_generate`

For the aforementioned functions, versions 2 are introduced, and the corresponding versions 1 are deprecated. The signature is:

```wat
(func $ext_crypto_{ed25519|sr25519|ecdsa}_generate_version_2
    (param $id i32) (param $seed i64) (param $out i32))
```

##### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid;
* `seed` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the SCALE-encoded Option value ([Definition 200](https://spec.polkadot.network/id-cryptography-encoding#defn-option-type)) containing the BIP-39 seed which must be valid UTF-8. The function will panic if the seed is not valid UTF-8;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer of the respective size (depending on key type) where the generated key will be written.

##### Changes

The logic of the functions is unchanged since the previous version. The signature has changed to align with the new memory allocation strategy.

#### ext_crypto_{ed25519|sr25519|ecdsa}_sign\[_prehashed]

The following functions share the same signatures and set of changes:
* `ext_crypto_ed25519_sign`
* `ext_crypto_sr25519_sign`
* `ext_crypto_ecdsa_sign`
* `ext_crypto_ecdsa_sign_prehashed`

For the aforementioned functions, versions 2 are introduced, and the corresponding versions 1 are deprecated. The signature is:

```wat
(func $ext_crypto_{ed25519|sr25519|ecdsa}_sign{_prehashed|}_version_2
    (param $id i32) (param $pub_key i32) (param $msg i64) (param $out i64) (result i64))
```

##### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid;
* `pub_key` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the public key bytes (as returned by the respective `_public_key` function);
* `msg` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the message that is to be signed;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer of the respective size (depending on key type) where the signature will be written.

##### Result

The function returns `0` on success. On error, `-1` is returned and the output buffer should be considered uninitialized.

##### Changes

The logic of the functions is unchanged since the previous version. The signature has changed to align with the new memory allocation strategy.

#### ext_crypto_secp256k1_ecdsa_recover\[_compressed]

The following functions share the same signatures and set of changes:
* `ext_crypto_secp256k1_ecdsa_recover`
* `ext_crypto_secp256k1_ecdsa_recover_compressed`

For the aforementioned functions, versions 3 are introduced, and the corresponding versions 2 are deprecated. The signature is:

```wat
(func $ext_crypto_secp256k1_ecdsa_recover\[_compressed]_version_3
    (param $sig i32) (param $msg i32) (param $out i32) (result i64))
```

##### Arguments

* `sig` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the buffer containing the 65-byte signature in RSV format. V must be either 0/1 or 27/28;
* `msg` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the buffer containing the 256-bit Blake2 hash of the message;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer of the respective size (depending on key type) where the recovered public key will be written.

##### Result

The function returns `0` on success. On error, it returns a negative ECDSA verification error code, where `-1` stands for incorrect R or S, `-2` stands for invalid V, and `-3` stands for invalid signature.

##### Changes

The signature has changed to align with the new memory allocation strategy. The return error encoding, defined under [Definition 221](https://spec.polkadot.network/chap-host-api#defn-ecdsa-verify-error), is changed to promote the unification of host function result reporting (zero and positive values are for success, and the negative values are for failure codes).

#### ext_hashing_{keccak|sha2|blake2|twox}_{64|128|256|512}

The following functions share the same signatures and set of changes:
* `ext_hashing_keccak_256`
* `ext_hashing_keccak_512`
* `ext_hashing_sha2_256`
* `ext_hashing_blake2_128`
* `ext_hashing_blake2_256`
* `ext_hashing_twox_64`
* `ext_hashing_twox_128`
* `ext_hashing_twox_256`

For the aforementioned functions, versions 2 are introduced, and the corresponding versions 1 are deprecated. The signature is:

```wat
(func $ext_hashing_{keccak|sha2|blake2|twox}_{64|128|256|512}_version_2
    (param $data i64) (param $out i32))
```

##### Arguments

* `data` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the data to be hashed.
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer of the respective size (depending on hash type) where the calculated hash will be written.

##### Changes

The logic of the functions is unchanged since the previous version. The signature has changed to align with the new memory allocation strategy.

#### ext_offchain_submit_transaction

The new version 2 is introduced, deprecating `ext_offchain_submit_transaction_version_1`. The signature is unchanged.

```wat
(func $ext_offchain_submit_transaction_version_2
    (param $data i64) (result i64))
```

##### Arguments

* `data` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the byte array storing the encoded extrinsic.

##### Result

The result is `0` for success or `-1` for failure.

##### Changes

The logic and the signature of the function are unchanged since the previous version. The only change is the interpretation of the result value to avoid an unneeded allocation and promote the unification of host function result reporting (zero and positive values are for success, and the negative values are for failure codes).

#### ext_offchain_network_state

The function is deprecated. Users are encouraged to use `ext_offchain_network_peer_id_version_1` instead.

#### ext_offchain_network_peer_id

A new function is introduced. The signature is

```wat
(func $ext_offchain_submit_transaction_version_2
    (param $out i32) (result i64))
```

##### Arguments

* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer, 38 bytes long, where the network peer ID will be written.

##### Result

The result is `0` for success or `-1` for failure.

#### ext_offchain_random_seed

The new version 2 is introduced, deprecating `ext_offchain_random_seed_version_1`. The signature is unchanged.

```wat
(func $ext_offchain_random_seed_version_2
    (param $out i32))
```

##### Arguments

* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer, 32 bytes long, where the random seed will be written.

##### Changes

The logic of the functions is unchanged since the previous version. The signature has changed to align with the new memory allocation strategy and promote the unification of host function result returning (zero and positive values are for success, and the negative values are for failure codes).

#### ext_offchain_local_storage_get

The function is deprecated. Users are encouraged to use `ext_offchain_local_storage_read_version_1` instead.

#### ext_offchain_local_storage_read

A new function is introduced. The signature is

```wat
(func $ext_offchain_local_storage_read_version_1
    (param $kind i32) (param $key i64) (param $value_out i64) (param $offset i32) (result i64))
```

##### Arguments

* `kind` is an offchain storage kind, where `0` denotes the persistent storage ([Definition 222](https://spec.polkadot.network/chap-host-api#defn-offchain-persistent-storage)), and `1` denotes the local storage ([Definition 223](https://spec.polkadot.network/chap-host-api#defn-offchain-persistent-storage));
* `key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the storage key being read;
* `value_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the value read should be stored. If the buffer is not large enough to accommodate the value, the value is truncated to the length of the buffer;
* `offset` is a 32-bit offset from which the value reading should start.

##### Result

The result is an optional positive integer ([New Definition I](#new-def-i)), representing either the full length of the value in storage or the _absence_ of such a value in storage.

#### ext_offchain_http_request_start

The new version 2 is introduced, deprecating `ext_offchain_http_request_start_version_1`. The signature is unchanged.

```wat
(func $ext_offchain_http_request_start_version_2
    (param $method i64) (param $uri i64) (param $meta i64) (result i64))
```

##### Arguments

`method` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the HTTP method. Possible values are “GET” and “POST”;
`uri` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the URI;
`meta` is a future-reserved field containing additional, SCALE-encoded parameters. Currently, an empty array should be passed.

##### Result

On success, a positive request identifier is returned. On error, `-1` is returned.

##### Changes

The logic and the signature of the function are unchanged since the previous version. The only change is the interpretation of the result value to avoid an unneeded allocation and promote the unification of host function result returning (zero and positive values are for success, and the negative values are for failure codes).

#### ext_offchain_http_request_add_header

The new version 2 is introduced, deprecating `ext_offchain_http_request_add_header_version_1`. The signature is unchanged.

```wat
(func $ext_offchain_http_request_add_header_version_2
    (param $request_id i32) (param $name i64) (param $value i64) (result i64))
```

##### Arguments

* `request_id` is an i32 integer indicating the ID of the started request, as returned by `ext_offchain_http_request_start`;
* `name` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the HTTP header name;
* `value` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the HTTP header value.

##### Result

The result is `0` for success or `-1` for failure.

##### Changes

The logic and the signature of the function are unchanged since the previous version. The only change is the interpretation of the result value to avoid an unneeded allocation and promote the unification of host function result returning (zero and positive values are for success, and the negative values are for failure codes).

#### ext_offchain_http_request_write_body

The new version 2 is introduced, deprecating `ext_offchain_http_request_write_body_version_1`. The signature is unchanged.

```wat
(func $ext_offchain_http_request_write_body_version_2
    (param $request_id i32) (param $chunk i64) (param $deadline i64) (result i64))
```

##### Arguments

* `request_id` is an i32 integer indicating the ID of the started request, as returned by `ext_offchain_http_request_start`;
* `chunk` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the chunk of bytes. Writing an empty chunk finalizes the request;
* `deadline` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the SCALE-encoded Option value ([Definition 200](https://spec.polkadot.network/id-cryptography-encoding#defn-option-type)) containing the UNIX timestamp ([Definition 191](https://spec.polkadot.network/id-cryptography-encoding#defn-unix-time)). Passing `None` blocks indefinitely.

##### Result

On success, `0` is returned. On failure, a negative error code is returned, where `-1` denotes the deadline was reached, `-2` denotes that an I/O error occurred, and `-3` denotes that the request ID provided was invalid.

##### Changes

The logic and the signature of the function are unchanged since the previous version. The only change is the interpretation of the result value to avoid an unneeded allocation and promote the unification of host function result returning (zero and positive values are for success, and the negative values are for failure codes).

#### ext_offchain_http_request_wait

The new version 2 is introduced, deprecating `ext_offchain_http_request_wait_version_1`. The signature is:

```wat
(func $ext_offchain_http_request_wait_version_2
    (param $ids i64) (param $deadline i64) (param $out i64))
```

##### Arguments

* `ids` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the SCALE-encoded array of started request IDs, as returned by `ext_offchain_http_request_start`;
* `deadline` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the SCALE-encoded Option value ([Definition 200](https://spec.polkadot.network/id-cryptography-encoding#defn-option-type)) containing the UNIX timestamp ([Definition 191](https://spec.polkadot.network/id-cryptography-encoding#defn-unix-time)). Passing `None` blocks indefinitely;
* `out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the buffer of `i32` integers where the request statuses will be stored. The number of elements of the buffer must be strictly equal to the number of elements in the `ids` array; otherwise, the function panics.

##### Changes

The logic of the functions is unchanged since the previous version. The signature has changed to align with the new memory allocation strategy.

#### ext_offchain_http_response_read_body

The new version 2 is introduced, deprecating `ext_offchain_http_response_read_body_version_1`. The signature is unchanged.

```wat
(func $ext_offchain_http_response_read_body_version_2
    (param $request_id i32) (param $buffer i64) (param $deadline i64) (result i64))
```

##### Arguments

* `request_id` is an i32 integer indicating the ID of the started request, as returned by `ext_offchain_http_request_start`;
* `buffer` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the buffer where the body is written;
* `deadline` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the SCALE-encoded Option value ([Definition 200](https://spec.polkadot.network/id-cryptography-encoding#defn-option-type)) containing the UNIX timestamp ([Definition 191](https://spec.polkadot.network/id-cryptography-encoding#defn-unix-time)). Passing `None` blocks indefinitely.

##### Result

On success, the number of bytes written to the buffer is returned. A value of `0` means the entire response was consumed and no further calls to the function are needed for the provided request ID. On failure, a negative error code is returned, where `-1` denotes the deadline was reached, `-2` denotes that an I/O error occurred, and `-3` denotes that the request ID provided was invalid.

##### Changes

The logic and the signature of the function are unchanged since the previous version. The only change is the interpretation of the result value to avoid an unneeded allocation and promote the unification of host function result returning (zero and positive values are for success, and the negative values are for failure codes).

#### ext_allocator_{malloc|free}

The functions are deprecated and must not be used in new code.

#### ext_input_read

A new function is introduced. The signature is

```wat
(func $ext_input_read_version_1
    (param $buffer i64))
```

##### Arguments

* `buffer` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the buffer where the input data will be written. If the buffer is not large enough to accommodate the input data, the function will panic.

### Other changes

Currently, all runtime entrypoints have the following identical Wasm function signatures:

```wat
(func $runtime_entrypoint (param $data i32) (param $len i32) (result i64))
```

After this RFC is implemented, such entrypoints are still supported, but considered deprecated. New entrypoints must have the following signature:

```wat
(func $runtime_entrypoint (param $len i32) (result i64))
```

A runtime function called through such an entrypoint gets the length of SCALE-encoded input data as its only argument. After that, the function must allocate exactly the amount of bytes it is requested, and call the `ext_input_read` host function to obtain the encoded input data.
