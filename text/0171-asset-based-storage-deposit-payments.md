# RFC-0171: Asset-Based Storage Deposit Payments

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 17 June 2026                                                                                |
| **Description** | Allow storage deposits on Polkadot system chains to be paid in non-native fungible assets   |
| **Authors**     | [Pablo Andrés Dorado Suárez](https://github.com/pandres95)                                  |

## Summary

Storage deposits on Polkadot and Kusama system chains currently must be paid in the respective
native token (DOT or KSM), even though transaction execution fees can already be settled in
non-native assets via `pallet-asset-conversion-tx-payment`. This RFC proposes a mechanism that
allows any fungible asset that has an on-chain DOT (or KSM) liquidity pool to back storage
deposits by holding it directly, with no conversion required. The mechanism builds on two existing FRAME
primitives — the `fungible` trait family and the `Consideration` API — and introduces a
`TransactionExtension` through which signers declare their preferred deposit asset.

## Motivation

Storage deposits are refundable collateral locked to compensate the network for on-chain state
growth. Although execution fees can already be paid in non-native assets, deposits originate from a
different subsystem and still require native tokens. This imposes an asymmetric requirement on
users: a signer who holds only USDT (or any other asset with an on-chain liquidity pool) can pay execution fees in that
asset, but must separately acquire DOT or KSM to cover any deposit-bearing extrinsic.

The friction this creates affects three groups:

- **End users**, who must maintain a DOT/KSM balance in addition to the asset they actually intend
  to use.
- **Wallet developers**, who must implement distinct asset-acquisition flows for fees versus
  deposits.
- **dApp developers**, who must account for two separate cost models when estimating and presenting
  on-chain operation costs to their users.

The requirements for a conforming solution are:

1. Any pallet that creates a storage deposit MUST be able to accept a non-native fungible asset as
   collateral without changes to its core logic.
2. The deposit amount charged in the chosen asset MUST equal the deposit amount that would be
   charged in the native token for the same storage footprint.
3. The mechanism MUST fall back to native-token deposits when no non-native preference is expressed.
4. Existing deposits locked before the feature is enabled MUST remain refundable under their
   original terms.

## Stakeholders

- **Runtime users** (end users and wallet software): the primary beneficiaries; they may use the
  same asset for both fees and deposits.
- **dApp and tooling developers**: benefit from a unified asset flow, with a single runtime API for
  cost estimation.
- **Pallet authors**: must migrate from direct `Currency`/`ReservableCurrency` usage to the
  `Consideration` API; pallet logic is otherwise unchanged.
- **Runtime configurers**: must wire up the appropriate `Consideration` implementation and include
  the new `TransactionExtension`.

Previous socialization: [Polkadot Forum — Asset-Based Storage Deposit Payments for Polkadot &
Kusama](https://forum.polkadot.network/t/asset-based-storage-deposit-payments-for-polkadot-kusama/14757).

## Explanation

### Background: FRAME Primitives

#### Fungible Traits

The `frame_support::traits::fungibles` (multi-asset) and `frame_support::traits::fungible`
(single-asset) trait families are the current standard interfaces for balance manipulation in FRAME.
They supersede the deprecated `Currency`, `ReservableCurrency`, and `LockableCurrency` traits.
Relevant traits include:

- `fungible::Inspect` / `fungibles::Inspect` — balance and asset queries
- `fungible::MutateHold` / `fungibles::MutateHold` — reserve-style holds identified by a typed
  reason
- `fungible::MutateFreeze` / `fungibles::MutateFreeze` — freeze-style locks

Pallets MUST use these traits for all balance manipulation related to storage deposits as a
prerequisite for supporting the multi-asset deposit mechanism described in this RFC.

#### The `Consideration` API

`frame_support::traits::Consideration` is a lightweight abstraction that treats every storage
deposit as a _portable ticket_. A `Consideration` value represents an outstanding obligation: it
records that a certain amount has been locked on behalf of a particular account and can be updated
or released independently of the underlying balance implementation.

The simplified interface is:

```rust
pub trait Consideration<AccountId, Footprint>:
    Member + FullCodec + TypeInfo + MaxEncodedLen
{
    /// Create a new consideration for `who` with the given storage footprint.
    fn new(who: &AccountId, new: Footprint) -> Result<Self, DispatchError>;

    /// Alter the consideration to a new footprint, returning any excess to `who`.
    fn update(self, who: &AccountId, new: Footprint) -> Result<Self, DispatchError>;

    /// Release the consideration, returning all locked collateral to `who`.
    fn drop(self, who: &AccountId) -> Result<(), DispatchError>;
}
```

Existing native-token implementations in FRAME include:

- `fungible::HoldConsideration` — backs each ticket with a hold via `MutateHold`.
- `fungible::FreezeConsideration` — backs each ticket with a freeze via `MutateFreeze`.

### Proposed Extension: Multi-Asset Consideration

This RFC specifies the required behaviour of a `Consideration` implementation that accepts
non-native assets as deposit collateral. The implementation holds the chosen asset directly, with
no price conversion. Runtimes MAY use any conforming implementation; this section defines the
required semantics.

#### Deposit Creation (`new`)

1. The implementation reads the _preferred asset_ for the current execution context (see
   [TransactionExtension](#transactionextension) below). If no preference is set, the native asset
   is used and behaviour is identical to `fungible::HoldConsideration`.
2. The required deposit amount `d` is determined by the pallet's storage footprint (unchanged from
   existing behaviour).
3. If a non-native asset `a` is preferred:
   a. The implementation checks that a DOT (or KSM) liquidity pool exists for `a` in
      `pallet-asset-conversion`. If no such pool exists, the extrinsic MUST fail.
   b. `d` units of asset `a` are placed into a hold on `who`'s account, and a ticket is issued
      recording `(a, d)`.
4. The ticket MUST record the asset identity and the exact quantity held so that the correct amount
   is returned at release time.

#### Deposit Update (`update`)

When the storage footprint changes (e.g., a metadata field grows or shrinks):

1. The new deposit amount `d'` is computed from the new footprint.
2. The difference `d' − d` is taken from or returned to `who` in asset `a`.
3. The ticket is updated to record `(a, d')`.

The asset associated with a given ticket MUST NOT change after creation.

#### Deposit Release (`drop`)

The stored quantity `d` of asset `a` is released from the hold and returned to `who`.

### TransactionExtension

A runtime that supports multi-asset deposits MUST include a `TransactionExtension` (the _asset
injection extension_) with the following properties:

1. It accepts an `Option<AssetId>` field in the additional signed data of the extrinsic.
2. During `prepare`, it stores the `AssetId` in a context accessible to the consideration
   implementation within the same dispatch (e.g., a pallet storage value cleared at the end of the
   block, or a thread-local).
3. During `post_dispatch`, it clears the stored context.

The `AssetId` type MUST match the type used by `pallet-assets` on the given chain.

Runtimes that do not include this extension continue to behave as today: all deposits are paid in
the native token.

### Runtime API

Runtimes SHOULD expose a runtime API to allow off-chain tooling to report deposit costs:

```rust
sp_api::decl_runtime_apis! {
    pub trait StorageDepositApi<AssetId, Balance>
    where
        AssetId: Codec,
        Balance: Codec,
    {
        /// Return the deposit amount charged for `items` storage keys with an average value
        /// size of `value_size` bytes. The amount is the same regardless of `asset`; `asset`
        /// is accepted to allow callers to confirm that a pool exists for the asset.
        ///
        /// Returns `None` if `asset` is `Some` but no DOT (or KSM) pool exists for it.
        fn estimate_deposit(
            items: u32,
            value_size: u32,
            asset: Option<AssetId>,
        ) -> Option<Balance>;
    }
}
```

Wallets and dApps SHOULD query this API before constructing deposit-bearing extrinsics to confirm
pool eligibility and present the deposit amount to users.

### Pallet Migration Requirements

For a pallet to support multi-asset deposits it MUST:

1. Replace all direct `Currency`/`ReservableCurrency` calls for deposit handling with the
   `Consideration` API.
2. Declare its `Consideration` type parameter in `Config` using a bound that accepts any conforming
   implementation (e.g., `type DepositConsideration: Consideration<Self::AccountId, Footprint>`).
3. Ensure deposit ticket types implement `MaxEncodedLen`, `TypeInfo`, and `FullCodec`.

Pallets that continue to use `Currency`/`ReservableCurrency` for deposits are unaffected by this
RFC; their deposits continue to require native tokens.

## Drawbacks

- **Pallet migration cost**: Every deposit-bearing pallet must be updated to use the `Consideration`
  API before it benefits from this mechanism. Until a pallet migrates, its deposits still require
  native tokens, creating an inconsistent experience across system features.
- **No economic equivalence**: The deposit amount is the same nominal integer regardless of the
  chosen asset. A user who deposits in an asset worth much less than DOT locks proportionally less
  economic value, weakening the deposit's role as a disincentive for state bloat. This tradeoff is
  accepted in exchange for the simplicity of removing any price oracle dependency.
- **Pool-based eligibility is permissionless**: Any asset whose liquidity pool is created (or
  removed) by an external party automatically becomes eligible (or ineligible) for new deposits.
  This removes governance overhead but means eligibility can change without a runtime upgrade.
- **Increased ticket size**: Tickets that record asset identity and amount are larger than
  native-only tickets, increasing the storage footprint of deposit accounting itself.

## Testing, Security, and Privacy

### Testing

Implementations MUST be tested for:

- Correct round-trip: deposit `d` of asset `a`, refund `d` of asset `a`.
- Rejection when the preferred asset has no DOT (or KSM) pool in `pallet-asset-conversion`.
- Correct update semantics when footprint increases and decreases.
- Correct behaviour with the `TransactionExtension` absent vs. present.
- Correct release of deposits created against an asset whose pool is later removed.

### Security

- **Pool-gated eligibility**: Accepting any asset with a pool means low-liquidity or short-lived
  pools could briefly allow low-value assets as collateral. The pool existence check is a necessary
  but not sufficient signal of asset quality; runtimes MAY add additional guards (e.g., minimum pool
  depth) if this is a concern.
- **Existential deposit**: If taking `d` of asset `a` reduces `who`'s balance below the asset's
  minimum balance, the extrinsic MUST fail with an error before any state change is committed.
- **No privacy impact**: Deposit asset preferences are visible on-chain as part of the signed
  extrinsic and the stored ticket.

## Performance, Ergonomics, and Compatibility

### Performance

Deposit creation with a non-native asset adds one pool existence check (a storage read against
`pallet-asset-conversion`) and one additional balance hold operation compared to a native deposit. Both are constant-cost operations
independent of deposit size. Deposit release has no extra reads because the refund amount and asset
are taken directly from the stored ticket.

### Ergonomics

- Users who do not specify an asset preference observe no change in behaviour.
- Wallets that support the extension can present a single asset selector covering both execution
  fees and deposits, eliminating the need to hold separate DOT/KSM balances.
- dApp developers can use `StorageDepositApi` to confirm asset eligibility and display the deposit
  amount before the user signs.

### Compatibility

This RFC does not change the interface of any existing pallet. Pallets that migrate to the
`Consideration` API remain backward-compatible: existing `Config` implementations using
`HoldConsideration` or `FreezeConsideration` continue to work without changes.

The new `TransactionExtension` is additive. Existing signed extensions are not affected. Runtimes
that do not include the extension behave exactly as today.

## Prior Art and References

- [`pallet-asset-conversion-tx-payment`](https://github.com/paritytech/polkadot-sdk/tree/master/substrate/frame/transaction-payment/asset-conversion-tx-payment):
  the existing mechanism for paying execution fees in non-native assets.
- [`frame_support::traits::fungible::Consideration`](https://docs.rs/frame-support/latest/frame_support/traits/fungible/trait.Consideration.html):
  the existing FRAME consideration abstraction.
- [`frame_support::traits::fungible::HoldConsideration`](https://docs.rs/frame-support/latest/frame_support/traits/fungible/struct.HoldConsideration.html):
  native-token consideration via holds.
- [Polkadot Forum: Asset-Based Storage Deposit Payments for Polkadot &
  Kusama](https://forum.polkadot.network/t/asset-based-storage-deposit-payments-for-polkadot-kusama/14757)

## Unresolved Questions

1. **Minimum pool depth**: Should a minimum liquidity threshold be required for a pool to qualify,
   to prevent transient or trivially small pools from enabling low-value collateral?
2. **Update asset change**: If the user submits an update extrinsic with a different asset in the
   extension, should the update be rejected (forcing the same asset throughout the ticket's
   lifetime), or should the old collateral be released and new collateral taken in the new asset?
3. **Naming**: The multi-asset hold consideration is referred to generically here; the exact type
   and crate names are left to implementers and SHOULD be agreed upon before any runtime deployment.

## Future Directions and Related Material

- Once all deposit-bearing pallets on Polkadot Hub and Kusama Hub have migrated to the
  `Consideration` API, users will be able to interact with the full system feature set using a
  single whitelisted non-native asset, with no requirement to hold DOT or KSM beyond the
  existential deposit.
- If economic equivalence becomes a requirement in the future, a price-oracle-based variant of the
  multi-asset consideration could be specified as a separate RFC, building on the `Consideration`
  infrastructure introduced here.
- The `TransactionExtension` infrastructure introduced here may be reusable for future features
  that require per-extrinsic asset preferences.
