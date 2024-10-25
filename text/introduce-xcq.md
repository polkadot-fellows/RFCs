# RFC-0000: Introduce XCQ(Cross Consensus Query)

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | Oct 24 2024                                                                    |
| **Description** | Introduce XCQ (Cross Consensus Query)                                                          |
| **Authors**     | Bryan Chen, Jiyuan Zheng |

## Summary

This proposal introduces XCQ (Cross Consensus Query), which aims to serve as an intermediary layer between different chain runtime implementations and tools/UIs, to provide a unified interface for cross-chain queries.
`XCQ` abstracts away concrete implementations across chains and supports custom query computations.

Use cases benefiting from `XCQ` include:
- XCM bridge UI:
  - Query asset balances
  - Query XCM weight and fee from hop and dest chains
- Wallets:
  - Query asset balances
  - Query weights and fees for operations across chains
- Universal dApp that supports all the parachains:
  - Perform Feature discovery
  - Query pallet-specific features
  - Construct extrinsics by querying pallet index, call index, etc

## Motivation

In Substrate, runtime APIs facilitate off-chain clients in reading the state of the consensus system.
However, different chains may expose different APIs for a similar query or have varying data types, such as doing custom transformations on direct data, or differing `AccountId` types.
This diversity also extends to client-side, which may require custom computations over runtime APIs in various use cases.
Therefore, tools and UI developers often access storage directly and reimplement custom computations to convert data into user-friendly representations, leading to duplicated code between Rust runtime logic and UI JS/TS logic.
This duplication increases workload and potential for bugs.

Therefore, A system is needed to serve as an intermediary layer between concrete chain runtime implementations and tools/UIs, to provide a unified interface for cross-chain queries.

## Stakeholders

- Runtime Developers
- Tools/UI Developers

## Explanation

The overall query pattern of the XCQ consists of three components:

- Runtime: View-functions across different pallets are amalgamated through an extension-based system.
- XCQ query: Custom computations over view-function results are encapsulated via PolkaVM programs.
- XCQ query arguments: Query arguments like accounts to be queried are also passed.

### XCQ Runtime API

The runtime API for off-chain query usage includes two methods:

- `execute_query`: Executes the query and returns the result. It takes the query, input, and weight limit as arguments.
The query is the query program in PolkaVM program binary format.
The input is the query arguments that is SCALE-encoded.
The weight limit is the maximum weight allowed for the query execution.
- `metadata`: Return metadata of supported extensions, serving as a feature discovery functionality

**Example XCQ Runtime API**:
```rust
decl_runtime_apis! {
    pub trait XcqApi {
        fn execute_query(query: Vec<u8>, input: Vec<u8>, weight_limit: u64) -> XcqResult;
        fn metadata() -> Vec<u8>;
    }
}
type XcqResult =  Result<XcqResponse, XcqError>;
type XcqResponse = Vec<u8>;
enum XcqError {
    Custom(String),
}
```

**Example metadata**:
```rust
Metadata {
    extensions: vec![
        ExtensionMetadata {
            name: "ExtensionCore",
            methods: vec![MethodMetadata {
                name: "has_extension",
                inputs: vec![MethodParamMetadata {
                    name: "id",
                    ty: XcqType::Primitive(PrimitiveType::U64)
                }],
                output: XcqType::Primitive(PrimitiveType::Bool)
            }]
        },
        ExtensionMetadata {
            name: "ExtensionFungibles",
            methods: vec![
                MethodMetadata {
                    name: "total_supply",
                    inputs: vec![MethodParamMetadata {
                        name: "asset",
                        ty: XcqType::Primitive(PrimitiveType::U32)
                    }],
                    output: XcqType::Primitive(PrimitiveType::U64)
                },
                MethodMetadata {
                    name: "balance",
                    inputs: vec![
                        MethodParamMetadata {
                            name: "asset",
                            ty: XcqType::Primitive(PrimitiveType::U32)
                        },
                        MethodParamMetadata {
                            name: "who",
                            ty: XcqType::Primitive(PrimitiveType::H256)
                        }
                    ],
                    output: XcqType::Primitive(PrimitiveType::U64)
                }
            ]
        }
    ]
}
```

Note: `ty` is represented by a meta-type system called `xcq-types`

#### xcq-types

`xcq-types` is a meta-type system similar to `scale-info` but simpler.
It enables different chains with different type definitions to work via a common operation.
Front-end codes constructs call data to XCQ programs according to metadata provided by different chains.

### XCQ Executor

An XCQ executor is a runtime module that executes XCQ queries.
It has a core method `execute` that takes a PolkaVM program binary,
method name of the exported functions in the PolkaVM program, input arguments, and weight limit that the PolkaVM program can consume.

```rust
pub fn execute(
    &mut self,
    raw_blob: &[u8],
    method: &str,
    input: &[u8],
    weight_limit: u64,
) -> Result<Vec<u8>, XcqExecutorError> {...}
```

### XCQ Extension

An extension-based design is essential for several reasons:
- Diffent chains may have different data types for semantically similar queries, making it challenging to standardize function calls across them.
An extension-based design with optional associated types allows these diverse data types to be specified and utilized effectively.
- Function calls distributed across various pallets can be amalgamated into a single extension, simplifying the development process and ensuring a more cohesive and maintainable codebase.
- Extensions are identified via an extension ID, a hash based on the extension name and method sets. An update to an extension is treated as a new extension.
- New functionalities can be added without upgrading the core part of the XCQ.
- Ensure the core part is in a minimal scope.

Essential components of an XCQ extension system include:

- `decl_extension` macro: Defines an extension as a Rust trait with optional associated types.

**Example usage**:
```rust
use xcq_extension::decl_extension;

pub trait Config {
    type AssetId: Codec;
    type AccountId: Codec;
    type Balance: Codec;
}
decl_extensions! {
    pub trait ExtensionFungibles {
        type Config: Config;
        fn total_supply(asset: <Self::Config as Config>::AssetId) -> <Self::Config as Config>::Balance;
        fn balance(asset: <Self::Config as Config>::AssetId, who: <Self::Config as Config>::AccountId) -> <Self::Config as Config>::Balance;
    }
}
```

- `impl_extensions` macro: Generates extension implementations and extension-level metadata.

**Example Usage**:

```rust
// ExtensionImpl is an aggregate struct to impl different extensions
struct ExtensionImpl;
impl extension_fungibles::Config for ExtensionImpl {
    type AssetId = u32;
    type AccountId = [u8; 32];
    type Balance = u64;
}
impl_extensions! {
    impl extension_core::ExtensionCore for ExtensionImpl {
        type Config = ExtensionImpl;
        fn has_extension(id: <Self::Config as extension_core::Config>::ExtensionId) -> bool {
            matches!(id, 0 | 1)
        }
    }

    impl extension_fungibles::ExtensionFungibles for ExtensionImpl {
        type Config = ExtensionImpl;
        #[allow(unused_variables)]
        fn total_supply(asset: <Self::Config as extension_fungibles::Config>::AssetId) -> <Self::Config as extension_fungibles::Config>::Balance {
            200
        }
        #[allow(unused_variables)]
        fn balance(asset: <Self::Config as extension_fungibles::Config>::AssetId, who: <Self::Config as extension_fungibles::Config>::AccountId) -> <Self::Config as extension_fungibles::Config>::Balance {
            100
        }
    }
}
```

- `ExtensionExecutor`: Connects extension implementations and `xcq-executor`.
All methods of all extensions that a chain supports are amalgamated into a single `host_call` entry.
Then this entry is registered as a typed function entry in PolkaVM Linker within the `xcq-executor`.
Given the extension ID and call data encoded in SCALE format, call requests from the guest XCQ program are dispatched to corresponding extensions:
```rust
linker
    .define_typed(
        "host_call",
        move |caller: Caller<'_, Self::UserData>,
              extension_id: u64,
              call_ptr: u32,
              call_len: u32|
              -> Result<u64, ExtensionError> {
                  ...
              });
```
- `PermController`: Filters guest XCQ program calling requests, useful for host chains to disable some queries by filtering invoking sources.
```rust
pub trait PermController {
    fn is_allowed(extension_id: ExtensionIdTy, call: &[u8], source: InvokeSource) -> bool;
}
#[derive(Copy, Clone)]
pub enum InvokeSource {
    RuntimeAPI,
    XCM,
    Extrinsic,
    Runtime,
}
```

### XCQ Program Structure

An XCQ program is structured as a PolkaVM program with the following key components:

- Imported Functions:
   - `host_call`: Dispatches call requests to the XCQ Extension Executor.
     ```rust
     #[polkavm_derive::polkavm_import]
     extern "C" {
         fn host_call(extension_id: u64, call_ptr: u32, call_len: u32) -> u64;
     }
     ```
     Results are SCALE-encoded bytes, with the pointer address (lower 32 bits) and length (higher 32 bits) packed into a u64.

   - `return_ty`: Returns the type of the function call result.
     ```rust
     #[polkavm_derive::polkavm_import]
     extern "C" {
         fn return_ty(extension_id: u64, call_index: u32) -> u64;
     }
     ```
     Results are SCALE-encoded bytes, with the pointer address and length packed similarly to `host_call`.

- Exported Functions:
   - `main`: The entry point of the XCQ program. It performs type checking and executes the query.

### XCQ Program Execution Flow

The interaction between an XCQ program and the XCQ Extension Executor follows these steps:

1. Program Loading: The Executor loads the PolkaVM program binary.

2. Environment Setup: The Executor configures the PolkaVM environment, registering host functions like `host_call` and `return_ty`.

3. Main Function Execution: The Executor calls the program's `main` function, passing serialized query arguments.

4. Program Execution:
   a. Type Checking: The program uses the `return_ty` function to ensure compatibility with supported chain extensions.
   b. Query Execution: The program executes the query using `host_call` and performs custom computations.
   c. Result Serialization: The program serializes the result, writes it to shared memory, and returns the pointer and length to the executor.

5. Result Retrieval: The Executor reads the result from shared memory and returns it to the caller.

This structure allows for flexible, type-safe querying across different blockchain implementations while maintaining a consistent interface for developers.

## Drawbacks

### Performance issues

- XCQ Query Program Size: The size of XCQ query programs should be optimized to ensure efficient storage and transmission via XCMP/HRMP.
The specification should define a target size limit for query programs and outline strategies for reducing program size without compromising functionality. This may include techniques such as:
  - Exploring modular program structures that allow for separate storage and transmission of core logic and supporting elements. PolkaVM supports spliting the program into multiple modules.
  - Establishing guidelines for optimizing dynamic memory usage within query programs

### User experience issues

- Debugging: Currently, there is no full-fledged debuggers for PolkaVM programs. The only debugging approach is to set the PolkaVM backend in interpreter mode and then log the operations at the assembly level, which is too low-level to debug efficiently.
- Gas computation: According to [this issue](https://github.com/koute/polkavm/issues/17), the gas cost model of PolkaVM is not accurate for now.

## Testing, Security, and Privacy

- Testing:
  - A comprehensive test suite should be developed to cover various scenarios:
    - Positive test cases:
      - Basic queries with various extensions, data types, return values, custom computations, etc.
      - Accurate conversion between given weight limit and the gas limit of PolkaVM
    - Negative test cases:
      - Queries exceeding weight limits
      - Invoking queries from unauthorized sources
    - Edge cases:
      - Queries with minimal or maximum allowed input sizes
      - Queries requesting data at the boundaries of available ranges
  - Integration tests to ensure proper interaction with off-chain wallets/UI and on-chain XCM, including the aforementioned use cases in Motivation section.

- Security:
  - The XCQ system must enforce a strict read-only policy for all query operations. A mechanism should be implemented to prevent any state-changing operations within XCQ queries.
  - The security model should include measures to prevent potential attack vectors such as resource exhaustion or malicious query injection.
  - Clear guidelines and best practices should be provided for parachain developers to ensure secure implementation.

## Performance, Ergonomics, and Compatibility

### Performance

It's a new functionality, which doesn't modify the existing implementations.

### Ergonomics

The proposal facilitate the wallets and dApps developers. Developers no longer need to examine every concrete implementation to support conceptually similar operations across different chains. Additionally, they gain a more modular development experience through encapsulating custom computations over the exposed APIs in PolkaVM programs.
### Compatibility

The proposal defines new apis, which doesn't break compatibility with existing interfaces.

## Prior Art and References

There are several discussions related to the proposal, including:

- <https://forum.polkadot.network/t/wasm-view-functions/1045> is the original discussion about having a mechanism to avoid code duplications between the runtime and front-ends/wallets. In the original design, the custom computations are compiled as a wasm function.
- <https://github.com/paritytech/polkadot-sdk/issues/216> is the issue tracking the view functions implementation in runtime implementations
- <https://github.com/paritytech/polkadot-sdk/pull/4722> is the on-going `view function` pull request. It works at pallet level. If two chains use two different pallets to provide similar functionalities, like pallet-assets and pallet-erc20, we still need to have different codes to support. Therefore, it doesn't conflict with XCQ, and can be utilized by XCQ.

## Unresolved Questions


## Future Directions and Related Material

Since XCQ are supported both in off-chain and on-chain, a related XCM-Format RFC should be proposed.
