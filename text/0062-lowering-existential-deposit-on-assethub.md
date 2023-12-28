# RFC-0062: Lowering Existential Deposit on  Asset Hub for Polkadot

|                 |                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------- |
| **Start Date**  | 28 December 2023                                                                                    |
| **Description** | A proposal to reduce the existential deposit required for Asset Hub for Polkadot, making (a) asset minting to all DOT token holders more affordable for Asset Minters and (b) asset conversion on Asset Hub for Polkadot more accessible for all DOT Token holders. |
| **Authors**     | [Sourabh Niyogi](https://github.com/sourabhniyogi)  |

## Summary

This RFC proposes lowering the existential deposit requirements on Asset Hub for Polkadot by a factor of 25, from 0.1 DOT to .004 DOT.  The objective is to lower the barrier to entry for asset minters to mint a new asset to the entire DOT token holder base, and make Asset Hub on Polkadot a place where everyone can do small asset conversions.

## Motivation

The current Existential deposit is 0.1 DOT on Asset Hub for Polkadot.  While this is not does not appear to be a significant financial barrier for most people (only $0.80), this value makes Asset Hub impractical for Asset Hub Minters, specifically for the case where the Asset Hub Minters wishes to mint a new asset for the entire community of DOT holders (e.g. 1.25MM DOT holders would cost 125K DOT @ $8 = $1MM).    

By lowering the existential deposit requirements from 0.1 DOT to 0.004 DOT, the cost of minting to the entire community of DOT holders goes from an unmanagable number [125K DOT, the value of several houses  circa December 2023] down to a manageable number [5K DOT, the value of a car circa December 2023].  


## Stakeholders

- **Asset Hub Minters**: Those who call `asset.mint`.
- **DOT Token Holders**: Those who hold DOT on the Polkadot Relay Chain, Asset Hub for Polkadot or other chains.

## Explanation

The exact amount of the existential deposit (ED) is proposed to be 0.004 DOT based on
* asset.transfer costing 0.00124 DOT
* asset.transferKeepAlive costing 0.00092 DOT
This implies that the new ED can support  3 asset.transfer or 4 asset.transferKeepAlive operations.

Empirically, asset.transferKeepAlive is the lowest valued extrinsic at this time, so there is no value to lowering the ED below 0.001 DOT.  Lowering further would be unnecessary invite account spam attacks common to EVM chains, which have no ED.  


By [RFC #32 Minimal Relay Chain](https://github.com/polkadot-fellows/RFCs/blob/main/text/0032-minimal-relay.md), believed to be implemented within the next couple of years, Asset Hub should be able to support the entire DOT existing token holder base.  If there is any doubt that Substrate chains can store 10x-100x as many elements, then this change should test Asset Hub for Polkadot's capabilities.

The implementation is believed to be trivial:

https://github.com/polkadot-fellows/runtimes/blob/30e0dbfdcb78722ed61325c0ebf1efdcdb6033ba/system-parachains/asset-hubs/asset-hub-polkadot/src/constants.rs#L21

from
 ```
pub const EXISTENTIAL_DEPOSIT: Balance = constants::currency::EXISTENTIAL_DEPOSIT / 10;
```
to
```
pub const EXISTENTIAL_DEPOSIT: Balance = constants::currency::EXISTENTIAL_DEPOSIT / 250;
```

Given this change, once Asset Hub Minter 1 spends approximately 5K DOT to cover the ED for the entire DOT Token Holder base, then Asset Hub Minter 2 who subsequently wishes to mint to the same DOT Tokenholder will not pay anything (assuming no new DOT Tokenholders); however, both the first and second holder will need to spend 2,485 DOT to conduct their `asset.mint` operations (0.001988 DOT per `asset.mint`)  on the entire 1.25MM DOT Token holders.  If Minter 3 does the same thing when there are 1.26MM DOT Token holders (10K new DOT holders), then Minter 3 will bear the cost of 40 DOT.   This is summarized here:

| Minter | Cost to fund ED for 1.25MM users | Cost to call `asset.mint` for 1.25MM users |
|----|----|---|
| Minter 1 | 5K DOT (instead of 125K DOT) | 2,485 DOT |
| Minter 2 | 0 DOT                 | 2,485 DOT |
| Minter 3 | 40 DOT                | 2,485 DOT |

As new DOT Token Holders always enter the system, this lower ED will reduce costs for all new minters, not just Minter 1.  Given this reduced cost for Asset Hub Minters (Minter 2, 3, ...), this will enable a greater number of  DOT Token Holders to use the assetconversion pallet for newly minted assets.   

It is believed that having a greater number of assetconversion end-users will be massively beneficial for DOT ecosystem growth, especially for key asset pools of DOT/USDC and DOT/USDT, which can be reliably predicted to be the most widely used pools on the Asset Hub for Polkadot.


It is assumed that the estimated cost to store a single account is _less_ than 0.004 DOT.  If this assumption is challenged by Polkadot Fellows, we request the Fellows provided a empirical determination of what the actual cost of storing a single account is, at present day numbers of DOT Token Holders (approximately 1-2MM) and then to support a factor or 10-1000x growth over the next 5 years.  This assumption has been discussed on the forum: [Polkadot AssetHub - high NFT collection deposit](https://forum.polkadot.network/t/polkadot-assethub-high-nft-collection-deposit/4262/13)

 First, the cost has to be mapped from DOT into real world USD storage costs of running an Asset Hub on Polkadot node, and the DOT / USD ratio itself has varied widely in the past and will continue to do so in the future.     Second, according to this analysis, at present the pragmatic cost of estimating storage is approximated by what it costs to store accounts for 1 or 2 years at most.  Underestimates on this cost is believed to be an economic subsidy while overestimates on this cost is believe to be an economic depressant on activity.

Given the relatively underused AssetHub for Polkadot, we believe the correct thing to do is to aim to _subsidize Asset Hub activity_ with a lower ED.


## Drawbacks

The primary drawback for _subsidize Asset Hub activity_ with a 25x lower ED is borne by Asset Hub users  in the distant future who will pay for the subsidized activity by lowering the ED.  

## Testing, Security, and Privacy

Lowering the ED from 0.004 DOT to 0 DOT would clearly unnecessarily invite account spam attacks common to EVM chains, which have no ED.

Lowering ED from 0.004 DOT to 0.002 DOT or 0.001 DOT would threaten user experience wherein just 1 or 2 `asset` pallet operation would reap the account.

## Performance, Ergonomics, and Compatibility

### Performance

This change is not expected to have a significant impact on the overall performance of the Asset Hub for Polkadot.    

### Ergonomics

The proposed change aims to enhance the user experience for:
* Asset Creators/Minters, making the cost to mint an asset for all DOT Token holders around 5K DOT.
* DOT Token Holders, who will enjoy many new assets on Asset Hub created by the above minters

### Compatibility

It is believed that Asset Hub for Kusama can undergo the same logic change without issue.

For Asset Hub for Polkadot, it is extremely desirable that this change be approved in early 2024 with some urgency.

## Unresolved Questions

It is desirable to know the cost to store an account on Asset Hub for Polkadot when the number of accounts is 10MM, 100MM, 1B to better the cost of the subsidy.     We do not believe a precise answer to this merits delaying a subsidy at present.  However, if approved, we believe once the number of accounts reaches 10MM-25MM or exponential growth is observed, this ED be reevaluated.

## Future Directions and Related Material

If accepted, this RFC could pave the way for other accessibility improvements:
* EVM Contracts on Asset Hub for Polkadot/Kusama
* ink! Contracts on Asset Hub for Polkadot/Kusama
* CorePlay activity on Asset Hub for Polkadot/Kusama
