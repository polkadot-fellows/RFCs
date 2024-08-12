# RFC-0111: Pure Proxy Replication

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 12 Aug 2024.                                                                            |
| **Description** | Replication of pure proxy account ownership to a remote chain                                                                   |
| **Authors**     |  @muharem                                                                                           |

## Summary

This RFC proposes a solution to replicate an existing pure proxy from one chain to others. The aim is to address the current limitations where pure proxy accounts, which are keyless, cannot have their proxy relationships recreated on different chains. This leads to issues where funds or permissions transferred to the same keyless account address on chains other than its origin chain become inaccessible.

## Motivation

A pure proxy is a new account created by a primary account. The primary account is set as a proxy for the pure proxy account, managing it. Pure proxies are keyless and non-reproducible, meaning they lack a private key and have an address derived from a preimage determined by on-chain logic. More on pure proxies can be found [here](https://wiki.polkadot.network/docs/learn-proxies-pure).

For the purpose of this document, we define a keyless account as a "pure account", the controlling account as a "proxy account", and the entire relationship as a "pure proxy".

The relationship between a pure account (e.g., account ID: `pure1`) and its proxy (e.g., account ID: `alice`) is stored on-chain (e.g., parachain `A`) and currently cannot be replicated to another chain (e.g., parachain `B`). Because the account `pure1` is keyless and its proxy relationship with `alice` is not replicable from the parachain `A` to the parachain `B`, `alice` does not control the `pure1` account on the parachain `B`.

Although this behaviour is not promised, users and clients often mistakenly expect `alice` to control the same `pure1` account on the parachain `B`. As a result, assets transferred to the account or permissions granted for it are inaccessible. Several factors contribute to this misuse:
- regular accounts on different parachains with the same account ID are typically accessible for the owner and controlled by the same private key (e.g., within System Parachains);
- users and clients do not distinguish between keyless and regular accounts;
- members using the multisig account ID across different chains, where a member of a multisig is a pure account;
- users may prefer an account with a registered identity (e.g. for cross-chain treasury spend proposal), even if the account is keyless;

Given that these mistakes are likely, it is necessary to provide a solution to either prevent them or enable access to a pure account on a target chain.

## Stakeholders

Runtime Users, Runtime Devs, wallets, cross-chain dApps.

## Explanation

One possible solution is to allow a proxy to create or replicate a pure proxy relationship for the same pure account on a target chain. For example, Alice, as the proxy of the `pure1` pure account on parachain `A`, should be able to set a proxy for the same `pure1` account on parachain `B`.

To minimise security risks, the parachain `B` should grant the parachain `A` the least amount of permission necessary for the replication. First, Parachain `A` claims to Parachain `B` that the operation is commanded by the pure account, and thus by its proxy, and second, provides proof that the account is keyless.

The replication process will be facilitated by XCM, with the first claim made using the `DescendOrigin` instruction. The replication call on parachain `A` would require a signed origin by the pure account and construct an XCM program for parachain `B`, where it first descends the origin, resulting in the `ParachainA/AccountId32(pure1)` origin location on the receiving side.

To prove that the pure account is keyless, the client must provide the initial preimage used by the chain to derive the pure account. Parachain `A` verifies it and sends it to parachain `B` with the replication request.

We can draft a pallet extension for the proxy pallet, which needs to be initialised on both sides to enable replication:

``` rust 
// Simplified version to illustrate the concept.
mod pallet_proxy_replica {
  /// The part of the pure account preimage that has to be provided by a client.
  struct Witness {
    /// Pure proxy swapner
    spawner: AccountId,
    /// Disambiguation index
    index: u16,
    /// The block height and extrinsic index of when the pure account was created.  
    block_number: BlockNumber,
    /// The extrinsic index.
    ext_index: u32,
    // Part of the preimage, but constant.
    // proxy_type: ProxyType::Any,
  } 
  // ...
  
  /// The replication call to be initiated on the source chain.
  // Simplified version, the XCM part will be abstracted by the `Config` trait.
  fn replicate(origin: SignedOrigin, witness: Witness, proxy: xcm::Location) -> ... {
       let pure = ensure_signed(origin);
       ensure!(pure == proxy_pallet::derive_pure_account(witness), Error::NotPureAccount);
       let xcm = vec![
         DescendOrigin(who),
         Transact(
             // …
             origin_kind: OriginKind::Xcm,
	     call: pallet_proxy_replica::create(witness, proxy).encode(),
         )
       ];
       xcmTransport::send(xcm)?;
  }
  // …
  
  /// The call initiated by the source chain on the receiving chain.
  // `Config::CreateOrigin` - generally open for whitelisted parachain IDs and 
  // converts `Origin::Xcm(ParachainA/AccountId32(pure1))` to `AccountID(pure1)`.
  fn create(origin: Config::CreateOrigin, witness: Witness, proxy: xcm::Location) -> ... {
       let pure = T::CreateOrigin::ensure_origin(origin);
       ensure!(pure == proxy_pallet::derive_pure_account(witness), Error::NotPureAccount);
       proxy_pallet::create_pure_proxy(pure, proxy);
  }
}

```

## Drawbacks

There are two disadvantages to this approach:
- The receiving chain has to trust the sending chain's claim that the account controlling the pure account has commanded the replication.
- Clients must obtain witness data.

We could eliminate the first disadvantage by allowing only the spawner of the pure proxy to recreate the pure proxies, if they sign the transaction on a remote chain and supply the witness/preimage. Since the preimage of a pure account includes the account ID of the spawner, we can verify that the account signing the transaction is indeed the spawner of the given pure account. However, this approach would grant exclusive rights to the spawner over the pure account, which is not a property of pure proxies at present. This is why it's not an option for us.

As an alternative to requiring clients to provide a witness data, we could label pure accounts on the source chain and trust it on the receiving chain. However, this would require the receiving chain to place greater trust in the source chain. If the source chain is compromised, any type of account on the trusting chain could also be compromised.

A conceptually different solution would be to not implement replication of pure proxies and instead inform users that ownership of a pure proxy on one chain does not imply ownership of the same account on another chain. This solution seems complex, as it would require UIs and clients to adapt to this understanding. Moreover, mistakes would likely remain unavoidable.

## Testing, Security, and Privacy

Each chain expressly authorize another chain to replicate its pure proxies, accepting the inherent risk of that chain potentially being compromised.

## Performance, Ergonomics, and Compatibility

### Performance

The replication is facilitated by XCM, which adds some additional load to the communication channel. However, since the number of replications is not expected to be large, the impact is minimal.

### Ergonomics

The proposed solution does not alter any existing interfaces. It does require clients to obtain the witness data which should not be an issue with support of an indexer. 

### Compatibility

None.

## Prior Art and References

None.

## Unresolved Questions

None.

## Future Directions and Related Material

- Pure Proxy documentation - https://wiki.polkadot.network/docs/learn-proxies-pure
