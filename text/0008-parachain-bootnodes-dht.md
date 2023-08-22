# RFC-0008: Store parachain bootnodes in relay chain DHT

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2023-07-14                                                                                  |
| **Description** | Parachain bootnodes shall register themselves in the DHT of the relay chain                 |
| **Authors**     | Pierre Krieger                                                                              |

## Summary

The full nodes of the Polkadot peer-to-peer network maintain a distributed hash table (DHT), which is currently used for full nodes discovery and validators discovery purposes.

This RFC proposes to extend this DHT to be used to discover full nodes of the parachains of Polkadot.

## Motivation

The maintenance of bootnodes has long been an annoyance for everyone.

When a bootnode is newly-deployed or removed, every chain specification must be updated in order to take the update into account. This has lead to various non-optimal solutions, such as pulling chain specifications from GitHub repositories.
When it comes to RPC nodes, UX developers often have trouble finding up-to-date addresses of parachain RPC nodes. With the ongoing migration from RPC nodes to light clients, similar problems would happen with chain specifications as well.

Furthermore, there exists multiple different possible variants of a certain chain specification: with the non-raw storage, with the raw storage, with just the genesis trie root hash, with or without checkpoint, etc. All of this creates confusion. Removing the need for parachain developers to be aware of and manage these different versions would be beneficial.

Since the PeerId and addresses of bootnodes needs to be stable, extra maintenance work is required from the chain maintainers. For example, they need to be extra careful when migrating nodes within their infrastructure. In some situations, bootnodes are put behind domain names, which also requires maintenance work.

Because the list of bootnodes in chain specifications is so annoying to modify, the consequence is that the number of bootnodes is rather low (typically between 2 and 15). In order to better resist downtimes and DoS attacks, a better solution would be to use every node of a certain chain as potential bootnode, rather than special-casing some specific nodes.

While this RFC doesn't solve these problems for relay chains, it aims at solving it for parachains by storing the list of all the full nodes of a parachain on the relay chain DHT.

Assuming that this RFC is implemented, and that light clients are used, deploying a parachain wouldn't require more work than registering it onto the relay chain and starting the collators. There wouldn't be any need for special infrastructure nodes anymore.

## Stakeholders

This RFC has been opened on my own initiative because I think that this is a good technical solution to a usability problem that many people are encountering and that they don't realize can be solved.

## Explanation

The content of this RFC only applies for parachains and parachain nodes that are "Substrate-compatible". It is in no way mandatory for parachains to comply to this RFC.

Note that "Substrate-compatible" is very loosely defined as "implements the same mechanisms and networking protocols as Substrate". The author of this RFC believes that "Substrate-compatible" should be very precisely specified, but there is controversy on this topic.

While a lot of this RFC concerns the implementation of parachain nodes, it makes use of the resources of the Polkadot chain, and as such it is important to describe them in the Polkadot specification.

This RFC adds two mechanisms: a registration in the DHT, and a new networking protocol.

### DHT provider registration

This RFC heavily relies on the functionalities of the Kademlia DHT already in use by Polkadot.
You can find a link to the specification [here](https://github.com/libp2p/specs/tree/master/kad-dht).

Full nodes of a parachain registered on Polkadot should register themselves onto the Polkadot DHT as the providers of a key corresponding to the parachain that they are serving, as described in [the `Content provider advertisement` section](https://github.com/libp2p/specs/tree/master/kad-dht#content-provider-advertisement) of the specification. This uses the `ADD_PROVIDER` system of libp2p-kademlia.

This key is: `sha256(concat(scale_compact(para_id), randomness))` where the value of `randomness` can be found in the `randomness` field when calling the `BabeApi_currentEpoch` function.
For example, for a `para_id` equal to 1000, and at the time of writing of this RFC (July 14th 2023 at 09:13 UTC), it is `sha(0xa10f12872447958d50aa7b937b0106561a588e0e2628d33f81b5361b13dbcf8df708)`, which is equal to `0x483dd8084d50dbbbc962067f216c37b627831d9339f5a6e426a32e3076313d87`.

In order to avoid downtime when the key changes, parachain full nodes should also register themselves as a secondary key that uses a value of `randomness` equal to the `randomness` field when calling `BabeApi_nextEpoch`.

Implementers should be aware that their implementation of Kademlia might already hash the key before XOR'ing it. The key is not meant to be hashed twice.

The compact SCALE encoding has been chosen in order to avoid problems related to the number of bytes and endianness of the `para_id`.

### New networking protocol

A new request-response protocol should be added, whose name is `/91b171bb158e2d3848fa23a9f1c25182fb8e20313b2c1eb49219da7a70ce90c3/paranode` (that hexadecimal number is the genesis hash of the Polkadot chain, and should be adjusted appropriately for Kusama and others).

The request consists in a SCALE-compact-encoded `para_id`. For example, for a `para_id` equal to 1000, this is `0xa10f`.

Note that because this is a request-response protocol, the request is always prefixed with its length in bytes. While the body of the request is simply the SCALE-compact-encoded `para_id`, the data actually sent onto the substream is both the length and body.

The response consists in a protobuf struct, defined as:

```
syntax = "proto2";

message Response {
    // Peer ID of the node on the parachain side.
    bytes peer_id = 1;

    // Multiaddresses of the parachain side of the node. The list and format are the same as for the `listenAddrs` field of the `identify` protocol.
    repeated bytes addrs = 2;

    // Genesis hash of the parachain. Used to determine the name of the networking protocol to connect to the parachain. Untrusted.
    bytes genesis_hash = 3;

    // So-called "fork ID" of the parachain. Used to determine the name of the networking protocol to connect to the parachain. Untrusted.
    optional string fork_id = 4;
};
```

The maximum size of a response is set to an arbitrary 16kiB. The responding side should make sure to conform to this limit. Given that `fork_id` is typically very small and that the only variable-length field is `addrs`, this is easily achieved by limiting the number of addresses.

Implementers should be aware that `addrs` might be very large, and are encouraged to limit the number of `addrs` to an implementation-defined value.

## Drawbacks

The `peer_id` and `addrs` fields are in theory not strictly needed, as the PeerId and addresses could be always equal to the PeerId and addresses of the node being registered as the provider and serving the response. However, the Cumulus implementation currently uses two different networking stacks, one of the parachain and one for the relay chain, using two separate PeerIds and addresses, and as such the PeerId and addresses of the other networking stack must be indicated. Asking them to use only one networking stack wouldn't feasible in a realistic time frame.

The values of the `genesis_hash` and `fork_id` fields cannot be verified by the requester and are expected to be unused at the moment. Instead, a client that desires connecting to a parachain is expected to obtain the genesis hash and fork ID of the parachain from the parachain chain specification. These fields are included in the networking protocol nonetheless in case an acceptable solution is found in the future, and in order to allow use cases such as discovering parachains in a not-strictly-trusted way.

## Testing, Security, and Privacy

Because not all nodes want to be used as bootnodes, implementers are encouraged to provide a way to disable this mechanism. However, it is very much encouraged to leave this mechanism on by default for all parachain nodes.

This mechanism doesn't add or remove any security by itself, as it relies on existing mechanisms.
However, if the principle of chain specification bootnodes is entirely replaced with the mechanism described in this RFC (which is the objective), then it becomes important whether the mechanism in this RFC can be abused in order to make a parachain unreachable.

Due to the way Kademlia works, it would become the responsibility of the 20 Polkadot nodes whose `sha256(peer_id)` is closest to the `key` (described in the explanations section) to store the list of bootnodes of each parachain.
Furthermore, when a large number of providers (here, a provider is a bootnode) are registered, only the providers closest to the `key` are kept, up to a certain implementation-defined limit.

For this reason, an attacker can abuse this mechanism by randomly generating libp2p PeerIds until they find the 20 entries closest to the `key` representing the target parachain. They are then in control of the parachain bootnodes.
Because the key changes periodically and isn't predictable, and assuming that the Polkadot DHT is sufficiently large, it is not realistic for an attack like this to be maintained in the long term.

Furthermore, parachain clients are expected to cache a list of known good nodes on their disk. If the mechanism described in this RFC went down, it would only prevent new nodes from accessing the parachain, while clients that have connected before would not be affected.

## Performance, Ergonomics, and Compatibility

### Performance

The DHT mechanism generally has a low overhead, especially given that publishing providers is done only every 24 hours.

Doing a Kademlia iterative query then sending a provider record shouldn't take more than around 50 kiB in total of bandwidth for the parachain bootnode.

Assuming 1000 parachain full nodes, the 20 Polkadot full nodes corresponding to a specific parachain will each receive a sudden spike of a few megabytes of networking traffic when the `key` rotates. Again, this is relatively negligible. If this becomes a problem, one can add a random delay before a parachain full node registers itself to be the provider of the `key` corresponding to `BabeApi_next_epoch`.

Maybe the biggest uncertainty is the traffic that the 20 Polkadot full nodes will receive from light clients that desire knowing the bootnodes of a parachain. Light clients are generally encouraged to cache the peers that they use between restarts, so they should only query these 20 Polkadot full nodes at their first initialization.
If this every becomes a problem, this value of 20 is an arbitrary constant that can be increased for more redundancy.

### Ergonomics

Irrelevant.

### Compatibility

Irrelevant.

## Prior Art and References

None.

## Unresolved Questions

While it fundamentally doesn't change much to this RFC, using `BabeApi_currentEpoch` and `BabeApi_nextEpoch` might be inappropriate. I'm not familiar enough with good practices within the runtime to have an opinion here. Should it be an entirely new pallet?

## Future Directions and Related Material

It is possible that in the future a client could connect to a parachain without having to rely on a trusted parachain specification.
