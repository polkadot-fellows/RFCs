# RFC-0173: Prevent Transaction Replay After Account Reaping via `CheckCreatedAtHeight`

|                 |                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Start Date**  | 2026-07-01                                                                                                                |
| **Description** | Add `created_at_height` to account storage and a `CheckCreatedAtHeight` transaction extension to prevent transaction replay after account reaping |
| **Authors**     | Josep M Sobrepere                                                                                                         |

## Summary

This RFC proposes two additions to prevent transaction replay attacks that arise from Polkadot's account reaping mechanism:

1. A `created_at_height` field (`u32`, block height) added to per-account storage, set to the current block height whenever an account is created (or re-created), and defaulting to zero for genesis and pre-upgrade accounts.
2. A new `CheckCreatedAtHeight` transaction extension whose sole value is `created_at_height` carried as an **implicit** (additional-signed) field, mixed into the transaction signature without increasing the extrinsic's encoded size.

Together these changes ensure that a transaction is cryptographically bound to a specific lifetime of its sender account. If the account is reaped and subsequently re-funded, `created_at_height` changes and all previously signed transactions become permanently invalid, eliminating replay attacks and simplifying transaction-tracking APIs for DApps and indexers.

## Motivation

### The Account Reaping Problem

Polkadot uses an Existential Deposit (ED) to prevent the accumulation of dust accounts. When an account's free balance falls below the ED and its reference counters (providers, consumers, sufficients) drop to zero, the account is **reaped**: its storage entry is removed and its nonce resets to zero.

This creates a fundamental replay vulnerability. Consider the following scenario:

1. Alice holds an account with nonce `0` and signs an **immortal** transaction sending all her funds to Bob.
2. The transaction is executed. Alice's balance drops below the ED; her account is reaped and her nonce resets to `0`.
3. Carol sends Alice some DOT, recreating Alice's account with nonce `0`.
4. Anyone in possession of Alice's original transaction can now **replay** it, sending Alice's new funds to Bob without Alice's consent.

This is not a theoretical concern. Even mortal transactions are at risk if the account is reaped and re-funded within the transaction's mortality window.

### Intra-Block Replay

The same vulnerability allows a malicious block author to include an identical transaction **twice within a single block**. If a transaction causes account reaping and the account is re-funded later in the same block (e.g., via another transaction), a dishonest block author can append the original transaction a second time. The nonce has reset to zero, so the nonce check passes.

### Unnecessary API Complexity

The most natural way for DApps and indexers to identify a transaction is by its hash. However, because a transaction can be validly included more than once, in different blocks, or even more than once within the same block, the transaction hash is not currently a safe unique identifier. Consumers must instead track inclusion by `(account_id, nonce)` and still handle the edge case where the same pair appears across account reaping events. This complicates event monitoring, transaction receipt APIs, and transaction-inclussion detection logic unnecessarily.

### Why `CheckMortality` Does Not Fully Solve This

The existing `CheckMortality` signed extension lets signers create transactions that are only valid within a specific block range and, optionally, only if a specific ancestor block is canonical. This provides partial protection:

- A mortal transaction with a short validity window reduces replay risk, but only if the account is reaped and re-funded **outside** that window.
- If the window is long, or if the transaction is immortal, no protection is offered.
- `CheckMortality` provides no protection against intra-block replay.

`CheckCreatedAtHeight` and `CheckMortality` are complementary: mortality limits the time window during which a transaction is valid; `created_at_height` invalidates transactions across account lifecycle epochs regardless of the mortality window.

### Requirements

1. A transaction MUST be cryptographically bound to the specific lifecycle epoch of its sender account.
2. If a sender account is reaped and re-created, all previously signed transactions from that account MUST become permanently invalid.
3. The protection MUST cover both cross-block and intra-block replay scenarios.
4. The mechanism MUST NOT increase the encoded size of extrinsics.
5. The mechanism MUST NOT require signers to perform additional computation beyond a single storage read.

## Stakeholders

- **Wallet and signer developers**: Must update signing libraries to read `created_at_height` from storage and include it in the signing payload. This is the primary integration burden introduced by this RFC.
- **DApp and indexer developers**: Benefit directly from being able to use the transaction hash as a safe, stable unique identifier for inclusion events, something that is not currently possible. The `(account_id, created_at_height, nonce)` triple also becomes a reliable alternative identifier across the full history of the chain.
- **Block explorer developers**: Benefit from the same uniqueness guarantee for transaction display and search.
- **Runtime and parachain developers**: Any FRAME-based runtime that adopts `CheckCreatedAtHeight` gains the same guarantees; the extension is designed to be chain-agnostic.
- **End users**: Benefit from the elimination of a class of fund-loss attack that is currently silent and difficult to detect.

This proposal is related to prior discussions in [polkadot-fellows/RFCs#19](https://github.com/polkadot-fellows/RFCs/issues/19) (light clients and downloading block bodies) and [paritytech/json-rpc-interface-spec#182](https://github.com/paritytech/json-rpc-interface-spec/pull/182) (efficient transaction lookup via `archive_unstable_transactionReceipt`). Both discussions surface the non-uniqueness of transaction hashes as a structural problem; this RFC addresses its root cause.

## Explanation

### Conceptual Ideal

To understand the design, it helps to consider what the correct approach would have been had this problem been anticipated at genesis. Ideally, the nonce stored in account state would be a two-component value:

```
(created_at_height: u32, nonce: u32)
```

The `CheckNonce` extension would then carry:
- `created_at_height` as an **implicit** value: included in the signature but not in the extrinsic body.
- `nonce` as an **explicit** value: encoded in the extrinsic body (aka "extra"), as it is today.

This would have prevented the replay vulnerability from the start. Retrofitting this structure into `CheckNonce` is not feasible without breaking the existing signed extension interface. Instead, this RFC introduces a dedicated `CheckCreatedAtHeight` extension that achieves the same cryptographic binding without modifying `CheckNonce`.

### Storage Change: `created_at_height`

A new `created_at_height` field of type `u32` MUST be added to per-account storage. The field SHALL:

- Be set to the **current block height** (`frame_system::Pallet::<T>::block_number()`) whenever an account transitions from non-existent to existent in `System::Account`.
- Default to **zero** (`0u32`) for all accounts that exist prior to the runtime upgrade that enacts this change (see storage placement options below).

When an account is reaped and subsequently re-funded, a new `AccountInfo` entry is written with `created_at_height` set to the block height at the time of recreation. This new value differs from the value in effect when any prior transactions were signed, making those transactions permanently invalid.

#### Option A: New field in `frame_system::AccountInfo`

The field is added directly to `AccountInfo`, after `data`:

```rust
pub struct AccountInfo<Nonce, AccountData> {
    pub nonce: Nonce,
    pub consumers: RefCount,
    pub providers: RefCount,
    pub sufficients: RefCount,
    pub data: AccountData,
    pub created_at_height: u32,  // new
}
```

**Advantage:** Semantically correct. Account lifecycle is managed entirely by `frame_system`; the field that tracks the lifecycle epoch belongs there. Future readers of the code will find the field in the natural location.

**Disadvantage:** The SCALE encoding of `AccountInfo` changes, requiring a state migration. All existing `System::Account` entries must be migrated to the new layout (inserting four zero bytes after `data`). On Polkadot, this covers millions of accounts. To avoid excessive block weight in a single block, the migration SHOULD be implemented as a lazy/on-demand migration: old-format entries are transparently decoded on read, and entries are written in the new format on any subsequent update.

#### Option B: Reinterpret `ExtraFlags` in `pallet_balances::AccountData`

The `ExtraFlags` field in `pallet_balances::AccountData` is currently a `u128` newtype with only one bit in use, bit 127 (the MSB), which is the `new_logic` sentinel introduced when the holds/freezes balance model was adopted:

```rust
pub struct ExtraFlags(pub u128);

impl ExtraFlags {
    pub const NEW_LOGIC: ExtraFlags = ExtraFlags(1 << 127);
}
```

All bits 0–126 are zero for every existing account. This RFC proposes reinterpreting the `u128` as a structured layout without changing any stored bytes. SCALE encodes integers in little-endian order, so the mapping is:

```
bits   0– 31  : created_at_height  (u32)  - this RFC
bits  32– 63  : extra_flags        (u32)  - reserved for future use
bits  64–127  : flags              (u64)  - existing flags; bit 127 = new_logic sentinel
```

For all existing accounts, bits 0–63 are zero, so `created_at_height` decodes as `0` with no migration whatsoever.

**Advantage:** No state migration required. Fully backwards-compatible at the storage level.

**Disadvantage:**
- `created_at_height` ends up living in `pallet_balances` rather than `frame_system`, which is the wrong conceptual home for an account lifecycle property.
- The codec interpretation of `ExtraFlags` becomes non-obvious and requires careful documentation and defensive assertions to prevent future corruption of the field layout.
- This approach only applies to runtimes that use `pallet_balances`. Parachains using alternative balance pallets would need a different strategy (see Unresolved Questions).

The Fellowship SHOULD debate and resolve which option to adopt before this RFC is merged (see Unresolved Questions).

### New Extension: `CheckCreatedAtHeight`

A new transaction extension `CheckCreatedAtHeight` is introduced. It carries no **explicit** data (extrinsic size is unchanged) and carries `created_at_height` as a single **implicit** value:

```
Implicit = u32   (the sender's current created_at_height from storage)
Explicit = ()    (empty, no bytes added to the extrinsic)
```

In FRAME's `TransactionExtension` trait, the implicit value is gathered at validation time by reading the sender's `created_at_height` from storage and is added into the signing payload alongside other implicit values (spec version, genesis hash, etc.). The signer MUST read the same value from storage at signing time and include it in their signed payload. If the stored value has changed since the transaction was signed, because the account was reaped and re-created, signature verification fails automatically. No explicit comparison is required in `validate()`.

#### Formal Behaviour

- **`implicit()`**: Returns `System::Account::<T>::get(&signer).created_at_height`. If the account does not exist in storage, returns `0u32`, consistent with the default value used for pre-upgrade accounts.
- **`validate()`**: No explicit logic beyond what signature verification already enforces.
- **`prepare()`**: No state changes required.

#### Mandatory Enforcement

`CheckCreatedAtHeight` MUST be included in the signed extension pipeline for all **V4** and **V5** signed transactions once the enacting runtime upgrade is applied. A signed transaction that omits this extension MUST be rejected as invalid. Because the extension carries no explicit bytes, existing transaction size budgets and fee calculations are unaffected.

#### Effect on Replay Scenarios

| Scenario | Before this RFC | After this RFC |
|---|---|---|
| Immortal transaction replayed after account reaping and re-funding | **Valid** (nonce reset to 0) | **Invalid** (`created_at_height` changed) |
| Mortal transaction replayed within mortality window after reaping and re-funding | **Valid** | **Invalid** (`created_at_height` changed) |
| Same transaction included twice in one block after intra-block reap and re-fund, account created in a prior block | **Valid** (nonce reset) | **Invalid** (`created_at_height` changed) |
| Same transaction included twice in one block after intra-block reap and re-fund, account first created in the same block | **Valid** (nonce reset) | **Invalid** (runtime-level tx-hash deduplication; see below) |
| Same transaction included twice in one block, no reaping | **Invalid** (nonce check) | **Invalid** (nonce check, unchanged) |

#### Intra-Block Replay

For the common case, `CheckCreatedAtHeight` fully covers intra-block replay. If a transaction T1 was signed with `created_at_height = M` (the block in which the sender's account was originally created, where M < N) and within block N the account is reaped and re-funded, the new `created_at_height` is set to N. Any attempt to re-include T1 fails immediately because the stored value N does not match the signed value M.

The only remaining gap is the contrived scenario in which an account is **first created** within the same block N as the replay attempt. In that case the original and recreated account states both carry `created_at_height = N`, so signature verification alone cannot distinguish them. This gap is closed by a complementary runtime-level requirement:

Implementations MUST enforce, within `BlockBuilder_apply_extrinsic`, that the hash of each applied extrinsic is unique within the block. If an extrinsic with the same hash has already been applied in the current block, `BlockBuilder_apply_extrinsic` MUST return an error and the extrinsic MUST NOT be applied. This makes it impossible for any block author to include the same transaction more than once in a single block, closing the remaining intra-block edge case completely.

### Impact on Transaction Uniqueness

With this extension enforced, a given transaction can only ever be included once across the entire history of the chain. This makes the **transaction hash** a safe and stable unique identifier for inclusion events: the primary benefit for DApps, indexers, and block explorers, which can rely on it without any defensive edge-case handling. Additionally, the triple `(account_id, created_at_height, nonce)` becomes a reliable alternative canonical identifier across the full history of the chain.

## Drawbacks

1. **Storage overhead (Option A only)**: Option A adds 4 bytes of new state per account. For Polkadot's current account population this is small in absolute terms but is a permanent per-account cost. Option B has no storage overhead: it repurposes 4 bytes that are already allocated within the existing `ExtraFlags` u128 but are currently unused.

2. **Option A migration cost**: A full iteration over all `System::Account` entries is expensive. Even with a lazy migration strategy the intermediate state, where some accounts have the old layout, persists until all accounts have been touched by at least one write operation.

3. **Ecosystem tooling update**: Every signer, wallets, hardware signing devices, scripts, etc, must be updated to fetch `created_at_height` from storage and include it in the signing payload. This is the largest practical coordination cost of this RFC.

4. **Option B semantic mismatch**: Encoding an account lifecycle property inside a balance pallet's flags field is architecturally incoherent and places an ongoing documentation and maintenance burden on `pallet_balances`.

## Testing, Security, and Privacy

### Testing

Implementations MUST be tested against at minimum the following scenarios:

- A transaction is signed; the sender account is reaped in a subsequent block; the account is re-funded; the original transaction MUST be deemed invalid.
- A transaction is signed; the sender account is reaped and re-funded within the same block in which the original transaction is included, duplicate submission MUST be rejected as the transaction is now invalid.
- A transaction is signed against an account with `created_at_height = 0` (genesis or pre-upgrade account); the account is reaped and re-funded, the original transaction MUST be rejected (new `created_at_height` is the recreating block, non-zero) as the transaction is now invalid.
- A mortal transaction within its validity window MUST be rejected after the sender account is reaped and re-created.
- Any attempt to apply the same extrinsic (same hash) more than once within a single block via `BlockBuilder_apply_extrinsic` MUST be rejected, regardless of whether account reaping is involved.

### Security

This RFC eliminates all known forms of transaction replay on FRAME-based runtimes through two complementary mechanisms:

1. **`CheckCreatedAtHeight`**: a cryptographic binding between a transaction and the account's current lifecycle epoch. A mismatched `created_at_height` causes signature verification to fail and cannot be bypassed without knowledge of the sender's private key. This covers cross-block replay and the common intra-block replay scenario (where the sender's account was created in a prior block).

2. **Runtime-level tx-hash deduplication**: a requirement on `BlockBuilder_apply_extrinsic` to reject any extrinsic whose hash has already been applied in the current block. This closes the remaining theoretical intra-block gap (where the account is first created in the same block as the replay attempt) and provides a general guarantee that a given transaction can appear at most once per block under any circumstances.

### Privacy

This proposal has no privacy implications. `created_at_height` is a deterministic, publicly observable property of account state and reveals no information beyond what is already available on-chain.

## Performance, Ergonomics, and Compatibility

### Performance

`CheckCreatedAtHeight` requires one additional field access per transaction validation. In practice, `System::Account` is already fetched by `CheckNonce` during the same validation pass, so the marginal cost is a single field read on a value already in the storage cache. The overhead is negligible.

### Ergonomics

Signing libraries MUST add one storage query to retrieve `created_at_height` before constructing the signing payload. Libraries that already fetch `AccountInfo` to read the nonce can extract `created_at_height` from the same response at no extra network round-trip cost (under Option A, or with an updated decoder under Option B). The ergonomic impact on signers is therefore minimal once libraries are updated.

For DApp and indexer developers, the change is a net improvement: the transaction hash becomes a safe unique identifier for inclusion events, eliminating the defensive edge-case handling that the current protocol requires.

### Compatibility

This is a **breaking change to the transaction signing format**. Transactions signed without `CheckCreatedAtHeight` in the extension pipeline will be rejected by runtimes that enforce it.

This breakage is no different in kind from any prior runtime upgrade that modified the signed extension pipeline. The existing `CheckSpecVersion` implicit extension already ensures that all transactions signed before a runtime upgrade are automatically invalid after it. Consequently, the upgrade to a runtime that mandates `CheckCreatedAtHeight` simultaneously and safely invalidates all in-flight transactions signed under the previous runtime, regardless of whether those transactions include the new extension. No grace period or opt-in phase is needed.

## Prior Art and References

- **`CheckNonce`** (`frame_system`): Existing nonce extension. Prevents replay within a single account lifetime but provides no protection across lifetime epochs (post-reaping).
- **`CheckMortality`** (`frame_system`): Limits transaction validity to a block range and optionally to a specific fork. Partially mitigates replay but not when the account is reaped and re-funded within the validity window, and not at all for immortal transactions or intra-block replay.
- **Ethereum**: Ethereum accounts are not reaped when balance reaches zero; the nonce persists permanently at any balance. This class of replay vulnerability does not exist in Ethereum's account model. The problem is specific to the Polkadot ED-based account lifecycle.
- **Bitcoin**: UTXO model; no per-account nonce. Replay is structurally prevented by the one-time consumption of UTXOs [since BIP-0034](https://github.com/bitcoin/bips/blob/master/bip-0034.mediawiki).
- **[polkadot-fellows/RFCs#19](https://github.com/polkadot-fellows/RFCs/issues/19)**: Discussion on light clients and downloading block bodies. Proposals in that thread, such as a `System.Extrinsics` per-block `StorageMap<Hash, ExtrinsicIndex>`, are complicated by the fact that transaction hashes are not currently unique. This RFC resolves that precondition.
- **[paritytech/json-rpc-interface-spec#182](https://github.com/paritytech/json-rpc-interface-spec/pull/182)**: Proposal for an `archive_unstable_transactionReceipt` JSON-RPC method for efficient, stateless transaction location queries. Reviewers in that thread explicitly identified transaction hash non-uniqueness as a design problem for the method. This RFC eliminates that obstacle.

## Unresolved Questions

1. **Which storage placement option should be adopted?** Option A (new field in `frame_system::AccountInfo`, requires state migration) vs Option B (reinterpret `ExtraFlags` in `pallet_balances::AccountData`, no migration but semantic mismatch). The Fellowship should weigh implementation correctness against migration cost.

2. **Lazy vs eager migration (Option A only)**: If Option A is adopted, should the migration be lazy/on-demand, an eager bounded migration scheduled at upgrade time, or a combination? The choice has implications for how long the mixed-format intermediate state persists and how tooling must handle it.

3. **Behaviour for non-existent accounts**: `implicit()` returns `0u32` when the signer's account does not exist in storage. Is there a scenario in which this could cause a transaction to validate against an account that has been reaped but not yet re-created?


## Future Directions and Related Material

- The `created_at_height` value could serve as a useful primitive for on-chain logic that needs to reason about account age, though such uses are out of scope for this RFC.
- The guarantee that a transaction hash can only appear once across the entire chain history significantly simplifies the APIs and tooling used to track transaction inclusion. Methods such as `archive_unstable_transactionReceipt` (discussed in [paritytech/json-rpc-interface-spec#182](https://github.com/paritytech/json-rpc-interface-spec/pull/182)) can be specified cleanly around a transaction hash as an unambiguous key, without caveats or special-casing for duplicate inclusion. More broadly, any subscription, receipt, or finality-detection API that currently requires consumers to reason about `(account_id, nonce)` pairs and account reaping edge cases can be simplified to treat the transaction hash as the sole stable identifier.
