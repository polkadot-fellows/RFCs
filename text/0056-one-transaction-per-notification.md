# RFC-0056: Enforce only one transaction per notification

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2023-11-30                                                                                  |
| **Description** | Modify the transactions notifications protocol to always send only one transaction at a time|
| **Authors**     | Pierre Krieger                                                                              |

## Summary

When two peers connect to each other, they open (amongst other things) a so-called "notifications protocol" substream dedicated to gossiping transactions to each other.

Each notification on this substream currently consists in a SCALE-encoded `Vec<Transaction>` where `Transaction` is defined in the runtime.

This RFC proposes to modify the format of the notification to become `(Compact(1), Transaction)`. This maintains backwards compatibility, as this new format decodes as a `Vec` of length equal to 1.

## Motivation

There exists three motivations behind this change:

- It is technically impossible to decode a SCALE-encoded `Vec<Transaction>` into a list of SCALE-encoded transactions without knowing how to decode a `Transaction`. That's because a `Vec<Transaction>` consists in several `Transaction`s one after the other in memory, without any delimiter that indicates the end of a transaction and the start of the next. Unfortunately, the format of a `Transaction` is runtime-specific. This means that the code that receives notifications is necessarily tied to a specific runtime, and it is not possible to write runtime-agnostic code.

- Notifications protocols are already designed to be optimized to send many items. Currently, when it comes to transactions, each item is a `Vec<Transaction>` that consists in multiple sub-items of type `Transaction`. This two-steps hierarchy is completely unnecessary, and was originally written at a time when the networking protocol of Substrate didn't have proper multiplexing.

- It makes the implementation more straight-forward by not having to repeat code related to back-pressure. See explanations below.

## Stakeholders

Low-level developers.

## Explanation

To give an example, if you send one notification with three transactions, the bytes that are sent on the wire are:

```
concat(
    leb128(total-size-in-bytes-of-the-rest),
    scale(compact(3)), scale(transaction1), scale(transaction2), scale(transaction3)
)
```

But you can also send three notifications of one transaction each, in which case it is:

```
concat(
    leb128(size(scale(transaction1) + 1)), scale(compact(1)), scale(transaction1),
    leb128(size(scale(transaction2) + 1)), scale(compact(1)), scale(transaction2),
    leb128(size(scale(transaction3) + 1)), scale(compact(1)), scale(transaction3)
)
```

Right now the sender can choose which of the two encoding to use. This RFC proposes to make the second encoding mandatory.

The format of the notification would become a SCALE-encoded `(Compact(1), Transaction)`.
A SCALE-compact encoded `1` is one byte of value `4`. In other words, the format of the notification would become `concat(&[4], scale_encoded_transaction)`.
This is equivalent to forcing the `Vec<Transaction>` to always have a length of 1, and I expect the Substrate implementation to simply modify the sending side to add a `for` loop that sends one notification per item in the `Vec`.

As explained in the motivation section, this allows extracting `scale(transaction)` items without having to know how to decode them.

By "flattening" the two-steps hierarchy, an implementation only needs to back-pressure individual notifications rather than back-pressure notifications and transactions within notifications.

## Drawbacks

This RFC chooses to maintain backwards compatibility at the cost of introducing a very small wart (the `Compact(1)`).

An alternative could be to introduce a new version of the transactions notifications protocol that sends one `Transaction` per notification, but this is significantly more complicated to implement and can always be done later in case the `Compact(1)` is bothersome.

## Testing, Security, and Privacy

Irrelevant.

## Performance, Ergonomics, and Compatibility

### Performance

Irrelevant.

### Ergonomics

Irrelevant.

### Compatibility

The change is backwards compatible if done in two steps: modify the sender to always send one transaction per notification, then, after a while, modify the receiver to enforce the new format.

## Prior Art and References

Irrelevant.

## Unresolved Questions

None.

## Future Directions and Related Material

None. This is a simple isolated change.
