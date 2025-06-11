# RFC-0149: Renewal Adjustment

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 30th of May 2025                                                                    |
| **Description** | Amendmend to RFC-1 Agile Coretime                                                                    |
| **Authors**     | eskimor                                                            |

## Summary

This RFC proposes an amendment to RFC-1 Agile Coretime: Renewal prices will no
longer only be adjusted based on a configurable renewal bump, but also to the
lower end of the current sale - if that turns out higher. 

An implementation can be found [here](https://github.com/paritytech/polkadot-sdk/pull/8630).

## Motivation

In RFC-1, we strived for perfect predictability on renewal prices, but what we
expected unfortunately got proven in practice: Perfect predictability allows
for core hoarding and cheap market manipulation, with the effect that both on
Kusama and Polkadot there is no free market for cores anymore. Some actor is
hoarding a lot of cores cheaply, driving up prices without getting affected
himself.

This is causing issues for teams wanting to join, existing teams wanting to
extend to elastic scaling and in practice, even existing teams wanting to keep
their core, because they forgot to renew in the interlude.

In a nutshell the current situation is severely hindering teams from deploying
on Polkadot: We are essentially in a Denial of Service situation.

## Stakeholders

Stakeholders should be existing teams already having a core and new teams wanting to join the ecosystem.

## Explanation


This RFC proposes to fix this situation, by limiting renewal price
predictability to reasonable levels, by introducing a weak coupling to the
current market price: We ensure that the price for renewals is at least as high
as the end price of the current sale.

The existing price cap for renewals will be changed from:

```rust
		let price_cap = record.price + config.renewal_bump * record.price;
```

to 

```rust
		let price_cap = cmp::max(record.price + config.renewal_bump * record.price, end_price);
```

What does this mean in the context of the currently deployed implementation?

The Dutch auction of a sale, has an end price, a target price in the middle and
a starting price. The target price is ten times the end price and the start
price is ten times the target price (or 100 times the end price).

The target price is the expected market price of a core. To be more precise,
what happens is that, for a sale X+1 the end price is set to the clearing price
of sale X divided by 10. This results in a maximum adjustment of the price
curve (and the end price) by a factor of 10 each sale.

To illustrate this with actual numbers: Let's consider an end price of 10 DOT,
then if someone bought all the available cores at 1000 DOT (starting price),
then the end price in the next sale would become 100 DOT.

Prior to this RFC, all of this hardly mattered for existing tenants, which
keeps being the case, except for extreme market changes - or if you happened to
be lucky to buy below the target price. In particular, in the above example,
all cores were sold at 1000 DOT, then tenants who were lucky holding a core at
10 DOT, would now get bumped to 100 DOT. Tenants who bought at the current
target price or above would still not be affected.

In other words, we limit price predictability: If the market experiences a bump
of 100 times the current price, renewals will be affected by a factor of 10.
Even in that extreme situation, renewal prices would still be 10x more stable than
the market: Therefore it is fair to say that this RFC is maintaining
predictability within reasonable bounds.

So, while predictability is mostly maintained, this RFC ensures that renewals
don't get detached too much from the current market, with the following
effects:

1. Attacking the system is becoming very expensive. Let's assume 10 cores are
   for sale at an end price of 10 DOT, then an attacker would need to invest
10_000 DOT to drive up renewal prices to 100 DOT. Not only is this expensive in
itself with limited effect, the attacker would also have driven up the price
for his own renewals: Core hoarding for price manipulation is no longer
profitable. An attacker would be at least as much affected as the honest
parties he is targeting. In practice likely more, as core hoarding hardly means
holding only one or two cores.
2. In the honest scenario, where we are just experiencing great adoption: Once
   cores become scarce, prices would go up and renewals would be affected too.
They are still favored over new entrants (they pay 10x less), but as prices
keep increasing, eventually the least profitable projects will give up their
cores, freeing up resources for new entrants. 


Recommendations for deployment:

1. Deploy with a price curve enforcing a minimum end price, we suggest 10 DOT
   and 1 KSM. This is to ensure prompt recovery to sound market conditions.
2. Together with a minimum price, it should be safe to add more cores. We
   recommend adding at least 10 additional cores, 20 would be better. This
results in immediate availability for cores for teams waiting and secondly
ensures that any additional attack will be expensive: 10 cores, results in
1000x the attack cost, compared to the caused damage on individual projects.
3. While adding more cores should be safe, we would still recommend to not go
   to 100% capacity to have some leeway for governance in case of unforeseen
attacks/weaknesses. 


## Drawbacks

We are dropping almost perfect predictability on renewal prices, in favor of
predictability within reasonable bounds. The introduction of a minimum price,
will also result in huge relative price adjustments for existing tenants,
because prices were so unreasonably low on Kusama. In practice this should not
be an issue for any real project.

## Testing, Security, and Privacy

This RFC is proposing a single line of code change. A [test has been
added](https://github.com/paritytech/polkadot-sdk/pull/8630/files#diff-5c1aa49e85b8916278350cef73f121ceda192adbbf3b16d35e52626a96243fc9R500)
to make sure it is working as expected.

Security of the system will be improved, as attacks now become expensive. It is
worth mentioning though that while this RFC ensures that attacks are very
costly, it makes attacking existing tenants possible, which was not the case
before. This seems to be a sound trade-off though for the following reasons:

1. Any attack costs orders of magnitudes more than the harm it is imposing on
   existing projects. Sustaining an attack quickly goes into the hundred
thousands of DOT, each month.
2. Renewals costs are always pre-determined a month ahead. Together with market
   only adjusting by a maximum of 10 times each month, this gives plenty of
time to react via Governance/treasury help out to projects, which are seen
valuable by the DAO, but can not afford the price jumps. Keeping some spare
cores on the side for such situations seems sensible too.
3. Existing tenants are not automatically more valuable than new tenants. Open
   market participants are still 10 times more exposed to attacks than existing
tenants. Having them exposed at least with this 10x reduction seems a sensible
valuation.

There are no privacy concerns.

## Performance, Ergonomics, and Compatibility

The proposed changes are backwards compatible. No interfaces are changed.
Performance is not affected. Ergonomics should be greatly improved especially
for new entrants, as cores will be available for sale again. A configured
minimum price also ensures that the starting price of the Dutch auction stays
reasonably high, deterring sniping all the cores at the beginning of a sale.

## Prior Art and References

This RFC is altering RFC-1 and taking ideas from RFC-17, mainly the introduction of a minimum price.

## Future Directions and Related Material

This RFC should solve the immediate problems we are seeing in production right
now. Longer term, improvements to the market in terms of price discovery
(RFC-17) should be considered, especially once demand grows.

There is an edge case remaining for situations like the following:

1. Not enough demand.
2. Prices drop to the end price.
3. Someone buys all the cores relatively cheaply & renews.
4. Market deprived of cores, but price only goes up by renewal bumps (all cores are renewed).
5. Market would only recover very slowly or when someone gives up on their renewal.

Mitigation for this edge case is relatively simple: Bump renewals more
aggressively the less cores are available on the free market. For now, leaving
a few cores not for sale should be enough to mitigate such a situation.
