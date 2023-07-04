# RFC-0000: Remove unnecessary host functions allocator usage

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2023-07-04                                                                                  |
| **Description** | Add alternatives to host functions that make use of the allocator when unnecessary          |
| **Authors**     | Pierre Krieger                                                                              |

## Summary

Add new versions of host functions in order to avoid using the allocator when the buffer being allocated is of a size known at compilation time.

## Motivation

The heap allocation of the runtime is currently controlled by the host using a memory allocator on the host side.

The API of many host functions consists in allocating a buffer. For example, when calling `ext_hashing_twox_256_version_1`, the host allocates a 32 bytes buffer using the host allocator, and returns a pointer to this buffer to the runtime. The runtime later has to call `ext_allocator_free_version_1` on this pointer in order to free the buffer.

Even though no benchmark has been done, it is pretty obvious that this design is very inefficient. To continue with the example of `ext_hashing_twox_256_version_1`, it would be more efficient to instead write the output hash to a buffer that was allocated by the runtime on its stack and passed by pointer to the function. Allocating a buffer on the stack in the worst case scenario simply consists in decreasing a number, and in the best case scenario is free. Doing so would save many Wasm memory reads and writes by the allocator, and would save a function call to `ext_allocator_free_version_1`.

After this RFC, only the following functions have no exact equivalent that doesn't use the allocator:

- `ext_storage_get`
- `ext_default_child_storage_get`
- `ext_storage_next_key`
- `ext_default_child_storage_next_key`
- `ext_crypto_ed25519_public_keys`
- `ext_crypto_sr25519_public_keys`
- `ext_crypto_ecdsa_public_keys`
- `ext_offchain_network_state`
- `ext_offchain_local_storage_get`
- `ext_offchain_http_response_wait`
- `ext_offchain_http_response_headers`
- `ext_offchain_http_response_read_body`

## Stakeholders

No attempt was made at convincing stakeholders. The writer of this RFC believes that these changes are pretty non-controversial.

## Explanation

This RFC proposes to introduce the following new host functions:

```wat
(func $ext_storage_read_version_2
    (param $key i64) (param $value_out i64) (param $offset i32) (result i64))
(func $ext_default_child_storage_read_version_2
    (param $child_storage_key i64) (param $key i64) (param $value_out i64)
    (param $offset i32) (result i64))
```

The signature and behaviour of `ext_storage_read_version_2` and `ext_default_child_storage_read_version_2` is identical to their version 1 equivalent, but the return value has a different meaning.
The new functions directly return the number of bytes that were written in the `value_out` buffer. If the entry doesn't exist, a value of `-1` is returned. Given that the host must never write more bytes than the size of the buffer in `value_out`, and that the size of this buffer is expressed as a 32 bits number, a 64bits value of `-1` is not ambiguous.

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
(func $ext_storage_root_version_3
    (param $out i32))
(func $ext_crypto_ed25519_generate_version_2
    (param $key_type_id i32) (param $seed i64) (param $out i32))
(func $ext_crypto_sr25519_generate_version_2
    (param $key_type_id i32) (param $seed i64) (return i32))
(func $ext_crypto_ecdsa_generate_version_2
    (param $key_type_id i32) (param $seed i64) (return i32))
```

The behaviour of these functions is identical to their version 1 or version 2 equivalent. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the new version of these functions accepts an `out` parameter containing the memory location where the host writes the output. The output is always of a size known at compilation time.

```wat
(func $ext_default_child_storage_root_version_3
    (param $child_storage_key i64) (param $out i32))
(func $ext_storage_root_version_3
    (param $out i32))
```

The behaviour of these functions is identical to their version 1 and version 2 equivalents. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the new versions of these functions accepts an `out` parameter containing the memory location where the host writes the output. The output is always of a size known at compilation time.

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

The behaviour of these functions is identical to their version 2 and 3 equivalent. Instead of allocating a buffer, writing the output to it, and returning a pointer to it, the version 3 and 4 of these functions accepts a `removed_count_out` parameter containing the memory location to a 8 bytes buffer where the host writes the number of keys that were removed in little endian. The functions return 1 to indicate that there are keys remaining, and 0 to indicate that all keys have been removed.

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

The behaviour of these functions is identical to their version 1 equivalents. The new versions of these functions accept an `out` parameter containing the memory location where the host writes the signature. The signatures are always of a size known at compilation time. On success, these functions return `0`. If the public key can't be found in the keystore, these functions return `1` and do not write anything to `out`.

Note that the return value is 0 on success and 1 on failure, while the previous version of these functions write 1 on success (as it represents a SCALE-encoded `Some`) and 0 on failure (as it represents a SCALE-encoded `None`). Returning 0 on success and non-zero on failure is consistent with common practices in the C programming language and is less surprising than the opposite.

```wat
(func $ext_crypto_secp256k1_ecdsa_recover_version_3
    (param $sig i32) (param $msg i32) (param $out i32) (return i64))
(func $ext_crypto_secp256k1_ecdsa_recover_compressed_version_3
    (param $sig i32) (param $msg i32) (param $out i32) (return i64))
```

The behaviour of these functions is identical to their version 2 equivalents. The new versions of these functions accept an `out` parameter containing the memory location where the host writes the signature. The signatures are always of a size known at compilation time. On success, these functions return `0`. On failure, these functions return a non-zero value and do not write anything to `out`. The non-zero value written on failure is the same as in version 2 of these functions: <https://spec.polkadot.network/chap-host-api#defn-ecdsa-verify-error>.

```wat
(func $ext_offchain_http_request_start_version_2
  (param $method i64) (param $uri i64) (param $meta i64) (result i32))
```

The behaviour of this function is identical to its version 1 equivalent. Instead of allocating a buffer, writing the request identifier in it, and returning a pointer to it, the version 2 of this function simply returns the newly-assigned identifier to the HTTP request. On failure, this function returns 0. An identifier of 0 is invalid and is reserved to indicate failure.

Host implementaters should be aware that, because a non-zero identifier value was previously valid, this might require slightly more changes to the host than just adding the new function.

```wat
(func $ext_offchain_http_request_write_body_version_2
  (param $method i64) (param $uri i64) (param $meta i64) (result i32))
```

The behaviour of this function is identical to its version 1 equivalent. Instead of allocating a buffer, writing two bytes in it, and returning a pointer to it, the new version of this function simply indicates what happened:

- 0 on success.
- 1 if the deadline was reached.
- 2 if there was an I/O error while processing the request.
- 3 if the identifier of the request is invalid.

These values are equal to the values returned on error by the version 1 (see <https://spec.polkadot.network/chap-host-api#defn-http-error>), but incremented by 1 in order to reserve 0 for success.

```wat
(func $ext_offchain_submit_transaction_version_2
    (param $data i64) (return i32))
(func $ext_offchain_http_request_add_header_version_2
    (param $request_id i32) (param $name i64) (param $value i64) (result i32))
```

The behaviour of these functions is identical to their version 1 equivalent. Instead of allocating a buffer, writing `1` or `0` in it, and returning a pointer to it, the version 2 of these functions simply return 1 or 0.

## Drawbacks

- This RFC might be difficult to implement in Substrate due to the internal code design. It is not clear to the author of this RFC how difficult it would be.

- In some situations, the runtime might still have to call `ext_allocator_malloc_version_1` then call one of the new functions, which is slightly less performant than when the two operations are combined into one call. The author of this RFC believes that this negligible, and that the performance saved by not allocating a buffer in most situations is worth the trade-off.

## Prior Art

The API of these new functions was heavily inspired by API used by the C programming language.

## Unresolved Questions

No unresolved questions.

## Future Possibilities

The existence of the host-side allocator has become questionable over time. It is implemented in a very naive way, and for determinism and backwards compatibility reasons it needs to be implemented exactly identically in every client implementation. Furthermore, runtimes make substantial use of heap memory allocations, and each allocation needs to go twice through the runtime <-> host boundary (once for allocating and once for freeing). Moving the allocator to the runtime side, while it would increase the size of the runtime, would be a good idea. But before the host-side allocator can be deprecated, all the host functions that make use of it need to updated to not use it.

When it comes to removing the allocator usage from the functions that still use it after this RFC, it can in my opinion be done like this:

- The `ext_crypto_*_public_keys`, `ext_offchain_network_state`, and `ext_offchain_http_*` host functions can be updated to no longer use the allocator by splitting them in two: one function to query the number of items and one function to query an individual item.
- The `ext_offchain_local_storage_get` should be deprecated in favor of a new `ext_offchain_local_storage_read` host function.
- The `ext_storage_next_key`, `ext_default_child_storage_next_key` should also be updated to get a new `read`-like API. Because storage keys are organized by concatenating hashes, their length is always known ahead of time, and as such a buffer containing the next key can be allocated ahead of time.
- The `ext_storage_get` and `ext_default_child_storage_get` should be deprecated in favor of `ext_storage_read` and `ext_default_child_storage_read`.

Furthermore, the input data provided to the runtime is also allocated using the allocator. New host functions that allow reading the input from the runtime would have to be added.

Because all these changes might be controversial and might require benchmarking, and that the removal of the allocator might also be controversial, I have decided to not include them as part of this RFC.
