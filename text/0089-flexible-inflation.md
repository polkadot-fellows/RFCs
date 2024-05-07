# RFC-0089: Flexible Inflation

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | May 6 2024                                                                    |
| **Description** | Revise the inflation logic in the runtime such that it can be parameterized and tweaked in an easier and more transparent way.                                                                    |
| **Authors**     | Kian Paimani                                                                                             |

## Summary

This RFC proposes a new `pallet_inflation` to be added to the Polkadot runtime, which improves
inflation machinery of the Polkadot relay chain in a number of ways:

1. More transparent and easier to understand inflation logic
2. Easier parameterization through governance
3. Decoupled from the staking logic, should inflation and staking happen in two disjoint consensus
   systems, as proposed
   [RFC32](https://polkadot-fellows.github.io/RFCs/approved/0032-minimal-relay.html).

## Motivation

The existing inflation logic in the relay chain is suffers from a number of drawbacks:

* It is dated, as the number of parachain slots (and consequently auctions) will soon no longer be a
  factor in determining the inflation rate.
* Is hard to parameterize through on-chain governance, as the only way to tweak the inflation amount
  is through changing a particular function directly in the source code ([example in Polkadot
  runtime](https://github.com/polkadot-fellows/runtimes/blob/cc3beb8b2337a65e879e1d739c33e30230888267/relay/polkadot/src/lib.rs#L743-L769)).
* Is deeply intertwined with the staking system, which is not an ideal design. For example, if one
  wishes to know the inflation amount, an [`Event` from the staking
  system](https://polkadot.subscan.io/event?page=1&time_dimension=date&module=staking&event_id=erapaid)
  has to be interpreted, which is counter-intuitive.
* Given all of this complexity, implementing an alteration which suggested a fixed percentage of the
  inflation to go to the treasury was also [not possible in an ergonomic
  way](https://github.com/paritytech/polkadot-sdk/pull/1660).

This RFC, as iterated above, proposes a new `pallet_inflation` that addresses all of the named
problems. However, **this RFC does not propose any changes to the actual inflation rate**, but
rather provide a new technical substrate (pun intended), upon which token holders can decide on the
future of the DOT token's inflation in a more clear and transparent way.

We argue that one reason why the inflation rate of Polkadot has not significantly change in ~4 years
has been the complicated process of updating it. We hope that with the tools provided in this RFC,
stakeholders can experiment with the inflation rate in a more ergonomic way. Finally, this
experimentation can be considered useful as a final step toward fixing the economics of DOT in JAM,
as proposed in the JAM graypaper.

Within the scope of this RFC, we suggest deploying the new inflation pallet in a backwards
compatible way, such that the inflation model does not change in practice, and leave the actual
changes to the token holders and researchers and further governance proposals.

> While mainly intended for Polkadot, the system proposed in this RFC is general enough such that it
> can be interpreted as a "general inflation system pallet", and can be used in newly onboarding
> parachain.

## Stakeholders

This RFCs is relevant to the following stakeholders, listed form high to low impact:

* All token holders who participate in governance, as they can possibly now propose (some degree of)
  changes to the inflation model without any coding required. Depending on the parameters, these
  changes may or may not require a particular governance track.
* Validators and all other stakers, as the staking rate of the chain might possibly change through
  the means that this pallet provides.
* All other token holders.

## Explanation

### Existing Order

First, let's further elaborate on the existing order. The current inflation logic is deeply nested
in `pallet_staking`, and `pallet_staking::Config::EraPayout` interface. Through this trait, the
staking pallet is informed how many new tokens should possibly be minted. This amount is divided
into two parts:

* an amount allocated to staking. This amount is not minted right away, and is instead minted when
  the staking rewards are paid out.
* an amount allocated to `pallet_staking::Config::RewardRemainder`, which is configured to forward
  the amount to the treasury.

As it stands now the implementation of `EraPayout` which specifies the two amounts above lives in
the respective runtime, and uses the original proposed inflation rate proposed by W3F for Polkadot.
Read more about this model [here](https://wiki.polkadot.network/docs/learn-inflation).

At present, the inflation always happens at the end of an _era_, which is a concept know by the
staking system. The duration of an era is recorded in `pallet_staking` as milliseconds (as recorded
by the standard `pallet_timestamp`), is passed to `EraPayout` as an input, as is measured against
the full year to determine how much should be inflated.

### New Order

> The naming used in this section is tentative, based on a WIP implementation, and subject to change
> before finalization of this RFC.

The new order splits the process for inflation into two steps:

1. **Sourcing** the inflation amount: This step merely specifies by how much the chain intends to
   inflate its token. This amount is not minted right away, and is instead passed over to the next
   step for *distribution*.
2. **Distributing** the aforementioned amount: A sequence of functions that decide what needs to be
   done with the sourced inflation amount. This process is expected to _transfer_ the inflation
   amount to any account that should receive it. This implies that the staking system should,
   similar to treasury, have a key-less account that will act as a temporary pot for the inflation
   amount.

In very abstract terms, an example of the above process can be:

* The chain inflates its token by a fixed 10% per year, an amount called `i`.
* Payout 20% of `i` to the treasury account.
* Payout 10% of what is left of `i` to the fellowship account.
* Payout up to 70% of what is left of `i` to staking, depending on the staking rate.
* Burn anything that is left.

A proper configuration of this pallet should use `pallet_parameters` where possible to allow for any
of the actual values used to specify `Sourcing` and `Distribution` to be changed via on-chain
governance. Please see the [example configurations](#example-configurations) section for more
details.

In the new model, inflation can happen at any point in time. Since now a new pallet is dedicated to
inflation, and it can internally store the timestamp of the last inflation point, and always inflate
the correct amount. This means that while the duration of a staking era can is 1 day, the inflation
process can happen eg. every hour. The opposite is also possible, although more complicated: The
staking/treasury system can possibly receive their corresponding income on a weekly basis, while the
era duration is still 1 day. That being said, we don't recommend using this flexibility as it brings
no clear advantage, and is only extra complexity. We recommend the inflation to still happen shortly
before the end of the staking era. This means that if the inflation `sourcing` or `distribution` is
a function of the staking rate, it can reliably use the staking rate of the last era.

Finally, as noted above, this RFC implies a new accounting system for staking to keep track of its
staking reward. In short, the new process is as follows: `pallet_inflation` will mint the staking
portion of inflation directly into a key-less account controlled by `pallet_staking`. At the end of
each era, `pallet_staking` will inspect this account, and move whatever amount is paid out into it
to another key-less account associated withe era number. The actual payouts, initiated by stakers,
will transfer from this era account into the corresponding stakers' account.

> Interestingly, this means that any account can possibly contribute to staking rewards by
> transferring DOTs to the key-less parent account controlled by the staking system.

### Proposed Implementation

A candidate implementation of this RFC can be found in
[this](https://github.com/paritytech/polkadot-sdk/compare/kiz-new-staking-inflation-system?expand=1)
branch of the `polkadot-sdk` repository. Please note the changes to:

1. `substrate/frame/inflation` to see the new pallet.
2. `substrate/frame/staking` to see the integration with the staking pallet.
3. `substrate/bin/runtime` to see how the pallet can be configured into a runtime.

#### Example Configurations

The following are working examples from the above implementation candidate, highlighting some of the
outcomes that can be achieved.

First, to parameterize the existing proposed implementation to replicate what Polkadot does today,
assuming we incorporate the fixed 2% treasury income, the outcome would be:

```rust
parameter_types! {
	pub Distribution: Vec<pallet_inflation::DistributionStep<Runtime>> = vec![
		// 2% goes to treasury, no questions asked.
		Box::new(pay::<Runtime, TreasuryAccount, dynamic_params::staking::FixedTreasuryIncome>),
		// from whatever is left, staking gets all the rest, based on the staking rate.
		Box::new(polkadot_staking_income::<
			Runtime,
			dynamic_params::staking::IdealStakingRate,
			dynamic_params::staking::Falloff,
			StakingIncomeAccount
		>),
		// Burn anything that is left.
		Box::new(burn::<Runtime, All>),
	];
}

impl pallet_inflation::Config for Runtime {
	/// Fixed 10% annual inflation.
	type InflationSource =
		pallet_inflation::FixedRatioAnnualInflation<Runtime, dynamic_params::staking::MaxInflation>;
	type Distribution = Distribution;
}
```

In this snippet, we use a number of components provided by `pallet_inflation`, namely `pay`,
`polkadot_staking_income`, `burn` and `FixedRatioAnnualInflation`. Yet, crucially, these components
are fed parameters that are all backed by an instance of the `pallet_parameters`, namely everything
prefixed by `dynamic_params`.

The above is a purely inflationary system. If one wants to change the inflation to
*dis-inflationary*, another pre-made component of `pallet_inflation` can be used:

```diff
impl pallet_inflation::Config for Runtime {
-	/// Fixed 10% annual inflation.
-	type InflationSource =
-		pallet_inflation::FixedRatioAnnualInflation<Runtime, dynamic_params::staking::MaxInflation>;
+	type InflationSource = pallet_inflation::FixedAnnualInflation<
+		Runtime,
+		dynamic_params::staking::FixedAnnualInflationAmount,
+	>;
}
```

Whereby `FixedAnnualInflationAmount` is the *fixed* absolute *value* (as opposed to *ratio*) by
which the chain inflates annually, for example 100m DOTs.

## Drawbacks

The following drawbacks are noted:

1. The solution provided here is possibly an over-engineering, if we want to achieve the goal of
   making the existing formula parameterize-able. In that case, we can merely add an instance of the
   `pallet_parameters` to the runtime and make the existing formula's ratios be provided by
   governance-controlled parameters. Although, this shortsighted but simpler solution fails to
   decouple the staking and inflation logic. This will be an issue depending on whether staking
   lives in AssetHub, or its independent parachain.
2. Some of the interfaces proposed in the draft implementation still leak the implementation detail
   of the inflation amount being reliant on eg. the staking-rate. We acknowledge this as a drawback,
   but given that many PoS inflationary systems rely on the staking rate, we believe it is a
   reasonable compromise. Such parameters can be ignored if the implementation does not need them.

## Testing, Security, and Privacy

The new `pallet_inflation`, among its integration into `pallet_staking` must be thoroughly audited
and reviewed by fellows. We also emphasize on simulating the actual inflation logic using the real
polkadot state with Chopsticks and try-runtime.

## Performance, Ergonomics, and Compatibility

The proposed system in this RFC implies a handful of extra storage reads and writes "per inflation
cycle", but given that a reasonable instance of this pallet would probably decide to inflation eg.
once per day, the performance impact is negligible.

The [drawback](#drawbacks) section above noted some ergonomic concerns.

The ["New Order"](#new-order) section above notes the compatibility notes with the existing staking
and inflation system.

## Prior Art and References

* Previous updates to the inflation system:
* [`pallet_parameters`](https://paritytech.github.io/polkadot-sdk/master/pallet_parameters/index.html)
* https://forum.polkadot.network/t/adjusting-the-current-inflation-model-to-sustain-treasury-inflow/3301

## Unresolved Questions

* Whether the design proposed in this RFC is worthy of the complexity implementing and integrating
  it? Note that a draft implementation already exists, yet the amount of further work needed to
  integrate it is non-negligible.
* Given that this pallet is general enough to also be used by parachain, the usage of timestamp
  poses risks with regard to agile-coretime, and parachains that only use on-demand cores. Accurate
  timestamps must be provided to the pallet in order to function, possibly being sourced from the
  relay-chain. @ggwpez has explored issues related to on-demand core-time and time-based systems
  [here](https://github.com/paritytech/polkadot-sdk/issues/3268).


## Future Directions and Related Material

* If initial reaction is positive researchers and economic experts should formulate their desired
  inflation parameters and systems, such that we can be sure the pallet is flexible enough in
  possibly fulfilling them without an extensive amount of work needed. Given the high flexibility of
  the pallet design as it stands, this is very unlikely.
