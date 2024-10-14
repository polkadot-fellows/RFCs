# RFC-0123: Introduce `:pending_code` as intermediate storage key for the runtime code

| **Start Date**  | 14.10.2024                                                              |
| --------------- | ----------------------------------------------------------------------- |
| **Description** | Store a runtime upgrade in `:pending_code` before moving it to `:code`. |
| **Authors**     | Bastian Köcher                                                          |

## Summary

The code of a runtime is stored in its own state, and when performing a runtime upgrade, this code is replaced. The new runtime can contain runtime migrations that adapt the state to the state layout as defined by the runtime code. This runtime migration is executed when building the first block with the new runtime code. Anything that interacts with the runtime state uses the state layout as defined by the runtime code. So, when trying to load something from the state in the block that applied the runtime upgrade, it will use the new state layout but will decode the data from the non-migrated state. In the worst case, the data is incorrectly decoded, which may lead to crashes or halting of the chain.

This RFC proposes to store the new runtime code under a different storage key when applying a runtime upgrade. This way, all the off-chain logic can still load the old runtime code under the default storage key and decode the state correctly. The block producer is then required to use this new runtime code to build the next block. While building the next block, the runtime is executing the migrations and moves the new runtime code to the default runtime code location. So, the runtime code found under the default location is always the correct one to decode the state from which the runtime code was loaded.
## Motivation

While the issue of having undecodable state only exists for the one block in which the runtime upgrade was applied, it still impacts anything that reads state data, like block explorers, UIs, nodes, etc. For block explorers, the issue mainly results in indexing invalid data and UIs may show invalid data to the user. For nodes, reading incorrect data may lead to a [performance degradation of the network](https://forum.polkadot.network/t/2024-09-17-polkadot-finality-lag-slow-parachain-production-immediately-after-runtime-upgrade-post-mortem/10057). There are also ways to prevent certain [decoding issues](https://github.com/polkadot-fellows/runtimes/pull/267) from happening, but it requires that developers are aware of this issue and also requires introducing extra code, which could introduce further bugs down the line.

So, this RFC tries to solve these issues by fixing the underlying problem of having temporary undecodable state.
## Stakeholders

- Relay chain/Parachain node developers
- Relay chain/Parachain node operators
## Explanation

The runtime code is stored under the special key `:code` in the state. Nodes and other tooling read the runtime code under this storage key when they want to interact with the runtime for e.g., building/importing blocks or getting the metadata to read the state. To update the runtime code the runtime overwrites the value at `:code`, and then from the next block on, the new runtime will be loaded. 
This RFC proposes to first store the new runtime code under `:pending_code` in the state for one block. When the next block is being built, the block builder first needs to check if `:pending_code` is set, and if so, it needs to load the runtime from this storage key. While building the block the runtime will move `:pending_code` to `:code` to have the runtime code at the default location. Nodes importing the block will also need to load `:pending_code`  if it exists to ensure that the correct runtime code is used. By doing it this way, the runtime code found at `:code` in the state of a block will always be able to decode the state. 
Furthermore, this RFC proposes to introduce `system_version: 3`. The `system_version` was introduced in [`RFC42`](https://polkadot-fellows.github.io/RFCs/approved/0042-extrinsics-state-version.html). Version `3` would then enable the usage of `:pending_code` when applying a runtime code upgrade. This way, the feature can be introduced first and enabled later when the majority of the nodes have upgraded.
## Drawbacks

Because the first block built with the new runtime code will move the runtime code from `:pending_code` to `:code`, the runtime code will need to be loaded. This means the runtime code will appear in the proof of validity of a parachain for the first block built with the new runtime code. Generally this  is not a problem as the runtime code is also loaded by the parachain when setting the new runtime code.
There is still the possibility of having state that is not migrated even when following the proposal as presented by this RFC. The issue is that if the amount of data to be migrated is too big, not all of it can be migrated in one block, because either it takes more time than there is assigned for a block or parachains for example have a fixed budget for their proof of validity. To solve this issue there already exist multi-block migrations that can chunk the migration across multiple blocks. Consensus-critical data needs to be migrated in the first block to ensure that block production etc., can continue. For the other data being migrated by multi-block migrations the migrations could for example expose to the outside which keys are being migrated and should not be indexed until the migration is finished.

## Testing, Security, and Privacy

Testing should be straightforward and most of the existing testing should already be good enough. Extending with some checks that `:pending_code` is moved to `:code`.
## Performance, Ergonomics, and Compatibility

### Performance

The performance should not be impacted besides requiring loading the runtime code in the first block being built with the new runtime code.

### Ergonomics

It only alters the way blocks are produced and imported after applying a runtime upgrade. This means that only nodes need to be adapted to the changes of this RFC.

### Compatibility

The change will require that the nodes are upgraded before the runtime starts using this feature. Otherwise they will fail to import the block build by `:pending_code`. 
For Polkadot/Kusama this means that also the parachain nodes need to be running with a relay chain node version that supports this new feature. Otherwise the parachains will stop producing/finalizing nodes as they can not sync the relay chain any more.

## Prior Art and References

The [issue](https://github.com/paritytech/polkadot-sdk/issues/64) initially reported a bug that led to this RFC. It also discusses multiple solutions for the problem.

## Unresolved Questions

None

## Future Directions and Related Material

- Solve the issue of requiring loading the entire runtime code to move it into a different location by introducing a low-level `move` function. When using the `V1` trie layout every value bigger than 32 bytes is put into the db separately. This means a low level `move` function would only need to move the hash of the runtime code from `:code` to `:pending_code`.
