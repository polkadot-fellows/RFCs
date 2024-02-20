# RFC-0076: Increase maximum length of identity raw data values from 32 bytes

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 20 Feb 2024                                                                                 |
| **Description** | Increase the maximum length of identity raw data values from 32 bytes                       |
| **Authors**     | Luke Schoen                                                                                 |

## Summary

This proposes to increase the maximum length of identity raw data values from a 32 bytes/chars limit to either a 64 bytes/chars limit or a 128 bytes/chars limit.

## Motivation

### Background

At the moment if you upload a file and pin it to IPFS storage you get an IPFS Content Identifier (CID), which is the unique ID of the file in the IPFS Network. That CID may be used to retrieve the file again via a standard IPFS interface and gateway from anywhere.

CIDs are reasonably short regardless of the size the underlying content and are based on the cryptographic hash of the content.

IPFS providers may default to using and recommending using CIDv1 [0] when using SHA256 generates a CID 46 bytes long, rather than CIDv0 [0] that generates a CID 59 bytes long, however CIDv0 may be be the preferred choice for minting and storing NFTs on-chain since it is cheaper.

Further, the URI protocol + CID for CIDv0 (ipfs://Qm...) will be 7+46=53 chars while for CIDv1 (ipfs://baf...) it will be 7+59=66 chars [1], so neither CIDv0 nor CIDv1 have a CID that supports a maximum length of 32 bytes, which exceeds the maximum 32 bytes/chars limit for bytes/string fields of their Polkadot on-chain identity.

### Problem

If you want to set a Polkadot on-chain identity, users may provide raw data values of their email address "email" field, which may be longer than 32 bytes/chars (e.g. abcdefghijklmnopqrstuvwxyz@me.com or longer), and either just a CID or the URI protocol + CID associated with a legal document, as the value of the "legal" field, and the URI protocol + CID associated with the profile image to associated with their on-chain identity, as the value of the "image" field, however each field can only store a maximum length of 32 bytes/chars of information [3]. They may also want to set a custom value in the "additional" field, which currently only stores a maximum length of 32 bytes, since it currently has a [`FieldLimit`](https://github.com/paritytech/polkadot-sdk/blob/master/substrate/frame/identity/src/legacy.rs#L82C43-L82C53).

Possible disadvantages of the current 32 bytes/chars limitation:
* Discourages users from using on-chain Web3 storage providers instead of Web2 storage providers to link to their on-chain identity. For example, in my Decentralized Voices application [4], since it is not possible to proactively provide a link in my on-chain identity to the IPFS CID associated with Conflict of Interest document that has been signed for integration with dApps or immediate verification by interested parties, it would instead be necessary to reactively share that IPFS CID upon each individual request from interested parties. 
* Encourages users to use Web2 storage providers and URL shorteners that may result in a plethora of on-chain profiles that have dead links.
* Encourages dApps to use Web2 storage providers for their users, for example Polkassembly requesting users to upload a profile image that is stored in a Web2 storage provider rather than first defaulting to use the "image" field from their on-chain identity, since it may be the case that the "image" field of most on-chain identities is not widely used due to the maximum length of 32 bytes/chars restriction.
* Discourages users from setting an on-chain identity by creating an extrinsic using Polkadot.js with `identity` > `setIdentity(info)`, since if they try to provide their email address or website domain name that is longer than 32 characters, or try to use a IPFS CID, they will encounter an error.
* Discourages users from using on-chain Web3 registrars to judge on-chain identity fields, where the shortest value they are able to generate is not less than or equal to the maximum length of 32 bytes.

### Solution Requirements

The maximum length of identity raw data values should be increased from the current 32 bytes/chars limit at least a 59 bytes/chars limit (or a 66 bytes/chars limit) to support IPFS CIDs that are either CIDv0 or CIDv1.

They maximum length of "additional" field values should be increased by the same amount.


## Stakeholders

* Any Polkadot account holder wishing to use a Polkadot on-chain identity for their:
  * Email addresses that are longer than 32 characters
  * Website domain names that are longer than 32 characters
  * Files that are stored on the IPFS Network since associated CIDs are longer than 32 characters

## Explanation

If a user tries to setting an on-chain identity by creating an extrinsic using Polkadot.js with `identity` > `setIdentity(info)`, then if they try to provide an email address or a website domain name that is longer than 32 characters, or try to use the IPFS CID (which may be associated with a file such as a document or image), then they will encounter this error:
```
createType(Call):: Call: failed decoding identity.setIdentity:: Struct: failed on args: {...}:: Data.Raw values are limited to a maximum length of 32 bytes
```

Increasing maximum length of identity raw data values from the current 32 bytes/chars limit to at least a 59 bytes/chars limit (or a 66 bytes/chars limit) would overcome these errors and support IPFS CIDs that are either CIDv0 or CIDv1, satisfying the solution requirements.

Increasing the maximum length of "additional" field values would also overcome these errors and should be increased from the current 32 bytes/chars limit[`FieldLimit`](https://github.com/paritytech/polkadot-sdk/blob/master/substrate/frame/identity/src/legacy.rs#L82C43-L82C53) by the same amount.

## Drawbacks

### Performance

If Polkadot on-chain identities are able to store raw data values greater than the current maximum length of 32 bytes, then each identity may want to use the maximum (or more) amount of "additional" custom fields or more, which would impact storage and performance on the network.

## Testing, Security, and Privacy

Implementations would need to be tested for adherance by checking that IPFS CIDs that are either CIDv0 or CIDv1 are supported.

No effect on security or privacy has been identified than already exists.

No implementation pitfalls have been identified.

## Performance, Ergonomics, and Compatibility

### Performance

It would be an optimization, since the associated exposed interfaces to developers and end-users could start being used.

To minimize additional overhead the proposal suggests at least a 59 bytes/chars limit (or a 66 bytes/chars limit) since that would at least provide support for IPFS CIDs that are either CIDv0 or CIDv1, satisfying the solution requirements.

### Ergonomics

It alters exposed interfaces to developers and end-users since they will now be able to provide IPFS CIDs that are either CIDv0 or CIDv1 as the values of Polkadot on-chain identity raw data input fields. Optionally 66 bytes/chars limit could be established to optimise for the usage pattern end-users, since that may be more intuitive to them, as it would allow users to provide a link (e.g. URI protocol + CID) rather than just the CID.

### Compatibility

Updates to Polkadot.js Apps, API and its documentation and those referring to it may be required.

## Prior Art and References

### Prior Art

No prior articles.

### References

* [1](https://docs.ipfs.tech/concepts/content-addressing/#cid-versions)
* [2](https://cardano.stackexchange.com/questions/9144/why-nfts-on-cardano-use-ipfs-cidv0-instead-of-recommended-cidv1)
* [3](https://support.polkadot.network/support/solutions/articles/65000181981-how-to-set-and-clear-an-identity)
* [4](https://forum.polkadot.network/t/decentralized-voices-program-luke-schoen/6111/7?u=ltfschoen)

## Unresolved Questions

Why can't we increase the maximum length of Polkadot on-chain identity raw data values and the "additional" field limit from 32 bytes/chars to an even longer maximum length than proposed of 128 bytes/chars?

## Future Directions and Related Material

Relates to RFC entitled "Increase maximum length of identity PGP fingerprint values from 20 bytes".