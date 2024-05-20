# RFC-0000: DHT Authority discovery record creation time

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2024-05-20                                                                                  |
| **Description** | Add creation time for DHT authority discovery records                                        |
| **Authors**     | Alex Gheorghe (alexggh)                                                                     |

## Summary

Extend the DHT authority discovery records with a signed creation time, so that nodes can determine which record is newer and always decide to prefer the newer records to the old ones.

## Motivation

Currently, we use the Kademlia DHT for storing records regarding the p2p address of an authority discovery key, the problem is that if the nodes decide to change its PeerId/Network key it will publish a new record, however because of the distributed and replicated nature of the DHT there is no way to tell which record is newer so both old PeerId and the new PeerId will live in the network until the old one expires(36h), that creates all sort of problem and leads to the node changing its address not being properly connected for up to 36h. 

After this RFC, nodes are extended to decide to keep the new record and propagate the new record to nodes that have the old record stored, so in the end all the nodes will converge faster to the new record(in the order of minutes not 36h)

Implementation of the rfc: https://github.com/paritytech/polkadot-sdk/pull/3786.

Current issue without this enhacement: https://github.com/paritytech/polkadot-sdk/issues/3673 

## Stakeholders

Polkadot node developers.

## Explanation

This RFC heavily relies on the functionalities of the Kademlia DHT already in use by Polkadot.
You can find a link to the specification [here](https://github.com/libp2p/specs/tree/master/kad-dht).

In a nutshell, on a specific node the current authority-discovery protocol publishes Kademila DHT records at startup and periodically. The records contain the full address of the node for each authorithy key it owns. The node, tries also to find the full address of all authorities in the network by querying the DHT and picking up the first record it finds for each of the authority id it found on chain.

The authority discovery DHT records use the protobuf protocol and the current format is specified [here](https://github.com/paritytech/polkadot-sdk/blob/313fe0f9a277f27a4228634f0fb15a1c3fa21271/substrate/client/authority-discovery/src/worker/schema/dht-v2.proto#L4). This RFC proposese extending the schema in a backwards compatible manner by adding a new optional `creation_time` field to `SignedAuthorityRecord` which nodes can use to determine which of the record is newer.

Diff of `dht-v3.proto` vs `dht-v2.proto`

```
@@ -1,10 +1,10 @@
 syntax = "proto3";

-package authority_discovery_v2;
+package authority_discovery_v3;

@@ -13,11 +13,21 @@
 	bytes public_key = 2;
 }

+// Information regarding the creation data of the record
+message TimestampInfo {
+	// Time since UNIX_EPOCH in nanoseconds, scale encoded
+	bytes timestamp = 1;
+	// A signature of the creation time.
+	bytes signature = 2;
+}
+
 // Then we need to serialize the authority record and signature to send them over the wire.
 message SignedAuthorityRecord {
 	bytes record = 1;
 	bytes auth_signature = 2;
 	// Even if there are multiple `record.addresses`, all of them have the same peer id.
 	PeerSignature peer_signature = 3;
+	// Information regarding the creation data of this record.
+	TimestampInfo creation_time = 4;
 }
```

Each time a node wants to resolve an authorithy ID it will issue a query with a certain redundancy factor, and from all the results it receives it will decide to pick only the newest record. Additionally, the nodes that answer with old records will be updated with the newer record.


## Drawbacks

In theory the new protocol creates a bit more traffic on the DHT network, because it waits for DHT records to be received from more than one node, while in the current implementation we just take the first record that we receive and cancel all in-flight requests to other peers. However, because the redundancy factor will be relatively small and this operation happens rarerly, every 10min, this cost is negligible.

## Testing, Security, and Privacy


This RFC's implementation https://github.com/paritytech/polkadot-sdk/pull/3786 had been tested on various local test networks and versi.

With regard to security the creation time will be signed with the authority id key, so there is no way for other malicious nodes to manipulate this field without the received node observing.

## Performance, Ergonomics, and Compatibility

Irrelevant.

### Performance

Irrelevant.

### Ergonomics

Irrelevant.

### Compatibility

The changes are backwards compatible with the existing protocol, so nodes with both the old protocol and newer protocol can exist in the network, this is achieved by the fact that we use protobuf for serializing and deserializing the records, so new fields will be ignore when deserializing with the older protocol and vice-versa when deserializing an old record with the new protocol the new field will be `None` and the new code accepts this record as being valid.

## Prior Art and References

The enhancements have been inspired by the algorithm specified in [here](https://github.com/libp2p/specs/blob/master/kad-dht/README.md#value-retrieval)

## Unresolved Questions

N/A

## Future Directions and Related Material

N/A