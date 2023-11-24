# RFC-0054: Remove the concept of "heap pages" from the client

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2023-11-24                                                                                  |
| **Description** | Remove the concept of heap pages from the client and move it to the runtime.                |
| **Authors**     | Pierre Krieger                                                                              |

## Summary

Rather that enforce a limit to the total memory consumption on the client side by loading the value at `:heappages`, enforce that limit on the runtime side.

## Motivation

From the early days of Substrate up until recently, the runtime was present in two forms: the wasm runtime (wasm bytecode passed through an interpreter) and the native runtime (native code directly run by the client).

Since the wasm runtime has a lower amount of available memory (4 GiB maximum) compared to the native runtime, and in order to ensure sure that the wasm and native runtimes always produce the same outcome, it was necessary to clamp the amount of memory available to both runtimes to the same value.

In order to achieve this, a special storage key (a "well-known" key) `:heappages` was introduced and represents the number of "wasm pages" (one page equals 64kiB) of memory that are available to the memory allocator of the runtimes. If this storage key is absent, it defaults to 2048, which is 128 MiB.

The native runtime has since then been disappeared, but the concept of "heap pages" still exists. This RFC proposes a simplification to the design of Polkadot by removing the concept of "heap pages" as is currently known, and proposes alternative ways to achieve the goal of limiting the amount of memory available.

## Stakeholders

Client implementers and low-level runtime developers.

## Explanation

This RFC proposes the following changes to the client:

- The client no longer considers `:heappages` as special.
- The memory allocator of the runtime is no longer bounded by the value of `:heappages`.

With these changes, the memory available to the runtime is now only bounded by the available memory space (4 GiB), and optionally by the maximum amount of memory specified in the Wasm binary (see https://webassembly.github.io/spec/core/bikeshed/#memories%E2%91%A0). In Rust, the latter can be controlled during compilation with the flag `-Clink-arg=--max-memory=...`.

Since the client-side change is strictly more tolerant than before, we can performance the change immediately without having to worry about backwards compatibility.

This RFC proposes three alternative paths (different chains might choose to follow different paths):

- Path A: add back the same memory limit to the runtime, like so:

    - At initialization, the runtime loads the value of `:heappages` from the storage (using `ext_storage_get` or similar), and sets a global variable to the decoded value.
    - The runtime tracks the total amount of memory that it has allocated using its instance of `#[global_allocator]` (https://github.com/paritytech/polkadot-sdk/blob/e3242d2c1e2018395c218357046cc88caaed78f3/substrate/primitives/io/src/lib.rs#L1748-L1762). This tracking should also be added around the host functions that perform allocations.
    - If an allocation is attempted that would go over the value in the global variable, the memory allocation fails.

- Path B: define the memory limit using the `-Clink-arg=--max-memory=...` flag.

- Path C: don't add anything to the runtime. This is effectively the same as setting the memory limit to ~4 GiB (compared to the current default limit of 128 MiB). This solution is viable only because we're compiling for 32bits wasm rather than for example 64bits wasm. If we ever compile for 64bits wasm, this would need to be revisited.

Each parachain can choose the option that they prefer, but the author of this RFC strongly suggests either option C or B.

## Drawbacks

In case of path A, there is one situation where the behaviour pre-RFC is not equivalent to the one post-RFC: when a host function that performs an allocation (for example `ext_storage_get`) is called, without this RFC this allocation might fail due to reaching the maximum heap pages, while after this RFC this will always succeed.
This is most likely not a problem, as storage values aren't supposed to be larger than a few megabytes at the very maximum.

In the unfortunate event where the runtime runs out of memory, path B would make it more difficult to relax the memory limit, as we would need to re-upload the entire Wasm, compared to updating only `:heappages` in path A or before this RFC.
In the case where the runtime runs out of memory only in the specific event where the Wasm runtime is modified, this could brick the chain. However, this situation is no different than the thousands of other ways that a bug in the runtime can brick a chain, and there's no reason to be particularily worried about this situation in particular.

## Testing, Security, and Privacy

This RFC would reduce the chance of a consensus issue between clients.
The `:heappages` are a rather obscure feature, and it is not clear what happens in some corner cases such as the value being too large (error? clamp?) or malformed. This RFC would completely erase these questions.

## Performance, Ergonomics, and Compatibility

### Performance

In case of path A, it is unclear how performances would be affected. Path A consists in moving client-side operations to the runtime without changing these operations, and as such performance differences are expected to be minimal. Overall, we're talking about one addition/subtraction per malloc and per free, so this is more than likely completely negligible.

In case of path B and C, the performance gain would be a net positive, as this RFC strictly removes things.

### Ergonomics

This RFC would isolate the client and runtime more from each other, making it a bit easier to reason about the client or the runtime in isolation.

### Compatibility

Not a breaking change. RFC can be applied immediately without any transition period.

## Prior Art and References

None.

## Unresolved Questions

None.

## Future Directions and Related Material

This RFC follows the same path as https://github.com/polkadot-fellows/RFCs/pull/4 by scoping everything related to memory allocations to the runtime.
