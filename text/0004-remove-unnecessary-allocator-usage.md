# RFC-0004: Remove the host-side runtime memory allocator

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2023-07-04                                                                                  |
| **Description** | Update the runtime-host interface to no longer make use of a host-side allocator            |
| **Authors**     | Pierre Krieger                                                                              |

## Summary

Update the runtime-host interface to no longer make use of a host-side allocator.

## Motivation

The heap allocation of the runtime is currently controlled by the host using a memory allocator on the host side.

The API of many host functions consists in allocating a buffer. For example, when calling `ext_hashing_twox_256_version_1`, the host allocates a 32 bytes buffer using the host allocator, and returns a pointer to this buffer to the runtime. The runtime later has to call `ext_allocator_free_version_1` on this pointer in order to free the buffer.

Even though no benchmark has been done, it is pretty obvious that this design is very inefficient. To continue with the example of `ext_hashing_twox_256_version_1`, it would be more efficient to instead write the output hash to a buffer that was allocated by the runtime on its stack and passed by pointer to the function. Allocating a buffer on the stack in the worst case scenario simply consists in decreasing a number, and in the best case scenario is free. Doing so would save many Wasm memory reads and writes by the allocator, and would save a function call to `ext_allocator_free_version_1`.

Furthermore, the existence of the host-side allocator has become questionable over time. It is implemented in a very naive way, and for determinism and backwards compatibility reasons it needs to be implemented exactly identically in every client implementation. Runtimes make substantial use of heap memory allocations, and each allocation needs to go twice through the runtime <-> host boundary (once for allocating and once for freeing). Moving the allocator to the runtime side, while it would increase the size of the runtime, would be a good idea. But before the host-side allocator can be deprecated, all the host functions that make use of it need to be updated to not use it.

## Stakeholders

No attempt was made at convincing stakeholders.

## Explanation

### New host functions

This section contains a list of new host functions to introduce.

```wat
(func $ext_storage_read_version_2
    (param $key i64) (param $value_out i64) (param $offset i32) (result i64))
(func $ext_default_child_storage_read_version_2
    (param $child_storage_key i64) (param $key i64) (param $value_out i64)
    (param $offset i32) (result i64))
```

The signature and behaviour of `ext_storage_read_version_2` and `ext_default_child_storage_read_version_2` is identical to their version 1 counterparts, but the return value has a different meaning.
The new functions directly return the number of bytes that were written in the `value_out` buffer. If the entry doesn't exist, a value of `-1` is returned. Given that the host must never write more bytes than the size of the buffer in `value_out`, and that the size of this buffer is expressed as a 32 bits number, a 64bits value of `-1` is not ambiguous.

The runtime execution stops with an error if `value_out` is outside of the range of the memory of the virtual machine, even if the size of the buffer is 0 or if the amount of data to write would be 0 bytes.

```wat
(func $ext_storage_next_key_version_2
    (param $key i64) (param $out i64) (return i32))
(func $ext_default_child_storage_next_key_version_2
    (param $child_storage_key i64) (param $key i64) (param $out i64) (return i32))
```

The behaviour of these functions is identical to their version 1 counterparts.
Instead of allocating a buffer, writing the next key to it, and returning a pointer to it, the new version of these functions accepts an `out` parameter containing [a pointer-size](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size) to the memory location where the host writes the output. The runtime execution stops with an error if `out` is outside of the range of the memory of the virtual machine, even if the function wouldn't write anything to `out`.
These functions return the size, in bytes, of the next key, or `0` if there is no next key. If the size of the next key is larger than the buffer in `out`, the bytes of the key that fit the buffer are written to `out` and any extra byte that doesn't fit is discarded.

Some notes:

- It is never possible for the next key to be an empty buffer, because an empty key has no preceding key. For this reason, a return value of `0` can unambiguously be used to indicate the lack of next key.
- The `ext_storage_next_key_version_2` and `ext_default_child_storage_next_key_version_2` are typically used in order to enumerate keys that starts with a certain prefix. Given that storage keys are constructed by concatenating hashes, the runtime is expected to know the size of the next key and can allocate a buffer that can fit said key. When the next key doesn't belong to the desired prefix, it might not fit the buffer, but given that the start of the key is written to the buffer anyway this can be detected in order to avoid calling the function a second time with a larger buffer.

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
(func $ext_default_child_storage_root_version_3
    (param $child_storage_key i64) (param $out i32))
(func $ext_crypto_ed25519_generate_version_2
    (param $key_type_id i32) (param $seed i64) (param $out i32))
(func $ext_crypto_sr25519_generate_version_2
    (param $key_type_id i32) (param $seed i64) (param $out i32) (return i32))
(func $ext_crypto_ecdsa_generate_version_2
    (param $key_type_id i32) (param $seed i64) (param $out i32) (return i32))
```

The behaviour of these functions is identical to their version 1 or version 2 counterparts. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the new version of these functions accepts an `out` parameter containing the memory location where the host writes the output. The output is always of a size known at compilation time. The runtime execution stops with an error if `out` is outside of the range of the memory of the virtual machine.

```wat
(func $ext_default_child_storage_root_version_3
    (param $child_storage_key i64) (param $out i32))
(func $ext_storage_root_version_3
    (param $out i32))
```

The behaviour of these functions is identical to their version 1 and version 2 counterparts. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the new versions of these functions accepts an `out` parameter containing the memory location where the host writes the output. The output is always of a size known at compilation time. The runtime execution stops with an error if `out` is outside of the range of the memory of the virtual machine.

I have taken the liberty to take the version 1 of these functions as a base rather than the version 2, as a PPP deprecating the version 2 of these functions has previously been accepted: <https://github.com/w3f/PPPs/pull/6>.

```wat
(func $ext_storage_clear_prefix_version_3
    (param $prefix i64) (param $limit i64) (param $removed_count_out i32)
    (return i32))
(func $ext_default_child_storage_clear_prefix_version_3
    (param $child_storage_key i64) (param $prefix i64)
    (param $limit i64)  (param $removed_count_out i32) (return i32))
(func $ext_default_child_storage_kill_version_4
    (param $child_storage_key i64) (param $limit i64)
    (param $removed_count_out i32) (return i32))
```

The behaviour of these functions is identical to their version 2 and 3 counterparts. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the version 3 and 4 of these functions accepts a `removed_count_out` parameter containing the memory location to a 8 bytes buffer where the host writes the number of keys that were removed in little endian. The runtime execution stops with an error if `removed_count_out` is outside of the range of the memory of the virtual machine. The functions return 1 to indicate that there are keys remaining, and 0 to indicate that all keys have been removed.

Note that there is an alternative proposal to add new host functions with the same names: <https://github.com/w3f/PPPs/pull/7>. This alternative doesn't conflict with this one except for the version number. One proposal or the other will have to use versions 4 and 5 rather than 3 and 4.

```wat
(func $ext_crypto_ed25519_sign_version_2
    (param $key_type_id i32) (param $key i32) (param $msg i64) (param $out i32) (return i32))
(func $ext_crypto_sr25519_sign_version_2
    (param $key_type_id i32) (param $key i32) (param $msg i64) (param $out i32) (return i32))
func $ext_crypto_ecdsa_sign_version_2
    (param $key_type_id i32) (param $key i32) (param $msg i64) (param $out i32) (return i32))
(func $ext_crypto_ecdsa_sign_prehashed_version_2
    (param $key_type_id i32) (param $key i32) (param $msg i64) (param $out i32) (return i64))
```

The behaviour of these functions is identical to their version 1 counterparts. The new versions of these functions accept an `out` parameter containing the memory location where the host writes the signature. The runtime execution stops with an error if `out` is outside of the range of the memory of the virtual machine, even if the function wouldn't write anything to `out`. The signatures are always of a size known at compilation time. On success, these functions return `0`. If the public key can't be found in the keystore, these functions return `1` and do not write anything to `out`.

Note that the return value is 0 on success and 1 on failure, while the previous version of these functions write 1 on success (as it represents a SCALE-encoded `Some`) and 0 on failure (as it represents a SCALE-encoded `None`). Returning 0 on success and non-zero on failure is consistent with common practices in the C programming language and is less surprising than the opposite.

```wat
(func $ext_crypto_secp256k1_ecdsa_recover_version_3
    (param $sig i32) (param $msg i32) (param $out i32) (return i64))
(func $ext_crypto_secp256k1_ecdsa_recover_compressed_version_3
    (param $sig i32) (param $msg i32) (param $out i32) (return i64))
```

The behaviour of these functions is identical to their version 2 counterparts. The new versions of these functions accept an `out` parameter containing the memory location where the host writes the signature. The runtime execution stops with an error if `out` is outside of the range of the memory of the virtual machine, even if the function wouldn't write anything to `out`. The signatures are always of a size known at compilation time. On success, these functions return `0`. On failure, these functions return a non-zero value and do not write anything to `out`.

The non-zero value written on failure is:

- 1: incorrect value of R or S
- 2: incorrect value of V
- 3: invalid signature

These values are equal to the values returned on error by the version 2 (see <https://spec.polkadot.network/chap-host-api#defn-ecdsa-verify-error>), but incremented by 1 in order to reserve 0 for success.

```wat
(func $ext_crypto_ed25519_num_public_keys_version_1
    (param $key_type_id i32) (return i32))
(func $ext_crypto_ed25519_public_key_version_2
    (param $key_type_id i32) (param $key_index i32) (param $out i32))
(func $ext_crypto_sr25519_num_public_keys_version_1
    (param $key_type_id i32) (return i32))
(func $ext_crypto_sr25519_public_key_version_2
    (param $key_type_id i32) (param $key_index i32) (param $out i32))
(func $ext_crypto_ecdsa_num_public_keys_version_1
    (param $key_type_id i32) (return i32))
(func $ext_crypto_ecdsa_public_key_version_2
    (param $key_type_id i32) (param $key_index i32) (param $out i32))
```

The functions superceded the `ext_crypto_ed25519_public_key_version_1`, `ext_crypto_sr25519_public_key_version_1`, and `ext_crypto_ecdsa_public_key_version_1` host functions.

Instead of calling `ext_crypto_ed25519_public_key_version_1` in order to obtain the list of all keys at once, the runtime should instead call `ext_crypto_ed25519_num_public_keys_version_1` in order to obtain the number of public keys available, then `ext_crypto_ed25519_public_key_version_2` repeatedly.
The `ext_crypto_ed25519_public_key_version_2` function writes the public key of the given `key_index` to the memory location designated by `out`. The `key_index` must be between 0 (included) and `n` (excluded), where `n` is the value returned by `ext_crypto_ed25519_num_public_keys_version_1`. Execution must trap if `n` is out of range.

The same explanations apply for `ext_crypto_sr25519_public_key_version_1` and `ext_crypto_ecdsa_public_key_version_1`.

Host implementers should be aware that the list of public keys (including their ordering) must not change while the runtime is running. This is most likely done by copying the list of all available keys either at the start of the execution or the first time the list is accessed.

```wat
(func $ext_offchain_http_request_start_version_2
  (param $method i64) (param $uri i64) (param $meta i64) (result i32))
```

The behaviour of this function is identical to its version 1 counterpart. Instead of allocating a buffer, writing the request identifier in it, and returning a pointer to it, the version 2 of this function simply returns the newly-assigned identifier to the HTTP request. On failure, this function returns `-1`. An identifier of `-1` is invalid and is reserved to indicate failure.

```wat
(func $ext_offchain_http_request_write_body_version_2
  (param $method i64) (param $uri i64) (param $meta i64) (result i32))
(func $ext_offchain_http_response_read_body_version_2
  (param $request_id i32) (param $buffer i64) (param $deadline i64) (result i64))
```

The behaviour of these functions is identical to their version 1 counterpart. Instead of allocating a buffer, writing two bytes in it, and returning a pointer to it, the new version of these functions simply indicates what happened:

- For `ext_offchain_http_request_write_body_version_2`, 0 on success.
- For `ext_offchain_http_response_read_body_version_2`, 0 or a non-zero number of bytes on success.
- -1 if the deadline was reached.
- -2 if there was an I/O error while processing the request.
- -3 if the identifier of the request is invalid.

These values are equal to the values returned on error by the version 1 (see <https://spec.polkadot.network/chap-host-api#defn-http-error>), but tweaked in order to reserve positive numbers for success.

When it comes to `ext_offchain_http_response_read_body_version_2`, the host implementers must not read too much data at once in order to not create ambiguity in the returned value. Given that the size of the `buffer` is always inferior or equal to 4 GiB, this is not a problem.

```wat
(func $ext_offchain_http_response_wait_version_2
    (param $ids i64) (param $deadline i64) (param $out i32))
```

The behaviour of this function is identical to its version 1 counterpart. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the new version of this function accepts an `out` parameter containing the memory location where the host writes the output. The runtime execution stops with an error if `out` is outside of the range of the memory of the virtual machine.

The encoding of the response code is also modified compared to its version 1 counterpart and each response code now encodes to 4 little endian bytes as described below:

- 100-999: the request has finished with the given HTTP status code.
- -1 if the deadline was reached.
- -2 if there was an I/O error while processing the request.
- -3 if the identifier of the request is invalid.

The buffer passed to `out` must always have a size of `4 * n` where `n` is the number of elements in the `ids`.

```wat
(func $ext_offchain_http_response_header_name_version_1
    (param $request_id i32) (param $header_index i32) (param $out i64) (result i64))
(func $ext_offchain_http_response_header_value_version_1
    (param $request_id i32) (param $header_index i32) (param $out i64) (result i64))
```

These functions supercede the `ext_offchain_http_response_headers_version_1` host function.

Contrary to `ext_offchain_http_response_headers_version_1`, only one header indicated by `header_index` can be read at a time. Instead of calling `ext_offchain_http_response_headers_version_1` once, the runtime should call `ext_offchain_http_response_header_name_version_1` and `ext_offchain_http_response_header_value_version_1` multiple times with an increasing `header_index`, until a value of `-1` is returned.

These functions accept an `out` parameter containing [a pointer-size](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size) to the memory location where the header name or value should be written. The runtime execution stops with an error if `out` is outside of the range of the memory of the virtual machine, even if the function wouldn't write anything to `out`.

These functions return the size, in bytes, of the header name or header value. If request doesn't exist or is in an invalid state (as documented for `ext_offchain_http_response_headers_version_1`) or the `header_index` is out of range, a value of `-1` is returned. Given that the host must never write more bytes than the size of the buffer in `out`, and that the size of this buffer is expressed as a 32 bits number, a 64bits value of `-1` is not ambiguous.

If the buffer in `out` is too small to fit the entire header name of value, only the bytes that fit are written and the rest are discarded.

```wat
(func $ext_offchain_submit_transaction_version_2
    (param $data i64) (return i32))
(func $ext_offchain_http_request_add_header_version_2
    (param $request_id i32) (param $name i64) (param $value i64) (result i32))
```

Instead of allocating a buffer, writing `1` or `0` in it, and returning a pointer to it, the version 2 of these functions return `0` or `-1`, where `0` indicates success and `-1` indicates failure. The runtime must interpret any non-`0` value as failure, but the client must always return `-1` in case of failure.

```wat
(func $ext_offchain_local_storage_read_version_1
    (param $kind i32) (param $key i64) (param $value_out i64) (param $offset i32) (result i64))
```

This function supercedes the `ext_offchain_local_storage_get_version_1` host function, and uses an API and logic similar to `ext_storage_read_version_2`.

It reads the offchain local storage key indicated by `kind` and `key` starting at the byte indicated by `offset`, and writes the value to the [pointer-size](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size) indicated by `value_out`.

The function returns the number of bytes that were written in the `value_out` buffer. If the entry doesn't exist, a value of `-1` is returned. Given that the host must never write more bytes than the size of the buffer in `value_out`, and that the size of this buffer is expressed as a 32 bits number, a 64bits value of `-1` is not ambiguous.

The runtime execution stops with an error if `value_out` is outside of the range of the memory of the virtual machine, even if the size of the buffer is 0 or if the amount of data to write would be 0 bytes.

```wat
(func $ext_offchain_network_peer_id_version_1
    (param $out i64))
```

This function writes [the `PeerId` of the local node](https://spec.polkadot.network/chap-networking#id-node-identities) to the memory location indicated by `out`. A `PeerId` is always 38 bytes long.
The runtime execution stops with an error if `out` is outside of the range of the memory of the virtual machine.

```wat
(func $ext_input_size_version_1
    (return i64))
(func $ext_input_read_version_1
    (param $offset i64) (param $out i64))
```

When a runtime function is called, the host uses the allocator to allocate memory within the runtime where to write some input data. These two new host functions provide an alternative way to access the input that doesn't make use of the allocator.

The `ext_input_size_version_1` host function returns the size in bytes of the input data.

The `ext_input_read_version_1` host function copies some data from the input data to the memory of the runtime. The `offset` parameter indicates the offset within the input data where to start copying, and must be inferior or equal to the value returned by `ext_input_size_version_1`. The `out` parameter is [a pointer-size](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size) containing the buffer where to write to.
The runtime execution stops with an error if `offset` is strictly superior to the size of the input data, or if `out` is outside of the range of the memory of the virtual machine, even if the amount of data to copy would be 0 bytes.

### Other changes

In addition to the new host functions, this RFC proposes two changes to the runtime-host interface:

- The following function signature is now also accepted for runtime entry points: `(func (result i64))`.
- Runtimes no longer need to expose a constant named `__heap_base`.

All the host functions that are being superceded by new host functions are now considered deprecated and should no longer be used.
The following other host functions are similarly also considered deprecated:

- `ext_storage_get_version_1`
- `ext_default_child_storage_get_version_1`
- `ext_allocator_malloc_version_1`
- `ext_allocator_free_version_1`
- `ext_offchain_network_state_version_1`

## Drawbacks

This RFC might be difficult to implement in Substrate due to the internal code design. It is not clear to the author of this RFC how difficult it would be.

## Prior Art

The API of these new functions was heavily inspired by API used by the C programming language.

## Unresolved Questions

The changes in this RFC would need to be benchmarked. This involves implementing the RFC and measuring the speed difference.

It is expected that most host functions are faster or equal speed to their deprecated counterparts, with the following exceptions:

- `ext_input_size_version_1`/`ext_input_read_version_1` is inherently slower than obtaining a buffer with the entire data due to the two extra function calls and the extra copying. However, given that this only happens once per runtime call, the cost is expected to be negligible.

- The `ext_crypto_*_public_keys`, `ext_offchain_network_state`, and `ext_offchain_http_*` host functions are likely slightly slower than their deprecated counterparts, but given that they are used only in offchain workers this is acceptable.

- It is unclear how replacing `ext_storage_get` with `ext_storage_read` and `ext_default_child_storage_get` with `ext_default_child_storage_read` will impact performances.

- It is unclear how the changes to `ext_storage_next_key` and `ext_default_child_storage_next_key` will impact performances.

## Future Possibilities

After this RFC, we can remove from the source code of the host the allocator altogether in a future version, by removing support for all the deprecated host functions.
This would remove the possibility to synchronize older blocks, which is probably controversial and requires a some preparations that are out of scope of this RFC.
