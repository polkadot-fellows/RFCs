# RFC-0009: Improved light client requests networking protocol

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2023-07-19                                                                                  |
| **Description** | Modify the networking storage read requests to solve some problems with the existing one    |
| **Authors**     | Pierre Krieger                                                                              |

## Summary

Improve the networking messages that query storage items from the remote, in order to reduce the bandwidth usage and number of round trips of light clients.

## Motivation

Clients on the Polkadot peer-to-peer network can be divided into two categories: full nodes and light clients. So-called full nodes are nodes that store the content of the chain locally on their disk, while light clients are nodes that don't. In order to access for example the balance of an account, a full node can do a disk read, while a light client needs to send a network message to a full node and wait for the full node to reply with the desired value. This reply is in the form of a Merkle proof, which makes it possible for the light client to verify the exactness of the value.

Unfortunately, this network protocol is suffering from some issues:

- It is not possible for the querier to check whether a key exists in the storage of the chain except by querying the value of that key. The reply will thus include the value of the key, only for that value to be discarded by the querier that isn't interested by it. This is a waste of bandwidth.
- It is not possible for the querier to know whether a value in the storage of the chain has been modified between two blocks except by querying this value for both blocks and comparing them. Only a few storage values get modified in a block, and thus most of the time the comparison will be equal. This leads to a waste of bandwidth as the values have to be transferred.
- While it is possible to ask for multiple specific storage keys at the same time, it is not possible to ask for a list of keys that start with a certain prefix. Due to the way FRAME works, storage keys are grouped by "prefix", for example all account balances start with the same prefix. It is thus a common necessity for a light client to obtain the list of all keys (and possibly their values) that start with a specific prefix. This is currently not possible except by performing multiple queries serially that "walk down" the trie.

Once Polkadot and Kusama will have transitioned to `state_version = 1`, which modifies the format of the trie entries, it will be possible to generate Merkle proofs that contain only the hashes of values in the storage. Thanks to this, it is already possible to prove the existence of a key without sending its entire value (only its hash), or to prove that a value has changed or not between two blocks (by sending just their hashes).
Thus, the only reason why aforementioned issues exist is because the existing networking messages don't give the possibility for the querier to query this. This is what this proposal aims at fixing.

## Stakeholders

This is the continuation of https://github.com/w3f/PPPs/pull/10, which itself is the continuation of https://github.com/w3f/PPPs/pull/5.

## Explanation

The protobuf schema of the networking protocol can be found here: https://github.com/paritytech/substrate/blob/5b6519a7ff4a2d3cc424d78bc4830688f3b184c0/client/network/light/src/schema/light.v1.proto

The proposal is to modify this protocol in this way:

```diff
@@ -11,6 +11,7 @@ message Request {
                RemoteReadRequest remote_read_request = 2;
                RemoteReadChildRequest remote_read_child_request = 4;
                // Note: ids 3 and 5 were used in the past. It would be preferable to not re-use them.
+               RemoteReadRequestV2 remote_read_request_v2 = 6;
        }
 }
 
@@ -48,6 +49,21 @@ message RemoteReadRequest {
        repeated bytes keys = 3;
 }
 
+message RemoteReadRequestV2 {
+       required bytes block = 1;
+       optional ChildTrieInfo child_trie_info = 2;  // Read from the main trie if missing.
+       repeated Key keys = 3;
+       optional bytes onlyKeysAfter = 4;
+       optional bool onlyKeysAfterIgnoreLastNibble = 5;
+}
+
+message ChildTrieInfo {
+       enum ChildTrieNamespace {
+               DEFAULT = 1;
+       }
+
+       required bytes hash = 1;
+       required ChildTrieNamespace namespace = 2;
+}
+
 // Remote read response.
 message RemoteReadResponse {
        // Read proof. If missing, indicates that the remote couldn't answer, for example because
@@ -65,3 +81,8 @@ message RemoteReadChildRequest {
        // Storage keys.
        repeated bytes keys = 6;
 }
+
+message Key {
+       required bytes key = 1;
+       optional bool skipValue = 2; // Defaults to `false` if missing
+       optional bool includeDescendants = 3; // Defaults to `false` if missing
+}
```

Note that the field names aren't very important as they are not sent over the wire. They can be changed at any time without any consequence. I would invite people to not discuss these field names as they are implementation details.

This diff adds a new type of request (`RemoteReadRequestV2`).

The new `child_trie_info` field in the request makes it possible to specify which trie is concerned by the request. The current networking protocol uses two different structs (`RemoteReadRequest` and `RemoteReadChildRequest`) for main trie and child trie queries, while this new request would make it possible to query either. This change doesn't fix any of the issues mentioned in the previous section, but is a side change that has been done for simplicity.
An alternative could have been to specify the `child_trie_info` for each individual `Key`. However this would make it necessary to send the child trie hash many times over the network, which leads to a waste of bandwidth, and in my opinion makes things more complicated for no actual gain. If a querier would like to access more than one trie at the same time, it is always possible to send one query per trie.

If `skipValue` is `true` for a `Key`, then the value associated with this key isn't important to the querier, and the replier is encouraged to replace the value with its hash provided that the storage item has a `state_version` equal to 1. If the storage value has a `state_version` equal to 0, then the optimization isn't possible and the replier should behave as if `skipValue` was `false`.

If `includeDescendants` is `true` for a `Key`, then the replier must also include in the proof all keys that are descendant of the given key (in other words, its children, children of children, children of children of children, etc.). It must do so even if `key` itself doesn't have any storage value associated to it. The values of all of these descendants are replaced with their hashes if `skipValue` is `true`, similarly to `key` itself.

The optional `onlyKeysAfter` and `onlyKeysAfterIgnoreLastNibble` fields can provide a lower bound for the keys contained in the proof. The responder must not include in its proof any node whose key is strictly inferior to the value in `onlyKeysAfter`. If `onlyKeysAfterIgnoreLastNibble` is provided, then the last 4 bits for `onlyKeysAfter` must be ignored. This makes it possible to represent a trie branch node that doesn't have an even number of nibbles. If no `onlyKeysAfter` is provided, it is equivalent to being empty, meaning that the response must start with the root node of the trie.

If `onlyKeysAfterIgnoreLastNibble` is missing, it is equivalent to `false`. If `onlyKeysAfterIgnoreLastNibble` is `true` and `onlyKeysAfter` is missing or empty, then the request is invalid.

For the purpose of this networking protocol, it should be considered as if the main trie contained an entry for each default child trie whose key is `concat(":child_storage:default:", child_trie_hash)` and whose value is equal to the trie root hash of that default child trie. This behavior is consistent with what the host functions observe when querying the storage. This behavior is present in the existing networking protocol, in other words this proposal doesn't change anything to the situation, but it is worth mentioning.
Also note that child tries aren't considered as descendants of the main trie when it comes to the `includeDescendants` flag. In other words, if the request concerns the main trie, no content coming from child tries is ever sent back.

This protocol keeps the same maximum response size limit as currently exists (16 MiB). It is not possible for the querier to know in advance whether its query will lead to a reply that exceeds the maximum size. If the reply is too large, the replier should send back only a limited number (but at least one) of requested items in the proof. The querier should then send additional requests for the rest of the items. A response containing none of the requested items is invalid.

The server is allowed to silently discard some keys of the request if it judges that the number of requested keys is too high. This is in line with the fact that the server might truncate the response.

## Drawbacks

This proposal doesn't handle one specific situation: what if a proof containing a single specific item would exceed the response size limit? For example, if the response size limit was 1 MiB, querying the runtime code (which is typically 1.0 to 1.5 MiB) would be impossible as it's impossible to generate a proof less than 1 MiB. The response size limit is currently 16 MiB, meaning that no single storage item must exceed 16 MiB.

Unfortunately, because it's impossible to verify a Merkle proof before having received it entirely, parsing the proof in a streaming way is also not possible.

A way to solve this issue would be to Merkle-ize large storage items, so that a proof could include only a portion of a large storage item. Since this would require a change to the trie format, it is not realistically feasible in a short time frame.

## Testing, Security, and Privacy

The main security consideration concerns the size of replies and the resources necessary to generate them. It is for example easily possible to ask for all keys and values of the chain, which would take a very long time to generate. Since responses to this networking protocol have a maximum size, the replier should truncate proofs that would lead to the response being too large. Note that it is already possible to send a query that would lead to a very large reply with the existing network protocol. The only thing that this proposal changes is that it would make it less complicated to perform such an attack.

Implementers of the replier side should be careful to detect early on when a reply would exceed the maximum reply size, rather than inconditionally generate a reply, as this could take a very large amount of CPU, disk I/O, and memory. Existing implementations might currently be accidentally protected from such an attack thanks to the fact that requests have a maximum size, and thus that the list of keys in the query was bounded. After this proposal, this accidental protection would no longer exist.

## Performance, Ergonomics, and Compatibility

### Performance

It is unclear to the author of the RFC what the performance implications are. Servers are supposed to have limits to the amount of resources they use to respond to requests, and as such the worst that can happen is that light client requests become a bit slower than they currently are.

### Ergonomics

Irrelevant.

### Compatibility

The prior networking protocol is maintained for now. The older version of this protocol could get removed in a long time.

## Prior Art and References

None. This RFC is a clean-up of an existing mechanism.

## Unresolved Questions

None

## Future Directions and Related Material

The current networking protocol could be deprecated in a long time. Additionally, the current "state requests" protocol (used for warp syncing) could also be deprecated in favor of this one.
