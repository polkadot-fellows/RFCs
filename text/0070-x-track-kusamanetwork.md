# RFC-0070: X Track for [@kusamanetwork](https://x.com/kusamanetwork)

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | January 29, 2024                                                                            |
| **Description** | Add a governance track to facilitate posts on the @kusamanetwork's X account                |
| **Author**      | Adam Clay Steeber                                                                           |

## Summary

This RFC proposes adding a trivial governance track on Kusama to facilitate X (formerly known as Twitter) posts on the [@kusamanetwork](https://x.com/kusamanetwork) account. The technical aspect
of implementing this in the runtime is very inconsequential and straight-forward, though it might get more technical if the Fellowship wants to regulate this track
with a non-existent permission set. If this is implemented it would need to be followed up with:
1. the establishment of specifications for proposing X posts via this track, and
2. the development of tools/processes to ensure that the content contained in referenda enacted in this track would be automatically posted on X.

## Motivation

The overall motivation for this RFC is to decentralize the management of the Kusama brand/communication channel to KSM holders. This is necessary in my opinion primarily
because of the inactivity of the account in recent history, with posts spanning weeks or months apart. I am currently unaware of who/what entity manages the Kusama
X account, but if they are affiliated with Parity or W3F this proposed solution could also offload some of the legal ramifications of making (or not making)
announcements to the public regarding Kusama. While centralized control of the X account would still be present, it could become totally moot if this RFC is implemented
and the community becomes totally autonomous in the management of Kusama's X posts.

This solution does not cover every single communication front for Kusama, but it does cover one of the largest. It also establishes a precedent for other communication channels
that could be offloaded to openGov, provided this proof-of-concept is successful.

Finally, this RFC is the epitome of experimentation that Kusama is ideal for. This proposal may spark newfound excitement for Kusama and help us realize Kusama's potential
for pushing boundaries and trying new unconventional ideas.

## Stakeholders

This idea has not been formalized by any individual (or group of) KSM holder(s). To my knowledge the socialization of this idea is contained
entirely in [my recent X post here](https://twitter.com/AdamSteeber1/status/1750541362498302230), but it is possible that an idea like this one has been discussed in
other places. It appears to me that the ecosystem would welcome a change like this which is why I am taking action to formalize the discussion.

## Explanation

The implementation of this idea can be broken down into 3 primary phases:

### Phase 1 - Track configurations

First, we begin with this RFC to ensure all feedback can be discussed and implemented in the proposal. After the Fellowship and the community come to a reasonable
agreement on the changes necessary to make this happen, the Fellowship can merge changes into Kusama's runtime to include this new track with appropriate track configurations.
As a starting point, I recommend the following track configurations:

```
const APP_X_POST: Curve = Curve::make_linear(7, 28, percent(50), percent(100));
const SUP_X_POST: Curve = Curve::make_reciprocal(?, ?, percent(?), percent(?), percent(?));

// I don't know how to configure the make_reciprocal variables to get what I imagine for support,
// but I recommend starting at 50% support and sharply decreasing such that 1% is sufficient quarterway
// through the decision period and hitting 0% at the end of the decision period, or something like that.

	(
		69,
		pallet_referenda::TrackInfo {
			name: "x_post",
			max_deciding: 50,
			decision_deposit: 1 * UNIT,
			prepare_period: 10 * MINUTES,
			decision_period: 4 * DAYS,
			confirm_period: 10 * MINUTES,
			min_enactment_period: 1 * MINUTES,
			min_approval: APP_X_POST,
			min_support: SUP_X_POST,
		},
	),
```

I also recommend restricting permissions of this track to only submitting remarks or batches of remarks - that's all we'll need for its purpose. I'm not sure how
easy that is to configure, but it is important since we don't want such an agile track to be able to make highly consequential calls.

### Phase 2 - Establish Specs for X Post Track Referenda

It is important that we establish the specifications of referenda that will be submitted in this track to ensure that whatever automation tool is built can easily
make posts once a referendum is enacted. As stated above, we really only need a system.remark (or batch of remarks) to indicate the contents of a proposed X post.
The most straight-forward way to do this is to require remarks to adhere to X's requirements for making [posts via their API](https://developer.twitter.com/en/docs/twitter-api/tweets/manage-tweets/api-reference/post-tweets).

For example, if I wanted to propose a post that contained the text "Hello World!" I would propose a referendum in the X post track that contains the following call data:
`0x0000607b2274657874223a202248656c6c6f20576f726c6421227d` (i.e. `system.remark('{"text": "Hello World!"}')`).

At first, we could support text posts only to prove the concept. Later on we could expand this spec to add support for media, likes, retweets, replies, polls, and
whatever other X features we want.

### Phase 3 - Release, Tooling, & Documentation

Once we agree on track configurations and specs for referenda in this track, the Fellowship can move forward with merging these changes into Kusama's runtime and
include them in its next release. We could also move forward with developing the necessary tools that would listen for enacted referenda to post automatically on X.
This would require coordination with whoever controls the X account; they would either need to run the tools themselves or add a third party as an authorized user to
run the tools to make posts on the account's behalf. This is a bottleneck for decentralization, but as long as the tools are run by the X account manager or by a trusted third party
it should be fine. I'm open to more decentralized solutions, but those always come at a cost of complexity.

For the tools themselves, we could open a bounty on Kusama for developers/teams to bid on. We could also just ask the community to step up with a Treasury proposal
to have anyone fund the build. Or, the Fellowship could make the release of these changes contingent on their endorsement of developers/teams to build these tools. Lots of options!
For the record, me and my team could develop all the necessary tools, but all because I'm proposing these changes doesn't entitle me to funds to build the tools needed
to implement them. Here's what would be needed:

- a listener tool that would listen for enacted referenda in this track, verify the format of the remark(s), and submit to X's API with authenticating credentials
- a UI to allow layman users to propose referenda on this track

After everything is complete, we can update the Kusama wiki to include documentation on the X post specifications and include links to the tools/UI.

## Drawbacks

The main drawback to this change is that it requires a lot of off-chain coordination. It's easy enough to include the track on Kusama but it's a totally different
challenge to make it function as intended. The tools need to be built and the auth tokens need to be managed. It would certainly add an administrative burden to whoever
manages the X account since they would either need to run the tools themselves or manage auth tokens.

This change also introduces on-going costs to the Treasury since it would need to compensate people to support the tools necessary to facilitate this idea. The ultimate
question is whether these on-going costs would be worth the ability for KSM holders to make posts on Kusama's X account.

There's also the risk of misconfiguring the track to make referenda too easy to pass, potentially allowing a malicious actor to get content posted on X that violates X's ToS.
If that happens, we risk getting Kusama banned on X!

This change might also be outside the scope of the Fellowship/openGov. Perhaps the best solution for the X account is to have the Treasury pay for a professional
agency to manage posts. It wouldn't be decentralized but it would probably be more effective in terms of creating good content.

Finally, this solution is merely pseudo-decentralization since the X account manager would still have ultimate control of the account. It's decentralized insofar as
the auth tokens are given to people actually running the tools; a house of cards is required to facilitate X posts via this track. Not ideal.

## Testing, Security, and Privacy

There's major precedent for configuring tracks on openGov given the amount of power tracks have, so it shouldn't be hard to come up with a sound configuration.
That's why I recommend restricting permissions of this track to remarks and batches of remarks, or something equally inconsequential.

Building the tools for this implementation is really straight-forward and could be audited by Fellowship members, and the community at large, on Github.

The largest security concern would be the management of Kusama's X account's auth tokens. We would need to ensure that they aren't compromised.

## Performance, Ergonomics, and Compatibility

### Performance

If a track on Kusama promises users that compliant referenda enacted therein would be posted on Kusama's X account, users would expect that track to perform as promised.
If the house of cards tumbles down and a compliant referendum doesn't actually get anything posted, users might think that Kusama is broken or unreliable. This
could be damaging to Kusama's image and cause people to question the soundness of other features on Kusama.

As mentioned in the drawbacks, the performance of this feature would depend on off-chain coordinations. We can reduce the administrative burden of these coordinations
by funding third parties with the Treasury to deal with it, but then we're relying on trusting these parties.

### Ergonomics

By adding a new track to Kusama, governance platforms like Polkassembly or Nova Wallet would need to include it on their applications. This shouldn't be too
much of a burden or overhead since they've already built the infrastructure for other openGov tracks.

### Compatibility

This change wouldn't break any compatibility as far as I know.

## References

One reference to a similar feature requiring on-chain/off-chain coordination would be the Kappa-Sigma-Mu Society. Nothing on-chain necessarily enforces the rules
or facilitates bids, challenges, defenses, etc. However, the Society has managed to maintain itself with integrity to its rules. So I don't think this is totally
out of Kusama's scope. But it will require some off-chain effort to maintain.

## Unresolved Questions

- Who will develop the tools necessary to implement this feature? How do we select them?
- How can this idea be better implemented with on-chain/substrate features?
