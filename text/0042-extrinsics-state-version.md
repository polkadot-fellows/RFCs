# RFC-0042: Add Extrinsic State version to `RuntimeVersion`

|                 |                                               |
|-----------------|-----------------------------------------------|
| **Start Date**  | 25th October 2023                             |
| **Description** | Add extrinsic state version to RuntimeVersion |
| **Authors**     | Vedhavyas Singareddi                          |

## Summary

At the moment, extrinsics root is derived using `StateVersion::V0` without the possibility to use different version
unlike storage state version.
It would be useful for projects like `Subspace` to make extrinsics state version be part of the `RuntimeVersion`.

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
object. The state version, if introduced, will fallback
to using `StateVersion::V0` for runtimes with `CoreApi` version <=4
and projects using `CoreApi` >= 5 will have the ability to pick State version they would like to use.

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
		state_version: 1,
		extrinsic_state_version: 0,
	};
```

## Drawbacks

Since the `CoreApi` version would need to be bumped, there would require a Runtime upgrade for existing projects
with `extrinsic_state_version` set to `0` so that it wont brick their chain. New projects can choose between `0` or `1`
depending on their use-case.

## Testing, Security, and Privacy

Care should be taken when Decoding `RuntimeVersion` with `CoreApi` <=4 since this field is not available and
documentation clear enough to indicate existing projects to continue using `StateVersion::V0` as before. This change,
AFAIK, should not have any impact on the security or privacy.

## Performance, Ergonomics, and Compatibility

Since this change introduces a new field to `RuntimeVersion`, it will be unavailable in previous Runtimes and as result,
should always fallback to `StateVersion::V0`.

### Performance

I do not believe there is any performance hit with this change.

### Ergonomics

This does not break any exposed Apis.

### Compatibility

It does break compatibility with older runtimes and, as a result, Decoding of embed runtime version should consider
using `CoreApi` version to decode this field or fallback to `StateVersion::V0`.

## Prior Art and References

We [proposed](https://github.com/paritytech/polkadot-sdk/pull/1691) introducing a similar change by introducing a
parameter to `frame_system::Config` but did not feel that
is the correct way of introducing this change.

## Unresolved Questions

I do not have any specific questions about this change at the moment.

## Future Directions and Related Material

IMO, this change is pretty self-contained and there won't be any future work necessary. 
