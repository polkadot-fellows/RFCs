# RFC-0000: New model for PVF storage

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | Date of initial proposal                                                                    |
| **Description** | A new rental model for storing PVF on-chain.                                                               |
| **Authors**     | Sergej Sakac                                                                                       |

## Summary

This RFC proposes a new model for a sustainable on-demand parachain registration, involving a smaller initial deposit and periodic rent payments. The new model considers that on-demand chains may be unregistered and later re-registered. The proposed solution also ensures a quick startup for on-demand chains on Polkadot in such cases.

## Motivation

With the support of on-demand parachains on Polkadot, there is a need to explore a new, more cost-effective model for registering validation code. In the current model, the parachain manager is responsible for reserving a unique `ParaId` and covering the cost of storing the validation code of the parachain. These costs can escalate, particularly if the validation code is large. We need a better, sustainable model for registering on-demand parachains on Polkadot to help smaller teams deploy more easily.

This RFC suggests a new payment model to create a more financially viable approach to parathread registration. In this model, a lower initial deposit is required, followed by recurring payments upon parathread registration.

This new model will coexist with the existing one-time deposit payment model, offering teams seeking to deploy on-demand parachains on Polkadot a more cost-effective alternative.

## Requirements

1. The solution SHOULD NOT affect the current model for registering validatoin code.
2. The solution SHOULD offer an easily configurable way for governance to adjust the initial deposit and recurring rent cost.
3. The solution SHOULD provide an incentive to prune validation code for which rent is not paid.
4. The solution SHOULD allow anyone to re-register validation code under the same `ParaId` without the need for redundant pre-checking if it was already verified before.
5. The solution MUST allow anyone to pay the rent.
6. The solution MUST prevent the removal of validation code if it could still be required for disputes or approval checking.

## Stakeholders

- Future Polkadot on-demand Parachains

## Explanation

This RFC proposes a set of changes that will enable the new rent based approach to registering and storing validation code on-chain. Importantly, this solution doesn't require any storage migrations in the current system. The following provides a detailed description of this solution.

On-demand parachains should still be able to utilize the current one-time payment model. However, given the size of the deposit required, it's highly likely that most on-demand parachains will opt for the new rent-based model.

### Registering an on-demand parachain

In the current implementation of the registrar pallet, there are two constants that specify the necessary deposit for parachains to register and store their validation code:
```rust
/// The deposit required for reserving a `ParaId`.
#[pallet::constant]
type ParaDeposit: Get<BalanceOf<Self>>;

/// The deposit to be paid per byte stored on chain.
#[pallet::constant]
type DataDepositPerByte: Get<BalanceOf<Self>>;
```

This RFC proposes the addition of three new constants that will determine the payment amount and the frequency of the recurring rent payment:
```rust
/// Defines how frequently the rent needs to be paid.
///
/// The duration is set in sessions instead of block numbers.
#[pallet::constant]
type RentDuration: Get<SessionIndex>;

/// The initial deposit amount for reserving a `ParaId`
///
/// This is defined as a percentage of the deposit that would be required in the regular
/// model.
#[pallet::constant]
type InitialRentDeposit: Get<Perbill>;

/// The recurring rental cost as a percentage of the initial rental registration deposit.
#[pallet::constant]
type RecurringRentCost: Get<Perbill>;
```

Users will be able to reserve a `ParaId` and register their validation code for a percentage of the regular deposit required. However, they must also make additional rent payments at intervals of `T::RentDuration`.

For registering using the new rental system we will have to make modifications to the `paras-registrar` pallet. We should expose two new extrinsics, as well as make a small modification to the existing `reserve` extrinsic:
```rust
#[pallet::call_index(5)]
#[pallet::weight(<T as Config>::WeightInfo::reserve())]
pub fn reserve(origin: OriginFor<T>, rent_based_payment: bool) -> DispatchResult {
	// The logic remains the same; however, if `rent_based_payment` is true, the 
	// required deposit is only `T::InitialRentDeposit` percent of `T::ParaDeposit`.
}

pub fn register_rental(
	origin: OriginFor<T>,
	id: ParaId,
	genesis_head: HeadData,
	validation_code: ValidationCode,
) -> DispatchResult { /* ... */ }

pub fn pay_rent(origin: OriginFor<T>, id: ParaId) -> DispatchResult {
	/* ... */ 
}
```

A call to `register_rental` will require the reservation of only a percentage of the deposit that would otherwise be required to register the validation code when using the regular model.
As described later in the *Quick para re-registering* section below, we will also store the code hash and the head data of each parachain to enable faster re-registration after a parachain has been pruned. For this reason the total initial deposit amount is increased to account for that.
```rust
let validation_code_deposit = T::ParaDeposit::get()
	.saturating_add(per_byte_fee.saturating_mul((validation_code.0.len() as u32).into()));

let head_deposit = per_byte_fee.saturating_mul((genesis_head.0.len() as u32).into())
let hash_deposit = per_byte_fee.saturating_mul(HASH_SIZE);

let deposit = T::InitialRentDeposit::get().mul_ceil(validation_code_deposit)
	.saturating_add(head_deposit)
	.saturating_add(hash_deposit)
```
Once the `ParaId` is reserved and the validation code is registered the rent must be periodically paid to ensure the on-demand parachain doesn't get removed from the state. The `pay_rent` extrinsic should be callable by anyone.

### On-demand parachain pruning

If the rent is not paid, anyone has the option to prune the on-demand parachain and claim the initial deposit as a reward, minus the deposit for storing the validation code hash and the head data, as that won't be removed after the pruning operation.

The moment the rent is no longer paid, the parachain won't be able to purchase on-demand access, meaning no new blocks are allowed. This stage is called the "hibernation" stage, during which all the parachain-related data is still stored on-chain, but new blocks are not permitted. The reason for this is to ensure that the validation code is available in case it is needed in the dispute or approval checking subsystems. Waiting for one entire session will be enough to ensure it is safe to deregister the parachain.

This means that anyone can prune the parachain only once the "hibernation" stage is over, which lasts for an entire session after the moment that the rent is not paid.

### Ensuring rent is paid 
The `paras` pallet will be loosely coupled with the `para-registrar` pallet through a `RentStatusProvider` trait. This approach enables all the pallets tightly coupled with the `paras` pallet to have access to the rent status information.

```rust
pub trait RentStatusProvider {
	/// Checks whether the rent is paid for storing the PVF on-chain.
	///
	/// In case the parachain is registered using the regular registration model 
	/// this will simply return true.
	fn rent_paid(id: ParaId) -> bool;
}
```

Once the validation code is stored without having its rent paid the `assigner_on_demand` pallet will ensure that an order for that parachain cannot be placed. This is easily achievable given that the `assigner_on_demand` pallet is tightly coupled with the `paras` pallet.

### Quick para re-registration

If the rent isn't paid on time, and the parachain gets pruned, the new model should provide a quick way to re-register the same validation code under the same `ParaId`. This can be achieved by skipping the pre-checking process.

This will be accomplished by introducing a new storage map within the `paras` pallet. The reason for not utilizing the existing `CurrentCodeHash` storage map is because it contains code hashes associated with non pre-checked validation code.

```rust
/// Stores the validation code hash and head data for parachains that successfully completed the 
/// pre-checking process.
///
/// This is stored to enable faster on-demand para re-registration in case its pvf has been earlier
/// registered and checked.
///
/// NOTE: During a runtime upgrade where the pre-checking rules change this storage map should be
/// cleared.
#[pallet::storage]
#[pallet::getter(fn checked_code_hash)]
pub(super) type CheckedParachains<T: Config> =
	StorageMap<_, Twox64Concat, ParaId, (ValidationCodeHash, HeadData)>;
```

To perform a parachain re-registration, we can adapt the existing `register` extrinsic with a few necessary adjustments. The modified extrinsic will include a new argument that indicates the caller's intention to re-register the parachain.

```rust
#[pallet::call_index(0)]
#[pallet::weight(<T as Config>::WeightInfo::register())]
pub fn register(
	origin: OriginFor<T>,
	id: ParaId,
	genesis_head: HeadData,
	validation_code: ValidationCode,
	reregistering: bool,
) -> DispatchResult {
	// If the `reregistering` parameter is set to true, it's not necessary for the caller to be 
	// the para manager. In this case, the caller only needs to cover the initial deposit 
	// required for storing the validation code.
}
```

## Drawbacks

TODO

## Testing, Security, and Privacy

Describe the the impact of the proposal on these three high-importance areas - how implementations can be tested for adherence, effects that the proposal has on security and privacy per-se, as well as any possible implementation pitfalls which should be clearly avoided.

## Performance, Ergonomics, and Compatibility

Describe the impact of the proposal on the exposed functionality of Polkadot.

### Performance

Is this an optimization or a necessary pessimization? What steps have been taken to minimize additional overhead?

### Ergonomics

If the proposal alters exposed interfaces to developers or end-users, which types of usage patterns have been optimized for?

### Compatibility

Does this proposal break compatibility with existing interfaces, older versions of implementations? Summarize necessary migrations or upgrade strategies, if any.

## Prior Art and References

Provide references to either prior art or other relevant research for the submitted design.

## Unresolved Questions

Provide specific questions to discuss and address before the RFC is voted on by the Fellowship. This should include, for example, alternatives to aspects of the proposed design where the appropriate trade-off to make is unclear.

## Future Directions and Related Material

Describe future work which could be enabled by this RFC, if it were accepted, as well as related RFCs. This is a place to brain-dump and explore possibilities, which themselves may become their own RFCs.
