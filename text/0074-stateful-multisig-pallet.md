# RFC-0074: Stateful Multisig Pallet

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 15 February 2024                                                                            |
| **Description** | Add Enhanced Multisig Pallet to Collectives chain                                           |
| **Authors**     | Abdelrahman Soliman   (Boda)                                                                |

## Summary

A pallet to facilitate enhanced multisig accounts. The main enhancement is that we store a multisig account in the state with related info (signers, threshold,..etc). The module affords enhanced control over administrative operations such as adding/removing signers, changing the threshold, account deletion, canceling an existing proposal. Each signer can approve/reject a proposal while still exists. The proposal is **not** intended for migrating or getting rid of existing multisig. It's to allow both options to coexist.

For the rest of the RFC We use the following terms:

* `proposal` to refer to an extrinsic that is to be dispatched from a multisig account after getting enough approvals.
* `Stateful Multisig` to refer to the proposed pallet.
* `Stateless Multisig` to refer to the current multisig pallet in polkadot-sdk.

## Motivation

### Problem

Entities in the Polkadot ecosystem need to have a way to manage their funds and other operations in a secure and efficient way. Multisig accounts are a common way to achieve this. Entities by definition change over time, members of the entity may change, threshold requirements may change, and the multisig account may need to be deleted. For even more enhanced hierarchical control, the multisig account may need to be controlled by other multisig accounts.

Current native solutions for multisig operations are less optimal, performance-wise (as we'll explain later in the RFC), and lack fine-grained control over the multisig account.

#### Stateless Multisig

We refer to current [multisig pallet in polkadot-sdk](https://github.com/paritytech/polkadot-sdk/tree/master/substrate/frame/multisig) because the multisig account is only derived and not stored in the state. Although deriving the account is determinsitc as it relies on exact users (sorted) and thershold to derive it. This does not allow for control over the multisig account. It's also tightly coupled to exact users and threshold. This makes it hard for an organization to manage existing accounts and to change the threshold or add/remove signers.

We believe as well that the stateless multisig is not efficient in terms of block footprint as we'll show in the performance section.

#### Pure Proxy

Pure proxy can achieve having a stored and determinstic multisig account from different users but it's unneeded complexity as a way around the limitations of the current multisig pallet. It doesn't also have the same fine grained control over the multisig account.

### Requirements

Basic requirements for the Stateful Multisig are:

* The ability to have concrete and permanent (unless deleted) multisig accounts in the state.
* The ability to add/remove signers from an existing multisig account by the multisig itself.
* The ability to change the threshold of an existing multisig account by the multisig itself.
* The ability to delete an existing multisig account by the multisig itself.
* The ability to cancel an existing proposal by the multisig itself.
* Signers of multisig account can start a proposal on behalf of the multisig account which will be dispatched after getting enough approvals.
* Signers of multisig account can approve/reject a proposal while still exists.

### Use Cases

* Corporate Governance:
In a corporate setting, multisig accounts can be employed for decision-making processes. For example, a company may require the approval of multiple executives to initiate significant financial transactions.

* Joint Accounts:
Multisig accounts can be used for joint accounts where multiple individuals need to authorize transactions. This is particularly useful in family finances or shared business accounts.

* Decentralized Autonomous Organizations (DAOs):
DAOs can utilize multisig accounts to ensure that decisions are made collectively. Multiple key holders can be required to approve changes to the organization's rules or the allocation of funds.

and much more...

## Stakeholders

* Polkadot holders
* Polkadot developers

## Explanation

I've created the stateful multisig pallet during my studies in Polkadot Blockchain Academy under supervision from @shawntabrizi and @ank4n. After that, I've enhanced it to be fully functional and this is a draft [PR#3300](https://github.com/paritytech/polkadot-sdk/pull/3300) in polkadot-sdk. I'll list all the details and design decisions in the following sections. Note that the PR is not 1-1 exactly to the current RFC as the RFC is a more polished version of the PR after updating based on the feedback and discussions.

Let's start with a sequence diagram to illustrate the main operations of the Stateful Multisig.

![multisig operations](https://github.com/asoliman92/RFCs/assets/2677789/4f2e8972-f3b8-4250-b75f-1e4788b35752)

Notes on above diagram:

* It's a 3 step process to execute a proposal. (Start Proposal --> Approvals --> Execute Proposal)
* `Execute` is an explicit extrinsic for a simpler API. It can be optimized to be executed automatically after getting enough approvals.
* Any user can create a multisig account and they don't need to be part of it. (Alice in the diagram)
* A proposal is any extrinsic including control extrinsics (e.g. add/remove signer, change threshold,..etc).
* Any multisig account signer can start a proposal on behalf of the multisig account. (Bob in the diagram)
* Any multisig account owener can execute proposal if it's approved by enough signers. (Dave in the diagram)

### State Transition Functions

* `create_multisig` - Create a multisig account with a given threshold and initial signers. (Needs Deposit)

```rust
		/// Creates a new multisig account and attach signers with a threshold to it.
		///
		/// The dispatch origin for this call must be _Signed_. It is expected to be a nomral AccountId and not a
		/// Multisig AccountId.
		///
		/// T::BaseCreationDeposit + T::PerSignerDeposit * signers.len() will be held from the caller's account.
		///
		/// # Arguments
		///
		/// - `signers`: Initial set of accounts to add to the multisig. These may be updated later via `add_signer`
		/// and `remove_signer`.
		/// - `threshold`: The threshold number of accounts required to approve an action. Must be greater than 0 and
		/// less than or equal to the total number of signers.
		///
		/// # Errors
		///
		/// * `TooManySignatories` - The number of signatories exceeds the maximum allowed.
		/// * `InvalidThreshold` - The threshold is greater than the total number of signers.
		pub fn create_multisig(
			origin: OriginFor<T>,
			signers: BoundedBTreeSet<T::AccountId, T::MaxSignatories>,
			threshold: u32,
		) -> DispatchResult 
```

* `start_proposal` - Start a multisig proposal. (Needs Deposit)

```rust
		/// Starts a new proposal for a dispatchable call for a multisig account.
		/// The caller must be one of the signers of the multisig account.
		/// T::ProposalDeposit will be held from the caller's account.
		///
		/// # Arguments
		///
		/// * `multisig_account` - The multisig account ID.
		/// * `call` - The dispatchable call to be executed.
		///
		/// # Errors
		///
		/// * `MultisigNotFound` - The multisig account does not exist.
		/// * `UnAuthorizedSigner` - The caller is not an signer of the multisig account.
		/// * `TooManySignatories` - The number of signatories exceeds the maximum allowed. (shouldn't really happen as it's the first approval)
		pub fn start_proposal(
			origin: OriginFor<T>,
			multisig_account: T::AccountId,
			call_hash: T::Hash,
		) -> DispatchResult
```

* `approve` - Approve a multisig proposal.

```rust
		/// Approves a proposal for a dispatchable call for a multisig account.
		/// The caller must be one of the signers of the multisig account.
		///
		/// If a signer did approve -> reject -> approve, the proposal will be approved.
		/// If a signer did approve -> reject, the proposal will be rejected.
		///
		/// # Arguments
		///
		/// * `multisig_account` - The multisig account ID.
		/// * `call_hash` - The hash of the call to be approved. (This will be the hash of the call that was used in `start_proposal`)
		///
		/// # Errors
		///
		/// * `MultisigNotFound` - The multisig account does not exist.
		/// * `UnAuthorizedSigner` - The caller is not an signer of the multisig account.
		/// * `TooManySignatories` - The number of signatories exceeds the maximum allowed.
		/// This shouldn't really happen as it's an approval, not an addition of a new signer.
		pub fn approve(
			origin: OriginFor<T>,
			multisig_account: T::AccountId,
			call_hash: T::Hash,
		) -> DispatchResult
```

* `reject` - Reject a multisig proposal.

```rust
		/// Rejects a proposal for a multisig account.
		/// The caller must be one of the signers of the multisig account.
		///
		/// Between approving and rejecting, last call wins.
		/// If a signer did approve -> reject -> approve, the proposal will be approved.
		/// If a signer did approve -> reject, the proposal will be rejected.
		///
		/// # Arguments
		///
		/// * `multisig_account` - The multisig account ID.
		/// * `call_hash` - The hash of the call to be approved. (This will be the hash of the call that was used in `start_proposal`)
		///
		/// # Errors
		///
		/// * `MultisigNotFound` - The multisig account does not exist.
		/// * `UnAuthorizedSigner` - The caller is not an signer of the multisig account.
		/// * `SignerNotFound` - The caller has not approved the proposal.
		#[pallet::call_index(3)]
		#[pallet::weight(Weight::default())]
		pub fn reject(
			origin: OriginFor<T>,
			multisig_account: T::AccountId,
			call_hash: T::Hash,
		) -> DispatchResult
```

* `execute_proposal` - Execute a multisig proposal. (Releases Deposit)

```rust
		/// Executes a proposal for a dispatchable call for a multisig account.
		/// Poropsal needs to be approved by enough signers (exceeds or equal multisig threshold) before it can be executed.
		/// The caller must be one of the signers of the multisig account.
		///
		/// This function does an extra check to make sure that all approvers still exist in the multisig account.
		/// That is to make sure that the multisig account is not compromised by removing an signer during an active proposal.
		///
		/// Once finished, the withheld deposit will be returned to the proposal creator.
		///
		/// # Arguments
		///
		/// * `multisig_account` - The multisig account ID.
		/// * `call` - The call to be executed.
		///
		/// # Errors
		///
		/// * `MultisigNotFound` - The multisig account does not exist.
		/// * `UnAuthorizedSigner` - The caller is not an signer of the multisig account.
		/// * `NotEnoughApprovers` - approvers don't exceed the threshold.
		pub fn execute_proposal(
			origin: OriginFor<T>,
			multisig_account: T::AccountId,
			call: Box<<T as Config>::RuntimeCall>,
		) -> DispatchResult
```

* `cancel_proposal` - Cancel a multisig proposal. (Releases Deposit)

```rust
		/// Cancels an existing proposal for a multisig account.
		/// Poropsal needs to be rejected by enough signers (exceeds or equal multisig threshold) before it can be executed.
		/// The caller must be one of the signers of the multisig account.
		///
		/// This function does an extra check to make sure that all rejectors still exist in the multisig account.
		/// That is to make sure that the multisig account is not compromised by removing an signer during an active proposal.
		///
		/// Once finished, the withheld deposit will be returned to the proposal creator./
		///
		/// # Arguments
		///
		/// * `origin` - The origin multisig account who wants to cancel the proposal.
		/// * `call_hash` - The hash of the call to be canceled. (This will be the hash of the call that was used in `start_proposal`)
		///
		/// # Errors
		///
		/// * `MultisigNotFound` - The multisig account does not exist.
		/// * `ProposalNotFound` - The proposal does not exist.
		pub fn cancel_proposal(
		origin: OriginFor<T>, 
		multisig_account: T::AccountId, 
		call_hash: T::Hash) -> DispatchResult
```

* `cancel_own_proposal` - Cancel a multisig proposal started by the caller in case no other signers approved it yet. (Releases Deposit)

```rust
		/// Cancels an existing proposal for a multisig account Only if the proposal doesn't have approvers other than
		/// the proposer.
		///
		///	This function needs to be called from a the proposer of the proposal as the origin.
		///
		/// The withheld deposit will be returned to the proposal creator.
		///
		/// # Arguments
		///
		/// * `multisig_account` - The multisig account ID.
		/// * `call_hash` - The hash of the call to be canceled. (This will be the hash of the call that was used in `start_proposal`)
		///
		/// # Errors
		///
		/// * `MultisigNotFound` - The multisig account does not exist.
		/// * `ProposalNotFound` - The proposal does not exist.
		pub fn cancel_own_proposal(
			origin: OriginFor<T>,
			multisig_account: T::AccountId,
			call_hash: T::Hash,
		) -> DispatchResult
```

* `cleanup_proposals` - Cleanup proposals of a multisig account. (Releases Deposit)

```rust
		/// Cleanup proposals of a multisig account. This function will iterate over a max limit per extrinsic to ensure
		/// we don't have unbounded iteration over the proposals.
		///
		/// The withheld deposit will be returned to the proposal creator.
		///
		/// # Arguments
		///
		/// * `multisig_account` - The multisig account ID.
		///
		/// # Errors
		///
		/// * `MultisigNotFound` - The multisig account does not exist.
		/// * `ProposalNotFound` - The proposal does not exist.
		pub fn cleanup_proposals(
			origin: OriginFor<T>,
			multisig_account: T::AccountId,
		) -> DispatchResult
```

Note: Next functions need to be called from the multisig account itself. Deposits are reserved from the multisig account as well.

* `add_signer` - Add a new signer to a multisig account. (Needs Deposit)

```rust
		/// Adds a new signer to the multisig account.
		/// This function needs to be called from a Multisig account as the origin.
		/// Otherwise it will fail with MultisigNotFound error.
		///
		/// T::PerSignerDeposit will be held from the multisig account.
		///
		/// # Arguments
		///
		/// * `origin` - The origin multisig account who wants to add a new signer to the multisig account.
		/// * `new_signer` - The AccountId of the new signer to be added.
		/// * `new_threshold` - The new threshold for the multisig account after adding the new signer.
		///
		/// # Errors
		/// * `MultisigNotFound` - The multisig account does not exist.
		/// * `InvalidThreshold` - The threshold is greater than the total number of signers or is zero.
		/// * `TooManySignatories` - The number of signatories exceeds the maximum allowed.
		pub fn add_signer(
			origin: OriginFor<T>,
			new_signer: T::AccountId,
			new_threshold: u32,
		) -> DispatchResult
```

* `remove_signer` - Remove an signer from a multisig account. (Releases Deposit)

```rust
		/// Removes an  signer from the multisig account.
		/// This function needs to be called from a Multisig account as the origin.
		/// Otherwise it will fail with MultisigNotFound error.
		/// If only one signer exists and is removed, the multisig account and any pending proposals for this account will be deleted from the state.
		///
		/// # Arguments
		///
		/// * `origin` - The origin multisig account who wants to remove an signer from the multisig account.
		/// * `signer_to_remove` - The AccountId of the signer to be removed.
		/// * `new_threshold` - The new threshold for the multisig account after removing the signer. Accepts zero if
		/// the signer is the only one left.kkk
		///
		/// # Errors
		///
		/// This function can return the following errors:
		///
		/// * `MultisigNotFound` - The multisig account does not exist.
		/// * `InvalidThreshold` - The new threshold is greater than the total number of signers or is zero.
		/// * `UnAuthorizedSigner` - The caller is not an signer of the multisig account.
		pub fn remove_signer(
			origin: OriginFor<T>,
			signer_to_remove: T::AccountId,
			new_threshold: u32,
		) -> DispatchResult
```

* `set_threshold` - Change the threshold of a multisig account.

```rust
		/// Sets a new threshold for a multisig account.
		///	This function needs to be called from a Multisig account as the origin.
		/// Otherwise it will fail with MultisigNotFound error.
		///
		/// # Arguments
		///
		/// * `origin` - The origin multisig account who wants to set the new threshold.
		/// * `new_threshold` - The new threshold to be set.
		/// # Errors
		///
		/// * `MultisigNotFound` - The multisig account does not exist.
		/// * `InvalidThreshold` - The new threshold is greater than the total number of signers or is zero.
		set_threshold(origin: OriginFor<T>, new_threshold: u32) -> DispatchResult
```

* `delete_multisig` - Delete a multisig account. (Releases Deposit)

```rust
		/// Deletes a multisig account and all related proposals.
		///
		///	This function needs to be called from a Multisig account as the origin.
		/// Otherwise it will fail with MultisigNotFound error.
		///
		/// # Arguments
		///
		/// * `origin` - The origin multisig account who wants to cancel the proposal.
		///
		/// # Errors
		///
		/// * `MultisigNotFound` - The multisig account does not exist.
		pub fn delete_account(origin: OriginFor<T>) -> DispatchResult
```

### Storage/State

* Use 2 main storage maps to store mutlisig accounts and proposals.

```rust
#[pallet::storage]
  pub type MultisigAccount<T: Config> = StorageMap<_, Twox64Concat, T::AccountId, MultisigAccountDetails<T>>;

/// The set of open multisig proposals. A proposal is uniquely identified by the multisig account and the call hash.
/// (maybe a nonce as well in the future)
#[pallet::storage]
pub type PendingProposals<T: Config> = StorageDoubleMap<
    _,
    Twox64Concat,
    T::AccountId, // Multisig Account
    Blake2_128Concat,
    T::Hash, // Call Hash
    MultisigProposal<T>,
>;
```

As for the values:

```rust
pub struct MultisigAccountDetails<T: Config> {
	/// The signers of the multisig account. This is a BoundedBTreeSet to ensure faster operations (add, remove).
	/// As well as lookups and faster set operations to ensure approvers is always a subset from signers. (e.g. in case of removal of an signer during an active proposal)
	pub signers: BoundedBTreeSet<T::AccountId, T::MaxSignatories>,
	/// The threshold of approvers required for the multisig account to be able to execute a call.
	pub threshold: u32,
	pub creator: T::AccountId,
	pub deposit: BalanceOf<T>,
}
```

```rust
pub struct MultisigProposal<T: Config> {
    /// Proposal creator.
    pub creator: T::AccountId,
    pub creation_deposit: BalanceOf<T>,
    /// The extrinsic when the multisig operation was opened.
    pub when: Timepoint<BlockNumberFor<T>>,
    /// The approvers achieved so far, including the depositor.
    /// The approvers are stored in a BoundedBTreeSet to ensure faster lookup and operations (approve, reject).
    /// It's also bounded to ensure that the size don't go over the required limit by the Runtime.
    pub approvers: BoundedBTreeSet<T::AccountId, T::MaxSignatories>,
    /// The rejectors for the proposal so far.
    /// The rejectors are stored in a BoundedBTreeSet to ensure faster lookup and operations (approve, reject).
    /// It's also bounded to ensure that the size don't go over the required limit by the Runtime.
    pub rejectors: BoundedBTreeSet<T::AccountId, T::MaxSignatories>,
    /// The block number until which this multisig operation is valid. None means no expiry.
    pub expire_after: Option<BlockNumberFor<T>>,
}
```

For optimization we're using BoundedBTreeSet to allow for efficient lookups and removals. Especially in the case of approvers, we need to be able to remove an approver from the list when they reject their approval. (which we do lazily when `execute_proposal` is called).

There's an extra storage map for the deposits of the multisig accounts per signer added. This is to ensure that we can release the deposits when the multisig removes them even if the constant deposit per signer changed in the runtime later on.

### Considerations & Edge cases

#### Removing an signer from the multisig account during an active proposal

 We need to ensure that the approvers are always a subset from signers. This is also partially why we're using BoundedBTreeSet for signers and approvers. Once execute proposal is called we ensure that the proposal is still valid and the approvers are still a subset from current signers.

#### Multisig account deletion and cleaning up existing proposals

Once the last signer of a multisig account is removed or the multisig approved the account deletion we delete the multisig accound from the state and keep the proposals until someone calls `cleanup_proposals` multiple times which iterates over a max limit per extrinsic. This is to ensure we don't have unbounded iteration over the proposals. Users are already incentivized to call `cleanup_proposals` to get their deposits back.

#### Multisig account deletion and existing deposits

We currently just delete the account without checking for deposits (Would like to hear your thoughts here). We can either

* Don't make deposits to begin with and make it a fee.
* Transfer to treasury.
* Error on deletion. (don't like this)

#### Approving a proposal after the threshold is changed

We always use latest threshold and don't store each proposal with different threshold. This allows the following:

* In case threshold is lower than the number of approvers then the proposal is still valid.  
* In case threshold is higher than the number of approvers then we catch it during execute proposal and error.

## Drawbacks

* New pallet to maintain.

## Testing, Security, and Privacy

Standard audit/review requirements apply.

## Performance, Ergonomics, and Compatibility

### Performance

Doing back of the envelop calculation to proof that the stateful multisig is more efficient than the stateless multisig given it's smaller footprint size on blocks.

Quick review over the extrinsics for both as it affects the block size:

Stateless Multisig:
Both `as_multi` and `approve_as_multi` has a similar parameters:

```rust
origin: OriginFor<T>,
threshold: u16,
other_signatories: Vec<T::AccountId>,
maybe_timepoint: Option<Timepoint<BlockNumberFor<T>>>,
call_hash: [u8; 32],
max_weight: Weight,
```

Stateful Multisig:
We have the following extrinsics:

```rust
pub fn start_proposal(
			origin: OriginFor<T>,
			multisig_account: T::AccountId,
			call_hash: T::Hash,
		)
```

```rust
pub fn approve(
			origin: OriginFor<T>,
			multisig_account: T::AccountId,
			call_hash: T::Hash,
		)
```

```rust
pub fn execute_proposal(
			origin: OriginFor<T>,
			multisig_account: T::AccountId,
			call: Box<<T as Config>::RuntimeCall>,
		)
```

The main takeway is that we don't need to pass the threshold and other signatories in the extrinsics. This is because we already have the threshold and signatories in the state (only once).

So now for the caclulations, given the following:

* K is the number of multisig accounts.
* N is number of signers in each multisig account.
* For each proposal we need to have 2N/3 approvals.

The table calculates if each of the K multisig accounts has one proposal and it gets approved by the 2N/3 and then executed. How much did the total Blocks and States sizes increased by the end of the day.

Note: We're not calculating the cost of proposal as both in statefull and stateless multisig they're almost the same and gets cleaned up from the state once the proposal is executed or canceled.

Stateless effect on blocksizes = 2/3*K*N^2 (as each user of the 2/3 users will need to call approve_as_multi with all the other signatories(N) in extrinsic body)

Stateful effect on blocksizes = K * N (as each user will need to call approve with the multisig account only in extrinsic body)

Stateless effect on statesizes = Nil (as the multisig account is not stored in the state)

Stateful effect on statesizes = K*N (as each multisig account (K) will be stored with all the signers (K) in the state)

| Pallet         |  Block Size   | State Size |
|----------------|:-------------:|-----------:|
| Stateless      |     2/3*K*N^2 |        Nil |
| Stateful       |          K*N  |       K*N  |

Simplified table removing K from the equation:
| Pallet         |  Block Size   | State Size |
|----------------|:-------------:|-----------:|
| Stateless      |           N^2 |        Nil |
| Stateful       |           N   |         N  |

So even though the stateful multisig has a larger state size, it's still more efficient in terms of block size and total footprint on the blockchain.

### Ergonomics

The Stateful Multisig will have better ergonomics for managing multisig accounts for both developers and end-users.

### Compatibility

This RFC is compatible with the existing implementation and can be handled via upgrades and migration. It's not intended to replace the existing multisig pallet.

## Prior Art and References

[multisig pallet in polkadot-sdk](https://github.com/paritytech/polkadot-sdk/tree/master/substrate/frame/multisig)

## Unresolved Questions

* On account deletion, should we transfer remaining deposits to treasury or remove signers' addition deposits completely and consider it as fees to start with?

## Future Directions and Related Material

* [ ] Batch proposals. The ability to batch multiple calls into one proposal.  
* [ ] Batch addition/removal of signers.
* [ ] Add expiry to proposals. After a certain time, proposals will not accept any more approvals or executions and will be deleted.  
* [ ] Add extra identifier other than call_hash to proposals (e.g. nonce). This will allow same call to be proposed multiple times and be in pending state.  
* [ ] Implement call filters. This will allow multisig accounts to only accept certain calls.
