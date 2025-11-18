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

Furthermore, the existence of the host-side allocator has become questionable over time. It is implemented in a very naive way: every allocation is rounded up to the next power of two, and once a piece of memory is allocated it can only be reused for allocations which also round up to the exactly the same size. So in theory it's possible to end up in a situation where we still technically have plenty of free memory, but our allocations will fail because all of that memory is reserved for differently sized buckets. That behavior is de-facto hardcoded into the current protocol and for determinism and backwards compatibility reasons, it needs to be implemented exactly identically in every client implementation. 

In addition to that, runtimes make substantial use of heap memory allocations, and each allocation needs to go through the runtime <-> host boundary twice (once for allocating and once for freeing). Moving the allocator to the runtime side would be a good idea, although it would increase the runtime size. But before the host-side allocator can be deprecated, all the host functions that use it must be updated to avoid using it.

## Stakeholders

Runtime developers, who will benefit from the improved performance and more deterministic behavior of the runtime code.

## Explanation

### New definitions

#### <a name="new-def-i"></a>New Definition I: Runtime Optional Positive Integer

By a Runtime Optional Positive Integer we refer to an abstract value $r \in \mathcal{R}$ where $\mathcal{R} := \{\bot\} \cup \{0, 1, \dots, 2^{32} - 1\},$ and where $\bot$ denotes the _absent_ value.

At the Host-Runtime interface this type is represented by a signed 64-bit integer $x \in \mathbb{Z}$ (thus $\mathbb{Z} \in \{-2^{63}, \dots, 2^{63} - 1\}$).

We define the encoding function $\mathrm{Enc}_{\mathrm{ROP}} : \mathcal{R} \to \mathbb{Z}$ and decoding function $\mathrm{Dec}_{\mathrm{ROP}} : \mathbb{Z} \to \mathcal{R} \cup \{\mathrm{error}\}$ as follows.

For $r \in \mathcal{R}$,

$$
\mathrm{Enc}_{\mathrm{ROP}}(r) :=
\begin{cases}
-1 & \text{if } r = \bot, \\
r  & \text{if } r \in \{0, 1, \dots, 2^{32} - 1\}.
\end{cases}
$$

For a signed 64-bit integer $x$,

$$
\mathrm{Dec}_{\mathrm{ROP}}(x) :=
\begin{cases}
\bot & \text{if } x = -1, \\
x   & \text{if } 0 \le x < 2^{32}, \\
\mathrm{error} & \text{otherwise.}
\end{cases}
$$

A valid Runtime Optional Positive Integer at the Host-Runtime boundary is any 64-bit signed integer $x$ such that $x \in \{-1\} \cup \{0, 1, \dots, 2^{32} - 1\}$. All other 64-bit integer values are invalid for this type.

Conforming implementations must not produce invalid values when encoding. Receivers must abort execution if decoding results in $\mathrm{error}$.

#### <a name="new-def-ii"></a>New Definition II: Runtime Optional Pointer-Size

The Runtime optional pointer-size has exactly the same definition as Runtime pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) with the value of 2⁶⁴-1 representing a non-existing value (an _absent_ value).

### Changes to host functions

#### ext_storage_get

##### Existing prototype

```wat
(func $ext_storage_get_version_1
    (param $key i64) (result i64))
```

##### Changes

Considered obsolete in favor of `ext_storage_read_version_2`. Cannot be used in a runtime using the new-style of entry-point.

#### ext_storage_read

##### Existing prototype

```wat
(func $ext_storage_read_version_1
    (param $key i64) (param $value_out i64) (param $offset i32) (result i64))
```

##### Changes

The function was returning a SCALE-encoded `Option`-wrapped 32-bit integer representing the number of bytes left at supplied `offset`. It was using a host-allocated buffer to return it. It is changed to always return the full length of the value directly as a primitive value.

##### New prototype

```wat
(func $ext_storage_read_version_2
    (param $key i64) (param $value_out i64) (param $value_offset i32) (result i64))
```

##### Arguments

* `key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the storage key being read;
* `value_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the value read should be stored. The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are unchanged;
* `value_offset` is an unsigned 32-bit offset from which the value reading should start.

##### Result

The result is an optional positive integer ([New Definition I](#new-def-i)), representing either the full length of the value in storage or the _absence_ of such a value in storage.

#### ext_storage_clear_prefix

##### Existing prototype

```wat
(func $ext_storage_clear_prefix_version_2
    (param $prefix i64) (param $limit i64) (result i64))
```

##### Changes

The function used to accept only a prefix and a limit and return a SCALE-encoded `enum` representing the number of iterations performed, wrapped into a discriminator to differentiate if all the keys were removed. It was using a host-allocated buffer to return the value. As [discussed](https://github.com/w3f/polkadot-spec/issues/588), such implementation was suboptimal, and a better implementation was proposed in [PPP#7](https://github.com/w3f/PPPs/pull/7), but the PPP has never been adopted. The new version adopts the PPP, providing a means of returning much more exhaustive information about the work performed, and also accepts an optional input cursor and makes the limit optional as well. It always returns the full length of the continuation cursor.

##### New prototype

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
* `maybe_cursor_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the continuation cursor will optionally be written (see also the Result section). The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are undefined;
* `backend` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of items removed from the backend database will be written;
* `unique` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of unique keys removed, taking into account both the backend and the overlay;
* `loops` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of iterations (each requiring a storage seek/read) which were done will be written.

##### Result

The result represents the length of the continuation cursor which might have been written to the buffer provided in `maybe_cursor_out`. A zero value represents the absence of such a cursor and no need for continuation (the prefix has been completely cleared).

#### ext_storage_root

##### Existing prototype

```wat
(func $ext_storage_root_version_2
    (param $version i32) (result i64))
```

##### Changes

The old version accepted the state version as an argument and returned a SCALE-encoded trie root hash through a host-allocated buffer. The new version adopts [PPP#6](https://github.com/w3f/PPPs/pull/6) getting rid of the argument that used to represent the state version. It accepts a pointer to a runtime-allocated buffer and fills it with the output value. The length of the encoded result is returned.

##### New prototype

```wat
(func $ext_storage_root_version_3
    (param $out i64) (result i32))
```

##### Arguments

* `out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the SCALE-encoded storage root, calculated after committing all the existing operations, will be stored. The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are unchanged.

##### Results

The result is the full length of the output that might have been stored in the buffer provided in `out`.

#### ext_storage_next_key

##### Existing prototype

```wat
(func $ext_storage_next_key_version_1
    (param $key i64) (result i64))
```

##### Changes

The old version accepted the key and returned the SCALE-encoded next key in a host-allocated buffer. The new version additionally accepts a runtime-allocated output buffer and returns full next key length.

##### New prototype

```wat
(func $ext_storage_next_key_version_2
    (param $key_in i64) (param $key_out i64) (result i32))
```

##### Arguments

* `key_in` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer containing a storage key;
* `key_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to an output buffer where the next key in the storage in the lexicographical order will be written. The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are unchanged.

##### Result

The result is the full length of the output key that might have been stored in `key_out`, or zero if no next key was found.

#### ext_default_child_storage_get

##### Existing prototype

```wat
(func $ext_default_child_storage_get_version_1
    (param $child_storage_key i64) (param $key i64) (result i64))
```

##### Changes

Considered obsolete in favor of `ext_default_child_storage_read_version_2`. Cannot be used in a runtime using the new-style of entry-point.

#### ext_default_child_storage_read

##### Existing prototype

```wat
(func $ext_default_child_storage_read_version_1
    (param $child_storage_key i64) (param $key i64) (param $value_out i64) (param $offset i32)
    (result i64))
```

##### Changes

The function was returning a SCALE-encoded `Option`-wrapped 32-bit integer representing the number of bytes left at supplied `offset`. It was using a host-allocated buffer to return it. It is changed to always return the full length of the value directly as a primitive value.

##### New prototype

```wat
(func $ext_default_child_storage_read_version_2
    (param $storage_key i64) (param $key i64) (param $value_out i64) (param $value_offset i32)
    (result i64))
```

##### Arguments

* `storage_key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the child storage key ([Definition 219](https://spec.polkadot.network/chap-host-api#defn-child-storage-type));
* `key` is the storage key being read;
* `value_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the value read should be stored. The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are unchanged;
* `value_offset` is an unsigned 32-bit offset from which the value reading should start.

##### Result

The result is an optional positive integer ([New Definition I](#new-def-i)), representing either the full length of the value in storage or the _absence_ of such a value in storage.

#### ext_default_child_storage_storage_kill

##### Existing prototype

```wat
(func $ext_default_child_storage_storage_kill_version_3
    (param $child_storage_key i64) (param $limit i64)
    (result i64))
```

##### Changes

The function used to accept only a child storage key and a limit and return a SCALE-encoded `enum` representing the number of iterations performed, wrapped into a discriminator to differentiate if all the keys were removed. It was using a host-allocated buffer to return the value. As [discussed](https://github.com/w3f/polkadot-spec/issues/588), such implementation was suboptimal, and a better implementation was proposed in [PPP#7](https://github.com/w3f/PPPs/pull/7), but the PPP has never been adopted. The new version adopts the PPP, providing a means of returning much more exhaustive information about the work performed, and also accepts an optional input cursor and makes the limit optional as well. It always returns the full length of the continuation cursor.

##### New prototype

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
* `maybe_cursor_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the continuation cursor will optionally be written (see also the Result section). The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are undefined;
* `backend` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of items removed from the backend database will be written;
* `unique` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of unique keys removed, taking into account both the backend and the overlay;
* `loops` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of iterations (each requiring a storage seek/read) which were done will be written.

##### Result

The result represents the length of the continuation cursor which might have been written to the buffer provided in `maybe_cursor_out`. A zero value represents the absence of such a cursor and no need for continuation (the prefix has been completely cleared).

#### ext_default_child_storage_clear_prefix

##### Existing prototype

```wat
(func $ext_default_child_storage_clear_prefix_version_2
    (param $child_storage_key i64) (param $prefix i64) (param $limit i64)
    (result i64))
```

##### Changes

The function used to accept (along with the child storage key) only a prefix and a limit and return a SCALE-encoded `enum` representing the number of iterations performed, wrapped into a discriminator to differentiate if all the keys were removed. It was using a host-allocated buffer to return the value. As [discussed](https://github.com/w3f/polkadot-spec/issues/588), such implementation was suboptimal, and a better implementation was proposed in [PPP#7](https://github.com/w3f/PPPs/pull/7), but the PPP has never been adopted. The new version adopts the PPP, providing a means of returning much more exhaustive information about the work performed, and also accepts an optional input cursor and makes the limit optional as well. It always returns the full length of the continuation cursor.

##### New prototype

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
* `maybe_cursor_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the continuation cursor will optionally be written (see also the Result section). The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are undefined;
* `backend` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of items removed from the backend database will be written;
* `unique` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of unique keys removed, taking into account both the backend and the overlay;
* `loops` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 4-byte buffer where a 32-bit integer representing the number of iterations (each requiring a storage seek/read) which were done will be written.

##### Result

The result represents the length of the continuation cursor which might have been written to the buffer provided in `maybe_cursor_out`. A zero value represents the absence of such a cursor and no need for continuation (the prefix has been completely cleared).

#### ext_default_child_storage_root

##### Existing prototype

```wat
(func $ext_default_child_storage_root_version_2
    (param $child_storage_key i64) (param $version i32) (result i64))
```

##### Changes

The old version accepted (along with the child storage key) the state version as an argument and returned a SCALE-encoded trie root hash through a host-allocated buffer. The new version adopts [PPP#6](https://github.com/w3f/PPPs/pull/6) getting rid of the argument that used to represent the state version. It accepts a pointer to a runtime-allocated buffer and fills it with the output value. The length of the encoded result is returned.

##### New prototype

```wat
(func $ext_default_child_storage_root_version_3
    (param $storage_key i64) (param $out i64) (result i32))
```

##### Arguments

* `storage_key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the child storage key ([Definition 219](https://spec.polkadot.network/chap-host-api#defn-child-storage-type));
* `out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the SCALE-encoded storage root, calculated after committing all the existing operations, will be stored. The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are unchanged.

##### Results

The result is the length of the output that mught have been stored in the buffer provided in `out`.

#### ext_default_child_storage_next_key

##### Existing prototype

```wat
(func $ext_default_child_storage_next_key_version_1
    (param $child_storage_key i64) (param $key i64) (result i64))
```

##### Changes

The old version accepted (along with the child storage key) the key and returned the SCALE-encoded next key in a host-allocated buffer. The new version additionally accepts a runtime-allocated output buffer and returns full next key length.

##### New prototype

```wat
(func $ext_default_child_storage_next_key_version_2
    (param $storage_key i64) (param $key_in i64) (param $key_out i64) (result i32))
```

##### Arguments

* `storage_key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the child storage key ([Definition 219](https://spec.polkadot.network/chap-host-api#defn-child-storage-type));
* `key_in` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer containing a storage key;
* `key_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to an output buffer where the next key in the storage in the lexicographical order will be written. The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are unchanged.

##### Result

The result is the length of the output key that might have been written into `key_out`, or zero if no next key was found.

#### ext_trie_{blake2|keccak}\_256_\[ordered_]root

##### Existing prototypes

```wat
(func $ext_trie_{blake2|keccak}_256_[ordered_]root_version_2
    (param $data i64) (param $version i32) (result i32))
```

##### Changes

The following functions share the same signatures and set of changes:
* `ext_trie_blake2_256_root`
* `ext_trie_blake2_256_ordered_root`
* `ext_trie_keccak_256_root`
* `ext_trie_keccak_256_ordered_root`

The functions used to return the root in a 32-byte host-allocated buffer. They now accept a runtime-allocated output buffer as an argument, and doesn't return anything.

##### New prototypes

```wat
(func $ext_trie_{blake2|keccak}_256_[ordered_]root_version_3
    (param $input i64) (param $version i32) (param $out i32))
```

##### Arguments

* `input` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the SCALE-encoded vector of the trie key-value pairs;
* `version` is the state version, where `0` denotes V0 and `1` denotes V1 state version. Other state versions may be introduced in the future;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to a 32-byte buffer, where the calculated trie root will be stored.

#### ext_misc_runtime_version

##### Existing prototype

```wat
(func $ext_misc_runtime_version_version_1
    (param $data i64) (result i64))
```

##### Changes

The function used to return the SCALE-encoded runtime version information in a host-allocated buffer. It is changed to accept a runtime-allocated buffer as an arguments and to return the length of the SCALE-encoded result.

##### New prototype

```wat
(func $ext_misc_runtime_version_version_2
    (param $wasm i64) (param $out i64) (result i64))
```
##### Arguments

* `wasm` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the Wasm blob from which the version information should be extracted;
* `out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the buffer where the SCALE-encoded extracted version information will be stored. The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are unchanged.

##### Result

The result is an optional positive integer ([New Definition I](#new-def-i)) representing the length of the output data that might have been stored in `out`. An _absent_ value represents the absence of the version information in the Wasm blob or a failure to read one.

#### ext_misc_last_cursor

##### Changes

A new function is introduced to make it possible to fetch a cursor produced by `ext_storage_clear_prefix`, `ext_default_child_storage_clear_prefix`, and `ext_default_child_storage_kill_prefix` even if a buffer initially provided to those functions wasn't large enough to accommodate the cursor.

##### New prototype

```wat
(func $ext_misc_last_cursor_version_1
    (param $out i64) (result i64))
```
##### Arguments

* `out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the buffer where the last cached cursor will be stored, if one exists. The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are unchanged.

##### Result

The result is an optional positive integer ([New Definition I](#new-def-i)) representing the length of the cursor that might have been stored in `out`. An _absent_ value represents the absence of the cached cursor.

If the buffer had enough capacity and the cursor was stored successfully, the cursor cache is cleared and the same cursor cannot be retrieved once again using this function.

#### ext_crypto_{ed25519|sr25519|ecdsa}_public_keys

##### Existing prototypes

```wat
(func $ext_crypto_ed25519_public_keys_version_1
    (param $key_type_id i32) (result i64))
(func $ext_crypto_sr25519_public_keys_version_1
    (param $key_type_id i32) (result i64))
(func $ext_crypto_ecdsa_public_keys_version_1
    (param $key_type_id i32) (result i64))
```

##### Changes

The following functions are considered obsolete in favor of the new `*_num_public_keys` and `*_public_key` counterparts:
* `ext_crypto_ed25519_public_keys_version_1`
* `ext_crypto_sr25519_public_keys_version_1`
* `ext_crypto_ecdsa_public_keys_version_1`

They cannot be used in a runtime using the new-style of entry-point.

#### ext_crypto_{ed25519|sr25519|ecdsa}_num_public_keys

##### Changes

New functions, all sharing the same signature and logic, are introduced:
* `ext_crypto_ed25519_num_public_keys_version_1`
* `ext_crypto_sr25519_num_public_keys_version_1`
* `ext_crypto_ecdsa_num_public_keys_version_1`

They are intended to replace the obsolete `ext_crypto_{ed25519|sr25519|ecdsa}_public_keys` with a new iterative approach.

##### New prototypes

```wat
(func $ext_crypto_{ed25519|sr25519|ecdsa}_num_public_keys
    (param $id i32) (result i32))
```

##### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)).

##### Result

The result represents a (possibly zero) number of keys of the given type known to the keystore.

#### ext_crypto_{ed25519|sr25519|ecdsa}_public_key

##### Changes

New functions, all sharing the same signature and logic, are introduced:
* `ext_crypto_ed25519_public_key_version_1`
* `ext_crypto_sr25519_public_key_version_1`
* `ext_crypto_ecdsa_public_key_version_1`

They are intended to replace the obsolete `ext_crypto_{ed25519|sr25519|ecdsa}_public_keys` with a new iterative approach.

##### New prototypes

```wat
(func $ext_crypto_{ed25519|sr25519|ecdsa}_public_key
    (param $id i32) (param $index i32) (param $out))
```

##### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)).
* `index` is the index of the key in the keystore. If the index is out of bounds (determined by the value returned by the respective `_num_public_keys` function) the function will panic;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer of the respective size (depending on key type) where the key will be written.

#### ext_crypto_{ed25519|sr25519|ecdsa}_generate

##### Existing prototypes

```wat
(func $ext_crypto_{ed25519|sr25519|ecdsa}_generate_version_1
    (param $key_type_id i32) (param $seed i64) (result i32))
```

##### Changes

The following functions share the same signatures and set of changes:
* `ext_crypto_ed25519_generate`
* `ext_crypto_sr25519_generate`
* `ext_crypto_ecdsa_generate`

The functions used to return a host-allocated buffer containing the key of the corresponding type. They are changed to accept a runtime-allocated buffer as an argument and to return no value, as the length of keys is known and the operation cannot fail.

##### New prototypes

```wat
(func $ext_crypto_{ed25519|sr25519|ecdsa}_generate_version_2
    (param $id i32) (param $seed i64) (param $out i32))
```

##### Arguments

* `id` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the key type identifier ([Definition 220](https://spec.polkadot.network/chap-host-api#defn-key-type-id)). The function will panic if the identifier is invalid;
* `seed` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the SCALE-encoded Option value ([Definition 200](https://spec.polkadot.network/id-cryptography-encoding#defn-option-type)) containing the BIP-39 seed which must be valid UTF-8. The function will panic if the seed is not valid UTF-8;
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer of the respective size (depending on key type) where the generated key will be written.

#### ext_crypto_{ed25519|sr25519|ecdsa}_sign\[_prehashed]

##### Existing prototypes

```wat
(func $ext_crypto_{ed25519|sr25519|ecdsa}_sign{_prehashed|}_version_1
    (param $id i32) (param $pub_key i32) (param $msg i64) (result i64))
```

##### Changes

The following functions share the same signatures and set of changes:
* `ext_crypto_ed25519_sign`
* `ext_crypto_sr25519_sign`
* `ext_crypto_ecdsa_sign`
* `ext_crypto_ecdsa_sign_prehashed`

The functions used to return a host-allocated SCALE-encoded value representing the result of signature application. They are changed to accept a pointer to a runtime-allocated buffer of a known size (dependent on the signature type) and to return a result code.

#### New prototypes

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

#### ext_crypto_secp256k1_ecdsa_recover\[_compressed]

##### Existing prototypes

```wat
(func $ext_crypto_secp256k1_ecdsa_recover\[_compressed]_version_2
    (param $sig i32) (param $msg i32) (result i64))
```

##### Changes

The following functions share the same signatures and set of changes:
* `ext_crypto_secp256k1_ecdsa_recover`
* `ext_crypto_secp256k1_ecdsa_recover_compressed`

The functions used to return a host-allocated SCALE-encoded value representing the result of the key recovery. They are changed to accept a pointer to a runtime-allocated buffer of a known size and to return a result code. The return error encoding, defined under [Definition 221](https://spec.polkadot.network/chap-host-api#defn-ecdsa-verify-error), is changed to promote the unification of host function result reporting (zero and positive values are for success, and the negative values are for failure codes).

##### New prototypes

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

#### ext_hashing_{keccak|sha2|blake2|twox}_{64|128|256|512}

##### Existing prototypes

```wat
(func $ext_hashing_{keccak|sha2|blake2|twox}_{64|128|256|512}_version_1
    (param $data i64) (result i32))
```

##### Changes

The following functions share the same signatures and set of changes:
* `ext_hashing_keccak_256`
* `ext_hashing_keccak_512`
* `ext_hashing_sha2_256`
* `ext_hashing_blake2_128`
* `ext_hashing_blake2_256`
* `ext_hashing_twox_64`
* `ext_hashing_twox_128`
* `ext_hashing_twox_256`

The functions used to return a host-allocated buffer containing the hash. They are changed to accept a runtime-allocated buffer of a known size (depedent on the hash type) and to return no value, as the operation cannot fail.

##### New prototypes

```wat
(func $ext_hashing_{keccak|sha2|blake2|twox}_{64|128|256|512}_version_2
    (param $data i64) (param $out i32))
```

##### Arguments

* `data` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the data to be hashed.
* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer of the respective size (depending on hash type) where the calculated hash will be written.

#### ext_offchain_submit_transaction

##### Existing prototype

```wat
(func $ext_offchain_submit_transaction_version_1
    (param $data i64) (result i64))
```

##### Changes

The old version returned a SCALE-encoded result in a host-allocated buffer. That is changed to return the result as a primitive value.

##### New prototype

```wat
(func $ext_offchain_submit_transaction_version_2
    (param $data i64) (result i64))
```

##### Arguments

* `data` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the byte array storing the encoded extrinsic.

##### Result

The result is `0` for success or `-1` for failure.

#### ext_offchain_network_state

##### Existing prototype

```wat
(func $ext_offchain_network_state_version_1
    (result i64))
```

##### Changes

Considered obsolete in favor of `ext_offchain_network_peer_id_version_1`. Cannot be used in a runtime using the new-style of entry-point.

#### ext_offchain_network_peer_id

##### Changes

A new function is introduced to replace `ext_offchain_network_state`. It fills the output buffer with an opaque peer id of a known size.

##### New prototype

```wat
(func $ext_offchain_submit_transaction_version_2
    (param $out i32) (result i64))
```

##### Arguments

* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer, 38 bytes long, where the network peer ID will be written.

##### Result

The result is `0` for success or `-1` for failure.

#### ext_offchain_random_seed

##### Existing prototype

```wat
(func $ext_offchain_random_seed_version_1
    (result i32))
```

##### Changes

The function used to return a host-allocated buffer containing the random seed. It is changed to accept a pointer to a runtime-allocated buffer where the random seed is written and to return no value as the operation cannot fail.

##### New prototype

```wat
(func $ext_offchain_random_seed_version_2
    (param $out i32))
```

##### Arguments

* `out` is a pointer ([Definition 215](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer)) to the output buffer, 32 bytes long, where the random seed will be written.

#### ext_offchain_local_storage_get

##### Existing prototype

```wat
(func $ext_offchain_local_storage_get_version_1
    (param $kind i32) (param $key i64) (result i64))
```

##### Changes

Considered obsolete in favor of `ext_offchain_local_storage_read_version_1`. Cannot be used in a runtime using the new-style of entry-point.

#### ext_offchain_local_storage_read

##### Changes

A new function is introduced to replace `ext_offchain_local_storage_get`. The name has been changed to better correspond to the family of the same-functionality functions in `ext_storage_*` group.

##### New prototype

```wat
(func $ext_offchain_local_storage_read_version_1
    (param $kind i32) (param $key i64) (param $value_out i64) (param $offset i32) (result i64))
```

##### Arguments

* `kind` is an offchain storage kind, where `0` denotes the persistent storage ([Definition 222](https://spec.polkadot.network/chap-host-api#defn-offchain-persistent-storage)), and `1` denotes the local storage ([Definition 223](https://spec.polkadot.network/chap-host-api#defn-offchain-persistent-storage));
* `key` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the storage key being read;
* `value_out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to a buffer where the value read should be stored. The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are unchanged;
* `offset` is a 32-bit offset from which the value reading should start.

##### Result

The result is an optional positive integer ([New Definition I](#new-def-i)), representing either the full length of the value in storage or the _absence_ of such a value in storage.

#### ext_offchain_http_request_start

##### Existing prototype

```wat
(func $ext_offchain_http_request_start_version_1
    (param $method i64) (param $uri i64) (param $meta i64) (result i64))
```

##### Changes

The function used to return a SCALE-encoded `Result` value in a host-allocated buffer. That is changed to return a primitive value denoting the operation result. The result interpretation has been changed to promote the unification of host function result returning (zero and positive values are for success, and the negative values are for failure codes).

##### New prototype

```wat
(func $ext_offchain_http_request_start_version_2
    (param $method i64) (param $uri i64) (param $meta i64) (result i64))
```

##### Arguments

`method` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the HTTP method. Possible values are “GET” and “POST”;
`uri` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the URI;
`meta` is a future-reserved field containing additional, SCALE-encoded parameters. Currently, its value is ignored.

##### Result

On success, a positive request identifier is returned. On error, `-1` is returned.

#### ext_offchain_http_request_add_header

##### Existing prototype

```wat
(func $ext_offchain_http_request_add_header_version_1
    (param $request_id i32) (param $name i64) (param $value i64) (result i64))
```

##### Changes

The function used to return a SCALE-encoded `Result` value in a host-allocated buffer. That is changed to return a primitive value denoting the operation result. The result interpretation has been changed to promote the unification of host function result returning (zero and positive values are for success, and the negative values are for failure codes).

##### New prototype

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

#### ext_offchain_http_request_write_body

##### Existing prototype

```wat
(func $ext_offchain_http_request_write_body_version_1
    (param $request_id i32) (param $chunk i64) (param $deadline i64) (result i64))
```

##### Changes

The function used to return a SCALE-encoded `Result` value in a host-allocated buffer. That is changed to return a primitive value denoting the operation result. The result interpretation has been changed to promote the unification of host function result returning (zero and positive values are for success, and the negative values are for failure codes).

##### New prototype

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

#### ext_offchain_http_response_wait

##### Existing prototype

```wat
(func $ext_offchain_http_response_wait_version_1
    (param $ids i64) (param $deadline i64) (result i64))
```

##### Changes

The function used to return a SCALE-encoded array of request statuses in a host-allocated buffer. It is changed to accept the output buffer of a known size and fill it with request statuses.

##### New prototype

```wat
(func $ext_offchain_http_response_wait_version_2
    (param $ids i64) (param $deadline i64) (param $out i64))
```

##### Arguments

* `ids` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the SCALE-encoded array of started request IDs, as returned by `ext_offchain_http_request_start`;
* `deadline` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the SCALE-encoded Option value ([Definition 200](https://spec.polkadot.network/id-cryptography-encoding#defn-option-type)) containing the UNIX timestamp ([Definition 191](https://spec.polkadot.network/id-cryptography-encoding#defn-unix-time)). Passing `None` blocks indefinitely;
* `out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the buffer of `i32` integers where the request statuses will be stored. The number of elements of the buffer must be strictly equal to the number of elements in the `ids` array; otherwise, the function panics.

#### ext_offchain_http_response_headers

##### Existing prototype

```wat
(func $ext_offchain_http_response_headers_version_1
    (param $request_id i32) (result i64))
```

##### Changes

Considered obsolete in favor of `ext_offchain_http_response_header_name` and `ext_offchain_http_response_header_value`. Cannot be used in a runtime using the new-style of entry-point.

#### ext_offchain_http_response_header_name

##### Changes

New function to replace functionality of `ext_offchain_http_response_headers` with iterative approach. Reads a header name at a given index into a runtime-allocated buffer provided.

##### New prototype

```wat
(func $ext_offchain_http_response_header_name_version_1
    (param $request_id i32) (param $header_index i32) (param $out i64) (result i64))
```

##### Arguments

* `request_id` is an i32 integer indicating the ID of the started request, as returned by `ext_offchain_http_request_start`;
* `header_index` is an i32 integer indicating the index of the header requested, starting from zero;
* `out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the buffer where the header name will be stored. The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are unchanged;

##### Result

The result is an optional positive integer ([New Definition I](#new-def-i)), representing either the full length of the header name or the _absence_ of the header with such index.

#### ext_offchain_http_response_header_value

##### Changes

New function to replace functionality of `ext_offchain_http_response_headers` with iterative approach. Reads a header value at a given index into a runtime-allocated buffer provided.

##### New prototype

```wat
(func $ext_offchain_http_response_header_value_version_1
    (param $request_id i32) (param $header_index i32) (param $out i64) (result i64))
```

##### Arguments

* `request_id` is an i32 integer indicating the ID of the started request, as returned by `ext_offchain_http_request_start`;
* `header_index` is an i32 integer indicating the index of the header requested, starting from zero;
* `out` is a pointer-size ([Definition 216](https://spec.polkadot.network/chap-host-api#defn-runtime-pointer-size)) to the buffer where the header value will be stored. The value is actually stored only if the buffer is large enough. Otherwise, the buffer contents are unchanged;

##### Result

The result is an optional positive integer ([New Definition I](#new-def-i)), representing either the full length of the header value or the _absence_ of the header with such index.

#### ext_offchain_http_response_read_body

##### Existing prototype

```wat
(func $ext_offchain_http_response_read_body_version_1
    (param $request_id i32) (param $buffer i64) (param $deadline i64) (result i64))
```

##### Changes

The function has already been using a runtime-allocated buffer to return its value. However, the result of the operation was returned as a host-allocated SCALE-encoded `Result`. It is changed to return a primitive indicating either the length written or an error.

##### New prototype

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

#### ext_allocator_{malloc|free}

##### Existing prototype

```wat
(func $ext_allocator_malloc_version_1 (param $size i32) (result i32))
(func $ext_allocator_free_version_1 (param $ptr i32))
```

The functions are considered obsolete and cannot be used in a runtime using the new-style of entry-point.

#### ext_input_read

##### Changes

A new function providing means of passing input data from the host to the runtime. Previously, the host allocated a buffer and passed a pointer to it to the runtime. With the runtime allocator, it's not possible anymore, so the input data passing protocol changed (see "Other changes" section below). This function is required to support that change.

##### New prototype

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

After this RFC is implemented, such entrypoints are only supported for the legacy runtimes using the host-side allocator. All the new runtimes, using runtime-side allocator, must use new entry point signature:

```wat
(func $runtime_entrypoint (param $len i32) (result i64))
```

A runtime function called through such an entrypoint gets the length of SCALE-encoded input data as its only argument. After that, the function must allocate exactly the amount of bytes it is requested, and call the `ext_input_read` host function to obtain the encoded input data.

If a runtime happens to import both functions that allocate on the host side and functions that allocate on the runtime side, the host must not proceed with execution of such a runtime, aborting before the execution takes place.
