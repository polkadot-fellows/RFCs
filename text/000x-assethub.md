# RFC-0000: Lowering Deposit Requirements on Polkadot Asset Hub

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2 November 2023                                                                             |
| **Description** | A proposal to reduce the minimum deposit required for collection creation on the Polkadot Asset Hub, making it more accessible and affordable for artists. |
| **Authors**     | Aurora Poppyseed, Just_Luuuu                                                                |

## Summary

This RFC proposes a change to the current deposit requirements on the Polkadot Asset Hub for creating NFT collections. The objective is to lower the barrier to entry for artists, fostering a more inclusive and vibrant ecosystem, while maintaining network integrity and preventing spam.

## Motivation

The current deposit of 10 DOT for collection creation on the Polkadot Asset Hub presents a significant financial barrier for many artists, especially with the potential volatility in DOT’s price. By lowering the deposit requirements, we aim to encourage more artists to participate in the Polkadot NFT ecosystem, thereby enriching the diversity and vibrancy of the community and its offerings.

## Stakeholders

- **Artists**: Primary beneficiaries of the proposed change, particularly those who found the current deposit requirements prohibitive.
- **KodaDot**: As the facilitator of artists' relations, KodaDot has a vested interest in making the platform more accessible.
- **Polkadot Community**: Stands to benefit from an influx of artists and diverse NFT collections, enhancing the overall ecosystem.
- **Parity**: The developers of Polkadot, who may need to implement and oversee the changes.

Previous discussions have been held within the KodaDot community, as well as with artists expressing their concerns about the deposit amounts.

## Explanation
This RFC suggests modifying the smart contract governing collection creation on the Polkadot Asset Hub to require a lower deposit. The exact amount of the reduced deposit is yet to be determined and should be discussed and agreed upon by the stakeholders. The implementation of this change requires careful consideration of the network's integrity and the prevention of spam, possibly through alternative means such as rate limiting or account verification.


**Prices on Polkadot Asset Hub:**

```
| **Name**                  | **Current price implementation** | **Price if DOT = 5$** | **Price if DOT goes to 50$** | **Proposed Price in DOT** | **Proposed Price if DOT = 5$** | **Proposed Price if DOT goes to 50$** |
|---------------------------|----------------------------------|------------------------|-------------------------------|---------------------------|----------------------------------|-------------------------------------|
| collectionDeposit         | 10 DOT                           | 50 $                   | 500 $                         | 0.1 DOT                   | 0.5 $                            | 5$                                  |
| itemDeposit               | 0.01 DOT                         | 0.05 $                 | 0.5 $                         | 0.001 DOT                 | 0.005 $                          | 0.05$                               |
| metadataDepositBase       | 0.20129 DOT                      | 1.00645 $              | 10.0645 $                     | 0.0020129 DOT             | 0.0100645 $                       | 0.100645$                           |
| attributeDepositBase      | 0.2 DOT                          | 1 $                    | 10 $                          | 0.002 DOT                 | 0.01 $                            | 0.1$                                |
```

**Prices on Kusama Asset Hub:**

```
| **Name**                  | **Current price implementation** | **Price if KSM = 23$** | **Price if KSM goes to 500$** | **Proposed Price in KSM** | **Proposed Price if KSM = 23$** | **Proposed Price if KSM goes to 500$** |
|---------------------------|----------------------------------|------------------------|-------------------------------|---------------------------|----------------------------------|----------------------------------------|
| collectionDeposit         | 0.1 KSM                          | 2.3 $                  | 50 $                          | 0.01 KSM                  | 0.23 $                           | 5 $                                    |
| itemDeposit               | 0.001 KSM                        | 0.023 $                | 0.5 $                         | TBD KSM                   | TBD $                            | TBD $                                  |
| metadataDepositBase       | 0.006709666617 KSM               | 0.15432183319 $        | 3.3548333085 $                | TBD KSM                   | TBD $                            | TBD $                                  |
| attributeDepositBase      | 0.00666666666 KSM                | 0.15333333318 $        | 3.333333333 $                 | TBD KSM                   | TBD $                            | TBD $                                  |

```


## Drawbacks
Lowering the deposit requirements may potentially increase the risk of spam and malicious collections on the platform. This could lead to a cluttered and less secure ecosystem, possibly devaluing legitimate NFT collections. It also puts additional pressure on the network and its maintainers to implement and manage alternative spam prevention mechanisms.

## Testing, Security, and Privacy

## Performance, Ergonomics, and Compatibility

### Performance
This change is not expected to have a significant impact on the overall performance of the Polkadot Asset Hub. However, it is crucial to monitor the network closely, especially in the initial stages after implementation, to identify and mitigate any potential issues.

### Ergonomics
The proposed change aims to enhance the user experience for artists, making the platform more accessible and user-friendly. It should not alter existing interfaces but may require updates to user documentation and onboarding materials.

### Compatibility
The change should be backward compatible, with no impact on existing collections or users. However, a clear communication plan should be in place to inform all stakeholders of the changes and any required actions on their part.

## Prior Art and References
References to other blockchain platforms that have successfully implemented similar changes could provide valuable insights and learnings. Examples include Ethereum and Binance Smart Chain, both of which have a wide range of NFT platforms with varying deposit requirements.

## Unresolved Questions
  - What is the optimal new deposit amount that balances accessibility with the need for spam prevention?
  - What alternative mechanisms can be implemented to prevent spam without relying on financial barriers?
  - How will the change be communicated to the existing users and the wider Polkadot community?

## Future Directions and Related Material

If accepted, this RFC could pave the way for further discussions and proposals aimed at enhancing the inclusivity and accessibility of the Polkadot ecosystem. Future work could also explore additional mechanisms for spam prevention that do not rely on financial barriers.
