# RFC-0059: Add a discovery mechanism for nodes based on their capabilities

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2023-12-18                                                                                  |
| **Description** | Nodes having certain capabilities register themselves in the DHT to be discoverable         |
| **Authors**     | Pierre Krieger                                                                              |

## Summary

This RFC proposes to make the mechanism of [RFC #8](https://github.com/polkadot-fellows/RFCs/blob/main/text/0008-parachain-bootnodes-dht.md) more generic by introducing the concept of "capabilities".

Implementations can implement certain "capabilities", such as serving old block headers or being a parachain bootnode.

The discovery mechanism of RFC #8 is extended to be able to discover nodes of specific capabilities.

## Motivation

The Polkadot peer-to-peer network is made of nodes. Not all these nodes are equal. Some nodes store only the headers of recent blocks, some nodes store all the block headers and bodies since the genesis, some nodes store the storage of all blocks since the genesis, and so on.

It is currently not possible to know ahead of time (without connecting to it and asking) which nodes have which data available, and it is not easily possible to build a list of nodes that have a specific piece of data available.

If you want to download for example the header of block 500, you have to connect to a randomly-chosen node, ask it for block 500, and if it says that it doesn't have the block, disconnect and try another randomly-chosen node.
In certain situations such as downloading the storage of old blocks, nodes that have the information are relatively rare, and finding through trial and error a node that has the data can take a long time.

This RFC attempts to solve this problem by giving the possibility to build a list of nodes that are capable of serving specific data.

## Stakeholders

Low-level client developers.
People interested in accessing the archive of the chain.

## Explanation

*Reading RFC #8 first might help with comprehension, as this RFC is very similar.*

Please keep in mind while reading that everything below applies for both relay chains and parachains, except mentioned otherwise.

### Capabilities

This RFC defines a list of so-called **capabilities**:

- **Head of chain provider**. An implementation with this capability must be able to serve to other nodes block headers, block bodies, justifications, calls proofs, and storage proofs of "recent" (see below) blocks, and, for relay chains, to serve to other nodes warp sync proofs where the starting block is a session change block and must participate in Grandpa and Beefy gossip.
- **History provider**. An implementation with this capability must be able to serve to other nodes block headers and block bodies of any block since the genesis, and must be able to serve to other nodes justifications of any session change block since the genesis up until and including their currently finalized block.
- **Archive provider**. This capability is a superset of **History provider**. In addition to the requirements of **History provider**, an implementation with this capability must be able to serve call proofs and storage proof requests of any block since the genesis up until and including their currently finalized block.
- **Parachain bootnode** (only for relay chains). An implementation with this capability must be able to serve the network request described in RFC 8.

More capabilities might be added in the future.

In the context of the *head of chain provider*, the word "recent" means: any not-finalized-yet block that is equal to or an ancestor of a block that it has announced through a block announce, and any finalized block whose height is superior to its current finalized block minus **16**.
This does *not* include blocks that have been pruned because they're not a descendant of its current finalized block. In other words, blocks that aren't a descendant of the current finalized block can be thrown away.
A gap of blocks is required due to race conditions: when a node finalizes a block, it takes some time for its peers to be made aware of this, during which they might send requests concerning older blocks. The choice of the number of blocks in this gap is arbitrary.

Substrate is currently by default a **head of chain provider** provider. After it has finished warp syncing, it downloads the list of old blocks, after which it becomes a **history provider**.
If Substrate is instead configured as an archive node, then it downloads all blocks since the genesis and builds their state, after which it becomes an **archive provider**, **history provider**, and **head of chain provider**.
If blocks pruning is enabled and the chain is a relay chain, then Substrate unfortunately doesn't implement any of these capabilities, not even **head of chain provider**. This is considered as a bug that should be fixed, see <https://github.com/paritytech/polkadot-sdk/issues/2733>.

### DHT provider registration

This RFC heavily relies on the functionalities of the Kademlia DHT already in use by Polkadot. You can find a link to the specification [here](https://github.com/libp2p/specs/tree/master/kad-dht).

Implementations that have the **history provider** capability should register themselves as providers under the key `sha256(concat("history", randomness))`.

Implementations that have the **archive provider** capability should register themselves as providers under the key `sha256(concat("archive", randomness))`.

Implementations that have the **parachain bootnode** capability should register themselves as provider under the key `sha256(concat(scale_compact(para_id), randomness))`, as described in RFC 8.

"Register themselves as providers" consists in sending `ADD_PROVIDER` requests to nodes close to the key, as described in [the `Content provider advertisement` section](https://github.com/libp2p/specs/tree/master/kad-dht#content-provider-advertisement) of the specification.

The value of `randomness` can be found in the `randomness` field when calling the `BabeApi_currentEpoch` function.

In order to avoid downtimes when the key changes, nodes should also register themselves as a secondary key that uses a value of `randomness` equal to the `randomness` field when calling `BabeApi_nextEpoch`.

Implementers should be aware that their implementation of Kademlia might already hash the key before XOR'ing it. The key is not meant to be hashed twice.

Implementations must not register themselves if they don't fulfill the capability *yet*. For example, a node configured to be an archive node but that is still building its archive state in the background must register itself only after it has finished building its archive.

### Secondary DHTs

Implementations that have the **history provider** capability must also participate in a secondary DHT that comprises only of nodes with that capability. The protocol name of that secondary DHT must be `/<genesis-hash>/kad/history`.

Similarly, implementations that have the **archive provider** capability must also participate in a secondary DHT that comprises only of nodes with that capability and whose protocol name is `/<genesis-hash>/kad/archive`.

Just like implementations must not register themselves if they don't fulfill their capability yet, they must also not participate in the secondary DHT if they don't fulfill their capability yet.

### Head of the chain providers

Implementations that have the **head of the chain provider** capability do not register themselves as providers, but instead are the nodes that participate in the main DHT. In other words, they are the nodes that serve requests of the `/<genesis_hash>/kad` protocol.

Any implementation that isn't a head of the chain provider (read: light clients) must not participate in the main DHT. This is already presently the case.

Implementations must not participate in the main DHT if they don't fulfill the capability yet. For example, a node that is still in the process of warp syncing must not participate in the main DHT. However, assuming that warp syncing doesn't last more than a few seconds, it is acceptable to ignore this requirement in order to avoid complicating implementations too much.

## Drawbacks

None that I can see.

## Testing, Security, and Privacy

*The content of this section is basically the same as the one in RFC 8.*

This mechanism doesn't add or remove any security by itself, as it relies on existing mechanisms.

Due to the way Kademlia works, it would become the responsibility of the 20 Polkadot nodes whose `sha256(peer_id)` is closest to the `key` (described in the explanations section) to store the list of nodes that have specific capabilities.
Furthermore, when a large number of providers are registered, only the providers closest to the `key` are kept, up to a certain implementation-defined limit.

For this reason, an attacker can abuse this mechanism by randomly generating libp2p PeerIds until they find the 20 entries closest to the `key` representing the target capability. They are then in control of the list of nodes with that capability. While doing this can in no way be actually harmful, it could lead to eclipse attacks.

Because the key changes periodically and isn't predictable, and assuming that the Polkadot DHT is sufficiently large, it is not realistic for an attack like this to be maintained in the long term.

## Performance, Ergonomics, and Compatibility

### Performance

The DHT mechanism generally has a low overhead, especially given that publishing providers is done only every 24 hours.

Doing a Kademlia iterative query then sending a provider record shouldn't take more than around 50 kiB in total of bandwidth for the parachain bootnode.

Assuming 1000 nodes with a specific capability, the 20 Polkadot full nodes corresponding to that capability will each receive a sudden spike of a few megabytes of networking traffic when the `key` rotates. Again, this is relatively negligible. If this becomes a problem, one can add a random delay before a node registers itself to be the provider of the `key` corresponding to `BabeApi_next_epoch`.

Maybe the biggest uncertainty is the traffic that the 20 Polkadot full nodes will receive from light clients that desire knowing the nodes with a capability. If this every becomes a problem, this value of 20 is an arbitrary constant that can be increased for more redundancy.

### Ergonomics

Irrelevant.

### Compatibility

Irrelevant.

## Prior Art and References

Unknown.

## Unresolved Questions

While it fundamentally doesn't change much to this RFC, using `BabeApi_currentEpoch` and `BabeApi_nextEpoch` might be inappropriate. I'm not familiar enough with good practices within the runtime to have an opinion here. Should it be an entirely new pallet?

## Future Directions and Related Material

This RFC would make it possible to reliably discover archive nodes, which would make it possible to reliably send archive node requests, something that isn't currently possible. This could solve the problem of finding archive RPC node providers by migrating archive-related request to using the native peer-to-peer protocol rather than JSON-RPC.

If we ever decide to break backwards compatibility, we could divide the "history" and "archive" capabilities in two, between nodes capable of serving older blocks and nodes capable of serving newer blocks.
We could even add to the peer-to-peer network nodes that are only capable of serving older blocks (by reading from a database) but do not participate in the head of the chain, and that just exist for historical purposes.
