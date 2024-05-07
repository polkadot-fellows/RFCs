# RFC-0048: Generate ownership proof for `SessionKeys`

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 13 November 2023                                                                    |
| **Description** | Change `SessionKeys` runtime api to support generating an ownership proof for the on chain registration. |
| **Authors**     | Bastian Köcher                                                                    |

## Summary

This RFC proposes to changes the `SessionKeys::generate_session_keys` runtime api interface. This runtime api is used by validator operators to
generate new session keys on a node. The public session keys are then registered manually on chain by the validator operator. 
Before this RFC it was not possible by the on chain logic to ensure that the account setting the public session keys is also in 
possession of the private session keys. To solve this the RFC proposes to pass the account id of the account doing the 
registration on chain to `generate_session_keys`. Further this RFC proposes to change the return value of the `generate_session_keys` 
function also to not only return the public session keys, but also the proof of ownership for the private session keys. The 
validator operator will then need to send the public session keys and the proof together when registering new session keys on chain.

## Motivation

When submitting the new public session keys to the on chain logic there doesn't exist any verification of possession of the private session keys.
This means that users can basically register any kind of public session keys on chain. While the on chain logic ensures that there are 
no duplicate keys, someone could try to prevent others from registering new session keys by setting them first. While this wouldn't bring
the "attacker" any kind of advantage, more like disadvantages (potential slashes on their account), it could prevent someone from 
e.g. changing its session key in the event of a private session key leak.

After this RFC this kind of attack would not be possible anymore, because the on chain logic can verify that the sending account 
is in ownership of the private session keys.

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
key signing the `account_id`. The actual type of each signature depends on the
corresponding session key cryptographic algorithm. The order of the signatures in 
the `proof` is the same as the order of the session keys in the `SessionKeys` type 
declared in the runtime.

The version of the `SessionKeys` needs to be bumped to `1` to reflect the changes to the 
signature of `SessionKeys_generate_session_keys`:
```rust
pub struct OpaqueGeneratedSessionKeys {
	pub keys: Vec<u8>,
	pub proof: Vec<u8>,
}

fn SessionKeys_generate_session_keys(account_id: Vec<u8>, seed: Option<Vec<u8>>) -> OpaqueGeneratedSessionKeys;
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

Testing of the new changes only requires passing an appropriate `owner` for the current testing context. 
The changes to the proof generation and verification got audited to ensure they are correct.

## Performance, Ergonomics, and Compatibility

### Performance

The session key generation is an offchain process and thus, doesn't influence the performance of the 
chain. Verifying the proof is done on chain as part of the transaction logic for setting the session keys. 
The verification of the proof is a signature verification number of individual session keys times. As setting
the session keys is happening quite rarely, it should not influence the overall system performance.

### Ergonomics

The interfaces have been optimized to make it as easy as possible to generate the ownership proof.

### Compatibility

Introduces a new version of the `SessionKeys` runtime api. Thus, nodes should be updated before 
a runtime is enacted that contains these changes otherwise they will fail to generate session keys. 
The RPC that exists around this runtime api needs to be updated to support passing the account id 
and for returning the ownership proof alongside the public session keys.

UIs would need to be updated to support the new RPC and the changed on chain logic.

## Prior Art and References

None.

## Unresolved Questions

None.

## Future Directions and Related Material

Substrate implementation of the [RFC](https://github.com/paritytech/polkadot-sdk/pull/1739).
