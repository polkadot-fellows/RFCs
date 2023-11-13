# RFC-0048: Generate ownership proof for `SessionKeys`

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 13 November 2023                                                                    |
| **Description** | Change `SessionKeys` runtime api to also create a proof of ownership for on chain registration. |
| **Authors**     | Bastian Köcher                                                                    |

## Summary

When rotating/generating the `SessionKeys` of a node, the node calls into the runtime using the 
`SessionKeys::generate_session_keys` runtime api. This runtime api function needs to be changed
to add an extra parameter `owner` and to change the return value to also include the `proof` of 
ownership. The `owner` should be the account id of the account setting the `SessionKeys` on chain 
to allow the on chain logic the verification of the proof. The on chain logic is then able to proof 
the possession of the private keys of the `SessionKeys` using the `proof`.

## Motivation

When a user sets new `SessionKeys` on chain the chain can currently not ensure that the user 
actually has control over the private keys of the `SessionKeys`. With the RFC applied the chain is able 
to ensure that the user actually is in possession of the private keys.

## Stakeholders

- Polkadot runtime implementors
- Polkadot node implementors
- Validator operators

## Explanation

We are first going to explain the `proof` format being used:
```rust
type Proof = (Signature, Signature, ..);
```

The `proof` being a SCALE encoded tuple over all signatures of each private session 
key signing the `owner`. The actual type of each signature depends on the
corresponding session key cryptographic algorithm. The order of the signatures in 
the `proof` is the same as the order of the session keys in the `SessionKeys` type.

The version of the `SessionKeys` needs to be bumped to `1` to reflect the changes to the 
signature of `SessionKeys_generate_session_keys`:
```rust
pub struct OpaqueGeneratedSessionKeys {
	pub keys: Vec<u8>,
	pub proof: Vec<u8>,
}

fn SessionKeys_generate_session_keys(owner: Vec<u8>, seed: Option<Vec<u8>>) -> OpaqueGeneratedSessionKeys;
```

The default calling convention for runtime apis is applied, meaning the parameters 
passed as SCALE encoded array and the length of the encoded array. The return value 
being the SCALE encoded return value as `u64` (`array_ptr | length << 32`). So, the 
actual exported function signature looks like:
```rust
fn SessionKeys_generate_session_keys(array: *const u8, len: usize) -> u64;
```

The on chain logic for setting the `SessionKeys` needs to be changed as well. It
already gets the `proof` passed as `Vec<u8>`. This `proof` needs to be decoded to
the actual `Proof` type as explained above. The `proof` and the SCALE encoded
`account_id` of the sender are used to verify the ownership of the `SessionKeys`.

## Drawbacks

Validator operators need to pass the their account id when rotating their session keys in a node. 
This will require updating some high level docs and making users familiar with the slightly changed ergonomics.

## Testing, Security, and Privacy

Testing of the new changes is quite easy as it only requires passing an appropriate `owner` 
for the current testing context. The changes to the proof generation and verification got 
audited to ensure they are correct.

## Performance, Ergonomics, and Compatibility

### Performance

Does not have any impact on the overall performance, only setting `SessionKeys` will require more weight.

### Ergonomics

If the proposal alters exposed interfaces to developers or end-users, which types of usage patterns have been optimized for?

### Compatibility

Introduces a new version of the `SessionKeys` runtime api. Thus, nodes should be updated before 
a runtime is enacted that contains these changes otherwise they will fail to generate session keys.

## Prior Art and References

None.

## Unresolved Questions

None.

## Future Directions and Related Material

Substrate implementation of the [RFC](https://github.com/paritytech/polkadot-sdk/pull/1739).
