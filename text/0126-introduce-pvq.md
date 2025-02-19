# RFC-0126: Introduce PVQ(PolkaVM Query)

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | Oct 25 2024                                                                    |
| **Description** | Introduce PVQ (PolkaVM Query)                                                          |
| **Authors**     | Bryan Chen, Jiyuan Zheng |

## Summary

This proposal introduces PVQ (PolkaVM Query), which aims to serve as an intermediary layer between different chain runtime implementations and tools/UIs, to provide a unified interface for cross-chain queries.
`PVQ` abstracts away concrete implementations across chains and supports custom query computations.

Use cases benefiting from `PVQ`:

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
This duplication increases workload and is prone to bugs.

Therefore, a system is needed to serve as an intermediary layer between concrete chain runtime implementations and tools/UIs, to provide a unified interface for cross-chain queries.

## Stakeholders

- Runtime Developers
- Tools/UI Developers

## Explanation

The overall query pattern of PVQ involves three components:

- PVQ Extension: View-functions across different pallets are amalgamated through an extension-based system.
- PVQ Executor:  Custom computations over view-function results is performed via a PVM invocation.
- RuntimeAPI/XCM integration: Support off-chain and cross-chain scenarios.

### PVQ Extension

An extension-based design is suitable for several reasons:

- Different chains may have different data types (i.e account balance), making it challenging to standardize function calls across them.
An extension-based design with optional associated types allows these diverse data types to be specified and utilized effectively.
- Function calls distributed across various pallets can be amalgamated into a single extension, simplifying the development process and ensuring a more cohesive and maintainable codebase.
- In the presence of a hash-based extension addressing mechanism, new functionalities can be added without upgrading the core version of the PVQ, which ensures a permission-less manner and makes the core part in a minimal scope.

Therefore, essential components of a PVQ extension system include:

- A hash-based extension id generation mechanism for addressing and versioning. The hash value derives from the extension name and its method sets. Any update to an extension is treated as a new extension.

- `extension_decl` macro: Defines an extension as a Rust trait with optional associated types.

**Example Design**:

```rust
#[extension_decl]
mod extension_core {
    #[extension_decl::config]
    pub trait Config {
        type ExtensionId: Codec;
    }
    #[extension_decl::view_fns]
    pub trait ExtensionCore<T: Config> {
        fn has_extension(id: T::ExtensionId) -> bool;
    }
}
#[extension_decl]
mod extension_fungibles {
    #[extension_decl::config]
    pub trait Config {
        type AssetId: Codec;
        type AccountId: Codec;
        type Balance: Codec;
    }

    #[extension_decl::view_fns]
    pub trait ExtensionFungibles<T: Config> {
        fn total_supply(asset: T::AssetId) -> T::Balance;
        fn balance(asset: T::AssetId, who: T::AccountId) -> T::Balance;
    }
}
```

- `extensions_impl` macro: Amalgamates extension implementations and generates extension-level metadata.

**Example Design**:

```rust
#[extensions_impl]
mod extensions_impl {

    #[extensions_impl::extensions_config]
    pub struct ExtensionsConfig;
    #[extensions_impl::extensions_struct]
    pub struct Extensions;

    #[extensions_impl::extensions_config_impl]
    impl extension_core::Config for ExtensionsConfig {
        type ExtensionId = u64;
    }

    #[extensions_impl::extensions_config_impl]
    impl extension_fungibles::Config for ExtensionsConfig {
        type AssetId = u32;
        type AccountId = [u8; 32];
        type Balance = u64;
    }

    #[extensions_impl::extension_struct_impl]
    impl extension_core::ExtensionCore<ExtensionConfig> for Extensions {
        fn has_extension(id: u64) -> bool {
            matches!(id, 0 | 1)
        }
    }

    #[extensions_impl::extension_struct_impl]
    impl extension_fungibles::ExtensionFungibles<ExtensionConfig> for Extensions {
        fn total_supply(asset: u32) -> u64 {
            200
        }
        fn balance(asset: u32, who: [u8; 32]) -> u64 {
            100
        }
    }
}
```

### PVQ Executer

The PVQ Executer, should basically be formulated as a PVM program-argument invocation described in [Appendix A.8 in JAM Gray Paper](https://graypaper.com/). Since the invocation itself only includes custom computations logic, while all the state access is performed by host functions, which means the invocation itself is stateless.

Practically, it has a core method `execute` to initialize the program[^1] and perform argument invocation, which takes:

- `program`: The PVQ main binary which is a trimmed standard PolkaVM binary.
- `args`: The PVQ query data.
- `ref_time_limit`: Weight limit that the PolkaVM program can consume.

```rust
pub fn execute(
    &mut self,
    program: &[u8],
    args: &[u8],
    ref_time_limit: u64,
) -> Result<Vec<u8>, PvqExecutorError> {...}
```

It also has a executor initialization method to prepare PVM execution context and externality including registering host functions in advance:

```rust
pub fn new(context: PvqContext) -> Self
```

#### PVM Program initialization and Results Return

The PVM program initialization stage within the `execute` function of the `PVQ Executer` is detailed as follows:

- PVQ code size limit:
The standard PVM code format includes not only the instructions and jump table, but also information on the state of the RAM at program start. However, as aforementioned, the PVQ invocation itself is stateless. Therefore we can trim the standard code format. Specifically, the read-write(heap) data, stack section with their corresponding length encoding can be totally eliminated while the read-only data only includes utility data like host function extension id, which can be limited to a reasonable small size.

- Entrypoint:
Since the custom PVQ computation can be formulated as a single entrypoint, we can statically define it. It should starts at instruction 0.

- Argument passing:
Query data is encoded as invocation arguments. As discussed in [Equation A.36 in the Gray Paper](https://graypaper.com/), arguments starts at `0xfeff0000` which is the stored in `a0`(7th register), and the length is specified at `a1`(8th register).

- Return results
As discussed in [Equation A.39 in the Gray Paper](https://graypaper.com/), the invocation returns its output through register `a0` (7th register), which contains a pointer to the output buffer. Register `a1`(8th register) contains the length of the output buffer. The output buffer must be allocated within the program's memory space and contain the SCALE-encoded return value.

#### Host Calls

- `extension_call`: A unified entry point that routes queries to various extensions. It accepts two parameters:
  1. `extension_id`
  An `u64` value for selecting which extension to query, split across two 32-bit registers: lower 32 bits in `a0` and upper 32 bits in `a1`
  2. `query_data`
  SCALE-encoded value including the view function index and its arguments, pointer in `a2` and length in `a3`.
  The returned results are stored in registers `a0` (pointer) and `a1` (length). The output buffer contains the SCALE-encoded return value.
The host call also has the ability to filter call data requests based on their source of invocation (e.g., Runtime, Extrinsics, RuntimeAPI, or XCM).

- `return_ty`: Returns the type of a specific view function in a specific extension for type assertion. It accepts two parameters:
  1. `extension_id`
  An `u64` value for selecting which extension to query, split across two 32-bit registers: lower 32 bits in `a0` and upper 32 bits in `a1`
  2. `query_index`
  A `u32` value indicating the index of the view function in the extension, stored in register `a2`
The returned results are stored in register `a0` (pointer) and `a1` (length). The output buffer contains the SCALE-encoded return type.

### RuntimeAPI Integration

The runtime API for off-chain query usage includes two methods:

- `execute_query`: Executes the query and returns the result. It takes the query, input, and weight limit as arguments.
The `query` is the PVQ binary in a trimmed standard PVM program binary format.
The `input` is the query arguments that is SCALE-encoded.
The `ref_time_limit` is the maximum weight allowed for the query execution.

- `metadata`: Return metadata of supported extensions (introduced in later section) and methods, serving as a feature discovery functionality.
The representation and encoding mechanism is similar to the [`frame-metadata`](https://github.com/paritytech/frame-metadata/), using `scale-info`.

#### Example PVQ Runtime API

```rust
decl_runtime_apis! {
    pub trait PvqApi {
        fn execute_query(query: Vec<u8>, input: Vec<u8>, ref_time_limit: u64) -> PvqResult;
        fn metadata() -> Vec<u8>;
    }
}
type PvqResult =  Result<PvqResponse, PvqError>;
type PvqResponse = Vec<u8>;
enum PvqError {
    Custom(String),
}
```

#### Example Metadata (before SCALE-encoded)

```rust
pub struct Metadata {
    pub types: PortableRegistry,
    pub extensions: Vec<ExtensionMetadata<PortableForm>>,
}
```

### XCM integration

The integration of PVQ into XCM is achieved by adding a new instruction to XCM, as well as a new variant of the `Response` type in `QueryResponse` message.:

- A new `ReportQuery` instruction

```rust
ReportQuery {
  query: BoundedVec<u8, SIZE_LIMIT>,
  max_weight: Weight,
  info: QueryResponseInfo,
}
```

Report to a given destination the results of an PVQ. After query, a `QueryResponse` message of type `PvqResult` will be sent to the described destination.

Operands:

- `query: BoundedVec<u8, SIZE_LIMIT>`: which is the encoded bytes of the tuple `(program, input)`:
  - `program: Vec<u8>`: The PVQ binary.
  - `input: Vec<u8>`: The PVQ arguments.
where `SIZE_LIMIT` is the generic parameter type size limit (i.e. 2MB).

- `max_weight: Weight`: The maximum weight that the query should take.
- `info: QueryResponseInfo`: Information for making the response.

- Add a new variant to the `Response` type in `QueryResponse`

- `PvqResult = 6 (Vec<u8>)`
The containing bytes is the SCALE-encoded PVQ results.

#### Errors

[//] (details)

## Drawbacks

### Performance issues

- PVQ Program Size: The size of PVQ query programs may not be suitable for efficient storage and transmission via XCMP/HRMP.

### User experience issues

- Debugging: Currently, there is no full-fledged debuggers for PolkaVM programs. The only debugging approach is to set the PolkaVM backend in interpreter mode and then log the operations at the assembly level, which is too low-level to debug efficiently.
- Gas computation: According to [this issue](https://github.com/koute/polkavm/issues/17), the gas cost model of PolkaVM is not detailed for now.

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
  - Integration tests to ensure proper interaction with off-chain wallets/UI and on-chain XCM, including the aforementioned use cases in **Motivation** section.

- Security:
  - The PVQ system must enforce a strict read-only policy for all query operations. A mechanism should be implemented to prevent any state-changing operations within PVQ queries. For example, perform a final rollback in  `frame_support::storage::with_transaction` to ensure the storage won't be changed.
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

- [Original discussion](https://forum.polkadot.network/t/wasm-view-functions/1045) about having a mechanism to avoid code duplications between the runtime and front-ends/wallets. In the original design, the custom computations are compiled as a wasm function.
- [View functions](https://github.com/paritytech/polkadot-sdk/pull/4722) aims to provide view-only functions in pallet level. Additionally, [Facade Project](https://github.com/paritytech/polkadot-sdk/pull/4722) aims to gather and return commonly wanted information in runtime level.
The PVQ does't conflict with them, which can take advantage of these Pallet View Functions / Runtime APIs and allow people to build arbitrary PVQ programs to obtain more custom/complex data that isn't otherwise expressed by these two proposals.

## Unresolved Questions

- The custom computation performed in PVQ program involves serialization and deserialization when across the host call boundary. However, integration with such utilities significantly bloats the binary size except that the result value is simple numeric values. We need to find a way to optimize it.
- The metadata of the PVQ extensions can be integrated into `frame-metadata`'s `CustomMetadata` field, but the trade-offs (i.e. compatibility between versions) need examination.

## Future Directions and Related Material

The implementation work including:

### PVQ Reference Implementation

PVQ Extension Macros, PVQ Executor, RuntimeAPI Integration are implemented in standalone crate.

XCM integration is implemented in `polkadot-sdk` repository.

### PVQ Program Linker

A tool to trim the standard PVM binary format.

### PVQ Dev Console

A PVQ dev console similar to the chain state page in pjs apps.

- Display all the supported extensions and their methods
- Allow user to invoke those methods with custom arguments

### PVQ Registry

Although there's no mandatory central registry for storing PVQ binary in an extension-based design, we can still setup a community-driven registry for storing popular PVQ binaries.

### Integration with existing proposals

Once the PVQ reference implementation and the aforementioned proposals are ready, some apis can be aggregated, i.e. the metadata.

[^1]: [Appendix A.7 in JAM Gray Paper](https://graypaper.com/)
