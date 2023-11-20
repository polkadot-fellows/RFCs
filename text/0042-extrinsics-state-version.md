# RFC-0042: Add System version that replaces StateVersion on RuntimeVersion

|                 |                                             |
|-----------------|---------------------------------------------|
| **Start Date**  | 25th October 2023                           |
| **Description** | Add System Version and remove State Version |
| **Authors**     | Vedhavyas Singareddi                        |

## Summary

At the moment, we have `system_version` field on `RuntimeVersion` that derives which state version is used for the
Storage.
We have a use case where we want extrinsics root is derived using `StateVersion::V1`. Without defining a new field
under `RuntimeVersion`,
we would like to propose adding `system_version` that can be used to derive both storage and extrinsic state version.

## Motivation

Since the extrinsic state version is always `StateVersion::V0`, deriving extrinsic root requires full extrinsic data.
For `Subspace` project, we have an enshrined rollups called `Domain` with optimistic verification and Fraud proofs are
used to detect malicious behavior.
One of the `Fraud proof` variant is to derive `Domain` block extrinsic root on `Subspace`'s consensus chain.
Since `StateVersion::V0` requires full extrinsic data, we are forced to pass all the extrinsics through the Fraud proof.
One of the main challenge here is some extrinsics could be big enough that this variant of Fraud proof may not be
included in the Consensus block due to Block's weight restriction.
If the extrinsic root is derived using `StateVersion::V1`, then we do not need to pass the full extrinsic data but
rather at maximum, 32 byte of extrinsic data.

## Stakeholders

- Technical Fellowship, in its role of maintaining system runtimes.

## Explanation

In order to use project specific StateVersion for extrinsic roots, we proposed
an [implementation](https://github.com/paritytech/polkadot-sdk/pull/1691) that introduced
parameter to `frame_system::Config` but that unfortunately did not feel correct.
So we would like to [propose](https://github.com/paritytech/polkadot-sdk/pull/1968) adding this change to
the `RuntimeVersion`
object. The system version, if introduced, will be used to derive both storage and extrinsic state version.
If system version is `0`, then both Storage and Extrinsic State version would use V0.
If system version is `1`, then Storage State version would use V1 and Extrinsic State version would use V0.
If system version is `2`, then both Storage and Extrinsic State version would use V1.

If implemented, the new `RuntimeVersion` definition would look something similar to

```rust
/// Runtime version (Rococo).
#[sp_version::runtime_version]
pub const VERSION: RuntimeVersion = RuntimeVersion {
		spec_name: create_runtime_str!("rococo"),
		impl_name: create_runtime_str!("parity-rococo-v2.0"),
		authoring_version: 0,
		spec_version: 10020,
		impl_version: 0,
		apis: RUNTIME_API_VERSIONS,
		transaction_version: 22,
		system_version: 1,
	};
```

## Drawbacks

There should be no drawbacks as it would replace `state_version` with same behavior but documentation should be updated
so that chains know which `system_version` to use.

## Testing, Security, and Privacy

AFAIK, should not have any impact on the security or privacy.

## Performance, Ergonomics, and Compatibility

These changes should be compatible for existing chains if they use `state_version` value for `system_verision`.

### Performance

I do not believe there is any performance hit with this change.

### Ergonomics

This does not break any exposed Apis.

### Compatibility

This change should not break any compatibility.

## Prior Art and References

We [proposed](https://github.com/paritytech/polkadot-sdk/pull/1691) introducing a similar change by introducing a
parameter to `frame_system::Config` but did not feel that
is the correct way of introducing this change.

## Unresolved Questions

I do not have any specific questions about this change at the moment.

## Future Directions and Related Material

IMO, this change is pretty self-contained and there won't be any future work necessary. 
