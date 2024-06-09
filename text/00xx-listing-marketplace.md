# RFC-0001: Secondary Market for Regions

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2024-06-09                                                                                  |
| **Description** | Implement a secondary market for region listings and sales                                  |
| **Authors**     | [Aurora Poppyseed](https://github.com/poppyseedDev/), [Phil Plucksok](https://github.com/phillux)  |

## Summary

This RFC proposes the addition of a secondary market feature to the broker pallet, enabling users to list and purchase regions. This includes creating, purchasing, and removing listings, as well as emitting relevant events and handling associated errors.

## Motivation

Currently, the broker pallet lacks functionality for a secondary market, which limits users' ability to freely trade regions. This RFC aims to introduce a secure and straightforward mechanism for users to list regions they own for sale and allow other users to purchase these regions. This functionality can enhance the flexibility and utility of the broker pallet, making it more user-friendly and valuable.

## Stakeholders

Primary stakeholders include:
- Developers working on the broker pallet.
- Secondary Coretime marketplaces
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

The main drawback is the additional complexity introduced to the broker pallet, which may increase maintenance overhead. Moreover, there is a potential risk of security vulnerabilities in the new market functionalities, such as unauthorized region transfers or incorrect balance adjustments.

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
- Efforts have been made to optimize the code to prevent unnecessary computational costs.

### Ergonomics
- The new functions are designed to be intuitive and easy to use, providing clear feedback through events and errors.
- Documentation and examples will be provided to assist developers and users.

### Compatibility
- This proposal does not break compatibility with existing interfaces or previous versions.
- No migrations are necessary as it introduces new functionality without altering existing features.

## Prior Art and References

- Discussions with community members and developers highlighted the need for a built-in secondary market.

## Unresolved Questions

- Should there be a limit on the number of regions a user can list at one time?
- Are there additional security measures needed to prevent potential abuses of the new functionalities?

## Future Directions and Related Material

- Further enhancements could include advanced filtering and search capabilities for listings.
- Integration with external NFT marketplaces for more robust trading options.
- Development of user interfaces to interact with the new marketplace features seamlessly.
