# RFC-0100: New XCM instruction: `InitiateAssetsTransfer`

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 11 July 2024                                                                                |
| **Description** | Add new XCM instruction: `InitiateAssetsTransfer` for mixing asset transfer types in same XCM |
| **Authors**     | Adrian Catangiu                                                                             |

## Summary

This RFC proposes a new instruction that provides a way to initiate on remote chains, asset transfers which
transfer multiple types (teleports, local-reserve, destination-reserve) of assets, using XCM alone.

The currently existing instructions are too opinionated and force each XCM asset transfer to a single
transfer type (teleport, local-reserve, destination-reserve). This results in inability to combine different
types of transfers in single transfer which results in overall poor UX when trying to move assets across
chains.

## Motivation

XCM is the de-facto cross-chain messaging protocol within the Polkadot ecosystem, and cross-chain
assets transfers is one of its main use-cases. Unfortunately, in its current spec, it does not support
initiating on a remote chain, one or more transfers that combine assets with different transfer types.  
For example, `ParachainA` cannot instruct `AssetHub` to teleport `ForeignAssetX` to `ParachainX` alongside
`USDT` (which has to be reserve transferred) using current XCM specification.

There currently exist `DepositReserveAsset`, `InitiateReserveWithdraw` and `InitiateTeleport` instructions
that initiate asset transfers on execution, but they are opinionated in the type of transfer to use.
Combining them is also not possible, because as a result of their individual execution, a message containing
a `ClearOrigin` instruction is sent to the destination chain, making subsequent transfers impossible after
the first instruction is executed.

The new instruction proposed by this RFC allows an XCM program to describe multiple asset transfer types,
then execute them in one shot with a single `remote_xcm` program sent to the target chain to effect
the transfer and subsequently clear origin.

Multi-hop asset transfers will benefit from this change by allowing single XCM program to handle multiple
types of transfers and reduce complexity.

Bridge asset transfers greatly benefit from this change by allowing building XCM programs to transfer multiple
assets across multiple hops in a single pseudo-atomic action.  
For example, allows single XCM program execution to transfer multiple assets from `ParaK` on Kusama, through Kusama
Asset Hub, over the bridge through Polkadot Asset Hub with final destination `ParaP` on Polkadot.

With current XCM, we are limited to doing multiple independent transfers for each individual hop in order to
move both "interesting" assets, but also "supporting" assets (used to pay fees).

## Stakeholders

- Runtime users
- Runtime devs
- Wallet devs
- dApps devs

## Explanation

We can specify the desired transfer type for some asset(s) using:

```rust
/// Specify which type of asset transfer is required for a particular `(asset, dest)` combination.
pub enum AssetTransferFilter {
	/// teleport assets matching `AssetFilter` to `dest`
	Teleport(AssetFilter),
	/// reserve-transfer assets matching `AssetFilter` to `dest`, using the local chain as reserve
	ReserveDeposit(AssetFilter),
	/// reserve-transfer assets matching `AssetFilter` to `dest`, using `dest` as reserve
	ReserveWithdraw(AssetFilter),
}
```

This RFC proposes 1 new XCM instruction:
```rust
/// Cross-chain transfer matching `assets` in the holding register as follows:
///
/// Assets in the holding register are matched using the given list of `AssetTransferFilter`s,
/// they are then transferred based on their specified transfer type:
///
/// - teleport: burn local assets and append a `ReceiveTeleportedAsset` XCM instruction to
///   the XCM program to be sent onward to the `dest` location,
///
/// - reserve deposit: place assets under the ownership of `dest` within this consensus system
///   (i.e. its sovereign account), and append a `ReserveAssetDeposited` XCM instruction
///   to the XCM program to be sent onward to the `dest` location,
///
/// - reserve withdraw: burn local assets and append a `WithdrawAsset` XCM instruction
///   to the XCM program to be sent onward to the `dest` location,
///
/// The onward XCM is then appended a `ClearOrigin` to allow safe execution of any following
/// custom XCM instructions provided in `remote_xcm`.
///
/// The onward XCM also potentially contains a `BuyExecution` instruction based on the presence
/// of the `remote_fees` parameter (see below).
///
/// Parameters:
/// - `dest`: The location of the transfer destination.
/// - `remote_fees`: If set to `Some(asset_xfer_filter)`, the single asset matching
///   `asset_xfer_filter` in the holding register will be transferred first in the remote XCM
///   program, followed by a `BuyExecution(fee)`, then rest of transfers follow.
///   This guarantees `remote_xcm` will successfully pass a `AllowTopLevelPaidExecutionFrom` barrier.
/// - `remote_xcm`: Custom instructions that will be executed on the `dest` chain. Note that
///   these instructions will be executed after a `ClearOrigin` so their origin will be `None`.
///
/// Safety: No concerns.
///
/// Kind: *Command*.
///
/// Errors:
InitiateAssetsTransfer {
	destination: Location,
	assets: Vec<AssetTransferFilter>,
	remote_fees: Option<AssetTransferFilter>,
	remote_xcm: Xcm<()>,
}
```

An `InitiateAssetsTransfer { .. }` instruction shall transfer to `dest`, all assets in the `holding` register
that match the provided `assets` and `remote_fees` filters.
These filters identify the assets to be transferred as well as the transfer type to be used for transferring
them.
It shall handle the local side of the transfer, then forward an onward XCM to `dest` for handling
the remote side of the transfer.

It should do so using same mechanisms as existing `DepositReserveAsset`, `InitiateReserveWithdraw`, `InitiateTeleport`
instructions but practically combining all required XCM instructions to be remotely executed into a _single_
remote XCM program to be sent over to `dest`.

Furthermore, through `remote_fees: Option<AssetTransferFilter>`, it shall allow specifying a single asset to be used
for fees on `dest` chain. This single asset shall be remotely handled/received by the **first instruction** in the
onward XCM and shall be followed by a `BuyExecution` instruction using it.
If `remote_fees` is set to `None`, the **first instruction** in the onward XCM shall be a `UnpaidExecution` instruction.
The rest of the assets shall be handled by subsequent instructions, thus also finally allowing
[single asset buy execution](https://github.com/paritytech/polkadot-sdk/issues/2423) barrier security recommendation.

The `BuyExecution` appended to the onward XCM specifies `WeightLimit::Unlimited`, thus being limited only by the
`remote_fees` asset "amount". This is a deliberate decision for enhancing UX - in practice, people/dApps care about
limiting the amount of fee asset used and not the actually used weight.

The onward XCM, following the assets transfers instructions, `ClearOrigin` or `DescendOrigin` instructions shall be
appended to stop acting on behalf of the source chain, then the caller-provided `remote_xcm` shall also be appended,
allowing the caller to control what to do with the transferred assets.

### Example usage: transferring 2 different asset types across 3 chains

- Transferring ROCs as the native asset of `RococoAssetHub` and PENs as the native asset of `Penpal`,
- Transfer origin is `Penpal` (on Rococo) and the destination is `WestendAssetHub` (across the bridge),
- ROCs are native to `RococoAssetHub` and are registered as trust-backed assets on `Penpal` and `WestendAssetHub`,
- PENs are native to `Penpal` and are registered as teleportable assets on `RococoAssetHub` and as
  foreign assets on `WestendAssetHub`,
- Fees on `RococoAssetHub` and `WestendAssetHub` are paid using ROCs.

We can transfer them from `Penpal` (Rococo), through `RococoAssetHub`, over the bridge to `WestendAssetHub`
by executing a _single_ XCM message, even though we'll be mixing multiple types of transfers along the path:
1. 1st leg of the transfer: Penpal -> Rococo Asset Hub:
   - teleport PENs
   - reserve withdraw ROCs
2. 2nd leg of the transfer: Rococo Asset Hub -> Westend Asset Hub:
   - reserve deposit both PENs and ROCs

```rust
Penpal::execute_with(|| {
    let rocs: Asset = (rocs_id.clone(), rocs_amount).into();
    let pens: Asset = (pens_id, pens_amount).into();
    let assets: Assets = vec![rocs.clone(), pens.clone()].into();

    // XCM to be executed at dest (Westend Asset Hub)
    let xcm_on_dest =
        Xcm(vec![DepositAsset { assets: Wild(All), beneficiary: beneficiary.clone() }]);

    // XCM to be executed at Rococo Asset Hub
    let context = PenpalUniversalLocation::get();
    let reanchored_assets = assets.clone().reanchored(&local_asset_hub, &context).unwrap();
    let reanchored_dest = destination.clone().reanchored(&local_asset_hub, &context).unwrap();
    let reanchored_rocs_id = rocs_id.clone().reanchored(&local_asset_hub, &context).unwrap();

    // from AHR, both ROCs and PENs are local-reserve transferred to Westend Asset Hub
    let assets_filter = vec![
        AssetTransferFilter::ReserveDeposit(reanchored_assets.clone().into())
    ];
    // we want to pay with ROCs on WAH
    let remote_fees = Some(AssetTransferFilter::ReserveDeposit(
        AssetFilter::Wild(AllOf { id: reanchored_rocs_id.into(), fun: WildFungibility::Fungible }))
    );
    let xcm_on_ahr = Xcm(vec![
        InitiateAssetsTransfer {
            dest: reanchored_dest,
            assets: assets_filter,
            remote_fees: Some(),
            remote_xcm: xcm_on_dest,
        },
    ]);

    // pay remote fees with ROCs
    let remote_fees = Some(
        AssetTransferFilter::ReserveWithdraw(
            AssetFilter::Wild(AllOf { id: rocs_id.into(), fun: WildFungibility::Fungible })
        )
    );
    // XCM to be executed locally
    let xcm = Xcm::<penpal_runtime::RuntimeCall>(vec![
        // Withdraw both ROCs and PENs from origin account
        WithdrawAsset(assets.clone().into()),
        // Execute the transfers while paying remote fees with ROCs
        InitiateAssetsTransfer {
            dest: local_asset_hub,
            assets: vec![
                // ROCs are reserve-withdrawn on AHR
                ReserveWithdraw(rocs.into()),
                // PENs are teleported to AHR
                Teleport(pens.into()),
            ],
            remote_fees,
            remote_xcm: xcm_on_ahr,
        },
    ]);

    <Penpal as PenpalPallet>::PolkadotXcm::execute(
        signed_origin,
        bx!(xcm::VersionedXcm::V4(xcm.into())),
        Weight::MAX,
    ).unwrap();
})
```

## Drawbacks

No drawbacks identified.

## Testing, Security, and Privacy

There should be no security risks related to the new instruction from the XCVM perspective. It follows the same
pattern as with single-type asset transfers, only now it allows combining multiple types at once.

_Improves_ security by enabling
[enforcement of single asset for buying execution](https://github.com/paritytech/polkadot-sdk/issues/2423),
which minimizes the potential free/unpaid work that a receiving chain has to do. It does so, by making the
required execution fee payment, part of the instruction logic through the `remote_fees: Option<AssetTransferFilter>`
parameter, which will make sure the remote XCM starts with a single-asset-holding-loading-instruction,
immediately followed by a `BuyExecution` using said asset.

## Performance, Ergonomics, and Compatibility

This brings no impact to the rest of the XCM spec. It is a new, independent instruction, no changes to existing instructions.

Enhances the exposed functionality of Polkadot. Will allow multi-chain transfers that are currently forced to happen in
multiple programs per asset per "hop", to be possible in a single XCM program.

### Performance

No performance changes/implications.

### Ergonomics

The proposal enhances developers' and users' cross-chain asset transfer capabilities. This enhancement is optimized for XCM
programs transferring multiple assets, needing to run their logic across multiple chains.

### Compatibility

Does this proposal break compatibility with existing interfaces, older versions of implementations? Summarize necessary
migrations or upgrade strategies, if any.

This enhancement is compatible with all **existing** XCM programs and versions.

New (XCMv5) programs using this instruction shall be best-effort downgraded to an older XCM version, but cannot guarantee
success.
A program where the new instruction is used to initiate multiple types of asset transfers, cannot be downgraded to older
XCM versions, because there is no equivalent capability there.
Such conversion attempts will explicitly fail.

## Prior Art and References

None.

## Unresolved Questions

None.

## Future Directions and Related Material

None.
