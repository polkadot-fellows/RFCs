# RFC-0079: General transactions in extrinsic format

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 12 March 2024                                                                               |
| **Description** | Support more extrinsic types by updating the extrinsic format                               |
| **Authors**     | George Pisaltu                                                                              |

## Summary

This RFC proposes the expansion of the extrinsic type identifier from the current most significant bit of the first byte of the encoded extrinsic to the two most significant bits of the first byte of the encoded extrinsic.

## Motivation

In order to support transactions that use different authorization schemes than currently exist, a new extrinsic type must be introduced alongside the current signed and unsigned types. Currently, an encoded extrinsic's first byte indicate the type of extrinsic using the most significant bit - `0` for unsigned, `1` for signed - and the 7 following bits indicate the extrinsic format version, which has been equal to `4` for a long time.

By taking one bit from the extrinsic format version encoding, we can support 2 additional extrinsic types while also having a minimal impact on our capability to extend and change the extrinsic format in the future.

## Stakeholders

Runtime users.

## Explanation

An extrinsic is currently encoded as one byte to identify the extrinsic type and version. This RFC aims to change the interpretation of this byte regarding the reserved bits for the extrinsic type and version. In the following explanation, bits represented using `T` make up the extrinsic type and bits represented using `V` make up the extrinsic version.

Currently, the bit allocation within the leading encoded byte is `0bTVVV_VVVV`. In practice in the Polkadot ecosystem, the leading byte would be `0bT000_0100` as the version has been equal to `4` for a long time.

This RFC proposes for the bit allocation to change to `0bTTVV_VVVV`.

## Drawbacks

This change would reduce the maximum possible transaction version from the current `127` to `63`. In order to bypass the new, lower limit, the extrinsic format would have to change again.

## Testing, Security, and Privacy

There is no impact on testing, security or privacy.

## Performance, Ergonomics, and Compatibility

This change would allow Polkadot to support new types of transactions, with the specific "general" transaction type in mind at the time of writing this proposal.

### Performance

There is no performance impact.

### Ergonomics

The impact to developers and end-users is minimal as it would just be a bitmask update on their part for parsing the extrinsic type along with the version.

### Compatibility

This change breaks backwards compatiblity because any transaction that is neither signed nor unsigned, but a new transaction type, would be interpreted as having a future extrinsic format version.

## Prior Art and References

The original design was originally proposed in the [`TransactionExtension` PR](https://github.com/paritytech/polkadot-sdk/pull/2280), which is also the motivation behind this effort.

## Unresolved Questions

None.

## Future Directions and Related Material

Following this change, the "general" transaction type will be introduced as part of the [Extrinsic Horizon](https://github.com/paritytech/polkadot-sdk/issues/2415) effort, which will shape future work.
