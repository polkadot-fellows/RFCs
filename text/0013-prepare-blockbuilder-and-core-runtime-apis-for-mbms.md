# RFC-0013: Prepare `Core` runtime API for MBMs

|                 |                                                                             |
| --------------- | --------------------------------------------------------------------------- |
| **Start Date**  | July 24, 2023 |
| **Description** | Prepare the `Core` Runtime API for Multi-Block-Migrations |
| **Authors**     | Oliver Tale-Yazdi |

## Summary

Introduces breaking changes to the `Core` runtime API by letting `Core::initialize_block` return an enum. The versions of `Core` is bumped from 4 to 5.

## Motivation

The main feature that motivates this RFC are Multi-Block-Migrations (MBM); these make it possible to split a migration over multiple blocks.  
Further it would be nice to not hinder the possibility of implementing a new hook `poll`, that runs at the beginning of the block when there are no MBMs and has access to `AllPalletsWithSystem`. This hook can then be used to replace the use of `on_initialize` and `on_finalize` for non-deadline critical logic.  
In a similar fashion, it should not hinder the future addition of a `System::PostInherents` callback that always runs after all inherents were applied.

## Stakeholders

- Substrate Maintainers: They have to implement this, including tests, audit and
  maintenance burden.
- Polkadot Runtime developers: They will have to adapt the runtime files to this breaking change.
- Polkadot Parachain Teams: They have to adapt to the breaking changes but then eventually have
  multi-block migrations available.

## Explanation


### `Core::initialize_block`

This runtime API function is changed from returning `()` to `ExtrinsicInclusionMode`:

```patch
fn initialize_block(header: &<Block as BlockT>::Header)
+  -> ExtrinsicInclusionMode;
```

With `ExtrinsicInclusionMode` is defined as:

```rust
enum ExtrinsicInclusionMode {
  /// All extrinsics are allowed in this block.
  AllExtrinsics,
  /// Only inherents are allowed in this block.
  OnlyInherents,
}
```

A block author MUST respect the `ExtrinsicInclusionMode` that is returned by `initialize_block`. The runtime MUST reject blocks that have non-inherent extrinsics in them while `OnlyInherents` was returned.

Coming back to the motivations and how they can be implemented with this runtime API change:  

**1. Multi-Block-Migrations**: The runtime is being put into lock-down mode for the duration of the migration process by returning `OnlyInherents` from `initialize_block`. This ensures that no user provided transaction can interfere with the migration process. It is absolutely necessary to ensure this, otherwise a transaction could call into un-migrated storage and violate storage invariants.

**2. `poll`** is possible by using `apply_extrinsic` as entry-point and not hindered by this approach. It would not be possible to use a pallet inherent like `System::last_inherent` to achieve this for two reasons: First is that pallets do not have access to `AllPalletsWithSystem` which is required to invoke the `poll` hook on all pallets. Second is that the runtime does currently not enforce an order of inherents. 

**3. `System::PostInherents`** can be done in the same manner as `poll`.

## Drawbacks

The previous drawback of cementing the order of inherents has been addressed and removed by redesigning the approach. No further drawbacks have been identified thus far.

## Testing, Security, and Privacy

The new logic of `initialize_block` can be tested by checking that the block-builder will skip transactions when `OnlyInherents` is returned.

Security: n/a

Privacy: n/a

## Performance, Ergonomics, and Compatibility

### Performance

The performance overhead is minimal in the sense that no clutter was added after fulfilling the
requirements. The only performance difference is that `initialize_block` also returns an enum that needs to be passed through the WASM boundary. This should be negligible.

### Ergonomics

The new interface allows for more extensible runtime logic. In the future, this will be utilized for
multi-block-migrations which should be a huge ergonomic advantage for parachain developers.

### Compatibility

The advice here is OPTIONAL and outside of the RFC. To not degrade
user experience, it is recommended to ensure that an updated node can still import historic blocks.

## Prior Art and References

The RFC is currently being implemented in [polkadot-sdk#1781](https://github.com/paritytech/polkadot-sdk/pull/1781) (formerly [substrate#14275](https://github.com/paritytech/substrate/pull/14275)). Related issues and merge
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
~~=> renamed to `last_inherent`~~

## Future Directions and Related Material

The long-term future here is to move the block building logic into the runtime. Currently there is a tight dance between the block author and the runtime; the author has to call into different runtime functions in quick succession and exact order. Any misstep causes the block to be invalid.  
This can be unified and simplified by moving both parts into the runtime.
