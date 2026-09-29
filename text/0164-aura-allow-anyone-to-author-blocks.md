# RFC-0164: Aura: Allow anyone to produce blocks after a downtime

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 02.03.2026                                                                    |
| **Description** | Allow anyone to produce blocks with Aura after a period of inactivity.                                                                    |
| **Authors**     | Bastian Köcher                                                                              |

## Summary

Aura has a fixed set of authorities that are allowed to produce blocks in their respective slots. The list of authorities is repeated, leading to an endless stream of slots.
When an authority is not available at its slot, the slot is skipped and no block is produced. As long as there are enough authorities available this leads to a decreased block rate,
but the chain is still able to make progress. In the event of all authorities being unavailable, the chain would stall and without these authorities coming back there would be no
easy way to bring the chain back online. Thus, this RFC proposes to change the Aura "authority selection logic" to allow anyone to produce blocks after a configurable number of slots
without any progress. 

## Motivation

The collator selection for system parachains right now is not that sophisticated. There are invulnerables and open slots. The invulnerable slots are set by governance, but they
don't involve any kind of stake or similar. Especially for system chains with not that much activity (e.g. the collectives chain) and only a few (~3) invulnerable slots, it could happen
relatively easily that all operators are down. The collator operators could also, for example, collude to take the chain down to prevent the Fellowship from whitelisting a runtime upgrade.

## Stakeholders

- Runtime developers
- Node developers
- Node operators

## Explanation

To allow anyone to produce blocks, we will need to change the logic on the node side that tries to claim a particular slot and the logic in the runtime that ensures that a block author
is eligible to produce a block. This eligibility check is done using the current slot. We can use the difference between the current slot and the previous slot (slot of the parent) to determine
if anyone should be allowed to produce a block or not. In this context, "anyone" means any node running a collator — not just nodes in the authority list. The actual value on when to allow anyone is an implementation/configuration detail.

### Node side changes

On the node side we will need to change the slot claiming functionality. Instead of just checking who is eligible for the current slot, the logic should also be changed to check the difference between
the parent and the current slot. The "inactive_override_slot_diff" should be fetched from the runtime configuration using a runtime API. For this use case the Aura runtime API should be extended with
the function `fn inactive_override_slot_diff() -> u32`. A return value of `0` would mean that the functionality is disabled and only the runtime configured authority list is allowed. If the logic allows some
authority that isn't on the authority list to claim a slot and thus, build a block it will need to set some special new digest: `AuraDigestItem::InactiveOverride`. This digest should be passed
alongside the `slot` as a pre digest to the runtime.
The current pre digest for the `AURA_ENGINE_ID` is just the slot type which is not versionable. So, a new engine ID `aur2` should be introduced that uses an enum as pre digest. To stay compatible with old runtimes,
we would continue to pass the `slot` via the old `AURA_ENGINE_ID`.
The block import logic and especially the authority tracking logic needs to be adapted as well to the possibility of anyone building a block. It should follow the same logic as the block production to determine
the eligible block author. 
After a block was imported that had the `InactiveOverride` digest included, block production and import should allow any author to produce blocks. The nodes should restrict the number of blocks to one per slot.
As anyone can build blocks, the node should stop importing blocks at the same height/slot if there are too many blocks. It is then the job of the relay chain to determine on which will be the canonical block.
The nodes should allow any author until the runtime has announced the next authority list. After the new authority list was announced, Aura continues to produce blocks with the default logic for determining the
block authors. 
 

### Runtime side changes

Similar to the node side, the runtime side will need to change the logic to determine the current authority. There is no difference from how the node does it. If an inactive override is accepted by
the runtime logic, it will need to announce an immediate authority set change to an empty list. The empty authority list, alongside the `InactiveOverride` digest signals to the node side that any author is allowed. 
As for the node side, the runtime will accept any author to produce blocks until a new authority list is enacted.

## Drawbacks

No particular drawbacks.

## Testing, Security, and Privacy

The feature should be tested with an integration test that ensures that overriding the authorities works. Security-wise it needs to be ensured that overriding only works after the configured number of slots and
not in any other situation.

## Performance and Compatibility


### Performance

Should have no impact on the performance of the parachains under normal operations.

### Compatibility

The proposal changes the way the eligible authority is selected. This will require nodes to upgrade to this new logic, before the runtime would allow anyone to build a block. Otherwise non-upgraded nodes
would reject these blocks built by an unknown "authority".

