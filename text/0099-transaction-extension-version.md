# RFC-0099: Introduce a transaction extension version

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 03 July 2024                                                                               |
| **Description** | Introduce a versioning for transaction extensions.                               |
| **Authors**     | Bastian Köcher                                                                              |

## Summary

This RFC proposes a change to the extrinsic format to include a transaction extension version.

## Motivation

The extrinsic format supports to be extended with transaction extensions. These transaction extensions are runtime specific and can be different per chain. Each transaction extension can add data to the extrinsic itself or extend the signed payload.
This means that adding a transaction extension is breaking the chain specific extrinsic format. A recent example was the introduction of the [`CheckMetadatHash`](https://github.com/polkadot-fellows/runtimes/pull/337) to Polkadot and all its system chains.
As the extension was adding one byte to the extrinsic, it broke a lot of tooling. By introducing an extra version for the transaction extensions it will be possible to introduce changes to these transaction extensions while still being backwards compatible. 
Based on the version of the transaction extensions, each chain runtime could decode the extrinsic correctly and also create the correct signed payload.

## Stakeholders

- Runtime users
- Runtime devs
- Wallet devs

## Explanation

[RFC84](https://github.com/paritytech/polkadot-sdk/issues/2415) introduced the extrinsic format `5`. The idea is to piggyback onto this change of the extrinsic format to add the extra version for the transaction extensions. If required, this could also come 
as extrinsic format `6`, but `5` is not yet deployed anywhere. 

The extrinsic format supports the following types of transactions:
- `Bare`: Does not add anything to the extrinsic.
- `Signed`: `(Address, Signature, Extensions)`
- `General`: `Extensions`

The `Signed` and `General` transaction would change to:

- `Signed`: `(Address, Signature, Version, Extensions)`
- `General`: `(Version, Extensions)`

The `Version` being a SCALE encoded `u8` representing the version of the transaction extensions.

In the chain runtime the version can be used to determine which set of transaction extensions should be used to decode and to validate the transaction.

## Drawbacks

This adds a least one byte more to each signed transaction. 

## Testing, Security, and Privacy

There is no impact on testing, security or privacy.

## Performance, Ergonomics, and Compatibility

This will ensure that changes to the transactions extensions can be done in a backwards compatible way.

### Performance

There is no performance impact.

### Ergonomics

Runtime developers need to take care of the versioning and ensure to bump as required, so that there are no compatibility breaking changes without a bump of the version. It will also add a little bit more code in the runtime
to decode these old versions, but this should be neglectable.

### Compatibility

When introduced together with extrinsic format version `5` from [RFC84](https://github.com/paritytech/polkadot-sdk/issues/2415), it can be implemented in a backwards compatible way. So, transactions can still be send using the
old extrinsic format and decoded by the runtime.

## Prior Art and References

None.

## Unresolved Questions

None.

## Future Directions and Related Material

None.
