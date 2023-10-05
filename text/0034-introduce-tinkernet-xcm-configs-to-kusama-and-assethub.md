# RFC-34: Introduce Tinkernet XCM configs to Kusama and Asset Hub

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 05 October 2023                                                                             |
| **Description** | Introduce Tinkernet multisig XCM configs to Kusama and Asset Hub                            |
| **Authors**     | Gabriel Facco de Arruda                                                                     |

## Summary

This RFC proposes the introduction of Tinkernet's multisig XCM configs to both Kusama and the Kusama Asset Hub. These configs are spcifically a MultiLocation to AccountId converter and a MultiLocation to Origin converter. This enables the multisigs managed by the Tinkernet Kusama parachain to operate under Kusama and Asset Hub using their proper accounts, which are derived locally using a static derivation function with the goal to preserve the same account address across the origin and any destination chains, hence the need for the converter configs to be implemented directly in the receiver chains.

## Motivation

The integration of these simple XCM MultiLocation converters into Kusama and Kusama Asset Hub would allow for InvArch Tinker Network to integrate the relay and Asset Hub into the Saturn Multisig protocol, which intends to give users a unifying multisig and DAO experience that creates an intuitive user experience, one of the features that makes this possible is the shared account address across all networks, similar to how externally owned accounts would experience the many networks that compose the Kusama ecosystem of blockchains.

## Stakeholders

- Parachain users
- Ecosystem DAOs and communities
- Institutions managing funds across multiple chains

## Explanation

Saturn is a multi-chain multisig protocol built to utilize XCM for cross-chain execution, it works by defining the multisig and all of the necessary logic for operation in the Tinkernet parachain. The mulisig entities are defined at their lowest level as an integer id, which is then used to derive an AccountId locally or externally at an XCM connected chain.

The structure of the MultiLocation origin (from the perspective of the relay) is the following:
```rust
MultiLocation {
    parents: 0,
    interior: Junctions::X3(
        Junction::Parachain(2125), // Tinkernet ParaId in Kusama.
        Junction::PalletInstance(71), // Pallet INV4, from which the multisigs originate.
        Junction::GeneralIndex(index) // Index from which the multisig account is derived.
    )
}
```

This structure's use of an integer id is what allows the deriation of the exact same account id in the destination chains without having to rehash an account id, and since this is happening in the receiver's runtime there's also no risk of account impersonation, eliminating any trust requirements.

These are the two XCM converters that need to be implemented in the receiver chain (Kusama in this case):
```rust
// Kusama's MultiLocation -> AccountId converters
pub type SovereignAccountOf = (
	// We can convert a child parachain using the standard `AccountId` conversion.
	ChildParachainConvertsVia<ParaId, AccountId>,
	// We can directly alias an `AccountId32` into a local account.
	AccountId32Aliases<ThisNetwork, AccountId>,
	// Mapping Tinkernet multisig to the correctly derived AccountId.
	TinkernetMultisigAsAccountId<AccountId>,
);

// Kusama's MultiLocation -> Origin converters
type LocalOriginConverter = (
	// A `Signed` origin of the sovereign account that the original location controls.
	SovereignSignedViaLocation<SovereignAccountOf, RuntimeOrigin>,
	// A child parachain, natively expressed, has the `Parachain` origin.
	ChildParachainAsNative<parachains_origin::Origin, RuntimeOrigin>,
	// The AccountId32 location type can be expressed natively as a `Signed` origin.
	SignedAccountId32AsNative<ThisNetwork, RuntimeOrigin>,
	// A system child parachain, expressed as a Superuser, converts to the `Root` origin.
	ChildSystemParachainAsSuperuser<ParaId, RuntimeOrigin>,
	// Derives signed AccountId origins for Tinkernet multisigs.
	TinkernetMultisigAsNativeOrigin<RuntimeOrigin>,
);

// Below is the definition of TinkernetMultisigAsAccountId, TinkernetMultisigAsNativeOrigin and the supporting code.

/// Tinkernet ParaId used when matching Multisig MultiLocations.
const TINKERNET_PARA_ID: u32 = 2125;

/// Tinkernet Multisig pallet instance used when matching Multisig MultiLocations.
const TINKERNET_MULTISIG_PALLET: u8 = 71;

/// Constant derivation function for Tinkernet Multisigs.
/// Uses the Tinkernet genesis hash as a salt.
pub fn derive_tinkernet_multisig<AccountId: Decode>(id: u128) -> Result<AccountId, ()> {
	AccountId::decode(&mut TrailingZeroInput::new(
		&(
			// The constant salt used to derive Tinkernet Multisigs, this is Tinkernet's genesis
			// hash.
			H256([
				212, 46, 150, 6, 169, 149, 223, 228, 51, 220, 121, 85, 220, 42, 112, 244, 149, 243,
				80, 243, 115, 218, 162, 0, 9, 138, 232, 68, 55, 129, 106, 210,
			]),
			// The actual multisig integer id.
			u32::try_from(id).map_err(|_| ())?,
		)
			.using_encoded(blake2_256),
	))
	.map_err(|_| ())
}

/// Convert a Tinkernet Multisig `MultiLocation` value into a local `AccountId`.
pub struct TinkernetMultisigAsAccountId<AccountId>(PhantomData<AccountId>);
impl<AccountId: Decode + Clone> ConvertLocation<AccountId>
	for TinkernetMultisigAsAccountId<AccountId>
{
	fn convert_location(location: &MultiLocation) -> Option<AccountId> {
		match location {
			MultiLocation {
				parents: 0,
				interior:
					X3(
						Parachain(TINKERNET_PARA_ID),
						PalletInstance(TINKERNET_MULTISIG_PALLET),
						// Index from which the multisig account is derived.
						GeneralIndex(id),
					),
			} => derive_tinkernet_multisig(*id).ok(),
			_ => None,
		}
	}
}

/// Convert a Tinkernet Multisig `MultiLocation` value into a `Signed` origin.
pub struct TinkernetMultisigAsNativeOrigin<RuntimeOrigin>(PhantomData<RuntimeOrigin>);
impl<RuntimeOrigin: OriginTrait> ConvertOrigin<RuntimeOrigin>
	for TinkernetMultisigAsNativeOrigin<RuntimeOrigin>
where
	RuntimeOrigin::AccountId: Decode,
{
	fn convert_origin(
		origin: impl Into<MultiLocation>,
		kind: OriginKind,
	) -> Result<RuntimeOrigin, MultiLocation> {
		let origin = origin.into();
		match (kind, origin) {
			(
				OriginKind::Native,
				MultiLocation {
					parents: 0,
					interior:
						X3(
							Junction::Parachain(TINKERNET_PARA_ID),
							Junction::PalletInstance(TINKERNET_MULTISIG_PALLET),
							// Index from which the multisig account is derived.
							Junction::GeneralIndex(id),
						),
				},
			) => Ok(RuntimeOrigin::signed(derive_tinkernet_multisig(id).map_err(|_| origin)?)),
			(_, origin) => Err(origin),
		}
	}
}
```

The PR implementing this RFC can be found [here](https://github.com/polkadot-fellows/runtimes/pull/52).

This has been proposed and approved previously in [paritytech/polkadot PR 7165](https://github.com/paritytech/polkadot/pull/7165), however it was later reverted because the PR implemented these changes by defining the XCM types in the `xcm-builder` crate, which is intended to host generic XCM types instead of usecase specific types like these ones. As a solution, this proposal declares the types directly in the runtime, rather than using a shared library like `xcm-builder`.

## Drawbacks

An identified potential drawback is the definition of the types directly in the runtimes, which might introduce a small amount of bloat to the source code, but this is done to avoid using libraries like `xcm-builder` which are intended for generic types rather than usecase specific ones like this.

## Testing, Security, and Privacy

Since this proposal introduces two simple and static MultiLocation converters, testing can easily be done be inputting the expected MultiLocation with unique integer ids in the last junction and comparing the output account id and origin to the expected values.

This proposal does not introduce any privacy considerations and security is not affected due to the approach of deriving the accounts locally rather than simply allowing account ids to map to themselves.

## Performance, Ergonomics, and Compatibility

Describe the impact of the proposal on the exposed functionality of Polkadot.

### Performance

This proposal should not introduce a meaningful performance overhead, as it intends to declare the new MultiLocation converters at the very end of the tuples, meaning that previously used valid XCM origins should continue to match before it ever reaches the new converters, and invalid origins will fail to match regardless.

### Ergonomics

The proposal enables a new valid XCM origin in the Kusama and Kusama Asset Hub runtimes, however this is an origin that comes from a parachain and is controlled by the runtime, so it doesn't affect any existing interfaces.

### Compatibility

As mentioned previously in the performance section, this proposal implements the new converters at the end of the tuples, which means compatibility is not affected negatively.

## Prior Art and References

- Saturn Multisig Kusama Integration explainer on the Polkadot Forum: https://forum.polkadot.network/t/saturn-xcm-multisig-integration-on-kusama-a-technical-discussion/2694/1
- Fellowship runtimes repository PR implementing this RFC: https://github.com/polkadot-fellows/runtimes/pull/52
- Previous PR in the now deprecated paritytech/polkadot repository: https://github.com/paritytech/polkadot/pull/7165
- Higher level article about the Saturn protocol: https://invarch.medium.com/saturn-the-future-of-multi-party-ownership-ac7190f86a7b

## Unresolved Questions

There is one question about the current proposed implementation that might be discussed:

Should the types be declared in a different file rather than in the `xcm_config.rs` file?

## Future Directions and Related Material

In the future, with proper usage of the Saturn protocol within Kusama and Kusama Asset Hub and good community feedback, a continuation of this proposal can be made to extend functionality to Polkadot and the Polkadot Asset Hub through InvArch, the Polkadot counterpart to Tinkernet.
