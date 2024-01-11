# RFC-0000: Lowering NFT Deposits on Polkadot and Kusama Asset Hubs

|                 |                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------- |
| **Start Date**  | 2 November 2023                                                                                    |
| **Description** | A proposal to reduce the minimum deposit required for collection creation on the Polkadot and Kusama Asset Hub, making it more accessible and affordable for artists. |
| **Authors**     | [Aurora Poppyseed](https://github.com/poppyseedDev), [Just_Luuuu](https://github.com/justLuuuu), [Viki Val](https://github.com/vikiival)  |

## Summary

This RFC proposes changing the current deposit requirements on the Polkadot and Kusama Asset Hub for creating NFT collection, minting an individual NFT, and lowering it's coresponding metadata and attribute deposit. The objective is to lower the barrier to entry for NFT creators, fostering a more inclusive and vibrant ecosystem while maintaining network integrity and preventing spam.

## Motivation

The current deposit of 10 DOT for collection creation (along with 0.01 DOT for item deposit and 0.2 DOT for metadata and attribute deposit) on the Polkadot Asset Hub and 0.1 KSM on Kusama Asset Hub presents a significant financial barrier for many NFT creators. By lowering the deposit requirements, we aim to encourage more NFT creators to participate in the Polkadot NFT ecosystem, thereby enriching the diversity and vibrancy of the community and its offerings.

The actual implementation of the deposit is an arbitrary number coming from [Uniques pallet](https://github.com/paritytech/polkadot-sdk/blob/master/cumulus/parachains/runtimes/assets/asset-hub-rococo/src/lib.rs#L757). It is not a result of any economic analysis. This proposal aims to adjust the deposit from constant to dynamic pricing based on the `deposit` function with respect to stakeholders.

### Requirements

- Deposit SHOULD be derived from `deposit` function adjusted by correspoding pricing mechansim.

## Stakeholders

- **NFT Creators**: Primary beneficiaries of the proposed change, particularly those who found the current deposit requirements prohibitive.
- **NFT Platforms**: As the facilitator of artists' relations, NFT Marketplaces has a vested interest in onboarding new users and making the platform more accessible.
- **dApp Developers**: Making the blockspace more accessible will encourage developers to create and build unique dApps in the Polkadot ecosystem.
- **Polkadot Community**: Stands to benefit from an influx of artists, creators and diverse NFT collections, enhancing the overall ecosystem.

Previous discussions have been held within the Polkadot Forum community and with artists expressing their concerns about the deposit amounts. [Link](https://forum.polkadot.network/t/polkadot-assethub-high-nft-collection-deposit/4262).

## Explanation
This RFC proposes a revision of the deposit constants in the nfts pallet on the Polkadot Asset Hub. The new deposit amounts would be determined by a standard deposit formula.

This RFC suggests modifying deposit constants defined in the `nfts` pallet on the Polkadot Asset Hub to require a lower deposit. The reduced deposit amount should be determined by the `deposit` adjusted by the pricing mechanism (arbitrary number/another pricing function). 



### Current code structure

[Current deposit requirements are as follows](https://github.com/paritytech/polkadot-sdk/blob/master/cumulus/parachains/runtimes/assets/asset-hub-rococo/src/lib.rs#L757)

Looking at the current code structure the currently implemented we can find that the pricing re-uses the logic of how Uniques are defined:

```rust
parameter_types! {
	// re-use the Uniques deposits
	pub const NftsCollectionDeposit: Balance = UniquesCollectionDeposit::get();
	pub const NftsItemDeposit: Balance = UniquesItemDeposit::get();
	pub const NftsMetadataDepositBase: Balance = UniquesMetadataDepositBase::get();
	pub const NftsAttributeDepositBase: Balance = UniquesAttributeDepositBase::get();
	pub const NftsDepositPerByte: Balance = UniquesDepositPerByte::get();
}
```

And looking back on the code we can find that the Uniques are defined in such a way:
```rust
parameter_types! {
	pub const UniquesCollectionDeposit: Balance = UNITS / 10; // 1 / 10 UNIT deposit to create a collection
	pub const UniquesItemDeposit: Balance = UNITS / 1_000; // 1 / 1000 UNIT deposit to mint an item
	pub const UniquesMetadataDepositBase: Balance = deposit(1, 129);
	pub const UniquesAttributeDepositBase: Balance = deposit(1, 0);
	pub const UniquesDepositPerByte: Balance = deposit(0, 1);
}
```
As we can see in the code definition above the current code does not use the `deposit` funtion when the collection in the following instances: `UniquesCollectionDeposit` and  `UniquesItemDeposit`.

### Modifying the code to by Using the Deposit Function

As
The proposed change would modify the deposit constants to require a lower deposit. The reduced deposit amount should be determined by `deposit` adjusted by an arbitrary number.

```rust
parameter_types! {
	pub const NftsCollectionDeposit: Balance = deposit(1, 130);
	pub const NftsItemDeposit: Balance = deposit(1, 164);
	pub const NftsMetadataDepositBase: Balance = deposit(1, 129);
	pub const NftsAttributeDepositBase: Balance = deposit(1, 0);
	pub const NftsDepositPerByte: Balance = deposit(0, 1);
}
```

Calculations viewed bellow were calculated by using the following repository [rfc-pricing](https://github.com/vikiival/rfc-pricing).
**Polkadot**
| **Name**                  | **Current price implementation** | **Proposed Modified by using the new deposit function** |
|---------------------------|----------------------------------|-------------------------|
| collectionDeposit         | 10 DOT                           | 0.20064 DOT             |
| itemDeposit               | 0.01 DOT                         | 0.20081 DOT             |
| metadataDepositBase       | 0.20129 DOT                      | 0.20076 DOT             |
| attributeDepositBase      | 0.2 DOT                          | 0.2 DOT                 |

Similarly the prices for Kusama ecosystem were calculated as:
**Kusama:**
| **Name**                  | **Current price implementation** | **Proposed Price in KSM** |
|---------------------------|----------------------------------|---------------------------|
| collectionDeposit         | 0.1 KSM                          | 0.006688 KSM              |
| itemDeposit               | 0.001 KSM                        | 0.000167 KSM              |
| metadataDepositBase       | 0.006709666617 KSM               | 0.0006709666617 KSM       |
| attributeDepositBase      | 0.00666666666 KSM                | 0.000666666666 KSM        |


### Additional modifications to further reduce the barrier to entry
We propose reducing the prices further by reducing them by an arbitrary number. This number was chosen to have a reasonable amount to encourage participation even when the prices of Polkadot and Kusama rise. 

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

**Polkadot**
| **Name**                  | **Current price implementation** | **Proposed Prices** |
|---------------------------|----------------------------------|---------------------|
| collectionDeposit         | 10 DOT                           | 0.20064 DOT         |
| itemDeposit               | 0.01 DOT                         | 0.005 DOT           |
| metadataDepositBase       | 0.20129 DOT                      | 0.002 DOT           |
| attributeDepositBase      | 0.2 DOT                          | 0.002 DOT           |

**Kusama**
| **Name**                  | **Current price implementation** | **Proposed Price in KSM** |
|---------------------------|----------------------------------|---------------------------|
| collectionDeposit         | 0.1 KSM                          | 0.006688 KSM              |
| itemDeposit               | 0.001 KSM                        | 0.000167 KSM              |
| metadataDepositBase       | 0.006709666617 KSM               | 0.0006709666617 KSM       |
| attributeDepositBase      | 0.00666666666 KSM                | 0.000666666666 KSM        |


## Other proposals
There were some proposals how to augment the network's adaptability:

### Weak governance origin
One of the options how to mitigate a bloated state is to introduce a weak governance origin that is controlled by some consortium (ie. System Collective). This origin could then update the NFT deposits any time the market conditions warrant it - obviously while honoring the storage deposit requirements.

This dynamic governance approach would facilitate a responsive and agile economic model for deposit management, ensuring that the network remains accessible and robust in the face of market volatility.

However after discussions, we found that such a proposal lacks in certain areas:
 1. Actors could be too slow to act, having a delayed response and thus endagering the networks security
 2. In attempting to provide stability it actually removes it because the DOT-based deposit can change so often that NFT issuers don't even know how much DOT they should acquire in order to plan a few weeks in advance.
 3. It does not scale. There are deposits all over the system. These actors could find themselves perpetually changing multiple deposits.

### Having the price of the deposit imitate a function
A clever idea on how to encourage initial participation and then let slowly rise the prices to prevent bloating the network is to introduce a function that will slowly raise the prices. Initially an exponential was proposed, however upon further consideration a logarithmic or a sigmoid function would be more appropriate, since the nature of such functions are that they would never be so high to completely obliterate participation.

Considering such a function the question araises on how to adjust the constants properly to have an appropriate rising of the prices too avoid having the state too big and simultaneously not to have the prices too high. A good rule of thumb is to have one of the constants be correlated with the number of all NFTS on AssetHub.

### Linking deposit to USD(x) value
There arises also a possibility to have the deposit be a value that is based in USD. Since the nature of having the prices in a native currency doesn't represent predictability for the network users. It would make sense to stabilize the price with a stable coin like based on a currency like USD.

There are two trains of thoughts one that with the fluctuatining currency there will be naturally more people and the prices will rise accordingly thus, disincentivising people to spam the network and only incouraging more pricier collections. Another train of thought is if the DOT/KSM will raise and people like to participate and engage with the network we should just let them.

Having prices based in USD might introduce a level of complexity and unintended consequences if porly implemented.

## Drawbacks
Modifying deposit requirements necessitates a balanced assessment of the potential drawbacks. Highlighted below are cogent points extracted from the discourse on the [Polkadot Forum conversation](https://forum.polkadot.network/t/polkadot-assethub-high-nft-collection-deposit/4262), which provide critical perspectives on the implications of such changes:

The discourse around modifying deposit requirements includes various perspectives:

Adjusting NFT deposit requirements on Polkadot and Kusama Asset Hubs involves key challenges:

1. **State Growth and Technical Concerns**: Lowering deposit requirements can lead to increased blockchain state size, potentially causing state bloat. This growth needs to be managed to prevent strain on the network's resources and maintain operational efficiency. 

2. **Network Security and Market Response**: Reduced deposits might increase transaction volume, potentially bloating the state, thereby impacting network security. Additionally, adapting to the cryptocurrency market's volatility is crucial. The mechanism for setting deposit amounts must be responsive yet stable, avoiding undue complexity for users.

3. **Economic Impact on Stakeholders**: The change could have varied economic effects on creators, platform operators, and investors. Balancing these interests is essential to ensure the adjustment benefits the ecosystem without negatively impacting its value dynamics. However in the particular case of Polkadot and Kusama Asset Hub this does not pose a concern since there are very few collections currently. As of date 9th January 2024 there are 42 collections on Polkadot Asset Hub and 191 on Kusama Asset Hub with a relatively low volume.

## Testing, Security, and Privacy

### Security concerns

The prevention of "spam" could be prevented by OpenGov proposal to `forceDestoy` list of collections that are not suitable.

## Performance, Ergonomics, and Compatibility

### Performance
The only forseeable impact on performance araise from the state being too bloated from the potential and impacting performance of the chain.

### Ergonomics
The proposed change aims to enhance the user experience for artists, traders and utilizers of Kusama and Polkadot asset hub. Making Polkadot and Kusama more accessible and user-friendly.

### Compatibility
The change does not impact compatibility as `redeposit` function is already implemented.
### Compatibility
The change is backwards compatible.

## Unresolved Questions
The unresolved questions are related to having the price of the deposit imitate a function and linking deposit to USD(x) value.

## Future Directions and Related Material
We suggest lowering the deposit as to the recommended levels and then if seen it's needed continuing the discussion if having the price of the deposit imitate a function or linking deposit to USD(x) value are needed.

If accepted, this RFC could pave the way for further discussions and proposals aimed at enhancing the inclusivity and accessibility of the Polkadot ecosystem. 
