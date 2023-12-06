# RFC-0044: Rent based registration model

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 6 November 2023                                                                   |
| **Description** | A new rent based parachain registration model                                                             |
| **Authors**     | Sergej Sakac                                                                                       |

## Summary

This RFC proposes a new model for a sustainable on-demand parachain registration, involving a smaller initial deposit and periodic rent payments. The new model considers that on-demand chains may be unregistered and later re-registered. The proposed solution also ensures a quick startup for on-demand chains on Polkadot in such cases.

## Motivation

With the support of on-demand parachains on Polkadot, there is a need to explore a new, more cost-effective model for registering validation code. In the current model, the parachain manager is responsible for reserving a unique `ParaId` and covering the cost of storing the validation code of the parachain. These costs can escalate, particularly if the validation code is large. We need a better, sustainable model for registering on-demand parachains on Polkadot to help smaller teams deploy more easily.

This RFC suggests a new payment model to create a more financially viable approach to on-demand parachain registration. In this model, a lower initial deposit is required, followed by recurring payments upon parachain registration.

This new model will coexist with the existing one-time deposit payment model, offering teams seeking to deploy on-demand parachains on Polkadot a more cost-effective alternative.

## Requirements

1. The solution SHOULD NOT affect the current model for registering validation code.
2. The solution SHOULD offer an easily configurable way for governance to adjust the initial deposit and recurring rent cost.
3. The solution SHOULD provide an incentive to prune validation code for which rent is not paid.
4. The solution SHOULD allow anyone to re-register validation code under the same `ParaId` without the need for redundant pre-checking if it was already verified before.
5. The solution MUST be compatible with the Agile Coretime model, as described in RFC#0001
6. The solution MUST allow anyone to pay the rent.
7. The solution MUST prevent the removal of validation code if it could still be required for disputes or approval checking.

## Stakeholders

- Future Polkadot on-demand Parachains

## Explanation

This RFC proposes a set of changes that will enable the new rent based approach to registering and storing validation code on-chain. 
The new model, compared to the current one, will require periodic rent payments. The parachain won't be pruned automatically if the rent is not paid, but by permitting anyone to prune the parachain and rewarding the caller, there will be an incentive for the removal of the validation code.

On-demand parachains should still be able to utilize the current one-time payment model. However, given the size of the deposit required, it's highly likely that most on-demand parachains will opt for the new rent-based model.

Importantly, this solution doesn't require any storage migrations in the current system nor does it introduce any breaking changes. The following provides a detailed description of this solution.

### Registering an on-demand parachain

In the current implementation of the registrar pallet, there are two constants that specify the necessary deposit for parachains to register and store their validation code:
```rust
trait Config {
	// -- snip --

	/// The deposit required for reserving a `ParaId`.
	#[pallet::constant]
	type ParaDeposit: Get<BalanceOf<Self>>;

	/// The deposit to be paid per byte stored on chain.
	#[pallet::constant]
	type DataDepositPerByte: Get<BalanceOf<Self>>;
}
```

This RFC proposes the addition of three new constants that will determine the payment amount and the frequency of the recurring rent payment:
```rust
trait Config {
	// -- snip --

	/// Defines how frequently the rent needs to be paid.
	///
	/// The duration is set in sessions instead of block numbers.
	#[pallet::constant]
	type RentDuration: Get<SessionIndex>;

	/// The initial deposit amount for registering validation code.
	///
	/// This is defined as a percentage of the deposit that would be required in the regular
	/// model.
	#[pallet::constant]
	type RentalDepositProportion: Get<Perbill>;

	/// The recurring rental cost as a percentage of the initial rental registration deposit.
	#[pallet::constant]
	type RentalRecurringProportion: Get<Perbill>;
}
```

Users will be able to reserve a `ParaId` and register their validation code for a percentage of the regular deposit required. However, they must also make additional rent payments at intervals of `T::RentDuration`.

For registering using the new rental system we will have to make modifications to the `paras-registrar` pallet. We should expose two new extrinsics for this:
```rust
mod pallet {
	// -- snip --

	pub fn register_rental(
		origin: OriginFor<T>,
		id: ParaId,
		genesis_head: HeadData,
		validation_code: ValidationCode,
	) -> DispatchResult { /* ... */ }

	pub fn pay_rent(origin: OriginFor<T>, id: ParaId) -> DispatchResult {
		/* ... */ 
	}
}
```

A call to `register_rental` will require the reservation of only a percentage of the deposit that would otherwise be required to register the validation code when using the regular model.
As described later in the *Quick para re-registering* section below, we will also store the code hash of each parachain to enable faster re-registration after a parachain has been pruned. For this reason the total initial deposit amount is increased to account for that.
```rust
// The logic for calculating the initial deposit for parachain registered with the 
// new rent-based model:

let validation_code_deposit = per_byte_fee.saturating_mul((validation_code.0.len() as u32).into());

let head_deposit = per_byte_fee.saturating_mul((genesis_head.0.len() as u32).into())
let hash_deposit = per_byte_fee.saturating_mul(HASH_SIZE);

let deposit = T::RentalDepositProportion::get().mul_ceil(validation_code_deposit)
	.saturating_add(T::ParaDeposit::get())
	.saturating_add(head_deposit)
	.saturating_add(hash_deposit)
```
Once the `ParaId` is reserved and the validation code is registered the rent must be periodically paid to ensure the on-demand parachain doesn't get removed from the state. The `pay_rent` extrinsic should be callable by anyone, removing the need for the parachain to depend on the parachain manager for rent payments.

### On-demand parachain pruning

If the rent is not paid, anyone has the option to prune the on-demand parachain and claim a portion of the initial deposit reserved for storing the validation code. This type of 'light' pruning only removes the validation code, while the head data and validation code hash are retained. The validation code hash is stored to allow anyone to register it again as well as to enable quicker re-registration by skipping the pre-checking process.

The moment the rent is no longer paid, the parachain won't be able to purchase on-demand access, meaning no new blocks are allowed. This stage is called the "hibernation" stage, during which all the parachain-related data is still stored on-chain, but new blocks are not permitted. The reason for this is to ensure that the validation code is available in case it is needed in the dispute or approval checking subsystems. Waiting for one entire session will be enough to ensure it is safe to deregister the parachain.

This means that anyone can prune the parachain only once the "hibernation" stage is over, which lasts for an entire session after the moment that the rent is not paid.

The pruning described here is a light form of pruning, since it only removes the validation code. As with all parachains, the parachain or para manager can use the `deregister` extrinsic to remove all associated state.

### Ensuring rent is paid 
The `paras` pallet will be loosely coupled with the `para-registrar` pallet. This approach enables all the pallets tightly coupled with the `paras` pallet to have access to the rent status information.

Once the validation code is stored without having its rent paid the `assigner_on_demand` pallet will ensure that an order for that parachain cannot be placed. This is easily achievable given that the `assigner_on_demand` pallet is tightly coupled with the `paras` pallet.

### On-demand para re-registration

If the rent isn't paid on time, and the parachain gets pruned, the new model should provide a quick way to re-register the same validation code under the same `ParaId`. This can be achieved by skipping the pre-checking process, as the validation code hash will be stored on-chain, allowing us to easily verify that the uploaded code remains unchanged.

```rust
/// Stores the validation code hash for parachains that successfully completed the 
/// pre-checking process.
///
/// This is stored to enable faster on-demand para re-registration in case its pvf has been earlier
/// registered and checked.
///
/// NOTE: During a runtime upgrade where the pre-checking rules change this storage map should be
/// cleared appropriately.
#[pallet::storage]
pub(super) type CheckedCodeHash<T: Config> =
	StorageMap<_, Twox64Concat, ParaId, ValidationCodeHash>;
```

To enable parachain re-registration, we should introduce a new extrinsic in the `paras-registrar` pallet that allows this. The logic of this extrinsic will be same as regular registration, with the distinction that it can be called by anyone, and the required deposit will be smaller since it only has to cover for the storage of the validation code.

## Drawbacks

A drawback of this RFC is that it does not reduce the cost of reserving a `ParaId`. This decision is based on the desire to avoid additional complexity in the system, as the current reservation cost is already considered reasonable.

Even though this RFC doesn't delve into the specifics of the configuration values for parachain registration but rather focuses on the mechanism, configuring it carelessly could lead to potential problems.

Since the validation code hash and head data are not removed when the parachain is pruned but only when the `deregister` extrinsic is called, the `T::DataDepositPerByte` must be set to a higher value to create a strong enough incentive for removing it from the state.

## Testing, Security, and Privacy

The implementation of this RFC will be tested on Rococo first.

Proper research should be conducted on setting the configuration values of the new system since these values can have great impact on the network.

An audit is required to ensure the implementation's correctness.

The proposal introduces no new privacy concerns.

## Performance, Ergonomics, and Compatibility

### Performance

This RFC should not introduce any performance impact.

### Ergonomics

This RFC does not affect the current parachains, nor the parachains that intend to use the one-time payment model for parachain registration.

### Compatibility

This RFC does not break compatibility.

## Prior Art and References

Prior discussion on this topic: https://github.com/paritytech/polkadot-sdk/issues/1796

## Unresolved Questions

None at this time.

## Future Directions and Related Material

As noted in [this GitHub issue](https://github.com/paritytech/polkadot-sdk/issues/1796), we want to raise the per-byte cost of on-chain data storage. However, a substantial increase in this cost would make it highly impractical for on-demand parachains to register on Polkadot.
This RFC offers an alternative solution for on-demand parachains, ensuring that the per-byte cost increase doesn't overly burden the registration process.
