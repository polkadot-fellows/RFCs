# RFC-0172: Ethereum JSON-RPC compatibility standard for `pallet-revive`

|                 |                                                                       |
| --------------- | --------------------------------------------------------------------- |
| **Start Date**  | 2026-06-25                                                            |
| **Description** | Define a normative Ethereum JSON-RPC conformance target, Substrate↔Ethereum semantics, and a conformance test suite for `pallet-revive`'s `eth-rpc` server. |
| **Authors**     | Maheswaran Velmurugan (@solokingm)                                    |
| **RFC PR**      | [polkadot-fellows/RFCs#172](https://github.com/polkadot-fellows/RFCs/pull/172) |

## Summary

`pallet-revive` exposes an Ethereum-compatible JSON-RPC interface (`pallet-revive-eth-rpc`) so that existing Ethereum tooling — wallets, libraries, indexers, block explorers — can talk to a Polkadot chain unchanged. Today this interface is implemented method-by-method with no written specification of *which* behaviour is guaranteed, and several behaviours diverge silently from the de-facto Ethereum reference (go-ethereum). This RFC proposes (1) adopting the Ethereum `execution-apis` specification as the normative conformance target, (2) standardising the handful of places where Substrate and Ethereum genuinely diverge — most importantly the mapping of Ethereum block tags onto Substrate's GRANDPA finality — and (3) requiring a conformance test suite in CI so the guarantee is enforced rather than aspirational.

## Motivation

The value proposition of `pallet-revive` is that *unmodified* Ethereum tooling works against a Polkadot chain. That promise only holds if the JSON-RPC surface behaves the way Ethereum clients expect. Three problems make this fragile today:

1. **No written conformance target.** Each `eth_*` method is implemented independently; there is no document stating that the server aims to match the `execution-apis` specification and the go-ethereum reference, nor what "match" means for edge cases. As a result, divergences are discovered only when a downstream tool breaks.

2. **Undocumented Substrate↔Ethereum semantics.** Some Ethereum concepts have no one-to-one Substrate equivalent. The clearest example is block tags: Ethereum's `safe`/`finalized`/`pending` are defined in terms of the beacon-chain consensus and the mempool, neither of which maps directly onto GRANDPA finality and Substrate's block lifecycle. The current code makes implicit choices (and in places rejects valid inputs) with no specification a tool author can rely on.

3. **Edge-case divergences are real and recurring.** Concrete examples found and fixed while preparing this RFC:
   - `eth_feeHistory` returned the wrong reward bucket because the cache lookup discarded the half-percentile resolution the cache was built at ([paritytech/polkadot-sdk#12470](https://github.com/paritytech/polkadot-sdk/pull/12470)).
   - `eth_getLogs` rejected the standard block tags `finalized`/`safe`/`pending` in filter ranges with an "Unsupported tag" error, although the same tags are accepted elsewhere in the server ([#12474](https://github.com/paritytech/polkadot-sdk/pull/12474)).
   - `eth_getLogs` produced invalid `IN ()` SQL — and therefore an error — for the valid filters `{"address": []}` and `{"topics": [[]]}`, which Ethereum clients treat as "match anything" ([#12479](https://github.com/paritytech/polkadot-sdk/pull/12479)).
   - The mapping of internal errors to JSON-RPC error codes did not follow EIP-1474 ([#11887](https://github.com/paritytech/polkadot-sdk/pull/11887)).

   Each was a small fix, but the *pattern* — independent, unspecified, untested-against-reference behaviour — is the underlying problem this RFC addresses.

The requirement for the solution is: a single, citable definition of the compatibility the `eth-rpc` server provides, a small set of explicit decisions for the cases where Ethereum semantics do not map cleanly onto Substrate, and an automated way to detect regressions against that definition.

This is squarely within the Fellowship's remit: the RFC scope lists "standard RPCs" and the "runtime public interfaces" of pallets used by system chains as in-scope concerns, and the repository notes that for node-side standards (such as RPC interfaces) the Fellowship's view is *strongly* binding, because all implementations "should conform to some foundational standards in order to communicate". The `eth-rpc` server is exactly such a foundational, cross-implementation interface standard.

## Stakeholders

- **Smart-contract developers and tooling authors** targeting `pallet-revive` (Foundry/Hardhat users, `ethers`/`viem`/`web3.js`, The Graph and other indexers, wallets such as MetaMask). They are the direct beneficiaries and the primary consumers of the guarantee.
- **`pallet-revive` / `eth-rpc` maintainers** at Parity, who would own the conformance suite and the documented semantics.
- **Parachain teams** (e.g. Asset Hub) deploying the Ethereum compatibility layer, who need to know precisely what they are promising their users.

This proposal has been socialised informally via the linked pull requests, each of which fixes one instance of the broader problem and references the others. It has not yet been discussed on the Fellowship channels; that discussion is a prerequisite to acceptance (see Unresolved Questions).

## Explanation

The RFC has three parts.

### 1. Normative conformance target

`pallet-revive-eth-rpc` SHOULD conform to the Ethereum [`execution-apis`](https://github.com/ethereum/execution-apis) specification for every method it exposes. Where the specification is silent or ambiguous on observable behaviour, the **go-ethereum** implementation is the reference, because it is the de-facto standard that tooling is written against. Conformance is defined as: *for the same request, the server returns a response that an Ethereum client cannot distinguish from a conforming Ethereum node's response*, except for the explicitly enumerated divergences below.

This is a guarantee about the externally observable interface only. It does not constrain the runtime, storage layout, or consensus.

### 2. Standardised Substrate↔Ethereum semantics

The following are the points where Ethereum semantics do not map one-to-one onto a Substrate chain. This RFC fixes the mapping so that it is specified rather than incidental.

#### 2.1 Block tags

Ethereum defines five block tags. Their meaning is anchored in Ethereum's consensus and mempool; the table below defines the mapping onto a GRANDPA-finalised Substrate chain.

| Ethereum tag | Ethereum meaning | `pallet-revive` mapping | Rationale |
| ------------ | ---------------- | ----------------------- | --------- |
| `earliest`   | Genesis | First block available to the node (genesis, or the first EVM block on chains where EVM support was activated later) | Earliest queryable state. |
| `latest`     | Latest canonical block | Best imported block | Direct equivalent. |
| `finalized`  | Last beacon-finalized block | Last **GRANDPA-finalised** block | Direct equivalent; GRANDPA finality is deterministic and irreversible, which is an *at least as strong* guarantee as Ethereum finality. |
| `safe`       | Latest "justified" block (weaker than finalized) | Last GRANDPA-finalised block (same as `finalized`) | Substrate exposes no checkpoint that is weaker than finalised yet stronger than best. Mapping `safe` to `finalized` returns an at-least-as-strong block, which is sound: a client asking for `safe` never receives a block that could be reverted. |
| `pending`    | Speculative next block built from the mempool | Best imported block (same as `latest`) | There is no stable, queryable speculative block exposed through this interface. Returning `latest` is the conservative choice already used elsewhere in the server. |

All five tags MUST be accepted everywhere a block tag is valid in `execution-apis` (notably `eth_getLogs` filter ranges, `eth_getBalance`, `eth_call`, `eth_getStorageAt`, `eth_getTransactionCount`, `eth_getCode`, `eth_feeHistory`). Rejecting a spec-valid tag is a conformance bug (cf. #12474).

The `pending` mapping has an observable consequence that MUST be documented: `eth_getTransactionCount(addr, "pending")` returns the nonce as of `latest` and therefore does not reflect not-yet-included transactions the way a mempool-backed Ethereum node would. Tooling that relies on `pending` nonce for rapid transaction batching should be aware of this. A future, stronger `pending` is listed under Future Directions.

#### 2.2 Error codes

Errors MUST be reported using the codes defined in [EIP-1474](https://eips.ethereum.org/EIPS/eip-1474#error-codes) (e.g. `-32000` server error, `-32003` transaction rejected, `-32601` method not found), rather than collapsing to a generic code. This is the standard tooling matches on to distinguish, for example, a rejected transaction from a malformed request (cf. #11887).

#### 2.3 Parameter edge cases

Where Ethereum clients accept a degenerate-but-valid parameter, the server MUST accept it with the same meaning rather than erroring:

- An **empty address or topic set** in an `eth_getLogs` filter (`[]`) imposes no constraint on that field — it matches any value (cf. #12479).
- A **`null` topic position** matches any value at that position (positional topic matching as defined by `eth_getLogs`).
- `eth_feeHistory` reward percentiles MUST be resolved at the resolution at which they are computed, and out-of-range or zero-count inputs handled as go-ethereum does (cf. #12470).

These are not new behaviours; they are the existing Ethereum semantics, written down so they are testable.

### 3. Conformance test suite

A conformance suite MUST be runnable in CI and SHOULD reuse the Ethereum `execution-apis` test vectors where applicable, supplemented by a curated set of the Substrate-specific cases above (block-tag mapping, empty filter sets, fee-history resolution, EIP-1474 error codes). The suite runs against a local development node and asserts the responses match the specified behaviour. New `eth_*` methods or behavioural changes MUST be accompanied by conformance cases.

The intent is that the guarantee in Part 1 is *enforced mechanically*: a regression like any of the four linked examples would be caught by CI rather than by a downstream user.

## Drawbacks

- **Maintenance cost.** A conformance suite is code that must be maintained and kept in step with upstream `execution-apis` revisions.
- **The compatibility target is a moving one.** Ethereum's RPC surface evolves; committing to track it is an ongoing obligation, not a one-off.
- **Some divergences are irreducible.** `pending` and mempool semantics cannot be made identical without exposing a speculative-execution interface that does not currently exist. The RFC documents rather than removes these, which means tooling authors still need to read the divergence list.

## Testing, Security, and Privacy

- **Testing** is central to the proposal: the conformance suite *is* the enforcement mechanism. Adherence is demonstrated by the suite passing in CI against a local node.
- **Security.** Standardising error codes and input handling reduces the risk of clients mis-interpreting responses (e.g. treating a rejected transaction as a transient failure and resubmitting). Specifying that empty/`null` filter fields match-all rather than error removes an input-handling path that previously produced backend errors. The proposal does not change runtime or consensus behaviour and so does not expand the trusted computing base.
- **Privacy.** No change; the RPC surface exposes the same on-chain data as before.

## Performance, Ergonomics, and Compatibility

### Performance

Neutral. The proposal standardises observable behaviour and adds tests; it does not mandate algorithmic changes. Individual conformance fixes have been chosen to be performance-neutral (e.g. skipping an empty `IN ()` clause is strictly cheaper).

### Ergonomics

This is a pure ergonomics improvement for the primary audience: Ethereum tooling works unmodified and predictably, and the divergence list gives tool authors a single place to learn the small number of differences they must account for.

### Compatibility

The proposal increases compatibility with the Ethereum ecosystem. For chains already running `pallet-revive`, the specified behaviours are either already correct or are bug-fixes that make previously-erroring requests succeed; no request that worked before should stop working. There is no on-chain migration. The one behaviour worth calling out to integrators is the explicit (and unchanged-in-practice) `safe`/`pending` → finalised/latest mapping.

## Prior Art and References

- Ethereum [`execution-apis`](https://github.com/ethereum/execution-apis) specification and its test suite.
- [EIP-1474: Remote procedure call specification](https://eips.ethereum.org/EIPS/eip-1474).
- go-ethereum, the de-facto reference implementation of the JSON-RPC surface.
- Motivating fixes: [#12470](https://github.com/paritytech/polkadot-sdk/pull/12470), [#12474](https://github.com/paritytech/polkadot-sdk/pull/12474), [#12479](https://github.com/paritytech/polkadot-sdk/pull/12479), [#11887](https://github.com/paritytech/polkadot-sdk/pull/11887).
- Frontier (the EVM pallet for Substrate) faced the same class of compatibility questions and is a useful source of prior decisions.

## Unresolved Questions

- **Scope of the conformance target.** Should every exposed method be in scope from day one, or should a subset (the methods most used by tooling) be specified first and the rest phased in?
- **`safe` semantics.** Is mapping `safe` to `finalized` acceptable to all stakeholders, or is there appetite to expose a genuinely weaker-than-finalised checkpoint (e.g. best-block-with-N-confirmations) as `safe`?
- **Where the suite lives.** Should the conformance suite vendor the upstream `execution-apis` vectors, or maintain an independent curated set, or both?
- **Normative strength.** Should conformance be a hard CI gate (MUST) or advisory (SHOULD) during an initial stabilisation period?

## Future Directions and Related Material

- A speculative-execution interface that would allow a meaningful `pending` block and mempool-aware `eth_getTransactionCount(addr, "pending")`.
- Extending the conformance guarantee to subscription methods (`eth_subscribe`) and tracing namespaces (`debug_*`).
- Publishing the divergence list as part of the public `pallet-revive` developer documentation so it is discoverable outside this RFC.
