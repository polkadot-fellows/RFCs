# RFC-0000: Lowering NFT Deposits on Polkadot and Kusama Asset Hubs

|                 |                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------- |
| **Start Date**  | 2 November 2023                                                                                    |
| **Description** | A proposal to reduce the minimum deposit required for collection creation on the Polkadot and Kusama Asset Hub, making it more accessible and affordable for artists. |
| **Authors**     | [Aurora Poppyseed](https://github.com/poppyseedDev), [Just_Luuuu](https://github.com/justLuuuu), [VikiiVal](https://github.com/vikiival)  |

## Summary

This RFC proposes changing the current deposit requirements on the Polkadot and Kusama Asset Hub for creating NFT collections. The objective is to lower the barrier to entry for artists, fostering a more inclusive and vibrant ecosystem while maintaining network integrity and preventing spam.

## Motivation

The current deposit of 10 DOT for collection creation on the Polkadot Asset Hub presents a significant financial barrier for many artists. By lowering the deposit requirements, we aim to encourage more artists to participate in the Polkadot NFT ecosystem, thereby enriching the diversity and vibrancy of the community and its offerings.

Actual implementation of deposit is an arbitrary number coming from [Uniques pallet](). It is not a result of any economic analysis. The current deposit requirements are as follows: 

### Requirements

- Deposit SHOULD be derived from `deposit` function adjusted by correspoding pricing mechansim.

## Stakeholders

- **NFT Creators**: Primary beneficiaries of the proposed change, particularly those who found the current deposit requirements prohibitive.
- **NFT Platforms**: As the facilitator of artists' relations, KodaDot has a vested interest in making the platform more accessible.
- **dApp Developers**: Making the blockspace more accessible will encourage developers to create and build unique dApps in the Polkadot ecosystem.
- **Polkadot Community**: Stands to benefit from an influx of artists, creators and diverse NFT collections, enhancing the overall ecosystem.

Previous discussions have been held within the KodaDot community, as well as with artists expressing their concerns about the deposit amounts. Referencing to [Polkadot Forum conversation](https://forum.polkadot.network/t/polkadot-assethub-high-nft-collection-deposit/4262).

## Explanation
This RFC suggests modifying deposit constants defined in the `nfts` pallet on the Polkadot Asset Hub to require a lower deposit. The amount of the reduced deposit should be determined by `deposit` adjusted by pricing mechanism (arbitrary number/another pricing function). 

[Current deposit requirements are as follows](https://github.com/paritytech/polkadot-sdk/blob/master/cumulus/parachains/runtimes/assets/asset-hub-rococo/src/lib.rs#L757):


```rust
parameter_types! {
	// re-use the Uniques deposits
	pub const NftsCollectionDeposit: Balance = UniquesCollectionDeposit::get();
	pub const NftsItemDeposit: Balance = UniquesItemDeposit::get();
	pub const NftsMetadataDepositBase: Balance = UniquesMetadataDepositBase::get();
	pub const NftsAttributeDepositBase: Balance = UniquesAttributeDepositBase::get();
	pub const NftsDepositPerByte: Balance = UniquesDepositPerByte::get();
}

// 
parameter_types! {
	pub const UniquesCollectionDeposit: Balance = UNITS / 10; // 1 / 10 UNIT deposit to create a collection
	pub const UniquesItemDeposit: Balance = UNITS / 1_000; // 1 / 1000 UNIT deposit to mint an item
	pub const UniquesMetadataDepositBase: Balance = deposit(1, 129);
	pub const UniquesAttributeDepositBase: Balance = deposit(1, 0);
	pub const UniquesDepositPerByte: Balance = deposit(0, 1);
}
```

The proposed change would modify the deposit constants to require a lower deposit. The amount of the reduced deposit should be determined by `deposit` adjusted by arbitrary number.

```rust
parameter_types! {
	pub const NftsCollectionDeposit: Balance = deposit(1, 130);
	pub const NftsItemDeposit: Balance = deposit(1, 164) / 40;
	pub const NftsMetadataDepositBase: Balance = deposit(1, 129) / 10;
	pub const NftsAttributeDepositBase: Balance = deposit(1, 0) / 10;
	pub const NftsDepositPerByte: Balance = deposit(0, 1);
}
```


**Prices and Proposed Prices on Polkadot Asset Hub:**
_Scroll right_
```
| **Name**                  | **Current price implementation** | **Price if DOT = 5$**  | **Price if DOT goes to 50$**  | **Proposed Price in DOT** | **Proposed Price if DOT = 5$**   | **Proposed Price if DOT goes to 50$**|
|---------------------------|----------------------------------|------------------------|-------------------------------|---------------------------|----------------------------------|--------------------------------------|
| collectionDeposit         | 10 DOT                           | 50 $                   | 500 $                         | 0.20064 DOT                   | ~1 $                            | 10.32$                                   |
| itemDeposit               | 0.01 DOT                         | 0.05 $                 | 0.5 $                         | 0.005 DOT                 | 0.025 $                          | 0.251$                                |
| metadataDepositBase       | 0.20129 DOT                      | 1.00645 $              | 10.0645 $                     | 0.0020129 DOT             | 0.0100645 $                      | 0.100645$                            |
| attributeDepositBase      | 0.2 DOT                          | 1 $                    | 10 $                          | 0.002 DOT                 | 0.01 $                           | 0.1$                                 |
```

**Prices and Proposed Prices on Kusama Asset Hub:**
_Scroll right_
```
| **Name**                  | **Current price implementation** | **Price if KSM = 23$** | **Price if KSM goes to 500$** | **Proposed Price in KSM** | **Proposed Price if KSM = 23$**  | **Proposed Price if KSM goes to 500$** |
|---------------------------|----------------------------------|------------------------|-------------------------------|---------------------------|----------------------------------|----------------------------------------|
| collectionDeposit         | 0.1 KSM                          | 2.3 $                  | 50 $                          | 0.01 KSM                  | 0.23 $                           | 5 $                                    |
| itemDeposit               | 0.001 KSM                        | 0.023 $                | 0.5 $                         | 0.0001 KSM                | 0.0023 $                         | 0.05 $                                 |
| metadataDepositBase       | 0.006709666617 KSM               | 0.15432183319 $        | 3.3548333085 $                | 0.0006709666617 KSM       | 0.015432183319 $                 | 0.33548333085 $                        |
| attributeDepositBase      | 0.00666666666 KSM                | 0.15333333318 $        | 3.333333333 $                 | 0.000666666666 KSM        | 0.015333333318 $                 | 0.3333333333 $                         |

```
> Note: This is only a proposal for change and it can be modified upon additional conversation.

## Drawbacks
Modifying deposit requirements necessitates a balanced assessment of the potential drawbacks. Highlighted below are cogent points extracted from the discourse on the [Polkadot Forum conversation](https://forum.polkadot.network/t/polkadot-assethub-high-nft-collection-deposit/4262), which provide critical perspectives on the implications of such changes:

> But NFT deposits were chosen somewhat arbitrarily at genesis and it’s a good exercise to re-evaluate them and adapt if they are causing pain and if lowering them has little or no negative side effect (or if the trade-off is worth it).
>  -> joepetrowski

> Underestimates mean that state grows faster, although not unbounded - effectively an economic subsidy on activity. Overestimates mean that the state grows slower - effectively an economic depressant on activity.
>  -> rphmeier

> Technical: We want to prevent state bloat, therefore using state should have a cost associated with it.
>  -> joepetrowski


## Testing, Security, and Privacy

The change is backwards compatible. The prevention of "spam" could be prevented by OpenGov proposal to `forceDestoy` list of collections that are not suitable.

## Performance, Ergonomics, and Compatibility

### Performance
This change is not expected to have a significant impact on the overall performance of the Polkadot Asset Hub. However, monitoring the network closely, especially in the initial stages after implementation, is crucial to identify and mitigate any potential issues.
 
Additionally, a supplementary proposal aims to augment the network's adaptability:

> Just from a technical perspective; I think the best we can do is to use a weak governance origin that is controlled by some consortium (ie. System Collective).
> This origin could then update the NFT deposits any time the market conditions warrant it - obviously while honoring the storage deposit requirements.
> To implement this, we need RFC#12 and the Parameters pallet from @xlc.
>  -> OliverTY

This dynamic governance approach would facilitate a responsive and agile economic model for deposit management, ensuring that the network remains accessible and robust in the face of market volatility.

### Ergonomics
The proposed change aims to enhance the user experience for artists, making Polkadot more accessible and user-friendly.

### Compatibility
The change doesn't impact compatibility.

## Unresolved Questions
- Determining the optimal new deposit amount that reduces the barrier to entry while preventing state bloat remains a subject for debate. What balance allows for inclusivity without compromising the network's efficiency and security?

## Future Directions and Related Material

If accepted, this RFC could pave the way for further discussions and proposals aimed at enhancing the inclusivity and accessibility of the Polkadot ecosystem. Future work could also explore having a weak governance origin for deposits as proposed by Oliver.
