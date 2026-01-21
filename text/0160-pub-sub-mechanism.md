# RFC-0160: PubSub Mechanism

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 18 - 12 - 2025                                                                    |
| **Description** | PubSub mechanism via XCM data publishing and relay state proof propagation.                                                                |
| **Authors**     |  metricaez                                                                                           |

## Summary

Add a publish/subscribe mechanism that allows parachains to publish data to the relay chain and other parachains to consume it via relay chain storage proofs. 

## Motivation

As pointed out in issue #606 (https://github.com/paritytech/polkadot-sdk/issues/606), when parachains need to exchange information, the only available options are repeated point-to-point XCM messages or ad-hoc off-chain infrastructure. This RFC is motivated by the desire to propose an alternative based on a relay-assisted publish/subscribe mechanism that enables one-to-many, verifiable, cross-parachain data distribution.

## Stakeholders

Runtime developers, oracles, bridges, and general rollup product and application builders.

## Explanation

This RFC defines a relay-assisted publish/subscribe mechanism that enables parachains to share arbitrary key-value data through the relay chain without relying on repeated XCM messages or off-chain protocols. The core idea is to use the relay chain as a common, verifiable distribution layer, allowing data to be published once and consumed by many parachains with bounded and predictable costs.
Parachains publish data via a new XCM v5 `Publish` instruction. Published entries are stored on the relay chain in a per-publisher child trie managed by the broadcaster pallet. Publishers must be registered, and both the number of keys and their sizes are bounded to prevent unbounded state growth. Each published item is addressed by a fixed-size key. The suggestion is to backport the new instruction to v5 as v6 discussion advances.

```rust
Publish { key: PublishKey, data: BoundedVec<u8, MaxPublishValueLength>, ttl: u32 } 
```

On the consumer side, subscribing parachains declare their interests at the runtime level by specifying which publishers and keys they want to subscribe to. This information is exposed to the collator through a new dedicated runtime API (`KeyToIncludeInRelayProofApi`), allowing the collator to know which relay-chain storage keys must be proven for a given block. During block production, the collator fetches relay-chain state proofs for those keys, including child-trie entries, and embeds them in the ParachainInherentData.

```rust
/// A relay chain storage key to be included in the storage proof.
#[derive(Clone, Debug, Encode, Decode, TypeInfo, PartialEq, Eq)]
pub enum RelayStorageKey {
	/// Top-level relay chain storage key.
	Top(Vec<u8>),
	/// Child trie storage key.
	Child {
		/// Unprefixed storage key identifying the child trie root location.
		/// Prefix `:child_storage:default:` is added when accessing storage.
		/// Used to derive `ChildInfo` for reading child trie data.
		trie_key: Vec<u8>,
		/// Key within the child trie.
		item_key: Vec<u8>,
	}
}

/// Request for proving relay chain storage data.
///
/// Contains a list of storage keys (either top-level or child trie keys)
/// to be included in the relay chain state proof.
#[derive(Clone, Debug, Encode, Decode, TypeInfo, PartialEq, Eq, Default)]
pub struct RelayProofRequest {
	/// Storage keys to include in the relay chain state proof.
	pub keys: Vec<RelayStorageKey>,
}

/// Runtime API for specifying which relay chain storage data to include in storage proofs.
/// Runtime API for specifying which relay chain storage data to include in storage proofs.
/// This API allows parachains to request both top-level relay chain storage keys
/// and child trie storage keys to be included in the relay chain state proof.
pub trait KeyToIncludeInRelayProofApi {
    /// Returns relay chain storage proof requests.
    ///
    /// The returned `RelayProofRequest` contains a list of storage keys where each key
    /// can be either:
    /// - `RelayStorageKey::Top`: Top-level relay chain storage key
    /// - `RelayStorageKey::Child`: Child trie storage, containing the child trie identifier
    ///   and the key to prove from that child trie
    ///
    /// The collator generates proofs for these and includes them in the relay chain state proof.
    fn keys_to_prove() -> RelayProofRequest;
}
```

The parachain verifies the relay-chain state proofs as part of `set_validation_data` of `parachain-system`. A processing hook extracts the relevant key–value pairs from the proofs and only triggers updates when the corresponding child-trie root has changed since the previous block, avoiding redundant child trie data extractions which are the most significant computation-demanding process of the feature. Verified updates are then delivered to the runtime through a subscription handler, enabling consumption of cross-chain data.

```rust
/// Processor for relay chain proof keys.
///
/// This allows parachains to process data from the relay chain state proof,
/// including both child trie keys and main trie keys that were requested
/// via `KeyToIncludeInRelayProofApi`.
type RelayProofKeysProcessor: ProcessRelayProofKeys;

/// Process keys from verified relay chain state proofs.
///
/// This trait allows processing of relay chain storage data from the verified proof.
pub trait ProcessRelayProofKeys {
	/// Process keys from a verified relay state proof.
	fn process_relay_proof_keys(verified_proof: &RelayChainStateProof) -> Weight;
}

```

```rust
/// Define subscriptions and handle received data.
pub trait SubscriptionHandler {
	/// List of subscriptions as (ParaId, keys) tuples.
	/// Returns (subscriptions, weight) where weight is the cost of computing the subscriptions.
	fn subscriptions() -> (Vec<(ParaId, Vec<Vec<u8>>)>, Weight);

	/// Called when subscribed data is updated.
	/// Returns the weight consumed by processing the data.
	fn on_data_updated(publisher: ParaId, key: Vec<u8>, value: Vec<u8>) -> Weight;
}
```

This design intents to address the issue #606 by reusing existing `cumulus` and relay-chain infrastructure.


## Drawbacks

- The relay-chain state passed during collator block construction increases, and its size and impact must be carefully monitored.
- Processing relay state proofs introduces additional overhead for data extraction and verification in the runtime.
- `KeyToIncludeInRelayProofApi` currently works for child tries using the default route; making it fully generic would require extending `ChildInfo` with `TypeInfo` or a workaround, which should be evaluated separately.


## Testing, Security, and Privacy

### Testing

The implementation is covered by unit tests that exercise the publish instruction and handler, broadcaster pallet, subscription handling, and relay-state proof processing logic. In addition, a dedicated testing branch provides a full end-to-end reference implementation based on Rococo Relay and testing Parachain, with publisher and subscriber parachains interacting through the relay chain, which can be run locally using Zombienet - https://github.com/blockdeep/polkadot-sdk/tree/feat/pubsub-rev1225-dev

### Security

Data consumed by parachains is verified against relay-chain state and validators proof, preventing forgery by collators.

### Privacy

Published data is stored in relay-chain child tries and is therefore publicly observable.

### Implementation pitfalls.

Care must be taken to avoid requesting keys unnecessarily, as this directly impacts proof size, building and runtime execution cost.


## Performance, Ergonomics, and Compatibility

### Performance

This proposal is a necessary trade-off rather than a pure optimization, adding relay-chain state proofs and runtime verification to avoid repeated point-to-point XCM requests and off-chain systems. Overhead is limited by proving only explicitly subscribed keys and enforcing strict bounds, while update handling based on child-trie root changes is managed by the Subscriber.

Does not present any overhead when not implemented. Runtimes can decide simply not to implement the API and pallet broadcaster nor subscriber and there will be no performance impact. 

### Ergonomics

Runtime developers interact with the mechanism through explicit runtime configuration.

### Compatibility

The proposal does not break existing XCM semantics or runtime interfaces. All changes are additive and opt-in, allowing parachains to adopt the mechanism incrementally.

## Future Directions and Related Material

This RFC enables a range of follow-up work around scalable cross-parachain data distribution. A straightforward application is price oracles, and there has also been interest in using the mechanism for broader state propagation patterns, including bridging-related operations.

At the same time, this RFC represents an initial design. Additional use cases, optimal configurations, limitations, and alternative patterns are expected to emerge as the mechanism is adopted and tested in practice.

Future RFCs may refine the API surface, extend child-trie handling, introduce additional safeguards or ergonomics, storage management, optimize proof generation and processing, or specialize the mechanism for particular use cases.
Future RFCs may refine the API surface, extend child-trie handling, introduce additional safeguards or ergonomics, storage management, optimize proof generation and processing, or specialize the mechanism for particular use cases.