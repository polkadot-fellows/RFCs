# RFC-0045: Lowering NFT Deposits on Asset Hub

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| **Start Date**  | 2 November 2023                                                               |
| **Description** | A proposal to reduce the minimum deposit required for collection creation on the Polkadot and Kusama Asset Hubs. |
| **Authors**     | [Aurora Poppyseed](https://github.com/poppyseedDev), [Just_Luuuu](https://github.com/justLuuuu), [Viki Val](https://github.com/vikiival) |

## Summary

This RFC proposes changing the current deposit requirements on the Polkadot and Kusama Asset Hub for
creating an NFT collection, minting an individual NFT, and lowering its corresponding metadata and
attribute deposits. The objective is to lower the barrier to entry for NFT creators, fostering a
more inclusive and vibrant ecosystem while maintaining network integrity and preventing spam.

## Motivation

The current deposit of 10 DOT for collection creation (along with 0.01 DOT for item deposit and 0.2
DOT for metadata and attribute deposits) on the Polkadot Asset Hub and 0.1 KSM on Kusama Asset Hub
presents a significant financial barrier for many NFT creators. By lowering the deposit
requirements, we aim to encourage more NFT creators to participate in the Polkadot NFT ecosystem,
thereby enriching the diversity and vibrancy of the community and its offerings.

The initial introduction of a 10 DOT deposit was an arbitrary starting point that does not consider
the actual storage footprint of an NFT collection. This proposal aims to adjust the deposit first to
a value based on the `deposit` function, which calculates a deposit based on the number of keys
introduced to storage and the size of corresponding values stored.

Further, it suggests a direction for a future of calculating deposits variably based on adoption
and/or market conditions. There is a discussion on tradeoffs of setting deposits too high or too
low.

### Requirements

- Deposits SHOULD be derived from `deposit` function, adjusted by correspoding pricing mechansim.

## Stakeholders

- **NFT Creators**: Primary beneficiaries of the proposed change, particularly those who found the
  current deposit requirements prohibitive.
- **NFT Platforms**: As the facilitator of artists' relations, NFT marketplaces have a vested
  interest in onboarding new users and making their platforms more accessible.
- **dApp Developers**: Making the blockspace more accessible will encourage developers to create and
  build unique dApps in the Polkadot ecosystem.
- **Polkadot Community**: Stands to benefit from an influx of artists, creators, and diverse NFT
  collections, enhancing the overall ecosystem.

Previous discussions have been held within the [Polkadot
Forum](https://forum.polkadot.network/t/polkadot-assethub-high-nft-collection-deposit/4262), with
artists expressing their concerns about the deposit amounts.

## Explanation

This RFC proposes a revision of the deposit constants in the configuration of the NFTs pallet on the
Polkadot Asset Hub. The new deposit amounts would be determined by a standard deposit formula.

As of v1.1.1, the Collection Deposit is 10 DOT and the Item Deposit is 0.01 DOT (see
[here](https://github.com/polkadot-fellows/runtimes/blob/v1.1.1/system-parachains/asset-hubs/asset-hub-polkadot/src/lib.rs#L687)).

Based on the storage footprint of these items, this RFC proposes changing them to:

```rust
pub const NftsCollectionDeposit: Balance = system_para_deposit(1, 130);
pub const NftsItemDeposit: Balance = system_para_deposit(1, 164);
```

This results in the following deposits (calculted using [this
repository](https://github.com/vikiival/rfc-pricing)):

**Polkadot**

| **Name**                  | **Current Rate (DOT)** | **Calculated with Function (DOT)** |
|---------------------------|:----------------------:|:----------------------------------:|
| `collectionDeposit`       | 10                     | 0.20064                            |
| `itemDeposit`             | 0.01                   | 0.20081                            |
| `metadataDepositBase`     | 0.20129                | 0.20076                            |
| `attributeDepositBase`    | 0.2                    | 0.2                                |

Similarly, the prices for Kusama were calculated as:

**Kusama:**

| **Name**                  | **Current Rate (KSM)** | **Calculated with Function (KSM)** |
|---------------------------|:----------------------:|:----------------------------------:|
| `collectionDeposit`       | 0.1                    | 0.006688                           |
| `itemDeposit`             | 0.001                  | 0.000167                           |
| `metadataDepositBase`     | 0.006709666617         | 0.0006709666617                    |
| `attributeDepositBase`    | 0.00666666666          | 0.000666666666                     |

### Enhanced Approach to Further Lower Barriers for Entry

This RFC proposes further lowering these deposits below the rate normally charged for such a storage
footprint. This is based on the economic argument that sub-rate deposits are a subsididy for growth
and adoption of a specific technology. If the NFT functionality on Polkadot gains adoption, it makes
it more attractive for future entrants, who would be willing to pay the non-subsidized rate because
of the existing community.

**Proposed Rate Adjustments**

```rust
parameter_types! {
	pub const NftsCollectionDeposit: Balance = system_para_deposit(1, 130);
	pub const NftsItemDeposit: Balance = system_para_deposit(1, 164) / 40;
	pub const NftsMetadataDepositBase: Balance = system_para_deposit(1, 129) / 10;
	pub const NftsAttributeDepositBase: Balance = system_para_deposit(1, 0) / 10;
	pub const NftsDepositPerByte: Balance = system_para_deposit(0, 1);
}
```

This adjustment would result in the following DOT and KSM deposit values:

| **Name**                  | **Proposed Rate Polkadot** | **Proposed Rate Kusama** |
|---------------------------|:--------------------------:|:------------------------:|
| `collectionDeposit`       | 0.20064 DOT                | 0.006688 KSM             |
| `itemDeposit`             | 0.005 DOT                  | 0.000167 KSM             |
| `metadataDepositBase`     | 0.002 DOT                  | 0.0006709666617 KSM      |
| `attributeDepositBase`    | 0.002 DOT                  | 0.000666666666 KSM       |

### Short- and Long-Term Plans

The plan presented above is recommended as an immediate step to make Polkadot a more attractive
place to launch NFTs, although one would note that a forty fold reduction in the Item Deposit is
just as arbitrary as the value it was replacing. As explained earlier, this is meant as a subsidy to
gain more momentum for NFTs on Polkadot.

In the long term, an implementation should account for what should happen to the deposit rates
assuming that the subsidy is successful and attracts a lot of deployments. Many options are
discussed in the [Addendum](#addendum).

The deposit should be calculated as a function of the number of existing collections with maximum
DOT and stablecoin values limiting the amount. With asset rates available via the Asset Conversion
pallet, the system could take the lower value required. A sigmoid curve would make sense for this
application to avoid sudden rate changes, as in:

$$ minDeposit + \frac{\mathrm{min(DotDeposit, StableDeposit) - minDeposit} }{\mathrm{1 + e^{a - b * x}} }$$

where the constant `a` moves the inflection to lower or higher `x` values, the constant `b` adjusts
the rate of the deposit increase, and the independent variable `x` is the number of collections or
items, depending on application.

## Drawbacks

Modifying deposit requirements necessitates a balanced assessment of the potential drawbacks.
Highlighted below are cogent points extracted from the discourse on the [Polkadot Forum
conversation](https://forum.polkadot.network/t/polkadot-assethub-high-nft-collection-deposit/4262),
which provide critical perspectives on the implications of such changes.

Adjusting NFT deposit requirements on Polkadot and Kusama Asset Hubs involves key challenges:

1. **State Growth and Technical Concerns**: Lowering deposit requirements can lead to increased
   blockchain state size, potentially causing state bloat. This growth needs to be managed to
   prevent strain on the network's resources and maintain operational efficiency. As stated earlier,
   the deposit levels proposed here are intentionally low with the thesis that future participants
   would pay the standard rate.

2. **Network Security and Market Response**: Adapting to the cryptocurrency market's volatility is
   crucial. The mechanism for setting deposit amounts must be responsive yet stable, avoiding undue
   complexity for users.

3. **Economic Impact on Previous Stakeholders**: The change could have varied economic effects on
   previous (before the change) creators, platform operators, and investors. Balancing these
   interests is essential to ensure the adjustment benefits the ecosystem without negatively
   impacting its value dynamics. However in the particular case of Polkadot and Kusama Asset Hub
   this does not pose a concern since there are very few collections currently and thus previous
   stakeholders wouldn't be much affected. As of date 9th January 2024 there are 42 collections on
   Polkadot Asset Hub and 191 on Kusama Asset Hub with a relatively low volume.

## Testing, Security, and Privacy

### Security concerns

As noted above, state bloat is a security concern. In the case of abuse, governance could adapt by
increasing deposit rates and/or using `forceDestroy` on collections agreed to be spam.

## Performance, Ergonomics, and Compatibility

### Performance

The primary performance consideration stems from the potential for state bloat due to increased
activity from lower deposit requirements. It's vital to monitor and manage this to avoid any
negative impact on the chain's performance. Strategies for mitigating state bloat, including
efficient data management and periodic reviews of storage requirements, will be essential.

### Ergonomics

The proposed change aims to enhance the user experience for artists, traders, and utilizers of
Kusama and Polkadot Asset Hubs, making Polkadot and Kusama more accessible and user-friendly.

### Compatibility

The change does not impact compatibility as a `redeposit` function is already implemented.

## Unresolved Questions

If this RFC is accepted, there should not be any unresolved questions regarding how to adapt the
implementation of deposits for NFT collections.

## Addendum

Several innovative proposals have been considered to enhance the network's adaptability and manage
deposit requirements more effectively. The RFC recommends a mixture of the function-based model and
the stablecoin model, but some tradeoffs of each are maintained here for those interested.

### Enhanced Weak Governance Origin Model

The concept of a weak governance origin, controlled by a consortium like a system collective, has
been proposed. This model would allow for dynamic adjustments of NFT deposit requirements in
response to market conditions, adhering to storage deposit norms.

- **Responsiveness**: To address concerns about delayed responses, the model could incorporate
  automated triggers based on predefined market indicators, ensuring timely adjustments.
- **Stability vs. Flexibility**: Balancing stability with the need for flexibility is challenging.
  To mitigate the issue of frequent changes in DOT-based deposits, a mechanism for gradual and
  predictable adjustments could be introduced.
- **Scalability**: The model's scalability is a concern, given the numerous deposits across the
  system. A more centralized approach to deposit management might be needed to avoid constant,
  decentralized adjustments.

### Function-Based Pricing Model

Another proposal is to use a mathematical function to regulate deposit prices, initially allowing
low prices to encourage participation, followed by a gradual increase to prevent network bloat.

- **Choice of Function**: A logarithmic or sigmoid function is favored over an exponential one, as
  these functions increase prices at a rate that encourages participation while preventing
  prohibitive costs.
- **Adjustment of Constants**: To finely tune the pricing rise, one of the function's constants
  could correlate with the total number of NFTs on Asset Hub. This would align the deposit
  requirements with the actual usage and growth of the network.

### Linking Deposit to USD(x) Value

This approach suggests pegging the deposit value to a stable currency like the USD, introducing
predictability and stability for network users.

- **Market Dynamics**: One perspective is that fluctuations in native currency value naturally
  balance user participation and pricing, deterring network spam while encouraging higher-value
  collections. Conversely, there's an argument for allowing broader participation if the DOT/KSM
  value increases.
- **Complexity and Risks**: Implementing a USD-based pricing system could add complexity and
  potential risks. The implementation needs to be carefully designed to avoid unintended
  consequences, such as excessive reliance on external financial systems or currencies.

Each of these proposals offers unique advantages and challenges. The optimal approach may involve a
combination of these ideas, carefully adjusted to address the specific needs and dynamics of the
Polkadot and Kusama networks.
