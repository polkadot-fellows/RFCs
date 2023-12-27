# RFC-0061: Support allocator inside of runtime

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 27 December 2023                                            |
| **Description** | Supporting runtime built-in allocator makes the substrate runtime more versatile |
| **Authors**     | Jiahao Ye |

## Summary

Currently, substrate runtime use an simple allocator defined by host side. Every runtime MUST
import these allocator functions for normal execution. This situation make runtime code not versatile enough.

So this RFC proposes to define a new spec for allocator part to make substrate runtime more generic.

## Motivation

Since this RFC define a new way for allocator, we now regard the old one as `legacy` allocator.
As we all know, since the allocator implementation details are defined by the substrate client, parachain/parathread cannot customize memory allocator algorithm, so the new specification allows the runtime to customize memory allocation, and then export the allocator function according to the specification for the client side to use.
Another benefit is that some new host functions can be designed without allocating memory on the client, which may have potential performance improvements. Also it will help provide a unified and clean specification if substrate runtime support multi-targets(e.g. RISC-V).
There is also a potential benefit. Many programming languages that support compilation to wasm may not be friendly to supporting external allocator. This is beneficial for other programming languages ​​to enter the substrate runtime ecosystem.
The last and most important benefit is that for offchain context execution, the runtime can fully support pure wasm. What this means here is that all imported host functions could not actually be called (as stub functions), then the various verification logic of the runtime can be converted into pure wasm, which provides the possibility for the substrate runtime to run block verification in other environments ( such as in browsers and other non-substrate environments).

## Stakeholders

No attempt was made at convincing stakeholders.

## Explanation

### Runtime side spec

This section contains a list of functions should be exported by substrate runtime.

We define the spec as version 1, so the following `dummy` function `v1` MUST be exported to hint
client that runtime is using version 1 spec, otherwise rollback to `legacy` allocator.
The function should never be used, and its name is only for version checking.

```wat
  (export "v1" (func $v1))
```

Choose this way is more generic than custom section since many other tools do not support custom section very well. But if an environment want to run it, it should always be possible to parse
the export section.

The allocator functions are:

```wat
(export "alloc" (func $alloc))
(export "dealloc" (func $dealloc))
(export "realloc" (func $realloc))
```

Their signatures are:

```wat
(func $alloc (param $size i32) (result i32))
(func $dealloc (param $addr i32) (param $size i32))
(func $realloc (param $addr i32) (param $size i32) (param $new_size i32) (result i32))
```

Note: `dealloc`/`realloc` is not used currently, but for the functional integrity.

The following imports are disabled.

The two kind of allocators(`leagcy` and `v1`) cannot know each other, and importing them will cause abnormal memory allocation.

```wat
(import "env" "ext_allocator_free_version_1" (func $ext_allocator_free_version_1 (type 0)))
(import "env" "ext_allocator_malloc_version_1" (func $ext_allocator_malloc_version_1 (type 1)))
```

The following export could be removed. The client side no need to know heap base.

```wat
  (export "__heap_base" (global 2))
```

### Client side spec

During instantiating time, add a version checking stage for wasm executor before any other wasm module checking.
Check if parsed wasm module contains a exported `v1` function:

- If not exist, we predicate it using legacy allocator, just do normal checking like before. Set legacy allocator be `Some` while set `v1` allocator be `None`.
- If exist, we predicate it using `v1` allocator. And then we lookup and hold the exported `alloc` function for the total lifestyle of instance, return error if not exist. Set legacy allocator be `None` while set `v1` allocator be `Some`.
- When wasm host functions or other entrypoint call(e.g. `runtime_apis`/`validate_block`) need to allocate memory, check if instance hold the `alloc`, if hold just call it otherwise call the legacy
allocator.

Detail-heavy explanation of the RFC, suitable for explanation to an implementer of the changeset. This should address corner cases in detail and provide justification behind decisions, and provide rationale for how the design meets the solution requirements.

## Drawbacks

The allocator inside of the runtime will make code size bigger, but it's not obvious.
The allocator inside of the runtime maybe slow down(or speed up) the runtime, still not obvious.

We could ignore these drawbacks since they are not prominent. And the execution efficiency is highly decided by runtime developer. We could not prevent a poor efficiency if developer want to do it.

## Testing, Security, and Privacy

Keep the legacy allocator runtime test cases, and add new feature to compile test cases for `v1` allocator spec. And then update the test asserts.

Update template runtime to enable `v1` spec. Once the dev network runs well, it seems that the spec is implmented correctly.

## Performance, Ergonomics, and Compatibility

### Performance

As the above says, not obvious impact about performance. And `polkadot-sdk` could offer the best practice allocator for all chains.
Third party also could customized by theirself. So the performance could be improved over time.

### Ergonomics

Only for runtime developer, Just need to import a new crate and enable a new feature. Maybe it's convienient for other wasm-target language to implment.

### Compatibility

It's 100% compatible. Only Some runtime configs and executor configs need to be depreacted.

For support new runtime spec, we MUST upgrade the client binary to support new spec of client part firstly.

We SHALL add an optional primtive crate to enable the version 1 spec and disable the legacy allocator by cargo feature.
For the first year, we SHALL disable the v1 by default, and enable it by default start in the next year.

## Prior Art and References

- [Move the allocator inside of the runtime](https://github.com/paritytech/substrate/issues/11883)
- [Add new allocator design](https://github.com/paritytech/polkadot-sdk/pull/1658)

## Unresolved Questions

None at this time.

## Future Directions and Related Material

The content discussed with RFC xxx is basically orthogonal, but it could still be considered together, and it is preferred that this rfc be implmentented first.

This feature could make substrate runtime be easier supported by other languages and integreted into other ecosystem.
