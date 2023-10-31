# RFC-0013: Prepare `BlockBuilder` and `Core` runtime APIs for MBMs

|                 |                                                                             |
| --------------- | --------------------------------------------------------------------------- |
| **Start Date**  | July 24, 2023 |
| **Description** | Prepare the `BlockBuilder` and `Core` Runtime APIs for Multi-Block-Migrations. |
| **Authors**     | Oliver Tale-Yazdi |

## Summary

Introduces breaking changes to the `BlockBuilder` and `Core` runtime APIs.  
A new function `BlockBuilder::last_inherent` is introduced and the return value of `Core::initialize_block` is changed to an enum.  
The versions of both APIs are bumped; `BlockBuilder` to 7 and `Core` to 5.

## Motivation

There are three main features that motivate for this RFC:
1. Multi-Block-Migrations: These make it possible to split a migration over multiple blocks.
2. Pallet `poll` hook: Can be used to gradually replace `on_initialize`/`on_finalize` in places where the code does not need to run by a hard deadline, since it is not guaranteed to execute each block.
3. New callback `System::PostInherents`: Can replace `on_initialize`/`on_finalize` where a hard deadline is required (complements `poll`). It is guaranteed to execute each block.

These three features can be implemented when fulfilling these two requirements:
1. The runtime can tell the block author to not include any transactions in the block.
2. The runtime can execute logic right after all pallet-provided inherents have been applied.

## Stakeholders

- Substrate Maintainers: They have to implement this, including tests, audit and
  maintenance burden.
- Polkadot Runtime developers: They will have to adapt the runtime files to this breaking change.
- Polkadot Parachain Teams: They also have to adapt to the breaking changes but then eventually have
  multi-block migrations available.

## Explanation


### `Core::initialize_block`

This runtime API function is changed from returning `()` to `ExtrinsicInclusionMode`:
```rust
enum ExtrinsicInclusionMode {
  /// All extrinsics are allowed in this block.
  AllExtrinsics,
  /// Only inherents are allowed in this block.
  OnlyInherents,
}
```

A block author MUST respect the `ExtrinsicInclusionMode` that is returned by `initialize_block`. The runtime MAY reject blocks that violate this requirement. 

It is RECOMMENDED that block authors keep transactions in their transaction pool (if applicable)
for as long as `initialize_block` returns `OnlyInherents`. The assumption is that these transactions become valid once the runtime finishes the MBM.  
Backwards compatibility with the current runtime API SHOULD be implemented by block authors to not mandate a lockstep update of the authoring software.  
This could be achieved by checking the runtime API version and assuming that `initialize_block` does not have a return value when the version is lower than 7.

### `BlockBuilder::last_inherent`

A block author MUST always invoke `last_inherent` directly after applying all runtime-provided inherents. The runtime MAY reject blocks that violate this requirement.

### Combined

Coming back to the three main features and how they can be implemented with these runtime APIs changes:

**1. Multi-Block-Migrations**: The runtime is being put into lock-down mode for the duration of the migration process by returning `OnlyInherents` from `initialize_block`. This ensures that no user provided transaction can interfere with the migration process. It is absolutely necessary to ensure this, since otherwise a transaction could call into un-migrated storage and violate storage invariants. The entry-point for the MBM logic is `last_inherent`. This is a good spot, because any data that is touched in inherents, is not MBM-migratable anyway. It could also be done before all other inherents or at the end of the block in `finalize_block`, but there is no downside from doing it in `last_inherent` and the other two features are in favour of this.

**2. `poll`** becomes possible by using `last_inherent` as entry-point. It would not be possible to use a pallet inherent like `System::last_inherent` to achieve this for two reasons. First is that pallets do not have access to `AllPalletsWithSystem` that is required to invoke the `poll` hook on all pallets. Second is that the runtime does currently not enforce an order of inherents. 

**3. `System::PostInherents`** can be done in the same manner as `poll`.

## Drawbacks

As noted in the review comments: this cements some assumptions about the order of inherents into the `BlockBuilder` traits. It was criticized for being to rigid in its assumptions.

## Testing, Security, and Privacy

Compliance of a block author can be tested by adding specific code to the `last_inherent` hook and
checking that it always executes. The new logic of `initialize_block` can be tested by checking that
the block-builder will skip transactions and optional hooks when `OnlyInherents` is returned.  

Security: n/a

Privacy: n/a

## Performance, Ergonomics, and Compatibility

### Performance

The performance overhead is minimal in the sense that no clutter was added after fulfilling the
requirements. A slight performance penalty is expected from invoking
`last_inherent` once per block.

### Ergonomics

The new interface allows for more extensible runtime logic. In the future, this will be utilized for
multi-block-migrations which should be a huge ergonomic advantage for parachain developers.

### Compatibility

The advice here is OPTIONAL and outside of the RFC. To not degrade
user experience, it is recommended to ensure that an updated node can still import historic blocks.

## Prior Art and References

The RFC is currently being implemented in [polkadot-sdk#1781](https://github.com/paritytech/polkadot-sdk/pull/1781). Related issues and merge
requests:
- [Simple multi block migrations](https://github.com/paritytech/substrate/pull/14275)
- [Execute a hook after inherent but before
  transactions](https://github.com/paritytech/substrate/issues/9210)
- [There is no module hook after inherents and before
  transactions](https://github.com/paritytech/substrate/issues/5757)


## Unresolved Questions

~~Please suggest a better name for `BlockExecutiveMode`. We already tried: `RuntimeExecutiveMode`,
`ExtrinsicInclusionMode`. The names of the modes `Normal` and `Minimal` were also called
`AllExtrinsics` and `OnlyInherents`, so if you have naming preferences; please post them.~~  
=> renamed to `ExtrinsicInclusionMode`

~~Is `post_inherents` more consistent instead of `last_inherent`? Then we should change it.~~  
=> renamed to `last_inherent`

## Future Directions and Related Material

The long-term future here is to move the block building logic into the runtime. Currently there is a tight dance between the block author and the runtime; the author has to call into different runtime functions in quick succession and exact order. Any misstep causes the built block to be invalid.  
This can be unified and simplified by moving both parts of the logic into the runtime.
