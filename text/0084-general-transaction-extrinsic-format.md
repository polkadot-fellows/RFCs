# RFC-0084: General transactions in extrinsic format

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 12 March 2024                                                                               |
| **Description** | Support more extrinsic types by updating the extrinsic format                               |
| **Authors**     | George Pisaltu                                                                              |

## Summary

This RFC proposes a change to the extrinsic format to incorporate a new transaction type, the "general" transaction.

## Motivation

"General" transactions, a new type of transaction that this RFC aims to support, are transactions which obey the runtime's extensions and have according extension data yet do not have hard-coded signatures. They are first described in [Extrinsic Horizon](https://github.com/paritytech/polkadot-sdk/issues/2415) and supported in [3685](https://github.com/paritytech/polkadot-sdk/pull/3685). They enable users to authorize origins in new, more flexible ways (e.g. ZK proofs, mutations over pre-authenticated origins). As of now, all transactions are limited to the account signing model for origin authorization and any additional origin changes happen in extrinsic logic, which cannot leverage the validation process of extensions.

An example of a use case for such an extension would be sponsoring the transaction fee for some other user. A new extension would be put in place to verify that a part of the initial payload was signed by the author under who the extrinsic should run and change the origin, but the payment for the whole transaction should be handled under a sponsor's account. A POC for this can be found in [3712](https://github.com/paritytech/polkadot-sdk/pull/3712).

The new "general" transaction type would coexist with both current transaction types for a while and, therefore, the current number of supported transaction types, capped at 2, is insufficient. A new extrinsic type must be introduced alongside the current signed and unsigned types. Currently, an encoded extrinsic's first byte indicate the type of extrinsic using the most significant bit - `0` for unsigned, `1` for signed - and the 7 following bits indicate the [extrinsic format version](https://spec.polkadot.network/id-extrinsics#id-extrinsics-body), which has been equal to `4` for a long time.

By taking one bit from the extrinsic format version encoding, we can support 2 additional extrinsic types while also having a minimal impact on our capability to extend and change the extrinsic format in the future.

## Stakeholders

- Runtime users
- Runtime devs
- Wallet devs

## Explanation

An extrinsic is currently encoded as one byte to identify the extrinsic type and version. This RFC aims to change the interpretation of this byte regarding the reserved bits for the extrinsic type and version. In the following explanation, bits represented using `T` make up the extrinsic type and bits represented using `V` make up the extrinsic version.

Currently, the bit allocation within the leading encoded byte is `0bTVVV_VVVV`. In practice in the Polkadot ecosystem, the leading byte would be `0bT000_0100` as the version has been equal to `4` for a long time.

This RFC proposes for the bit allocation to change to `0bTTVV_VVVV`. As a result, the extrinsic format version will be bumped to `5` and the extrinsic type bit representation would change as follows:

| bits  | type      |
|-------|-----------|
| 00    | unsigned  |
| 10    | signed    |
| 01 	| reserved  |
| 11 	| reserved  |

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
