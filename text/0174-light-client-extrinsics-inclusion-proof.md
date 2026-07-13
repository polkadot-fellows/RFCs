# RFC-0174: Light client extrinsics-trie inclusion proof request

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2026-07-13                                                                                   |
| **Description** | Add a light-client network request that lets light clients trustlessly and efficiently check whether given transactions were (or weren't) included in a block, without downloading its full body |
| **Authors**     | Josep M Sobrepere                                                                            |

## Summary

Today, the only way for a light client to determine whether a submitted transaction was included in a block (and, if so, at which index) is to download the entire block body and scan it for a matching extrinsic. This wastes bandwidth, especially as block bodies grow. Polkadot and its system chains already compute the header's `extrinsics_root` using Trie `state_version` 1 (per RFC-0042), which means that, for any extrinsic larger than 32 bytes, its 32-byte hash alone is enough to stand in for it when reconstructing that trie. This RFC adds a new light-client network request that lets a light client ask a full node for every leaf of a block's extrinsics trie (each extrinsic's raw bytes, or just its hash if it's large) letting the light client recompute `extrinsics_root` itself and confirm it matches the header. This lets a light client trustlessly confirm inclusion (or non-inclusion) of a transaction it is tracking, and learn its index, without ever downloading the block body.

## Motivation

### Light clients pay for block-body bandwidth just to check inclusion

After submitting a transaction, a light client consumer needs to know when (and where) it was included, both to update the UI and to know when to stop gossiping it. The only mechanism available today is to download the body of each new block and linearly search it for the submitted extrinsic. Block bodies are one of the chain's primary scaling factors: the busier the chain, the larger the bodies, and the more bandwidth a light client burns on data it almost entirely discards.

### The previously-identified blocker (V0 extrinsics trie) is already resolved

[RFC-0042](0042-extrinsics-state-version.md) introduced `RuntimeVersion::system_version`, and setting it to `2` switches the trie used to compute `extrinsics_root` from `state_version` 0 to `state_version` 1 (in addition to the state trie itself). This is already enacted on Polkadot and its system chains. Trie `state_version` 1 replaces, inside proof nodes, any value whose SCALE-encoded length is 33 bytes or more with just its hash. Since almost all extrinsics comfortably exceed 33 bytes, everything needed to reconstruct and verify the extrinsics trie of such a chain is, in practice, just a list of extrinsic hashes. What has been missing since is the networking primitive to actually request that list. This RFC adds it.

### Requirements

- The protocol MUST allow a light client to request, for a given block hash, enough information to reconstruct and verify that block's extrinsics trie.
- That information MUST let the light client verify it directly against the `extrinsics_root` field already present in that block's header, without any other trust assumption.
- The response MUST NOT include the full byte content of any extrinsic whose encoded value would be represented as a hash under the trie's `state_version` (currently `state_version` 1, values ≥ 33 bytes).
- The mechanism MUST NOT require any change to the runtime, to the extrinsics trie format, or to how `extrinsics_root` is computed; both are already settled by RFC-0042 for chains that set `system_version = 2`.
- The mechanism SHOULD let a light client tell, before sending any request, whether a given peer supports it, rather than relying on undefined behavior when a peer receives a message it doesn't understand.
- Peers that don't support this request MAY continue being queried for all other existing light-client request types unaffected.

## Stakeholders

- **Light client implementers**: who implement the requesting side of this protocol.
- **Full node implementers**: who implement the responding side of this protocol.
- **Wallet, dApp, and library maintainers**: who consume this primitive to implement cheap transaction-inclusion tracking, which was the original motivation for opening issue #19.

This RFC is a direct continuation of [polkadot-fellows/RFCs#19](https://github.com/polkadot-fellows/RFCs/issues/19), discussed there since August 2023 by @tomaka, @bkchr, @burdges, @seunlanlege, @joepetrowski, @carlosala, and @josepot, most recently converging in September 2025 once it was confirmed that Polkadot and its system chains already run with `system_version = 2` (i.e. `extrinsics_root` on Trie `state_version` 1), which is the only precondition this proposal needed.

## Explanation

### The extrinsics trie

`extrinsics_root` is not derived from the state trie; it is the root of a separate, ephemeral, ordered trie built purely to produce this one hash. `frame_system` computes it as `H::ordered_trie_root(extrinsics, extrinsics_root_state_version)` in `on_finalize` ([`frame_system::extrinsics_data_root`](https://github.com/paritytech/polkadot-sdk/blob/master/substrate/frame/system/src/lib.rs)), where:

- the **key** for the extrinsic at position `i` is `Compact(i as u32).encode()` (`TrieLayout::encode_index`, overridden this way by both `LayoutV0` and `LayoutV1` in [`sp-trie`](https://github.com/paritytech/polkadot-sdk/blob/master/substrate/primitives/trie/src/lib.rs)), and
- the **value** is the SCALE-encoded opaque extrinsic exactly as it appears in the block body.

Unlike the state trie, nothing about this trie other than its final root is committed anywhere: the root is written into the header, and that is the only thing this RFC assumes is available on demand. How a full node arrives at the per-extrinsic values needed to answer a request about this trie is entirely up to it; this RFC only specifies the request/response wire format and the meaning of the bytes exchanged.

### Trie `state_version` 1 and value hashing

Under `state_version` 0, every trie node inlines its full value regardless of size. Under `state_version` 1, any value whose SCALE-encoded length is `>= sp_core::storage::TRIE_VALUE_NODE_THRESHOLD` (33 bytes) is represented in the node by its hash instead, with the actual bytes addressable separately by that hash. A Merkle proof over such a trie can therefore include, for every "large" leaf, only the 32-byte hash plus a few bytes of node encoding overhead. RFC-0042 already causes `extrinsics_root` to be computed this way (`extrinsics_root_state_version = StateVersion::V1`) once a runtime sets `system_version = 2`, which Polkadot and its system chains do today.

### Protocol change

This RFC extends the existing light-client protobuf schema ([`light.v1.proto`](https://github.com/paritytech/polkadot-sdk/blob/master/substrate/client/network/light/src/schema/light.v1.proto)) with a new request and a dedicated response type:

```diff
 message Request {
 	oneof request {
 		RemoteCallRequest remote_call_request = 1;
 		RemoteReadRequest remote_read_request = 2;
 		RemoteReadChildRequest remote_read_child_request = 4;
 		// Note: ids 3 and 5 were used in the past. It would be preferable to not re-use them.
+		// Note: id 6 is used by the (currently unimplemented) RFC-0009's RemoteReadRequestV2.
+		RemoteReadExtrinsicsRequest remote_read_extrinsics_request = 7;
 	}
 }

 message Response {
 	oneof response {
 		RemoteCallResponse remote_call_response = 1;
 		RemoteReadResponse remote_read_response = 2;
 		// Note: ids 3 and 4 were used in the past. It would be preferable to not re-use them.
+		RemoteReadExtrinsicsResponse remote_read_extrinsics_response = 5;
 	}
 }

+// Remote read request for a block's extrinsics-trie leaves.
+message RemoteReadExtrinsicsRequest {
+	// Hash of the block whose extrinsics-trie leaves are requested.
+	required bytes block = 1;
+}
+
+// Remote read response carrying every leaf of a block's extrinsics trie,
+// in order, letting the requester reconstruct the trie root itself.
+message RemoteReadExtrinsicsResponse {
+	// Absent if the block is unknown, pruned, or the payload would exceed
+	// the maximum response size.
+	optional ExtrinsicsLeaves extrinsics = 1;
+}
+
+message ExtrinsicsLeaves {
+	// One entry per extrinsic in the block, in the order they appear in
+	// the body. May be empty, for a block with no extrinsics.
+	repeated ExtrinsicLeaf leaves = 1;
+}
+
+message ExtrinsicLeaf {
+	oneof value {
+		// The full SCALE-encoded extrinsic, sent whenever its encoded
+		// length is below the extrinsics trie's inline-value threshold.
+		bytes raw = 1;
+		// The hash of the SCALE-encoded extrinsic, sent otherwise.
+		bytes hash = 2;
+	}
+}
```

Field numbers are chosen to avoid both the explicitly-deprecated ids (`3`, `5` on `Request`; `3`, `4` on `Response`) and RFC-0009's proposed (but as of this writing unimplemented) id `6` on `Request`. Unlike RFC-0009's approach of adding a new `Request` variant while leaving peer-support discovery to unknown-field handling, this RFC proposes bumping the light-client protocol's version suffix from `/light/2` to `/light/3` for the wire name under which this new request is served, following the existing precedent of `generate_protocol_name` / `generate_legacy_protocol_name` in [`substrate/client/network/light/src/light_client_requests.rs`](https://github.com/paritytech/polkadot-sdk/blob/master/substrate/client/network/light/src/light_client_requests.rs), which already registers a primary protocol name together with a list of legacy fallback names for exactly this kind of transition. A node that implements this RFC advertises `/{genesis_hash}/light/3` (with `/{genesis_hash}/light/2` kept as a fallback for the pre-existing request types) so libp2p's multistream-select gives a light client an unambiguous, upfront answer about whether a given peer supports `RemoteReadExtrinsicsRequest`, rather than the light client discovering this only after a failed decode.

### Why the response isn't a generic Merkle proof

A generic Merkle proof (transmitting the trie's internal branch/extension nodes along a path) is necessary when a verifier wants to authenticate a subset of a trie's keys without knowing the rest: the untransmitted siblings' hashes are exactly what let the verifier bridge from the keys it asked about up to the root.

That isn't the situation here. `RemoteReadExtrinsicsRequest` always concerns the entire extrinsics trie, never a subset. A light client that receives `n` leaves already knows every key in the trie, because the keys are nothing but `Compact(0), Compact(1), ..., Compact(n - 1)` — the same construction `frame_system::extrinsics_data_root` used when it built the trie in the first place (see "The extrinsics trie" above). Trie construction is a pure, deterministic function of an ordered `(key, value)` sequence. So once a light client has the full ordered sequence of values (or, for large ones, their hashes, precisely what a `state_version` 1 leaf would itself encode), it can rebuild the *entire* trie itself, branch and extension nodes included, using the exact same construction algorithm the runtime used (`H::ordered_trie_root`), and compare the resulting root to `extrinsics_root`. There is nothing for a full node to prove about the trie's internal structure; only the leaves are information the light client doesn't already have.

This is why the response above carries only `ExtrinsicLeaf` entries, no trie nodes at all. It is also why producing a response requires no trie or proof-generation logic on the full node's side: for each extrinsic in the block body, in order, it either includes it verbatim (SCALE-encoded length below `sp_core::storage::TRIE_VALUE_NODE_THRESHOLD`, 33 bytes) or includes its hash otherwise, mirroring, one-to-one, exactly what a `state_version` 1 leaf itself would contain. This is a linear pass over data the full node already has; it needs to know which trie `state_version` the block's runtime used for `extrinsics_root` (already necessary information, since it also had to produce or import that block), but nothing else about tries.

If the full node cannot answer for the requested block, it leaves `extrinsics` absent, distinguishing that case from a genuinely empty block.

### Response payload and verification

Given a block header it has already independently verified, a light client:

1. Sends `RemoteReadExtrinsicsRequest { block }` to a peer known (via multistream-select) to support `/light/3`.
2. If `extrinsics` is present, feeds its `leaves`, in order, into the same ordered-trie-root construction the runtime uses (`H::ordered_trie_root`): treating each `raw` entry as that algorithm would treat any value below the inline threshold, and each `hash` entry as it would treat the hash of a value at or above it.
3. Compares the resulting root to the block header's `extrinsics_root`. A match verifies the *entire* list in one step; there is no separate per-node proof-checking pass, because there is no proof structure beyond the leaves themselves.
4. Records, for each index `i` (the leaf's position in the list), a canonical extrinsic hash: the hash given directly for `hash` entries, or the locally-computed hash of the bytes for `raw` entries.

The result of one verified response is a complete, ordered `(index, extrinsic hash)` list for the entire block. A light client checks it for a hash it is tracking, learns that extrinsic's index if present (useful, for instance, to then read the corresponding entries in `System.Events`), and (because the list is guaranteed complete once the root matches, not merely a subset) treats absence from it as a verified proof of non-inclusion, not merely the absence of evidence.

If `extrinsics` is absent, or the recomputed root doesn't match, the light client falls back to a different peer or, ultimately, to downloading the full block body as it does today; this RFC does not change that fallback path.

### Response size

This request reuses the existing 16 MiB maximum response size (`MAX_RESPONSE_SIZE` in `substrate/client/network/src/lib.rs`) with no partial/paginated response mode: a response either carries every leaf, or none at all. Given the ~35-40 bytes/entry cost this RFC is designed around, hitting that ceiling would require several hundred thousand extrinsics in a single block, far beyond what current weight and PoV-size limits allow on any live chain. All-or-nothing keeps the request and its verification logic simple. Should this ever need revisiting, splitting the leaf list across several round trips would be materially simpler than the equivalent for a generic Merkle proof: since verification only happens once the full ordered list is assembled, a light client can just concatenate leaves received across multiple requests before running the check in step 2 above; see Unresolved Questions.

## Drawbacks

- The bandwidth benefit is conditional on the chain having set `system_version = 2` (RFC-0042). On a chain still using `system_version < 2` for its extrinsics root, this request still works and is still verifiable, but the response degrades toward the size of the block body itself, since no extrinsic is ever represented by just a hash.
- The all-or-nothing response model means a hypothetical future block large enough to push the full response past 16 MiB would make this request unusable for that specific block, falling back to full-body download; not a concern under today's weight/PoV bounds.

## Testing, Security, and Privacy

**Testing.** Implementations MUST be tested against, at minimum: an empty-body block, a block containing only small (< 33 byte) unsigned inherents, a block mixing small and large extrinsics, and a block sized near current weight/PoV limits. An end-to-end test SHOULD exercise a light client fetching leaves from a full node peer over the real libp2p request-response substream and confirming it can detect inclusion of a locally-submitted extrinsic without ever requesting the block body.

**Security.** The new per-request cost (a linear pass over the already-stored block body, hashing entries above the inline threshold) is bounded by the same weight/PoV limits that already bound how large a block body a full node must be willing to serve, so this does not introduce a materially new denial-of-service vector. A malicious or unresponsive full node can still simply omit `extrinsics`, exactly as it already can for existing light-client requests; the light client's mitigation (querying a different peer) is unchanged. A full node cannot cause a light client to accept an incorrect result by omitting, reordering, or substituting leaves, since any such tampering changes the recomputed root and fails verification.

**Privacy.** None. Extrinsics in finalized blocks are already fully public.

## Performance, Ergonomics, and Compatibility

### Performance

This is a bandwidth optimization for light clients tracking specific transactions: response size is `O(k)` at roughly 35-40 bytes per extrinsic, versus `O(bytes of the full block body)` today, which can be orders of magnitude larger for chains with sizeable extrinsics (e.g. a relay chain's `ParaInherent::enter`, on the order of tens of kilobytes). Because the response contains no trie-internal data, this is close to the minimum possible size for conveying this information at all. The full node's added cost is a single linear pass over a block body it already has, hashing only the entries above the inline threshold; the light client's added cost is one ordered-trie-root computation over the received leaves, the same construction the runtime itself already performs when authoring a block.

### Ergonomics

This does not change any existing exposed interface; it is a new, opt-in network primitive at the libp2p layer. Applications that talk to a light client over JSON-RPC rather than embedding one directly (e.g. via smoldot in a browser talking through a JSON-RPC relay) would need a corresponding JSON-RPC method to benefit from this, deliberately left as future work rather than a requirement of this RFC.

### Compatibility

Purely additive. The new request is served under a new protocol name suffix (`/light/3`) negotiated through standard libp2p multistream-select, alongside the pre-existing `/light/2` protocol which remains available unchanged for all current request types and for peers that haven't upgraded. No runtime, storage, or wire format of any existing request type changes. Chains that have not adopted `system_version = 2` remain fully compatible with this request; they simply don't see its bandwidth benefit.

## Prior Art and References

- [polkadot-fellows/RFCs#19 — Light clients and downloading block bodies](https://github.com/polkadot-fellows/RFCs/issues/19): the originating issue, and in particular [@tomaka's 2023 proposal](https://github.com/polkadot-fellows/RFCs/issues/19#issuecomment-1673708658) that this RFC implements the networking half of.
- [RFC-0042: Add System version that replaces StateVersion on RuntimeVersion](0042-extrinsics-state-version.md): already-implemented prerequisite that puts `extrinsics_root` on Trie `state_version` 1 for chains setting `system_version = 2`, including Polkadot and its system chains today.
- [RFC-0009: Improved light client requests networking protocol](0009-improved-net-light-client-requests.md) (not yet implemented): prior art for extending `light.v1.proto`'s `Request` oneof with a new message type. This RFC follows the same pattern of extending the schema, but defines its own response shape rather than reusing `RemoteReadResponse` (since this proposal's response is a list of trie leaves, not a generic node-based Merkle proof), and additionally proposes a protocol-name version bump for well-defined capability negotiation rather than relying on unknown-field handling.
- [`paritytech/trie`](https://github.com/paritytech/trie) — `TrieLayout::ordered_trie_root` / `encode_index`, and `polkadot-sdk`'s `LayoutV0`/`LayoutV1` overrides, which define the exact key/value encoding of the extrinsics trie this proposal's proofs are generated and verified against.

## Unresolved Questions

- Should the `/light/3` protocol-name bump proposed here be shared with whatever protocol change RFC-0009 eventually ships with, so peers only need to negotiate one new protocol version rather than one per RFC?
- Should full nodes be encouraged to cache the per-extrinsic raw-or-hash split for recent blocks, to avoid recomputing hashes on repeated requests for the same block under load? Given how cheap the computation is, this may not be worth specifying at all.
- Is a pagination mechanism worth specifying now, given today's response-size headroom, or should it be deferred until real-world usage demonstrates a need? Unlike a generic Merkle-proof request, pagination here would be a simple matter of splitting the ordered leaf list across requests, since verification only needs the fully-assembled list.
- Should this primitive also be exposed through a JSON-RPC method (e.g. under `chainHead`) for consumers that rely on a JSON-RPC-speaking light client rather than embedding their own libp2p stack? This RFC intentionally scopes that out.

## Future Directions and Related Material

- A `chainHead`-adjacent JSON-RPC method that wraps this request-and-verify flow, so JSON-RPC-only light client consumers (e.g. smoldot in a browser) can benefit.
- This RFC gives chains still running `system_version < 2` an additional, concrete incentive to adopt RFC-0042.
