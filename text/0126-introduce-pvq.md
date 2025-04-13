# RFC-0126: Introduce PVQ (PolkaVM Query)

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | Oct 25, 2024                                                                    |
| **Description** | Introduce PVQ (PolkaVM Query)                                                          |
| **Authors**     | Bryan Chen, Jiyuan Zheng |

## Summary

This proposal introduces PVQ (PolkaVM Query), a unified query interface that bridges different chain runtime implementations and client tools/UIs. PVQ provides an extension-based system where runtime developers can expose chain-specific functionality through standardized interfaces, while allowing client-side developers to perform custom computations on the data through PolkaVM programs. By abstracting away concrete implementations across chains and supporting both off-chain and cross-chain scenarios, PVQ aims to reduce code duplication and development complexity while maintaining flexibility for custom use cases.

## Motivation

In Substrate, runtime APIs facilitate off-chain clients in reading the state of the consensus system.
However, the APIs defined and implemented by individual chains often fall short of meeting the diverse requirements of client-side developers.
For example, client-side developers may want some aggregated data from multiple pallets, or apply various custom transformations on the raw data.
Additionally, chains often implement different APIs and data types (such as `AccountId`) for similar functionality, which increases complexity and development effort on the client side.
As a result, client-side developers frequently resort to directly accessing storage (which is susceptible to breaking changes) and reimplementing custom computations on the raw data. This leads to code duplication between the Rust runtime logic and UI JavaScript/TypeScript logic, increasing development effort and introducing potential for bugs.

Moreover, the diversity also extends to cross-chain queries.

Therefore, a system that serves as an intermediary layer between runtime implementations and client-side implementations with a unified but flexible interface will be beneficial for both sides. It should be able to:

- Allow runtime developers to provide query APIs which may include data across multiple pallets but aggregate these APIs through a unified interface
- Allow client-side developers to query data from this unified interface across different chains while maintaining the flexibility to perform custom transformations on the raw data
- Support cross-chain queries through XCM integration

Use cases that will benefit from such a system:

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

## Stakeholders

- Runtime Developers
- Tools/UI Developers

## Explanation

The core idea of PVQ is to have a unified interface that meets the aforementioned requirements.

On the runtime side, an extension-based system is introduced to serve as a standardization layer across different chains.
Each extension specification defines a set of cohesive APIs.
Runtime developers can freely select which extensions they want to implement, and have full control over how the data is sourced - whether from single or multiple pallet functions, with optional data transformations applied.
The runtime aggregates all implemented extensions into a single unified interface that takes a query program and corresponding arguments, and returns the query result.
This interface will be exposed in two ways: as a Substrate RuntimeAPI for off-chain queries, and as an XCM instruction for cross-chain queries.

On the client side or in XCM use cases, the client can easily detect which extensions are supported by a runtime through the metadata API. This allows for runtime feature discovery and enables clients to adapt their behavior based on available functionality.
Client-side developers can encode their desired custom computation logic into the query program and its arguments, while the actual data access happens through runtime-implemented extensions.

In conclusion, PVQ involves three components:

- PVQ Extension System: Standardize the functionality across different chains.
- PVQ Executor: Aggregates the extensions and perform the query from off-chain or cross-chain.
- RuntimeAPI/XCM Integration: Support off-chain and cross-chain scenarios.

### PVQ Extension System

The PVQ extension system has the following features:

- Defines an extension as a Rust trait with optional associated types.

**Example Design**:

The following code declares two extensions: `extension_core` and `extension_fungibles` with some associated types.

```rust
#[extension_decl]
pub mod extension_core {
    #[extension_decl::extension]
    pub trait ExtensionCore {
        type ExtensionId;
        fn has_extension(id: Self::ExtensionId) -> bool;
    }
}

#[extension_decl]
pub mod extension_fungibles {
    #[extension_decl::extension]
    pub trait ExtensionFungibles {
        type AssetId;
        type Balance;
        type AccountId;
        fn total_supply(asset: Self::AssetId) -> Self::Balance;
        fn balance(asset: Self::AssetId, who: Self::AccountId) -> Self::Balance;
    }
}
```

The following code implements the extensions, amalgamates them and generates the corresponding metadata.

```rust
#[extensions_impl]
pub mod extensions {
    #[extensions_impl::impl_struct]
    pub struct ExtensionsImpl;

    #[extensions_impl::extension]
    impl pvq_extension_core::extension::ExtensionCore for ExtensionsImpl {
        type ExtensionId = u64;
        fn has_extension(id: Self::ExtensionId) -> bool {
            matches!(id, 0 | 1)
        }
    }

    #[extensions_impl::extension]
    impl pvq_extension_fungibles::extension::ExtensionFungibles for ExtensionsImpl {
        type AssetId = u32;
        type AccountId = [u8; 32];
        type Balance = u64;
        fn total_supply(_asset: Self::AssetId) -> Self::Balance {
            100
        }
        fn balance(_asset: Self::AssetId, _who: Self::AccountId) -> Self::Balance {
            100
        }
    }
}
```

- Hash-based extension id generation mechanism

Extensions are uniquely identified by a hash value computed from their name and method names. This means that modifying either the extension name or its method names results in a new extension. This design allows new functionality to be added independently of the PVQ core version, enabling a permissionless extension system while keeping the core implementation minimal.

The extension ID generation can be expressed mathematically as:

$ExtID = twox64(P \parallel E \parallel M_1 \parallel M_2 \parallel ... \parallel M_n)$

Where:

- $P$ is the prefix string constant, `pvq-ext`
- $E$ is the extension name
- $M_1...M_n$ are the method names in lexicographical order
- $\parallel$ represents string concatenation with a separator `@` to avoid collision
- $twox64()$ is the 64-bit xxHash function

- A permission control system allows filtering extension method invocations based on their origin (Runtime, Extrinsics, RuntimeAPI, or XCM). This enables runtime developers to restrict certain functions from being called through specific interfaces, such as preventing access via XCM when desired.

### PVQ Executor

The PVQ Executor provides a unified interface that only takes query programs with corresponding arguments and returns results. It can be formulated as a PVM program-argument invocation, as detailed in [Appendix A.8 in the JAM Gray Paper](https://graypaper.com/). Specifically, we call it PVQ invocation.

#### Program initialization and Results Return

- PVQ program size limit:
While the standard PVM code format contains instructions, jump table, and initial RAM state information, PVQ programs can be significantly trimmed down. This is because PVQ separates computation logic from state access: the computation happens in the program while state access is handled through host functions. This makes the program stateless, allowing us to eliminate the initial read-write (heap) data and stack sections along with their length encodings in the PVQ program binary. The read-only data section can be minimized to only contain essential utility data like host function extension IDs, keeping it within a reasonable size limit.

- Entrypoint:
PVQ programs have a single static entrypoint that begins at instruction 0, since all PVQ computation can be expressed through a single entry point.

- Argument passing:
Query data is encoded as invocation arguments. Specifically, it includes the view function index and its arguments. As discussed in [Equation A.36 in the Gray Paper](https://graypaper.com/), arguments start at `0xfeff0000` which is stored in `a0`(7th register), and the length is specified at `a1`(8th register).

- Return results
As discussed in [Equation A.39 in the Gray Paper](https://graypaper.com/), the invocation returns its output through register `a0` (7th register), which contains a pointer to the output buffer. Register `a1`(8th register) contains the length of the output buffer. The output buffer must be allocated within the program's memory space and contain the SCALE-encoded return value.

#### Host Functions

The following host functions are available to PVQ invocations. The index numbers shown below correspond to the values used in the `ecalli` instruction.

1. `extension_call`: A unified entry point that routes queries to various extensions. It accepts two parameters:

- `extension_id`
  A `u64` value for selecting which extension to query, split across two 32-bit registers: lower 32 bits in `a0` and upper 32 bits in `a1`
- `query_data`
  SCALE-encoded value including the view function index and its arguments, pointer in `a2` and length in `a3`.

The returned results are stored in registers `a0` (pointer) and `a1` (length). The output buffer contains the SCALE-encoded return value.

All host functions must properly account for and deduct gas based on their computational costs.

**Example Rust Implementation using [PolkaVM SDK](https://github.com/paritytech/polkavm)**:

```rust
#[polkavm_derive::polkavm_import]
extern "C" {
    fn extension_call(extension_id:u64, call_ptr:u32, call_len: u32) -> (u32, u32);
}
```

#### PVQ Executor Implementation

Practically, the executor has a core method `execute` to initialize the program and perform argument invocation, which takes:

- `program`: PVQ main binary.
- `args`: PVQ query data.
- `gas_limit`: Maximum PVM gas limit for the query. If not provided, the executor works at no gas metering mode.

**Example Rust Implementation**:

```rust
pub fn execute(
    &mut self,
    program: &[u8],
    args: &[u8],
    gas_limit: Option<i64>,
) -> Result<Vec<u8>, PvqExecutorError> {...}

pub enum PvqExecutorError<UserError> {
  InvalidProgramFormat,
  MemoryAccessError(polkavm::MemoryAccessError),
  Trap,
  NotEnoughGas,
  User(UserError),
  OtherPvmError(polkavm::Error),
  // Implementors can define additional error variants to differentiate specific panic reasons for internal debugging purposes.
}
```

Additionally, it provides an initialization method that sets up the PVM execution environment and external interfaces by pre-registering the required host functions:

**Example Rust Implementation**:

```rust
pub fn new(context: PvqContext) -> Self
```

### RuntimeAPI Integration

The RuntimeAPI for off-chain query usage includes two methods:

- `execute_query`: Executes the query and returns the result. It takes:
  - `program`: PVQ binary.
  - `args`: Query arguments that is SCALE-encoded.
  - `gas_limit`: Optional gas limit. If not provided, we have the gas limit which corresponds to 2 seconds as maximum execution time the query.

- `metadata`: Returns information about available extensions, including their IDs, supported methods, gas costs, etc. This provides feature discovery capabilities. The metadata is encoded using `scale-info`, following a similar approach to [`frame-metadata`](https://github.com/paritytech/frame-metadata/).

**Example PVQ Runtime API**:

```rust
decl_runtime_apis! {
    pub trait PvqApi {
        fn execute_query(program: Vec<u8>, args: Vec<u8>, gas_limit: Option<i64>) -> PvqResult;
        fn metadata() -> Vec<u8>;
    }
}
type PvqResult =  Result<PvqResponse, PvqError>;
type PvqResponse = Vec<u8>;
enum PvqError {
    InvalidProgramFormat,
    Timeout,
    Panic(String),
}
```

**Example Metadata**:

```rust
pub struct Metadata {
    pub types: PortableRegistry,
    pub extensions: Vec<ExtensionMetadata<PortableForm>>,
}
```

### XCM integration

The integration of PVQ into XCM is achieved by adding a new instruction to XCM, as well as a new variant of the `Response` type in the `QueryResponse` message.

- A new `ReportQuery` instruction: report to a given destination the results of a PVQ. After query, a `QueryResponse` message of type `PvqResult` will be sent to the described destination.

Operands:

- `query: BoundedVec<u8, MaxPvqSize>`: Encoded bytes of the tuple `(program, args)`. `MaxPvqSize` is the generic parameter type size limit (i.e. 2MB).

- `max_weight: Weight`: Maximum weight that the query should take.
- `info: QueryResponseInfo`: Information for making the response.

```rust
ReportQuery {
  query: BoundedVec<u8, MaxPvqSize>,
  max_weight: Weight,
  info: QueryResponseInfo,
}
```

- A new variant to the `Response` type in `QueryResponse`
  - `PvqResult = 6 (BoundedVec<u8, MaxPvqResult>)`

`PvqResult` is a variant type:

- `Ok(Vec<u8>)`: Successful query result
- `Err(PvqError)`: The query panics, the specific panic reason is encoded in the bytes.

#### Errors

- `FailedToDecode`: Invalid PVQ program format
- `MaxWeightInvalid`: Query exceeds the weight limit
- `Overflow`: Query result is too large to fit into the bounded vec
- `BadOrigin`
- `ReanchorFailed`
- `NotHoldingFees`
- `Unroutable`
- `DestinationUnsupported`
- `ExceedsMaxMessageSize`
- `Transport`

## Drawbacks

### Performance issues

- PVQ Program Size: The size of a complicated PVQ program may be too large to be suitable for efficient storage and transmission via XCMP/HRMP.

## Testing, Security, and Privacy

- Testing:
  - A comprehensive test suite should be developed to cover various scenarios:
    - Positive test cases:
      - Basic queries with various extensions, data types, return values, custom computations, etc.
      - Accurate conversion between given weight limit and the gas limit of PolkaVM for both off-chain and cross-chain queries
    - Negative test cases:
      - Queries with invalid input data
      - Queries exceeding weight limits
      - Queries that panic including (no permission, host function error, etc.)
  - End-to-end integration testing to verify seamless interaction both off-chain and cross-chain scenarios, validating all use cases outlined in the **Motivation** section above.

- Security:
  - The PVQ extension implementors must enforce a strict read-only policy for all extension methods.
  - The implementation of the PVM engine must be secure and robust, refer to the discussion in [Gray Paper](https://graypaper.com/) for more details.

- Privacy:
  N/A

## Performance, Ergonomics, and Compatibility

### Performance

As a newly introduced feature, PVQ operates independently and does not impact or degrade the performance of existing runtime implementations.

### Ergonomics

From the perspective of off-chain tooling, this proposal streamlines development by unifying multiple chain-specific RuntimeAPIs under a single consistent interface.
This significantly benefits wallet and dApp developers by eliminating the need to handle individual implementations for similar operations across different chains. The proposal also enhances development flexibility by allowing custom computations to be modularly encapsulated as PolkaVM programs that interact with the exposed APIs.

### Compatibility

For RuntimeAPI integration, the proposal defines new APIs, which do not break compatibility with existing interfaces.
For XCM Integration, the proposal does not modify the existing XCM message format, which is backwards compatible.

## Prior Art and References

There are several discussions related to the proposal, including:

- [Original discussion](https://forum.polkadot.network/t/wasm-view-functions/1045) about having a mechanism to avoid code duplications between the runtime and front-ends/wallets. In the original design, the custom computations are compiled as a wasm function.
- [View functions](https://github.com/paritytech/polkadot-sdk/pull/4722) aims to provide view-only functions at the pallet level. Additionally, [Facade Project](https://github.com/paritytech/polkadot-sdk/pull/4722) aims to gather and return commonly wanted information in runtime level.
PVQ does not conflict with them, and it can take advantage of these Pallet View Functions / Runtime APIs and allow people to build arbitrary PVQ programs to obtain more custom/complex data that is not otherwise expressed by these two proposals.

## Unresolved Questions

- The specific conversion between gas and weight has not been finalized and will likely require development of a suitable benchmarking methodology.

## Future Directions and Related Material

Once PVQ and the aforementioned Facade Project are ready, there are opportunities to consolidate overlapping functionality between the two systems. For example, the metadata APIs could potentially be unified to provide a more cohesive interface for runtime information. This would help reduce duplication and improve maintainability while preserving the distinct benefits of each approach.
