# RFC-0000: Pre-ELVES soft concensus

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | Date of initial proposal                                                                    |
| **Description** | Provide and exploit a soft concensus before launching approval checks                             |
| **Authors**     | Jeff Burdges, Alistair Stewart                                                            |

## Summary

Availability (bitfield) votes gain a `preferred_fork` flag which expresses the validator's opinion upon relay chain equivocations and babe forks, while still sharing availability votes for all relay chain blocks.  We make relay chain block production require a supermajority with `preferred_fork` set, so forks cannot advance if they split the honest validators, which creates an early soft concensus.  We similarly defend ELVES from relay chain equivocation attacks and prevent redundent approvals across babe forks.

## Motivation

We've always known relay chain equivocations break the ELVES threat model.  We originally envisioned ELVES having fallback pathways, but doing fallbacks requires dangerous subtle debugging.  We support more assignment schemes in ELVES this way too, including one novel post-quantum one, and very low CPU usage schemes.

We expect this early soft concensus creates back pressure that improves performance under babe forks.  

Alistair: TODO?

## Stakeholders

We modify the availability votes and restrict relay chain blocks, fork choice, and ELVES start conditions, so mostly the parachain

A sassafras RC like JAM has could avoid `preferred_fork` flag, because they have only equivocations not babe forks.

## Explanation

### Availability voting

At present, availability votes have a bitfield representing the cores, a `relay_parent`, and a signature.  We process these on-chain in several steps:  We first validate the signatures, zero any bits for cores included/enacted between the `relay_parent` and our predecessor, sum the set bits for each core, and finally include/enact the core if this exceeds 2/3rds of the validators.

Availability votes gain a `preferred_fork` flag, which honest validators set for exactly one `relay_parent` on their availability votes in a block production slot.  We say a validator prefers a fork given by chain head `h` if it provides an availability vote with `relay_parent = h` and `preferred_fork` set.

Validators recieve a minor equivocations slash if they claim to set `preferred_fork` for two different `relay_parent`s in the same slot.  In sassafras, this means preferred fork equivocations can only occur for relay chain equivocations, but under babe preferred fork equivocations could occur between primary and secondary blocks, or other primary blocks.

All validators still provide availability votes for all forks, because those non-preferred votes could still help enact candidates faster, but those non-preferred vote have `preferred_fork` zeroed.

Around this, validators could optionally provide an early availability vote that commits to their preferred fork, and then later provide a second availability votes stating the same preferred fork but a fuller bitfield, provided doing so somehow helps relay chain blcok producers.

### Fork choice

We require relay chain block producers build upon forks preferred by `2 f + 1` validators.  In other words, a relay chain block with parent `p` must contain availability bitfield votes from `2 f + 1` validators with `relay_parent = p` and `preferred_fork` set.  It follows our preferred fork votes override other fork choice priorities.

A relay chain block producer could lack this `2 f + 1` threshold for a prespective parent block `p`, in which case they must build upon the parent of `p` instead.  We know availability votes simply being slow would cause this somtimes, in which case adding slightly more delay could save the relay chain slot Alternatively though, two distinct relay chain blocks in the same slot could each wind up prefered by `f+1` validators, in which case we must abandond the slot entirely.

It's critical that honest validators carefully time when they judge their preferences.  In babe, this adds complexity:  We always prefer a primary slot over a secondary slot, so the validators should delay preferring a secondary slot, giving the primary slot enough time.  We prefer the primary slot with smallest VRF as well, so we need some delay even once we recieve a primary.

### Elves

We launch the approvals process aka (machine) elves for a relay chain block `p` once `2 f + 1` validators prefer that block, aka `2 f + 1` validators provide availability votes with `relay_parent = p` and `preferred_fork` set.  We could optionally delay this further until we have some valid decendent of `p`.

## Concerns: Drawbacks, Testing, Security, and Privacy

Adds subtle timing constraints, which could entrench existing performanceg obstacles.  We might explore variations that ignore wall clock time.

We've always known relay chain equivocations break the ELVES threat model.  We originally envisioned ELVES having fallback pathways, but these were complex and demanded unused code paths, which cannot realistically be debugged.  Although complex, the early soft concensus scheme feels less complex overall.  We know timing sucks to optimise a distributed system, but at least doing so use everyday code paths.

## Performance, Ergonomics, and Compatibility

We expect early soft concensus introduce back pressure that radically alters performance.  We no longer run approvals checks upon all forks.  As primary slots occur once every other slot in expectation, one might expect a 30% reduction in CPU load, but this depends upon diverse factors.

We apply back pressure by dropping some whole relay chain blocks though, so this shall increase the expected parachain blocktime somewhat, but how much depens upon future optimisation work.

### Compatibility

Major upgrade

## Prior Art and References

...

## Unresolved Questions

Provide specific questions to discuss and address before the RFC is voted on by the Fellowship. This should include, for example, alternatives to aspects of the proposed design where the appropriate trade-off to make is unclear.

## Future Directions and Related Material

A sassafras RC like JAM could avoid `preferred_fork` flag, by only releasing availability votes for at most one sassafras equivocation.

### Thresahold randomness

We think threshold randomness could reduce the tranche zero approcha checker assigments by roughly 40%, meaning a fixed 15 vs the expected 25 in the elves paper (30 in production now).

We do know threshold VRF based schemes that address relay chain equivocations directly, by using as input the relay chain block hash.  We have many more options with early soft concensus though.  TODO  In particular, we only know two post-quantum approaches to elves, and the bandwidth efficent one needs early soft concensus.

### Avoid wall clock time

Avoiding or minimizing wall clock time could provide an interesting development direction.

...

### Partial relay chain blocks

Above, we only discuss abandoning realy chain blocks which fail early soft concensus.  We could alternatively treat them as partial blocks and build extension partial blocks that complete them, with elves probably using randomness from the final partial block.

