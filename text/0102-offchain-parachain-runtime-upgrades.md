# RFC-0000: Feature Name Here

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 13 July 2024                                                                                |
| **Description** | Implement off-chain parachain runtime upgrades                                              |
| **Authors**     | eskimor                                                                                     |

## Summary

Change the upgrade process of a parachain runtime upgrade to become an off-chain
process with regards to the relay chain. Upgrades are still contained in
parachain blocks, but will no longer need to end up in relay chain blocks nor in
relay chain state.

## Motivation

Having parachain runtime upgrades go through the relay chain has always been
seen as a scalability concern. Due to optimizations in statement
distribution and asynchronous backing it became less crucial and got
de-prioritized, the original issue can be found
[here](https://github.com/paritytech/polkadot-sdk/issues/971).

With the introduction of Agile Coretime and in general our efforts to reduce
barrier to entry more for Polkadot more, the issue becomes more relevant again:
We would like to reduce the required storage deposit for PVF registration, with
the aim to not only make it cheaper to run a parachain (bulk + on-demand
coretime), but also reduce the amount of capital required for the deposit. With
this we would hope for far more parachains to get registered, thousands
potentially even ten thousands. With so many PVFs registered, updates are
expected to become more frequent and even attacks on service quality for other
parachains would become a higher risk.

## Stakeholders

- Parachain Teams
- Relay Chain Node implementation teams
- Relay Chain runtime developers

## Explanation

The issues with on-chain runtime upgrades are:

1. Needlessly costly.
2. A single runtime upgrade more or less occupies an entire relay chain block, thus it
   might affect also other parachains, especially if their candidates are also
   not negligible due to messages for example or they want to uprade their
   runtime at the same time.
3. The signalling of the parachain to notify the relay chain of an upcoming
   runtime upgrade already contains the upgrade. Therefore the only way to rate
   limit upgrades is to drop an already distributed update in the size of
   megabytes: With the result that the parachain missed a block and more
   importantly it will try again with the very next block, until it finally
   succeeds. If we imagine to reduce capacity of runtime upgrades to let's say 1
   every 100 relay chain blocks, this results in lot's of wasted effort and lost
   blocks.

We discussed introducing a separate signalling before submitting the actual
runtime, but I think we should just go one step further and make upgrades fully
off-chain.

### Introduce a new UMP message type `RequestCodeUpgrade`

As part of elastic scaling we are already planning to increase flexibility of [UMP
messages](https://github.com/polkadot-fellows/RFCs/issues/92#issuecomment-2144538974), we can now use this to our advantage and introduce another UMP message:

```rust
enum UMPSignal {
  // For elastic scaling
  OnCore(CoreIndex),
  // For off-chain upgrades
  RequestCodeUpgrade(Hash),
}
```

We could also make that new message a regular XCM, calling an extrinsic on the
relay chain, but we will want to look into that message right after validation
on the backers on the node side, making a straight forward semantic message more
apt for the purpose.


### Handle `RequestCodeUpgrade` on backers

We will introduce a new request/response protocol for both collators and
validators, with the following request/response:

```rust
struct RequestCode {
  para_id: ParaId,
  code_hash: Hash,
}

struct CodeResponse(Vec<u8>)
```

This protocol will be used by backers to request the PVF from collators in the
following conditions:

1. They received a collation sending `RequestCodeUpgrade`.
2. They received a collation, but they don't yet have the code that was
   previously registered on the relaychain. (E.g. disk pruned, new validator)

In case they received the collation via PoV distribution instead of from the
collator itself, they will use the exact same message to fetch from the valiator
they got the PoV from.

### Get the new code to all validators

Once the candidate issuing `RequestCodeUpgrade` got backed on chain, validators
will start fetching the code from the backers as part of availability
distribution.

To mitigate attack vectors we should make sure that serving requests for code
can be treated as low priority requests. Thus I am suggesting the following
scheme:

Validators will notice via a runtime API (TODO: Define) that a new code has been requested, the
API will return the `Hash` and a counter, which starts at some configurable
value e.g. 10. The validators are now aware of the new hash and start fetching,
but they don't have to wait for the fetch to succeed to sign their bitfield.

Then on each further candidate from that chain that counter gets decremented.
Validators which have not yet succeeded fetching will now try again. This game
continues until the counter reached `0`. Now it is mandatory to have to code in
order to sign a `1` in the bitfield.

PVF pre-checking will happen after the candidate which brought the counter to
`0` has been successfully included and thus is also able to assume that 2/3 of
the validators have the code.

This scheme serves two purposes:

1. Fetching can happen over a longer period of time with low priority. E.g. if
   we waited for the PVF at the very first avaialbility distribution, this might
   actually affect liveness of other chains on the same core. Distributing
   megabytes of data to a thousand validators, might take a bit. Thus this helps
   isolating parachains from each other.
2. By configuring the initial counter value we can affect how much an upgrade
   costs. E.g. forcing the parachain to produce 10 blocks, means 10x the cost
   for issuing an update. If too frequent upgrades ever become a problem for the
   system, we have a knob to make them more costly.

### On-chain code upgrade process

First when a candidate is backed we need to make the new hash available
(together with a counter) via a
runtime API so validators in availability distribution can check for it and
fetch it if changed (see previous section). For performance reasons, I think we
should not do an additional call, but replace the [existing one](https://github.com/paritytech/polkadot-sdk/blob/d2fd53645654d3b8e12cbf735b67b93078d70113/polkadot/node/subsystem-util/src/runtime/mod.rs#L355) with one containing the new additional information (Option<(Hash, Counter)>).

Once the candidate gets included (counter 0), the hash is given to pre-checking
and only after pre-checking succeeded (and a full session passed) it is finally
enacted and the parachain can switch to the new code. (Same process as it used
to be.)

### Handling new validators
#### Backers

If a backer receives a collation for a parachain it does not yet have the code
as enacted on chain (see "On-chain code upgrade process"), it will use above
request/response protocol to fetch it from whom it received the collation.

#### Availablity Distribution

Validators in availability distribution will be changed to only sign a `1` in
the bitfield of a candidate if they not only have the chunk, but also the
currently active PVF. They will fetch it from backers in case they don't have it
yet.

### How do other parties get hold of the PVF?

Two ways:

1. Discover collators via [relay chain DHT](https://github.com/polkadot-fellows/RFCs/pull/8) and request from them: Preferred way,
   as it is less load on validators.
2. Request from validators, which will serve on a best effort basis.

### Pruning

We covered how validators get hold of new code, but when can they prune old ones?
In principle it is not an issue, if some validors prune code, because:

1. We changed it so that a candidate is not deemed available if validators were
   not able to fetch the PVF.
2. Backers can always fetch the PVF from collators as part of the collation
   fetching.

But the majority of validators should always keep the latest code of any
parachain and only prune the previous one, once the first candidate using the
new code got finalized. This ensures that disputes will always be able to
resolve.

## Drawbacks

The major drawback of this solution is the same as any solution the moves work
off-chain, it adds complexity to the node. E.g. nodes needing the PVF, need to
store them separately, together with their own pruning strategy as well.

## Testing, Security, and Privacy

Implementations adhering to this RFC, will respond to PVF requests with the
actual PVF, if they have it. Requesters will persist received PVFs on disk for
as long as they are replaced by a new one. Implementations must not be lazy
here, if validators only fetched the PVF when needed, they can be prevented from
participating in disputes.

Validators should treat incoming requests for PVFs in general with rather low
priority, but should prefer fetches from other validators over requests from
random peers.

Given that we are altering what set bits in the availability bitfields mean (not
only chunk, but also PVF available), it is important to have enough validators
upgraded, before we allow collators to make use of the new runtime upgrade
mechanism. Otherwise we would risk disputes to not being able to succeed.

This RFC has no impact on privacy.

## Performance, Ergonomics, and Compatibility

### Performance

This proposal lightens the load on the relay chain and is thus in general
beneficial for the performance of the network, this is achieved by the
following:

1. Code upgrades are still propagated to all validators, but only once, not
   twice (First statements, then via the containing relay chain block).
2. Code upgrades are only communicated to validators and other nodes which are
   interested, not any full node as it has been before.
3. Relay chain block space is preserved. Previously we could only do one runtime
   upgrade per relay chain block, occupying almost all of the blockspace.
4. Signalling an upgrade no longer contains the upgrade, hence if we need to
   push back on an upgrade for whatever reason, no network bandwidth and core
   time gets wasted because of this.

### Ergonomics

End users are only affected by better performance and more stable block times.
Parachains will need to implement the introduced request/response protocol and
adapt to the new signalling mechanism via an `UMP` message, instead of sending
the code upgrade directly.

### Compatibility

We will continue to support the old mechanism for code upgrades for a while, but
will start to impose stricter limits over time, with the number of registered
parachains going up. With those limits in place parachains not migrating to the
new scheme might be having a harder time upgrading and will miss more blocks. I
guess we can be lenient for a while still, so the upgrade path for
parachains should be rather smooth.

In total the protocol changes we need are:

For validators and collators:
1. New request/response protocol for fetching PVF data from collators and
   validators.
2. New UMP message type for signalling a runtime upgrade.

Only for validators:

1. New runtime API for determining to be enacted code upgrades.
2. Different behaviour of bitfields (only sign a 1 bit, if validator has chunk +
   "hot" PVF).
3. Altered behaviour in availability-distribution: Fetch missing PVFS.

## Prior Art and References

Off-chain runtime upgrades have been discussed before, the architecture
described here is simpler though as it piggybacks on already existing features,
namely:

1. availability-distribution: No separate `I have code` messages anymore.
2. Existing pre-checking.

https://github.com/paritytech/polkadot-sdk/issues/971

## Unresolved Questions

None at this time.

## Future Directions and Related Material

By no longer having code upgrade go through the relay chain, occupying a full relay
chain block, the impact on other parachains is already greatly reduced, if we
make distribution and PVF pre-checking low-priority processes on validators. The
only thing attackers might be able to do is delay upgrades of other parachains.

Which seems like a problem to be solved once we actually see it as a problem in
the wild (and can already be mitigated by adjusting the counter). The good thing
is that we have all the ingredients to go further if need be. Signalling no
longer actually includes the code, hence there is no need to reject the
candidate: The parachain can make progress even if we choose not to immediately
act on the request and no relay chain resources are wasted either.

We could for example introduce another UMP Signalling message
`RequestCodeUpgradeWithPriority` which not just requests a code upgrade, but
also offers some DOT to get ranked up in a queue.
