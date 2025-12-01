# RFC-0001: Secondary Market for Regions

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2024-06-09                                                                                  |
| **Description** | Implement a secondary market for region listings and sales                                  |
| **Authors**     | [Aurora Poppyseed](https://github.com/poppyseedDev/), [Philip Lucsok](https://github.com/phillux)  |

## Summary

This RFC proposes the addition of a secondary market feature to either the broker pallet or as a separate pallet maintained by Lastic, enabling users to list and purchase regions. This includes creating, purchasing, and removing listings, as well as emitting relevant events and handling associated errors.

## Motivation

Currently, the broker pallet lacks functionality for a secondary market, which limits users' ability to freely trade regions. This RFC aims to introduce a secure and straightforward mechanism for users to list regions they own for sale and allow other users to purchase these regions.

While integrating this functionality directly into the broker pallet is one option, another viable approach is to implement it as a separate pallet maintained by Lastic. This separate pallet would have access to the broker pallet and add minimal functionality necessary to support the secondary market.

Adding smart contracts to the Coretime chain could also address this need; however, this process is expected to be lengthy and complex. We cannot afford to wait for this extended timeline to enable basic secondary market functionality. By proposing either integration into the broker pallet or the creation of a dedicated pallet, we can quickly enhance the flexibility and utility of the broker pallet, making it more user-friendly and valuable.

## Stakeholders

Primary stakeholders include:
- Developers working on the broker pallet.
- Secondary Coretime marketplaces.
- Users who own regions and wish to trade them.
- Community members interested in enhancing the broker pallet’s capabilities.

## Explanation

This RFC introduces the following key features:

1. **Storage Changes**:
    - Addition of `Listings` storage map to keep track of regions listed for sale and their prices.

2. **New Dispatchable Functions**:
    - `create_listing`: Allows a region owner to list a region for sale.
    - `purchase_listing`: Allows a user to purchase a listed region.
    - `remove_listing`: Allows a region owner to remove their listing.

3. **Events**:
    - `ListingCreated`: Emitted when a new listing is created.
    - `RegionSold`: Emitted when a region is sold.
    - `ListingRemoved`: Emitted when a listing is removed.

4. **Error Handling**:
    - `ExpiredRegion`: The region has expired and cannot be listed or sold.
    - `UnknownListing`: The listing does not exist.
    - `InvalidPrice`: The listing price is invalid.
    - `NotOwner`: The caller is not the owner of the region.

5. **Testing**:
    - Comprehensive tests to verify the correct functionality of the new features, including listing creation, purchase, removal, and handling of edge cases such as expired regions and unauthorized actions.

## Drawbacks

The main drawback of adding the additional complexity directly to the broker pallet is the potential increase in maintenance overhead. Therefore, we propose adding additional functionality as a separate pallet on the Coretime chain. To take the pressure off from implementing these features, implementation along with unit tests would be taken care of by Lastic (Aurora Makovac, Philip Lucsok).

There are potential risks of security vulnerabilities in the new market functionalities, such as unauthorized region transfers or incorrect balance adjustments. Therefore, extensive security measures would have to be implemented.

## Testing, Security, and Privacy

### Testing
- Comprehensive unit tests need to be provided to ensure the correctness of the new functionalities.
- Scenarios tested should include successful and failed listing creation, purchases, and removals, as well as edge cases like expired regions and non-owner actions.

### Security
- Security audits should be performed to identify any vulnerabilities.
- Ensure that only region owners can create or remove listings.
- Validate all inputs to prevent invalid operations.

### Privacy
- The proposal does not introduce new privacy concerns as it only affects region trading functionality within the existing framework.

## Performance, Ergonomics, and Compatibility

### Performance
- This feature is expected to introduce minimal overhead since it primarily involves read and write operations to storage maps.
- Efforts will be made to optimize the code to prevent unnecessary computational costs.

### Ergonomics
- The new functions are designed to be intuitive and easy to use, providing clear feedback through events and errors.
- Documentation and examples will be provided to assist developers and users.

### Compatibility
- This proposal does not break compatibility with existing interfaces or previous versions.
- No migrations are necessary as it introduces new functionality without altering existing features.

## Prior Art and References
- All related discussions are going to be under this PR.

## Unresolved Questions

- Are there additional security measures needed to prevent potential abuses of the new functionalities?

## Future Directions and Related Material

- Integration with external NFT marketplaces for more robust trading options.
- Development of user interfaces to interact with the new marketplace features seamlessly.
- Exploration of adding smart contracts to the Coretime chain, which would provide greater flexibility and functionality for the secondary market and other decentralized applications. This would require a longer time for implementation, so this proposes an intermediary solution.
