# RFC-0145: Remove the host-side runtime memory allocator

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2025-05-16                                                                                   |
| **Description** | Update the runtime-host interface to no longer make use of a host-side allocator            |
| **Authors**     | Pierre Krieger, Someone Unknown                                                             |
## Summary

Update the runtime-host interface so that it no longer uses the host-side allocator.

## Prior Art

The API of these new functions was heavily inspired by the API used by the C programming language.

This RFC is mainly based on [RFC-4](https://github.com/polkadot-fellows/RFCs/pull/4) by @tomaka, which has never been adopted, and supercedes it.

### Changes

* The original RFC required checking if an output buffer address provided to a host function is inside the VM address space range and to stop the runtime execution if that's not the case. That requirement has been removed in this version of the RFC, as in the general case, the host doesn't have exhaustive information about the VM's memory organization. Thus, attempting to write to an out-of-bound region will result in a "normal" runtime panic.
* Function signatures introduced by [PPP#7](https://github.com/w3f/PPPs/pull/7) have been used in this RFC, as the PPP has already been [properly implemented](https://github.com/paritytech/substrate/pull/11490) and [documented](https://github.com/w3f/polkadot-spec/pull/592/files). However, it has never been officially adopted, nor have its functions been in use.
* For `*_next_key` input buffer is reused for output.
* Error codes were harmonized to be always represented by negative values.
* Return values were harmonized to `i64` everywhere where they represent either a positive outcome as a positive integer or a negative outcome as a negative error code.
* `ext_offchain_network_peer_id_version_1` now returns a result code instead of silently failing if the network status is unavailable.
* Added new versions of `ext_misc_runtime_version` and `ext_offchain_random_seed`.
* Addressed discussions from the original RFC-4 discussion flow.

## Motivation

The heap allocation of the runtime is currently controlled by the host using a memory allocator on the host side.

The API of many host functions contains buffer allocations. For example, when calling `ext_hashing_twox_256_version_1`, the host allocates a 32-byte buffer using the host allocator, and returns a pointer to this buffer to the runtime. The runtime later has to call `ext_allocator_free_version_1` on this pointer to free the buffer.

Even though no benchmark has been done, it is pretty obvious that this design is very inefficient. To continue with the example of `ext_hashing_twox_256_version_1`, it would be more efficient to instead write the output hash to a buffer allocated by the runtime on its stack and passed by pointer to the function. Allocating a buffer on the stack in the worst-case scenario consists of simply decreasing a number; in the best-case scenario, it is free. Doing so would save many VM memory reads and writes by the allocator, and would save a function call to `ext_allocator_free_version_1`.

Furthermore, the existence of the host-side allocator has become questionable over time. It is implemented in a very naive way, and for determinism and backwards compatibility reasons, it needs to be implemented exactly identically in every client implementation. Runtimes make substantial use of heap memory allocations, and each allocation needs to go through the runtime <-> host boundary twice (once for allocating and once for freeing). Moving the allocator to the runtime side would be a good idea, although it would increase the runtime size. But before the host-side allocator can be deprecated, all the host functions that use it must be updated to avoid using it.

## Stakeholders

No attempt was made to convince stakeholders.

## Explanation

### New host functions

This section contains a list of new host functions to introduce and amendments to the existing ones.

```wat
(func $ext_storage_read_version_2
    (param $key i64) (param $value_out i64) (param $offset i32) (result i64))
(func $ext_default_child_storage_read_version_2
    (param $child_storage_key i64) (param $key i64) (param $value_out i64)
    (param $offset i32) (result i64))
```

The signature and behaviour of `ext_storage_read_version_2` and `ext_default_child_storage_read_version_2` are identical to their version 1 counterparts, but the return value has a different meaning.

The new functions directly return the number of bytes written into the `value_out` buffer. If the entry doesn't exist, `-1` is returned. Given that the host must never write more bytes than the size of the buffer in `value_out`, and that the size of this buffer is expressed as a 32-bit number, the 64-bit value of `-1` is not ambiguous.

```wat
(func $ext_storage_next_key_version_2
    (param $key_in_out i64) (return i32))
(func $ext_default_child_storage_next_key_version_2
    (param $child_storage_key i64) (param $key_in_out i64) (return i32))
```

The behaviour of these functions is identical to their version 1 counterparts.

Instead of allocating a buffer, writing the next key to it, and returning a pointer to it, the new version of these functions accepts an `key_in_out` parameter containing [a pointer-size](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size) to the memory location where the host first reads the input from, and then writes the output to.

These functions return the size, in bytes, of the next key, or `0` if there is no next key. If the size of the next key is larger than the buffer in `key_in_out`, the bytes of the key that fit the buffer are written to `key_in_out`, and any extra bytes that don't fit are discarded.

Some notes:

- It is never possible for the next key to be an empty buffer, because an empty key has no preceding key. For this reason, a return value of `0` can unambiguously be used to indicate the lack of the next key.
- The `ext_storage_next_key_version_2` and `ext_default_child_storage_next_key_version_2` are typically used to enumerate keys that start with a certain prefix. Since storage keys are constructed by concatenating hashes, the runtime is expected to know the size of the next key and can allocate a buffer that can fit said key. When the next key doesn't belong to the desired prefix, it might not fit the buffer, but given that the start of the key is written to the buffer anyway, this can be detected to avoid calling the function the second time with a larger buffer.

```wat
(func $ext_hashing_keccak_256_version_2
    (param $data i64) (param $out i32))
(func $ext_hashing_keccak_512_version_2
    (param $data i64) (param $out i32))
(func $ext_hashing_sha2_256_version_2
    (param $data i64) (param $out i32))
(func $ext_hashing_blake2_128_version_2
    (param $data i64) (param $out i32))
(func $ext_hashing_blake2_256_version_2
    (param $data i64) (param $out i32))
(func $ext_hashing_twox_64_version_2
    (param $data i64) (param $out i32))
(func $ext_hashing_twox_128_version_2
    (param $data i64) (param $out i32))
(func $ext_hashing_twox_256_version_2
    (param $data i64) (param $out i32))
(func $ext_trie_blake2_256_root_version_3
    (param $data i64) (param $version i32) (param $out i32))
(func $ext_trie_blake2_256_ordered_root_version_3
    (param $data i64) (param $version i32) (param $out i32))
(func $ext_trie_keccak_256_root_version_3
    (param $data i64) (param $version i32) (param $out i32))
(func $ext_trie_keccak_256_ordered_root_version_3
    (param $data i64) (param $version i32) (param $out i32))
(func $ext_crypto_ed25519_generate_version_2
    (param $key_type_id i32) (param $seed i64) (param $out i32))
(func $ext_crypto_sr25519_generate_version_2
    (param $key_type_id i32) (param $seed i64) (param $out i32) (return i32))
(func $ext_crypto_ecdsa_generate_version_2
    (param $key_type_id i32) (param $seed i64) (param $out i32) (return i32))
```

The behaviour of these functions is identical to their version 1 or version 2 counterparts. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the new version of these functions accepts an `out` parameter containing the memory location where the host writes the output. The output is always of a size known at compilation time.

```wat
(func $ext_default_child_storage_root_version_3
    (param $child_storage_key i64) (param $out i32))
(func $ext_storage_root_version_3
    (param $out i32))
```

The behaviour of these functions is identical to their version 1 and version 2 counterparts. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the new versions of these functions accept an `out` parameter containing the memory location where the host writes the output. The output is always of a size known at compilation time.

The version 1 of these functions has been taken as a base rather than the version 2, as a [PPP#6](https://github.com/w3f/PPPs/pull/6) deprecating the version 2 of these functions has previously been accepted.

```wat
(func $ext_storage_clear_prefix_version_3
    (param $maybe_prefix i64) (param $maybe_limit i64)
    (param $maybe_cursor_in i64) (param $removal_results_out i32))
(func $ext_default_child_storage_clear_prefix_version_3
    (param $child_storage_key i64) (param $prefix i64) (param $maybe_limit i64)
    (param $maybe_cursor_in i64) (param $removal_results_out i32))
(func $ext_default_child_storage_kill_version_4
    (param $child_storage_key i64) (param $maybe_limit i64)
    (param $maybe_cursor_in i64) (param $removal_results_out i32))
```

These functions amend already implemented but still unused functions introduced by [PPP#7](https://github.com/w3f/PPPs/pull/7), hence there's no version number change. `maybe_limit` defines the limit of backend deletions, not counting keys in the current overlay. `maybe_cursor_in` may be used to pass a continuation cursor. After the operation is completed, a SCALE-encoded [varying data](https://spec.polkadot.network/id-cryptography-encoding#defn-varrying-data-type) are written to the provided output buffer. The varying data consists from the following fields, in order:

* [Optional](https://spec.polkadot.network/id-cryptography-encoding#defn-option-type) continuation cursor. Absence of the cursor denotes the end of the operation;
* 32-bit unsigned integer representing the number of items removed from the backend DB;
* 32-bit unsigned integer representing the number of unique keys removes, including overlay;
* 32-bit unsigned integer representing the number of iterations done.

The size of the output buffer must be determined at the compile time. If the SCALE-encoded data do not fit into the buffer, the data are silently trucated. The caller may determine the truncation by checking the value length data contained in the SCALE-encoded data header.
 
```wat
(func $ext_crypto_ed25519_sign_version_2
    (param $key_type_id i32) (param $key i32) (param $msg i64) (param $out i32) (return i32))
(func $ext_crypto_sr25519_sign_version_2
    (param $key_type_id i32) (param $key i32) (param $msg i64) (param $out i32) (return i32))
(func $ext_crypto_ecdsa_sign_version_2
    (param $key_type_id i32) (param $key i32) (param $msg i64) (param $out i32) (return i32))
(func $ext_crypto_ecdsa_sign_prehashed_version_2
    (param $key_type_id i32) (param $key i32) (param $msg i64) (param $out i32) (return i64))
```

The behaviour of these functions is identical to their version 1 counterparts. The new versions of these functions accept an `out` parameter containing the memory location where the host writes the signature. The signatures are always of a size known at compilation time. On success, these functions return `0`. If the public key can't be found in the keystore, these functions return `1` and do not write anything to `out`.

Note that the return value is `0` on success and `1` on failure, while the previous version of these functions wrote `1` on success (as it represents a SCALE-encoded `Some`) and `0` on failure (as it represents a SCALE-encoded `None`). Returning `0` on success and non-zero on failure is consistent with standard practices in the C programming language and is less surprising than the opposite.

```wat
(func $ext_crypto_secp256k1_ecdsa_recover_version_3
    (param $sig i32) (param $msg i32) (param $out i32) (return i32))
(func $ext_crypto_secp256k1_ecdsa_recover_compressed_version_3
    (param $sig i32) (param $msg i32) (param $out i32) (return i32))
```

The behaviour of these functions is identical to their version 2 counterparts. The new versions of these functions accept an `out` parameter containing the memory location where the host writes the signature. The signatures are always of a size known at compilation time. On success, these functions return `0`. On failure, these functions return a non-zero value and do not write anything to `out`.

The non-zero value written on failure is:

- 1: incorrect value of R or S
- 2: incorrect value of V
- 3: invalid signature

These values are equal to the values returned on error by the version 2 (see <https://spec.polkadot.network/chap-host-api#defn-ecdsa-verify-error>), but incremented by 1 to reserve 0 for success.

```wat
(func $ext_crypto_ed25519_num_public_keys_version_1
    (param $key_type_id i32) (return i32))
(func $ext_crypto_ed25519_public_key_version_1
    (param $key_type_id i32) (param $key_index i32) (param $out i32))
(func $ext_crypto_sr25519_num_public_keys_version_1
    (param $key_type_id i32) (return i32))
(func $ext_crypto_sr25519_public_key_version_1
    (param $key_type_id i32) (param $key_index i32) (param $out i32))
(func $ext_crypto_ecdsa_num_public_keys_version_1
    (param $key_type_id i32) (return i32))
(func $ext_crypto_ecdsa_public_key_version_1
    (param $key_type_id i32) (param $key_index i32) (param $out i32))
```

The functions supersede the `ext_crypto_ed25519_public_key_version_1`, `ext_crypto_sr25519_public_key_version_1`, and `ext_crypto_ecdsa_public_key_version_1` host functions.

Instead of calling `ext_crypto_ed25519_public_key_version_1` to obtain the list of all the keys at once, the runtime should instead call `ext_crypto_ed25519_num_public_keys_version_1` to get the number of public keys available, then `ext_crypto_ed25519_public_key_version_1` repeatedly.
The `ext_crypto_ed25519_public_key_version_1` function writes the public key of the given `key_index` to the memory location designated by `out`. The `key_index` must be between 0 (included) and `n` (excluded), where `n` is the value returned by `ext_crypto_ed25519_num_public_keys_version_1`. Execution must trap if `n` is out of range.

The same explanations apply for `ext_crypto_sr25519_public_key_version_1` and `ext_crypto_ecdsa_public_key_version_1`.

Host implementers should be aware that the list of public keys (including their ordering) must not change while the runtime is running. That is most likely done by copying the list of all available keys either at the start of the execution or the first time the list is accessed.

```wat
(func $ext_offchain_http_request_start_version_2
  (param $method i64) (param $uri i64) (param $meta i64) (result i64))
```

The behaviour of this function is identical to its version 1 counterpart. Instead of allocating a buffer, writing the request identifier in it, and returning a pointer to it, version 2 of this function simply returns the newly-assigned identifier to the HTTP request. On failure, this function returns `-1`. An identifier of `-1` is invalid and is reserved to indicate failure.

```wat
(func $ext_offchain_http_request_write_body_version_2
  (param $method i64) (param $uri i64) (param $meta i64) (result i64))
(func $ext_offchain_http_response_read_body_version_2
  (param $request_id i32) (param $buffer i64) (param $deadline i64) (result i64))
```

The behaviour of these functions is identical to their version 1 counterpart. Instead of allocating a buffer, writing two bytes in it, and returning a pointer to it, the new version of these functions simply indicates what happened:

- For `ext_offchain_http_request_write_body_version_2`, 0 on success.
- For `ext_offchain_http_response_read_body_version_2`, 0 or a non-zero number of bytes on success.
- -1 if the deadline was reached.
- -2 if there was an I/O error while processing the request.
- -3 if the identifier of the request is invalid.

These values are equal to the values returned on error by version 1 (see <https://spec.polkadot.network/chap-host-api#defn-http-error>), but tweaked to reserve positive numbers for success.

When it comes to `ext_offchain_http_response_read_body_version_2`, the host implementers must not read too much data at once to avoid ambiguity in the returned value. Given that the `buffer` size is always inferior or equal to 4 GiB, this is not a problem.

```wat
(func $ext_offchain_http_response_wait_version_2
    (param $ids i64) (param $deadline i64) (param $out i32))
```

The behaviour of this function is identical to its version 1 counterpart. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the new version of this function accepts an `out` parameter containing the memory location where the host writes the output.

The encoding of the response code is also modified compared to its version 1 counterpart, and each response code now encodes up to 4 little-endian bytes as described below:

- 100-999: The request has finished with the given HTTP status code.
- -1: The deadline was reached.
- -2: There was an I/O error while processing the request.
- -3: The identifier of the request is invalid.

The buffer passed to `out` must always have a size of `4 * n` where `n` is the number of elements in the `ids`.

```wat
(func $ext_offchain_http_response_header_name_version_1
    (param $request_id i32) (param $header_index i32) (param $out i64) (result i64))
(func $ext_offchain_http_response_header_value_version_1
    (param $request_id i32) (param $header_index i32) (param $out i64) (result i64))
```

These functions supersede the `ext_offchain_http_response_headers_version_1` host function.

Contrary to `ext_offchain_http_response_headers_version_1`, only one header indicated by `header_index` can be read at a time. Instead of calling `ext_offchain_http_response_headers_version_1` once, the runtime should call `ext_offchain_http_response_header_name_version_1` and `ext_offchain_http_response_header_value_version_1` multiple times with an increasing `header_index`, until a value of `-1` is returned.

These functions accept an `out` parameter containing [a pointer-size](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size) to the memory location where the header name or value should be written.

These functions return the size, in bytes, of the header name or header value. If the request doesn't exist or is in an invalid state (as documented for `ext_offchain_http_response_headers_version_1`) or the `header_index` is out of range, a value of `-1` is returned. Given that the host must never write more bytes than the size of the buffer in `out`, and that the size of this buffer is expressed as a 32-bit number, a 64-bit value of `-1` is not ambiguous.

If the buffer in `out` is too small to fit the entire header name or value, only the bytes that fit are written, and the rest are discarded.

```wat
(func $ext_offchain_submit_transaction_version_2
    (param $data i64) (return i32))
(func $ext_offchain_http_request_add_header_version_2
    (param $request_id i32) (param $name i64) (param $value i64) (result i64))
```

Instead of allocating a buffer, writing `1` or `0` in it, and returning a pointer to it, the version 2 of these functions returns `0` or `-1`, where `0` indicates success and `-1` indicates failure.

```wat
(func $ext_offchain_local_storage_read_version_1
    (param $kind i32) (param $key i64) (param $value_out i64) (param $offset i32) (result i64))
```

This function supercedes the `ext_offchain_local_storage_get_version_1` host function, and uses an API and logic similar to `ext_storage_read_version_2`.

It reads the offchain local storage key indicated by `kind` and `key` starting at the byte indicated by `offset`, and writes the value to the [pointer-size](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size) indicated by `value_out`.

The function returns the number of bytes written into the `value_out` buffer. If the entry doesn't exist, the `-1` value is returned. Given that the host must never write more bytes than the size of the buffer in `value_out`, and that the size of this buffer is expressed as a 32-bit number, a 64-bit value of `-1` is not ambiguous.

```wat
(func $ext_offchain_network_peer_id_version_1
    (param $out i64) (result i64))
```

This function writes [the `PeerId` of the local node](https://spec.polkadot.network/chap-networking#id-node-identities) to the memory location indicated by `out`. A `PeerId` is always 38 bytes long. This function returns `0` on success or `-1` if the network state is unavailable.

```wat
(func $ext_misc_runtime_version_version_2
    (param $wasm i64) (param $out i64) (result i64))
```

The behaviour of this function is identical to its version 1 counterpart. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the new version of this function accepts an `out` parameter containing [pointer-size](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size) to the memory location where the host writes the output. If the output buffer is not large enough, the version information is truncated. Returns the length of the encoded version information, or `-1` in case of any failure.

```wat
(func $ext_offchain_random_seed_version_2 (param $out i32))
```

The behaviour of this function is identical to its version 1 counterpart. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the new version of this function accepts an `out` parameter containing the address of the memory location where the host writes the output. The size is output is always 32 bytes.

```wat
(func $ext_misc_input_read_version_1
    (param $offset i64) (param $out i64) (result i64))
```

When a runtime function is called, the host uses the allocator to allocate memory within the runtime to write some input data. The new host function provides an alternative way to access the input that doesn't use the allocator.

The function copies some data from the input data to the runtime's memory. The `offset` parameter indicates the offset within the input data from which to start copying, and must lie inside the output buffer provided. The `out` parameter is [a pointer-size](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size) and contains the buffer where to write.

The runtime execution stops with an error if `offset` is strictly greater than the input data size.

The return value is the number of bytes written unless `out` has zero length, in which case the full length of input data in bytes is returned, and nothing is written into the output buffer.

### Other changes

In addition to the new host functions, this RFC proposes two changes to the runtime-host interface:

- The following function signature is now also accepted for runtime entry points: `(func (result i64))`.
- Runtimes no longer need to expose a constant named `__heap_base`.

All the host functions superseded by new host functions are now considered deprecated and should no longer be used.

The following other host functions are also considered deprecated:

- `ext_storage_get_version_1`
- `ext_storage_changes_root_version_1`
- `ext_default_child_storage_get_version_1`
- `ext_allocator_malloc_version_1`
- `ext_allocator_free_version_1`
- `ext_offchain_network_state_version_1`

## Unresolved Questions

The changes in this RFC would need to be benchmarked. That involves implementing the RFC and measuring the speed difference.

It is expected that most host functions are faster or equal in speed to their deprecated counterparts, with the following exceptions:

- `ext_misc_input_read_version_1` is inherently slower than obtaining a buffer with the entire data due to the two extra function calls and the extra copying. However, given that this only happens once per runtime call, the cost is expected to be negligible.

- The `ext_crypto_*_public_keys`, `ext_offchain_network_state`, and `ext_offchain_http_*` host functions are likely slightly slower than their deprecated counterparts, but given that they are used only in offchain workers, that is acceptable.

- It is unclear how replacing `ext_storage_get` with `ext_storage_read` and `ext_default_child_storage_get` with `ext_default_child_storage_read` will impact performance.

- It is unclear how the changes to `ext_storage_next_key` and `ext_default_child_storage_next_key` will impact performance.

