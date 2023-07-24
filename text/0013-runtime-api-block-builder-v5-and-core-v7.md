# RFC-0013: Runtime API `BlockBuilder` v5 and `Core` v7

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | July 24, 2023 |
| **Description** | Changes to the BlockBuilder v5 and Core v7 Runtime APIs. |
| **Authors**     | Oliver Tale-Yazdi |

## Summary

Introduces breaking changes to the `BlockBuilder` and `Core` runtime APIs and bumps them to version
5 and 7 respectively. A new hook `after_inherents` is added to the `BlockBuilder` runtime API and
the `initialize_block` function of `Core` is changed to return an enum to indicate what extrinsics
and hooks can be executed.

## Motivation

The original motivation is Multi-Block-Migrations. They require the runtime to be able to tell the
block builder that it should not attempt to include transactions in the current block. Currently,
there is no communication possible between runtime and block builder that could achieve this.
Further, it is necessary to execute logic right after inherent application but still before
transaction inclusion.

This RFC proposes a way of communication between the runtime and the block builder by changing the
`initialize_block` function to return a `BlockExecutiveMode` enum. Additionally, an
`after_inherents` function is introduced that runs after inherent but before transaction
application.  

## Stakeholders

- Substrate Maintainers: They will have to implement it upstream with all the imposed testing, audit
  and maintenance burden.
- Polkadot Runtime developers: They will have to adapt to this breaking change.
- Polkadot Parachain Teams: They also need to adapt to the breaking changes but will eventually have
  multi-block migrations available.

## Explanation

All block authors MUST respect the `BlockExecutiveMode` that is returned by `initialize_block`. They
MUST always invoke `after_inherents` directly after inherent application. The runtime MAY reject a
block that violates either of these requirements.  

Backwards compatibility with the existing runtime API SHOULD be implemented in the authorship logic
to not mandate a lockstep update on the node side.

Enum `BlockExecutiveMode` has two variants: `Normal` and `Minimal`.  
- `Normal` indicates that all user transactions can be included as usual and no special detour or
  skipping of logic happens.
- `Minimal` indicates that only hard-deadline code (ie. inherents, `on_initialize`...) SHALL run.
  Transactions MUST NOT be included. Optional hooks, like `poll` and `on_idle`, MOST NOT run either;
  even if there is still weight available for them.

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

The new interface allows for more extensible runtime logic. In the future, this will be utilized for multi-block-migrations which should be a huge ergonomic advantage for parachain developers.

### Compatibility

Backwards compatibility can only be considered on the node side since the runtime cannot be
backwards compatible in any way. The advice here is OPTIONAL and outside of the RFC. To not degrade
user performance, it is recommended to check that an updated node can still import historic blocks.

## Prior Art and References

The RFC is currently being implemented in
[substrate#14414](https://github.com/paritytech/substrate/pull/14414) (only the name of
`BlockExecutiveMode` differs).
 
Related issues and merge requests:
- [Simple multi block migrations](https://github.com/paritytech/substrate/pull/14275)
- [Execute a hook after inherent but before
  transactions](https://github.com/paritytech/substrate/issues/9210)
- [There is no module hook after inherents and before
  transactions](https://github.com/paritytech/substrate/issues/5757)


## Unresolved Questions

Please suggest a better name for `BlockExecutiveMode`. We already tried: `RuntimeExecutiveMode`, `ExtrinsicInclusionMode`.

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
