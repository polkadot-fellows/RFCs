# RFC-0002: Smart Contracts on the Coretime Chain

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2024-06-09                                                                                  |
| **Description** | Implement smart contracts on the Coretime chain                                             |
| **Authors**     | [Aurora Poppyseed](https://github.com/poppyseedDev/), [Phil Lucksok](https://github.com/phillux)  |

## Summary

This RFC proposes the integration of smart contracts on the Coretime chain to enhance flexibility and enable complex decentralized applications, including secondary market functionalities.

## Motivation

Currently, the Coretime chain lacks the capability to support smart contracts, which limits the range of decentralized applications that can be developed and deployed. By enabling smart contracts, the Coretime chain can facilitate more sophisticated functionalities such as automated region trading, dynamic pricing mechanisms, and other decentralized applications that require programmable logic. This will enhance the utility of the Coretime chain, attract more developers, and create more opportunities for innovation.

Additionally, while there is a proposal (#885) to allow EVM-compatible contracts on Polkadot’s Asset Hub, the implementation of smart contracts directly on the Coretime chain will provide synchronous interactions and avoid the complexities of asynchronous operations via XCM. 

## Stakeholders

Primary stakeholders include:
- Developers working on the Coretime chain.
- Users who want to deploy decentralized applications on the Coretime chain.
- Community members interested in expanding the capabilities of the Coretime chain.
- Secondary Coretime marketplaces.

## Explanation

This RFC introduces the following key components:

1. **Smart Contract Support**:
    - Implement support for deploying and executing smart contracts on the Coretime chain.
    - Use a well-established smart contract platform, such as Ethereum’s Solidity or Polkadot's Ink!, to ensure compatibility and ease of use.

2. **Storage and Execution**:
    - Define a storage structure for smart contracts and their associated data.
    - Ensure efficient and secure execution of smart contracts, with proper resource management and gas fee mechanisms.

3. **Integration with Existing Pallets**:
    - Ensure that smart contracts can interact with existing pallets on the Coretime chain, such as the broker pallet.
    - Provide APIs and interfaces for seamless integration and interaction.

4. **Security and Auditing**:
    - Implement robust security measures to prevent vulnerabilities and exploits in smart contracts.
    - Conduct thorough security audits and testing before deployment.

## Drawbacks

There are several drawbacks to consider:
- **Complexity**: Adding smart contracts introduces significant complexity to the Coretime chain, which may increase maintenance overhead and the potential for bugs.
- **Performance**: The execution of smart contracts can be resource-intensive, potentially affecting the performance of the Coretime chain.
- **Security**: Smart contracts are prone to vulnerabilities and exploits, necessitating rigorous security measures and continuous monitoring.

## Testing, Security, and Privacy

### Testing
- Comprehensive unit tests and integration tests should be developed to ensure the correct functionality of smart contracts.
- Test scenarios should include various use cases and edge cases to validate the robustness of the implementation.

### Security
- Security audits should be performed to identify and mitigate vulnerabilities.
- Implement best practices for smart contract development to minimize the risk of exploits.
- Continuous monitoring and updates will be necessary to address new security threats.

### Privacy
- The proposal does not introduce new privacy concerns as it extends existing functionalities with programmable logic.

## Performance, Ergonomics, and Compatibility

### Performance
- The introduction of smart contracts may impact performance due to the additional computational overhead.
- Optimization techniques, such as efficient gas fee mechanisms and resource management, should be employed to minimize performance degradation.

### Ergonomics
- The new functionality should be designed to be intuitive and easy to use for developers, with comprehensive documentation and examples.
- Provide developer tools and SDKs to facilitate the creation and deployment of smart contracts.

### Compatibility
- This proposal should maintain compatibility with existing interfaces and functionalities of the Coretime chain.
- Ensure backward compatibility and provide migration paths if necessary.

## Prior Art and References

- Ethereum’s implementation of smart contracts using Solidity.
- Polkadot’s Ink! smart contract platform.
- Existing decentralized applications and use cases on other blockchain platforms.
- Proposal #885: EVM-compatible contracts on Asset Hub, which highlights the community's interest in integrating smart contracts within the Polkadot ecosystem.

## Unresolved Questions

- What specific security measures should be implemented to prevent smart contract vulnerabilities?
- How can we ensure optimal performance while supporting complex smart contracts?
- What are the best practices for integrating smart contracts with existing pallets on the Coretime chain?

## Future Directions and Related Material

- Further enhancements could include advanced developer tools and SDKs for smart contract development.
- Integration with external decentralized applications and platforms to expand the ecosystem.
- Continuous updates and improvements to the smart contract platform based on community feedback and emerging best practices.
- Exploration of additional use cases for smart contracts on the Coretime chain, such as decentralized finance (DeFi) applications, voting systems, and more.

By enabling smart contracts on the Coretime chain, we can significantly expand its capabilities and attract a wider range of developers and users, fostering innovation and growth in the ecosystem.
