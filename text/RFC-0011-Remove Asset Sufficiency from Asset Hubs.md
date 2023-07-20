# RFC-0011: Remove Asset Sufficiency from Asset Hubs

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| **Start Date**  | 19 July 2023                                                                  |
| **Description** | Proposal for a secure means of removing asset "sufficiency".                  |
| **Authors**     | Joe Petrowski                                                                 |

## Summary

The Assets pallet includes a notion of asset "sufficiency". Sufficient assets, when transferred to
a non-existent account, will provide a sufficient reference that creates the account. That is, the
asset is _sufficient_ to justify an account's existence, even in lieu of the existential deposit of
DOT.

This RFC proposes a means of removing this concept from Asset Hub in a way that will increase both
security and simplicity.

## Motivation

The network can make an asset "sufficient" via governance call. However, the network is still
placing trust in the asset's administrator (which may be a third-party account or a protocol). The
asset's administrator could mint the asset and create many accounts without paying an adequate
storage deposit. For this reason, governance has been extremely strict in granting sufficiency, so
far only doing so to one asset (USDT).

The concept of sufficiency can also be confusing for users and UX developers because it exposes
low-level protocol decisions (like existence criteria). Further, it means that the existence
criteria on Asset Hub are different than in other locations within the Polkadot system.

But the ability to create accounts without the need for the user to interact with DOT brings user
experience advantages. It allows applications to let users only use the asset(s) they are
interested in without adding extra steps to their journey.

With the introduction of the Asset Conversion pallet, the Asset Hub can entirely remove asset
sufficiency in a secure way, while still allowing asset transfer without introducing intermediate
steps in a user's (both sender's and receiver's) attempt to transer an asset.

### Requirements

- The system MUST be secure against economic attacks that allow an attacker to create a virtually
  unlimited number of accounts.
- The system SHOULD allow users to hold and transact in any asset without _separately and priorly_
  acquiring DOT.
- The system SHOULD NOT require asset-specific governance intervention.

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

The main benefits of this approach are:

- Asset transfers should almost always succeed, without the sender knowing about the destination's
  existence nor the recipient needing to "prepare" an account by endowing it;
- There is an increase in network security by only trusting DOT issuance and not needing to trust
  asset issuers;
- Wallet and UI developers no longer need to design logic around asset sufficiency.

The primary tradeoff, of course, is that it does force users to have DOT in order to have an
account. However, this is true everywhere else within the system, the amount is small (the
existential deposit is 0.1 DOT on Asset Hub), and the user need not interact with the DOT in any
way because transaction fee payment can also be handled via Asset Conversion.

Stripping out all other asset transfer-associated logic, this RFC proposes the following logic:

```rust
fn transfer(
    origin: OriginFor,
    asset: AssetId,
    destination: AccountId,
    amount: Balance,
    ..
) -> DispatchResult {
    let from = ensure_signed(origin)?;
    if destination.exists() {
        // The destination already exists (holds ED of DOT). We can just transfer the asset as
        // normal.
        Self::do_transfer(asset, from, destination, amount, ..)?;
    } else {
        // The destination does not exist. In the current way, we would check if the asset is
        // sufficient, and create the account with a sufficient reference if so or fail if not.
        //
        // Instead, we try to swap the asset provided for the existential deposit, depositing the ED
        // in the destination account. If the asset does not have an Asset Conversion pair with DOT
        // or the asset amount isn't enough to acquire the existential deposit, this will fail. But
        // we generally think (a) pairs will exist, and (b) the ED is small and UIs can easily
        // verify that this should succeed, so failures should be rare.
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
was perhaps not the recipient's intent.

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

This proposal would benefit the ergonomics of the system for end users by making all assets behave
the same when sending to a new account.

### Compatibility

This change would require changes to the Assets pallet to remove sufficiency from the internal
logic of the pallet. The Assets pallet may want to maintain the concept of sufficiency should other
chains want to use it for other purposes, but asset transfer should have a handler for what to do
when an account does not exist. The default implementation of that handler could rely on
sufficiency to preserve behavior, but runtimes (like Asset Hub) could implement an alternative,
like using Asset Conversion.

## Prior Art and References

Discussions with:

- SR Labs auditors, in particular Jakob Lell and Louis Merlin
- The monthly Asset Conversion ecosystem call, particular inspiration from Jakub Gregus

## Unresolved Questions

None at this time.

## Future Directions and Related Material

Not applicable.
