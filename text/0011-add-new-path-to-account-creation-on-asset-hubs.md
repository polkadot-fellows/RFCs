# RFC-0011: Add New Path to Account Creation on Asset Hubs

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| **Start Date**  | 19 July 2023                                                                  |
| **Description** | Proposal for a new secure means of creating an account on Asset Hub.          |
| **Authors**     | Joe Petrowski                                                                 |

## Summary

The Assets pallet includes a notion of asset "sufficiency". Sufficient assets, when transferred to
a non-existent account, will provide a sufficient reference that creates the account. That is, the
asset is _sufficient_ to justify an account's existence, even in lieu of the existential deposit of
DOT.

While convenient for sufficient assets, the vast majority of assets are not sufficient. This RFC
proposes an opt-in means for users to create accounts from non-sufficient assets by swapping a
portion of the first transfer to acquire the existential deposit of DOT.

## Motivation

The network can make an asset "sufficient" via governance call. However, the network is still
placing trust in the asset's administrator (which may be a third-party account or a protocol). The
asset's administrator could mint the asset and create many accounts without paying an adequate
storage deposit. For this reason, governance has been extremely strict in granting sufficiency, so
far only doing so to one asset (USDT).

With the introduction of the Asset Conversion pallet, the Asset Hub can offer a new path to account
creation. The current paths are:

1. An account can have the existential deposit of DOT;
1. An account can have the minimum balance of a sufficient asset;
1. Someone else can create an account in the context of an asset class by placing a deposit in DOT.
   This path is only available to the asset class's `Admin` or `Freezer`.

This RFC proposes a fourth path that does not introduce prior steps for either the sender or
receiver of the asset.

### Requirements

- The system MUST be secure against economic attacks that allow an attacker to create a virtually
  unlimited number of accounts.
- The system SHOULD allow users to hold and transact in any asset without _separately and priorly_
  acquiring DOT.

## Stakeholders

- Polkadot users
- Wallet and UI/UX developers

## Explanation

By using the Asset Conversion protocol, the system can convert any asset to DOT as long as there is
a path from that asset to DOT. As such, we can rely on the economic security provided by the
existential deposit of DOT by simply converting some amount of the asset being transferred to the
existential deposit.

This conversion only need happen when the account does not yet exist. When the destination account
does exist, the full amount of the asset can be transferred. This would mean that only the first
asset transfer to an account has some amount debited to acquire the DOT to create the account, but
subsequent transfers would always be in full.

The main benefit of this approach is that it removes the sender's need to know about the
desination's existence and the recipient's need to "prepare" an account by endowing it.

The primary tradeoff, of course, is that transactions like "send 10 USDT" could result in fewer
than 10 USDT arriving in the destination account. This can be solved by having the conversion be
opt-in for the sender.

Because the existential deposit is small (0.1 DOT on Asset Hub), and the user need not interact
with the DOT in any way -- because transaction fee payment can also be handled via Asset Conversion
-- many users may find this path convenient in avoiding transfer errors due to non-existent
accounts or asset insufficiency.

Stripping out all other asset transfer-associated logic, this RFC proposes the following logic:

```rust
fn transfer(
    origin: OriginFor,
    asset: AssetId,
    destination: AccountId,
    amount: Balance,
    create_destination: bool,
    ..
) -> DispatchResult {
    let from = ensure_signed(origin)?;
    let details = Asset::<T, I>::get(&id).ok_or(Error::<T, I>::Unknown)?;
    if destination.exists() || !create_destination || details.sufficient {
        // Either the destination already exists (holds ED of DOT), the user does not want to create
        // the destination account, or the asset class is sufficient. We can just transfer the
        // asset as normal.
        Self::do_transfer(asset, from, destination, amount, ..)?;
    } else {
        // The destination does not exist and the user has opted in to create it via a swap.
        //
        // We will try to swap the asset provided for the existential deposit, depositing the ED in
        // the destination account. If the asset does not have an Asset Conversion pair with DOT or
        // the asset amount isn't enough to acquire the existential deposit, this will fail. But we
        // generally think (a) pairs will exist, and (b) the ED is small and UIs can easily verify
        // that this should succeed, so failures should be rare.
        //
        // The swap returns the amount of the asset consumed to acquire the ED.
        let consumed = Swap::swap_tokens_for_exact_tokens(
            from,                // sender
            vec![asset, dot],    // path, where `dot` is Multilocation {parents: 1, interior: Here}
            existential_deposit, // amount_out, we need the ED for the account
            destination,         // send_to
            ..
        )?;
        // We used some asset for the swap, so we have to subtract that from the amount.
        let remaining_asset_amount = amount.saturating_sub(consumed);
        // Now we transfer whatever amount is left, knowing that the destination account exists.
        // This could still fail if the remaining amount is less than the minimum balance required
        // by the asset class.
        Self::do_transfer(asset, from, destination, remaining_asset_amount, ..)?;
    }
}
```

## Drawbacks

This solution would automatically convert some amount of another asset to DOT when acquiring DOT
was perhaps not the recipient's intent. However, this is opt-in.

## Testing, Security, and Privacy

An attacker that wanted to bloat state by sending worthless assets to many new accounts would need
to put the DOT into an Asset Conversion pool with the asset (thereby making the asset _not_
worthless with respect to DOT). This would provide the same cost and economic security as just
sending the existential deposit of DOT to all the new accounts. This approach is no less secure
than the DOT-only existential deposit system.

This proposal introduces no privacy enhancements or reductions.

## Performance, Ergonomics, and Compatibility

### Performance

The function to transfer assets will need to charge a larger weight at dispatch to account for the
possibility of needing to perform a swap for DOT. It could return any unused weight.

The implementation could also include witness data as to the destination account's existence so
that the block builder can appropriately budget for the weight.

### Ergonomics

This proposal would benefit the ergonomics of the system for end users by allowing all assets to
create destination accounts when needed.

### Compatibility

This change would require changes to the Assets pallet to add the new account creation path.

## Prior Art and References

Discussions with:

- SR Labs auditors, in particular Jakob Lell and Louis Merlin
- The monthly Asset Conversion ecosystem call, particular inspiration from Jakub Gregus

## Unresolved Questions

None at this time.

## Future Directions and Related Material

Not applicable.
