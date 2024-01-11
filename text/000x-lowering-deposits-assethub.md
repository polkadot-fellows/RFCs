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


## Discussion of Other Proposals
Several innovative proposals have been considered to enhance the network's adaptability and manage deposit requirements more effectively:

### Enhanced Weak Governance Origin Model
The concept of a weak governance origin, controlled by a consortium like the System Collective, has been proposed. This model would allow for dynamic adjustments of NFT deposit requirements in response to market conditions, adhering to storage deposit norms. 

**Enhancements and Concerns:**
- **Responsiveness**: To address concerns about delayed responses, the model could incorporate automated triggers based on predefined market indicators, ensuring timely adjustments.
- **Stability vs. Flexibility**: Balancing stability with the need for flexibility is challenging. To mitigate the issue of frequent changes in DOT-based deposits, a mechanism for gradual and predictable adjustments could be introduced.
- **Scalability**: The model's scalability is a concern, given the numerous deposits across the system. A more centralized approach to deposit management might be needed to avoid constant, decentralized adjustments.

### Function-Based Pricing Model
Another proposal is to use a mathematical function to regulate deposit prices, initially allowing low prices to encourage participation, followed by a gradual increase to prevent network bloat.

**Refinements:**
- **Choice of Function**: A logarithmic or sigmoid function is favored over an exponential one, as these functions increase prices at a rate that encourages participation while preventing prohibitive costs.
- **Adjustment of Constants**: To finely tune the pricing rise, one of the function's constants could correlate with the total number of NFTs on AssetHub. This would align the deposit requirements with the actual usage and growth of the network.

### Linking Deposit to USD(x) Value
This approach suggests pegging the deposit value to a stable currency like the USD, introducing predictability and stability for network users.

**Considerations and Challenges:**
- **Market Dynamics**: One perspective is that fluctuations in native currency value naturally balance user participation and pricing, deterring network spam while encouraging higher-value collections. Conversely, there's an argument for allowing broader participation if the DOT/KSM value increases.
- **Complexity and Risks**: Implementing a USD-based pricing system could add complexity and potential risks. The implementation needs to be carefully designed to avoid unintended consequences, such as excessive reliance on external financial systems or currencies.

Each of these proposals offers unique advantages and challenges. The optimal approach may involve a combination of these ideas, carefully adjusted to address the specific needs and dynamics of the Polkadot and Kusama networks.

## Drawbacks
Modifying deposit requirements necessitates a balanced assessment of the potential drawbacks. Highlighted below are cogent points extracted from the discourse on the [Polkadot Forum conversation](https://forum.polkadot.network/t/polkadot-assethub-high-nft-collection-deposit/4262), which provide critical perspectives on the implications of such changes:

The discourse around modifying deposit requirements includes various perspectives:

Adjusting NFT deposit requirements on Polkadot and Kusama Asset Hubs involves key challenges:

1. **State Growth and Technical Concerns**: Lowering deposit requirements can lead to increased blockchain state size, potentially causing state bloat. This growth needs to be managed to prevent strain on the network's resources and maintain operational efficiency. 

2. **Network Security and Market Response**: Reduced deposits might increase transaction volume, potentially bloating the state, thereby impacting network security. Additionally, adapting to the cryptocurrency market's volatility is crucial. The mechanism for setting deposit amounts must be responsive yet stable, avoiding undue complexity for users.

3. **Economic Impact on Previous Stakeholders**: The change could have varied economic effects on previous (before the change) creators, platform operators, and investors. Balancing these interests is essential to ensure the adjustment benefits the ecosystem without negatively impacting its value dynamics. However in the particular case of Polkadot and Kusama Asset Hub this does not pose a concern since there are very few collections currently and thus previous stakeholders wouldn't be much affected. As of date 9th January 2024 there are 42 collections on Polkadot Asset Hub and 191 on Kusama Asset Hub with a relatively low volume.

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
