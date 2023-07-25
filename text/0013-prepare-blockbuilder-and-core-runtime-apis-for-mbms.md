# RFC-0013: Prepare `BlockBuilder` and `Core` runtime API for MBMs

|                 |                                                                             |
| --------------- | --------------------------------------------------------------------------- |
| **Start Date**  | July 24, 2023 |
| **Description** | Prepare the `BlockBuilder` and `Core` Runtime APIs for Multi-Block-Migrations.|
| **Authors**     | Oliver Tale-Yazdi |

## Summary

Introduces breaking changes to the `BlockBuilder` and `Core` runtime APIs and bumps them to version
5 and 7 respectively. A new function `after_inherents` is added to the `BlockBuilder` runtime API
and the `initialize_block` function of `Core` is changed to return an enum to indicate what
extrinsics can be applied.

## Motivation

The original motivation is Multi-Block-Migrations. They require the runtime to be able to tell the
block builder that it should not attempt to include transactions in the current block. Currently,
there is no communication possible between runtime and block builder that could achieve this.
Further, it is necessary to execute runtime logic right after inherent application but still before
transaction inclusion.

This RFC proposes a way of communication between the runtime and the block builder by changing the
`initialize_block` function to return a `ExtrinsicInclusionMode` enum. Additionally, an
`after_inherents` function is introduced that runs after inherent but before transaction
application.  

## Stakeholders

- Substrate Maintainers: They will have to implement this upstream with all the testing, audit and
  maintenance burden.
- Polkadot Runtime developers: They will have to adapt to this breaking change.
- Polkadot Parachain Teams: They also have to adapt to the breaking changes but then eventually have
  multi-block migrations available.

## Explanation

The only relevant change is on the node side in the block authoring logic. Any further preparation
for MBMs can happen entirely on the runtime side with the provided primitives.

All block authors MUST respect the `ExtrinsicInclusionMode` that is returned by `initialize_block`.
They MUST always invoke `after_inherents` directly after inherent application. The runtime MAY
reject a block that violates either of those requirements.

Enum `ExtrinsicInclusionMode` has two variants:  
- `AllExtrinsics`: All extrinsics can be applied. It is the default behaviour prior to this RFC.
- `OnlyInherents`: Only inherents SHALL be applied by the block author. This differs from the
  current behaviour by omitting transactions.

It is RECOMMENDED that block authors keep transactions in the local transaction pool (if applicable)
for as long as `initialize_block` returns `OnlyInherents`.  
Backwards compatibility with the current runtime API SHOULD be implemented on the node side to not
mandate a lockstep update.

## Drawbacks

[…] drawbacks relating to performance, ergonomics, user experience, security, or privacy: None

The only drawback is that the block execution logic becomes more complicated. There is more room for
error.  
Downstream developers will also need to adapt their code to this breaking change.

## Testing, Security, and Privacy

Compliance of a block author can be tested by adding specific code to the `after_inherents` hook and
checking that it always executes. The new logic of `initialize_block` can be tested by checking that
the block-builder will skip transactions and optional hooks when `Minimal` is returned.  

Security: Implementations need to be well-audited before merging.

Privacy: n/a

## Performance, Ergonomics, and Compatibility

### Performance

The performance overhead is minimal in the sense that no clutter was added after fulfilling the
requirements. A slight performance slow-down is expected from now additionally invoking
`after_inherents` once per block.

### Ergonomics

The new interface allows for more extensible runtime logic. In the future, this will be utilized for
multi-block-migrations which should be a huge ergonomic advantage for parachain developers.

### Compatibility

Backwards compatibility can only be considered on the node side since the runtime cannot be
backwards compatible in any way. The advice here is OPTIONAL and outside of the RFC. To not degrade
user experience, it is recommended to ensure that an updated node can still import historic blocks.

## Prior Art and References

The RFC is currently being implemented in
[substrate#14414](https://github.com/paritytech/substrate/pull/14414). Related issues and merge
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
=> Resolved by using `ExtrinsicInclusionMode`.

Is `post_inherents` more consistent instead of `after_inherents`? Then we should change it.

## Future Directions and Related Material

An alternative approach to this is outlined
[here](https://github.com/paritytech/substrate/pull/14279#discussion_r1226289311) by using an
ordering of extrinsics. In this system, all inherents would have negative priority and transactions
positive priority. By then enforcing an order on them, there would be no hard differentiation
between inherent and transaction for the block author anymore. That approach aims more at unifying
the interplay between inherents and transactions, since the problem of communicating between runtime
and block author on whether transactions should be included would not be solved by it. It also needs
to invoke the `after_inherents` hook.  

I think it can therefore be done as a future refactor to improve the code clarity and simplify the
runtime logic. This RFC rather tries to prepare the runtime and block authors for a simple solution
to the Multi-block migrations problem.
