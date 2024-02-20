# RFC-0077: Increase maximum length of identity PGP fingerprint values from 20 bytes

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 20 Feb 2024                                                                                 |
| **Description** | Increase the maximum length of identity PGP fingerprint values from 20 bytes                |
| **Authors**     | Luke Schoen                                                                                 |

## Summary

This proposes to increase the maximum length of PGP Fingerprint values from a 20 bytes/chars limit to a 40 bytes/chars limit.

## Motivation

### Background

Pretty Good Privacy (PGP) Fingerprints are shorter versions of their corresponding Public Key that may be printed on a business card.

They may be used by someone to validate the correct corresponding Public Key.

It should be possible to add PGP Fingerprints to Polkadot on-chain identities.

GNU Privacy Guard (GPG) is compliant with PGP and the two acronyms are used interchangeably.

### Problem

If you want to set a Polkadot on-chain identity, users may provide a PGP Fingerprint value in the "pgfingerprint" field, which may be longer than 20 bytes/chars (e.g. PGP Fingerprints are 40 bytes/chars long), however that field can only store a maximum length of 20 bytes/chars of information.

Possible disadvantages of the current 20 bytes/chars limitation:
* Discourages users from using the "pgfingerprint" field.
* Discourages users from using Polkadot on-chain identities for Web2 and Web3 dApp software releases where the latest "pgfingerprint" field could be used to verify the correct PGP Fingerprint that has been used to sign the software releases so users that download the software know that it was from a trusted source.
* Encourages dApps to link to Web2 sources to allow their users verify the correct fingerprint associated with software releases, rather than to use the Web3 Polkadot on-chain identity "pgfingerprint" field of the releaser of the software, since it may be the case that the "pgfingerprint" field of most on-chain identities is not widely used due to the maximum length of 20 bytes/chars restriction.
* Discourages users from setting an on-chain identity by creating an extrinsic using Polkadot.js with `identity` > `setIdentity(info)`, since if they try to provide their 40 character long PGP Fingerprint or GPG Fingerprint, which is longer than the maximum length of 20 bytes/chars, they will encounter an error.
* Discourages users from using on-chain Web3 registrars to judge on-chain identity fields, where the shortest value they are able to generate for a "pgfingerprint" is not less than or equal to the maximum length of 20 bytes.

Note: The "pgfingerprint" field should probably be spelt "pgpfingerprint" in Polkadot.js.

### Solution Requirements

The maximum length of identity PGP Fingerprint values should be increased from the current 20 bytes/chars limit at least a 40 bytes/chars limit to support PGP Fingerprints and GPG Fingerprints.

## Stakeholders

* Any Polkadot account holder wishing to use a Polkadot on-chain identity for their:
  * PGP Fingerprints that are longer than 32 characters
  * GPG Fingerprints that are longer than 32 characters

## Explanation

If a user tries to setting an on-chain identity by creating an extrinsic using Polkadot.js with `identity` > `setIdentity(info)`, then if they try to provide their 40 character long PGP Fingerprint or GPG Fingerprint, which is longer than the maximum length of 20 bytes/chars `[u8;20]`, then they will encounter this error:
```
createType(Call):: Call: failed decoding identity.setIdentity:: Struct: failed on args: {...}:: Struct: failed on pgpFingerprint: Option<[u8;20]>:: Expected input with 20 bytes (160 bits), found 40 bytes
```

Increasing maximum length of identity PGP Fingerprint values from the current 20 bytes/chars limit to at least a 40 bytes/chars limit would overcome these errors and support PGP Fingerprints and GPG Fingerprints, satisfying the solution requirements.

## Drawbacks

No drawbacks have been identified.

## Testing, Security, and Privacy

Implementations would be tested for adherance by checking that 40 bytes/chars PGP Fingerprints are supported.

No effect on security or privacy has been identified than already exists.

No implementation pitfalls have been identified.

## Performance, Ergonomics, and Compatibility

### Performance

It would be an optimization, since the associated exposed interfaces to developers and end-users could start being used.

To minimize additional overhead the proposal suggests a 40 bytes/chars limit since that would at least provide support for PGP Fingerprints, satisfying the solution requirements.

### Ergonomics

No potential ergonomic optimizations have been identified. 

### Compatibility

Updates to Polkadot.js Apps, API and its documentation and those referring to it may be required.

## Prior Art and References

No prior articles or references.

## Unresolved Questions

No further questions at this stage.

## Future Directions and Related Material

Relates to RFC entitled "Increase maximum length of identity raw data values from 32 bytes".
