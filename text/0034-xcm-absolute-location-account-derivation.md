# RFC-34: XCM Absolute Location Account Derivation

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 05 October 2023                                                                             |
| **Description** | XCM Absolute Location Account Derivation                                                    |
| **Authors**     | Gabriel Facco de Arruda                                                                     |

## Summary

This RFC proposes a change to the `WithComputedOrigin` XCM barrier and a backwards-compatible change to the `DescribeFamily` MultiLocation descriptor with the end goal of enabling the use of Universal Locations for XCM MultiLocation to AccountId conversion, which allows the use of absolute locations to maintain the same derivation result in any runtime, regardless of its position in the family hierarchy.

## Motivation

These changes would allow protocol builders to leverage absolute locations to maintain the exact same derived account address across alls network in the ecosystem, thus enhancing user experience.

One such protocol, that is the original motivation for this proposal, is InvArch's Saturn Multisig, which gives users a unifying multisig and DAO experience across all XCM connected chains.

## Stakeholders

- Ecosystem developers

## Explanation

This proposal requires the modification of two XCM types defined in the `xcm-builder` crate: The `WithComputedOrigin` barrier and the `DescribeFamily` MultiLocation descriptor.

This proposal will go through the actual code changes that should be made, however the code provided will only serve to illustrate the goal of the changes and the actual implementation code is subject to further discussions.

#### WithComputedOrigin

The `WtihComputedOrigin` barrier serves as a wrapper around other barriers, consuming origin modification instructions and applying them to the message origin before passing to the inner barriers. One of the origin modifying instructions is `UniversalOrigin`, which serves the purpose of signaling that the origin should be a Universal Origin that represents the location as an absolute path with the interior prefixed by the `GlobalConsensus` junction.

The change that needs to be made here is to remove the current relative location conversion that is made and replace it with an absolute location, represented as `{ parents: 2, interior: [GlobalConsensus(...), ...] }`.

```diff
pub struct WithComputedOrigin<InnerBarrier, LocalUniversal, MaxPrefixes>(
	PhantomData<(InnerBarrier, LocalUniversal, MaxPrefixes)>,
);
impl<
		InnerBarrier: ShouldExecute,
		LocalUniversal: Get<InteriorMultiLocation>,
		MaxPrefixes: Get<u32>,
	> ShouldExecute for WithComputedOrigin<InnerBarrier, LocalUniversal, MaxPrefixes>
{
	fn should_execute<Call>(
		origin: &MultiLocation,
		instructions: &mut [Instruction<Call>],
		max_weight: Weight,
		properties: &mut Properties,
	) -> Result<(), ProcessMessageError> {
		log::trace!(
			target: "xcm::barriers",
			"WithComputedOrigin origin: {:?}, instructions: {:?}, max_weight: {:?}, properties: {:?}",
			origin, instructions, max_weight, properties,
		);
		let mut actual_origin = *origin;
		let skipped = Cell::new(0usize);
		// NOTE: We do not check the validity of `UniversalOrigin` here, meaning that a malicious
		// origin could place a `UniversalOrigin` in order to spoof some location which gets free
		// execution. This technical could get it past the barrier condition, but the execution
		// would instantly fail since the first instruction would cause an error with the
		// invalid UniversalOrigin.
		instructions.matcher().match_next_inst_while(
			|_| skipped.get() < MaxPrefixes::get() as usize,
			|inst| {
				match inst {
					UniversalOrigin(new_global) => {
-						// Note the origin is *relative to local consensus*! So we need to escape
-						// local consensus with the `parents` before diving in into the
-						// `universal_location`.
-						actual_origin = X1(*new_global).relative_to(&LocalUniversal::get());
+                        // Grab the GlobalConsensus junction of LocalUniversal.
+                        if let Ok(this_global) = LocalUniversal::get().global_consensus() {
+                            // Error if requested GlobalConsensus is not this location's GlobalConsensus.
+                            if *new_global != this_global.into() {
+                                return Err(ProcessMessageError::Unsupported);
+                            }
+
+                            // Build a location with 2 parents.
+                            actual_origin = MultiLocation::grandparent()
+                                // Start the interior with the GLobalConsensus junction.
+                                .pushed_front_with_interior(this_global)
+                                .map_err(|_| ProcessMessageError::Unsupported)?
+                                // Finish the interior with the remainder.
+                                .appended_with(actual_origin)
+                                .map_err(|_| ProcessMessageError::Unsupported)?;
+                        }
					},
					DescendOrigin(j) => {
						let Ok(_) = actual_origin.append_with(*j) else {
							return Err(ProcessMessageError::Unsupported)
						};
					},
					_ => return Ok(ControlFlow::Break(())),
				};
				skipped.set(skipped.get() + 1);
				Ok(ControlFlow::Continue(()))
			},
		)?;
		InnerBarrier::should_execute(
			&actual_origin,
			&mut instructions[skipped.get()..],
			max_weight,
			properties,
		)
	}
}
```

#### DescribeFamily

The `DescribeFamily` location descriptor is part of the `HashedDescription` MultiLocation hashing system and exists to describe locations in an easy format for encoding and hashing, so that an AccountId can be derived from this MultiLocation.

The change that's needed in the `DescribeFamily` type is the inclusion of a match arm for absolute locations with the structure `{ parents: 2, interior: [GlobalConsensus(...), Parachain(...), ...] }`.

```diff
pub struct DescribeFamily<DescribeInterior>(PhantomData<DescribeInterior>);
impl<Suffix: DescribeLocation> DescribeLocation for DescribeFamily<Suffix> {
	fn describe_location(l: &MultiLocation) -> Option<Vec<u8>> {
		match (l.parents, l.interior.first()) {
			(0, Some(Parachain(index))) => {
				let tail = l.interior.split_first().0;
				let interior = Suffix::describe_location(&tail.into())?;
				Some((b"ChildChain", Compact::<u32>::from(*index), interior).encode())
			},
			(1, Some(Parachain(index))) => {
				let tail = l.interior.split_first().0;
				let interior = Suffix::describe_location(&tail.into())?;
				Some((b"SiblingChain", Compact::<u32>::from(*index), interior).encode())
			},
			(1, _) => {
				let tail = l.interior.into();
				let interior = Suffix::describe_location(&tail)?;
				Some((b"ParentChain", interior).encode())
			},
+            // Absolute location.
+            (2, Some(GlobalConsensus(network_id))) => {
+                let tail = l.interior.split_first().0;
+                match tail.first() {
+                    // Second junction is a Parachain.
+                    Some(Parachain(index)) => {
+                        let tail = tail.split_first().0;
+                        let interior = Suffix::describe_location(&tail.into())?;
+                        Some(
+                            (
+                                b"GlobalConsensus",
+                                *network_id, // First prefix is the GlobalConsensus.
+                                b"Parachain",
+                                Compact::<u32>::from(*index), // Second prefix is the parachain.
+                                interior, // Suffixed with the tail.
+                            )
+                                .encode(),
+                        )
+                    }
                    _ => return None,
                }
            }
			_ => return None,
		}
	}
}
```

## Drawbacks

No drawbacks have been identified with this proposal.

## Testing, Security, and Privacy

Tests can be done using simple unit tests, as this is not a change to XCM itself but rather to types defined in `xcm-builder`.

Security considerations should be taken with the implementation to make sure no unwanted behavior is introduced.

This proposal does not introduce any privacy considerations.

## Performance, Ergonomics, and Compatibility

### Performance

Depending on the final implementation, this proposal should not introduce much overhead to performance.

### Ergonomics

This proposal introduces a new path in `DescribeFamily` for absolute locations, thus allowing for more protocols to be built around XCM. The ergonomics of this change follow how the rest ofthe type is implemented.

### Compatibility

Backwards compatibility is unchanged for `DescribeFamily`, as changing it's implemented match arms should never happen, this proposal instead introduces a new match arm.

The changes to the `WithComputedOrigin` barrier affect how `UniversalOrigin` computes the origin, but with the changes made to `DescribeFamily` this should have a lesser impact.

## Prior Art and References

- `DescirbeFamily` type: https://github.com/paritytech/polkadot-sdk/blob/master/polkadot/xcm/xcm-builder/src/location_conversion.rs#L122
- `WithComputedOrigin` type: https://github.com/paritytech/polkadot-sdk/blob/master/polkadot/xcm/xcm-builder/src/barriers.rs#L153

## Unresolved Questions

Implementation details and overall code is still up to discussion, the proposal suggests code to base discussions on.
