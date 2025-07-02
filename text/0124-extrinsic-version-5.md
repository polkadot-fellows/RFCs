# RFC-0124: Extrinsic version 5

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 18 October 2024                                                                             |
| **Description** | Definition and specification of version 5 extrinsics                                        |
| **Authors**     | George Pisaltu                                                                              |

## Summary

This RFC proposes the definition of version 5 extrinsics along with changes to the specification and
encoding from version 4.

## Motivation

[RFC84](https://github.com/polkadot-fellows/RFCs/blob/main/text/0084-general-transaction-extrinsic-format.md)
introduced the specification of `General` transactions, a new type of extrinsic besides the `Signed`
and `Unsigned` variants available previously in version 4. Additionally,
[RFC99](https://github.com/polkadot-fellows/RFCs/blob/main/text/0099-transaction-extension-version.md)
introduced versioning of transaction extensions through an extra byte in the extrinsic encoding.
Both of these changes require an extrinsic format version bump as both the semantics around
extensions as well as the actual encoding of extrinsics need to change to accommodate these new
features.

## Stakeholders

- Runtime users
- Runtime devs
- Wallet devs

## Explanation

### Changes to extrinsic authorization

The introduction of `General` transactions allows the authorization of any and all origins through
extensions. This means that, with the appropriate extension, `General` transactions can replicate
the same behavior present-day v4 `Signed` transactions. Specifically for Polkadot chains, an example
implementation for such an extension is
[`VerifySignature`](https://github.com/paritytech/polkadot-sdk/tree/master/substrate/frame/verify-signature),
introduced in the Transaction Extension
[PR3685](https://github.com/paritytech/polkadot-sdk/pull/3685). Other extensions can be inserted
into the extension pipeline to authorize different custom origins. Therefore, a `Signed` extrinsic
variant is redundant to a `General` one strictly in terms of user functionality and could eventually
be deprecated and removed.

### Encoding format for version 5

As with version 4, the encoded extrinsic v5 is a SCALE encoded vector of bytes (`u8`), therefore
starting with the encoded length of the following bytes in compact format. The leading byte after
the length determines the version and type of extrinsic, as specified by
[RFC84](https://github.com/polkadot-fellows/RFCs/blob/main/text/0084-general-transaction-extrinsic-format.md).
For reasons mentioned above, this RFC removes the `Signed` variant for v5 extrinsics.

For `Bare` extrinsics, the following bytes will just be the encoded call and nothing else.

For `General` transactions, as stated in
[RFC99](https://github.com/polkadot-fellows/RFCs/blob/main/text/0099-transaction-extension-version.md),
an extension version byte must be added to the extrinsic format. This byte should allow runtimes to
expose more than one set of extensions which can be used for a transaction. As far as the v5
extrinsic encoding is concerned, this extension byte should be encoded immediately after the leading
encoding byte. The extension version byte should be included in payloads to be signed by all
extensions configured by runtime devs to ensure a user's extension version choice cannot be altered
by third parties.

After the extension version byte, the extensions will be encoded next, followed by the call itself.

A quick visualization of the encoding:

- `Bare` extrinsics: `(extrinsic_encoded_len, 0b0000_0101, call)`
- `General` transactions: `(extrinsic_encoded_len, , 0b0100_0101, extension_version_byte,
  extensions, call)`

### Signatures on Polkadot in General transactions

In order to run a transaction with a signed origin in extrinsic version 5, a user must create the
transaction with an instance of at least one extension responsible for authorizing `Signed` origins
with a provided signature.

As stated before, [PR3685](https://github.com/paritytech/polkadot-sdk/pull/3685) comes with a
Transaction Extension which replicates the current `Signed` transactions in v5 extrinsics, namely
[`VerifySignature`](https://github.com/paritytech/polkadot-sdk/tree/master/substrate/frame/verify-signature).
I will use this extension as an example on how to replicate current `Signed` transaction
functionality in the new v5 extrinsic format, though the runtime logic is not constrained to this
particular implementation.

This extension leverages the new inherited implication functionality introduced in
`TransactionExtension` and creates a payload to be signed using the data of all extensions after
itself in the extension pipeline. This extension can be configured to accept a `MultiSignature`,
which makes it compatible with all signature types currently used in Polkadot.

In the context of using an extension such as `VerifySignature`, for example, to replicate current
`Signed` transaction functionality, the steps to generate the payload to be signed would be:

1. The extension version byte, call, extension and extension implicit should be encoded (by
   "extension" and its implicit we mean only the data associated with extensions that follow this
   one in the composite extension type);
2. The result of the encoding should then be hashed using the `BLAKE2_256` hasher;
3. The result of the hash should then be signed with the signature type specified in the extension definition.

```rust
// Step 1: encode the bytes
let encoded = (extension_version_byte, call, transaction_extension, transaction_extension_implicit).encode();
// Step 2: hash them
let payload = blake2_256(&encoded[..]);
// Step 3: sign the payload
let signature = keyring.sign(&payload[..]);
```

### Summary of changes in version 5

In order to minimize the number of changes to the extrinsic format version and also to help all
consumers downstream in the transition period between these extrinsic versions, we should:

- Remove the `Signed` variant starting with v5 extrinsics
- Add the `General` variant starting with v5 extrinsics
- Enable runtimes to support both v4 and v5 extrinsics

## Drawbacks

The metadata will have to accommodate two distinct extrinsic format versions at a given point in
time in order to provide the new functionality in a non-breaking way for users and tooling.

Although having to support multiple extrinsic versions in metadata involves extra work, the change
is ultimately an improvement to metadata and the extra functionality may be useful in other future
scenarios.

## Testing, Security, and Privacy

There is no impact on testing, security or privacy.

## Performance, Ergonomics, and Compatibility

This change makes the authorization through signatures configurable by runtime devs in version 5
extrinsics, as opposed to version 4 where the signing payload algorithm and signatures were
hardcoded. This moves the responsibility of ensuring proper authentication through
`TransactionExtension` to the runtime devs, but a sensible default which closely resembles the
present day behavior will be provided in `VerifySignature`.

### Performance

There is no performance impact.

### Ergonomics

Tooling will have to adapt to be able to tell which authorization scheme is used by a particular
transaction by decoding the extension and checking which particular `TransactionExtension` in the
pipeline is enabled to do the origin authorization. Previously, this was done by simply checking
whether the transaction is signed or unsigned, as there was only one method of authentication.

### Compatibility

As long as extrinsic version 4 is still exposed in the metadata when version 5 will be introduced,
the changes will not break existing infrastructure. This should give enough time for tooling to
support version 5 and to remove version 4 in the future.

## Prior Art and References

This is a result of the work in [Extrinsic
Horizon](https://github.com/paritytech/polkadot-sdk/issues/2415) and
[RFC99](https://github.com/polkadot-fellows/RFCs/blob/main/text/0099-transaction-extension-version.md).

## Unresolved Questions

None.

## Future Directions and Related Material

Following this change, extrinsic version 5 will be introduced as part of the [Extrinsic
Horizon](https://github.com/paritytech/polkadot-sdk/issues/2415) effort, which will shape future
work.
