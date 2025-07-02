# RFC-0006: Dynamic Pricing for Bulk Coretime Sales

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | July 09, 2023                                                                               |
| **Description** | A dynamic pricing model to adapt the regular price for bulk coretime sales                  |
| **Authors**     | Tommi Enenkel (Alice und Bob)                                                               |
| **License**     | MIT                                                                                         |

## Summary

This RFC proposes a dynamic pricing model for the sale of Bulk Coretime on the Polkadot UC. The proposed model updates the regular price of cores for each sale period, by taking into account the number of cores sold in the previous sale, as well as a limit of cores and a target number of cores sold. It ensures a minimum price and limits price growth to a maximum price increase factor, while also giving govenance control over the steepness of the price change curve. It allows governance to address challenges arising from changing market conditions and should offer predictable and controlled price adjustments.

Accompanying visualizations are provided at [1].

## Motivation

RFC-1 proposes periodic Bulk Coretime Sales as a mechanism to sell continouos regions of blockspace (suggested to be 4 weeks in length). A number of Blockspace Regions (compare RFC-1 & RFC-3) are provided for sale to the Broker-Chain each period and shall be sold in a way that provides value-capture for the Polkadot network. The exact pricing mechanism is out of scope for RFC-1 and shall be provided by this RFC. 

A dynamic pricing model is needed. A limited number of Regions are offered for sale each period. The model needs to find the price for a period based on supply and demand of the previous period.

The model shall give Coretime consumers predictability about upcoming price developments and confidence that Polkadot governance can adapt the pricing model to changing market conditions.

### Requirements
1. The solution SHOULD provide a dynamic pricing model that increases price with growing demand and reduces price with shrinking demand.
2. The solution SHOULD have a slow rate of change for price if the number of Regions sold is close to a given sales target and increase the rate of change as the number of sales deviates from the target.
3. The solution SHOULD provide the possibility to always have a minimum price per Region.
4. The solution SHOULD provide a maximum factor of price increase should the limit of Regions sold per period be reached.
5. The solution should allow governance to control the steepness of the price function

## Stakeholders

The primary stakeholders of this RFC are:

- Protocol researchers and evelopers
- Polkadot DOT token holders
- Polkadot parachains teams
- Brokers involved in the trade of Bulk Coretime

## Explanation

### Overview

The dynamic pricing model sets the new price based on supply and demand in the previous period. The model is a function of the number of Regions sold, piecewise-defined by two power functions.
- The left side ranges from 0 to the target. It represents situations where demand was lower than the target.
- The right side ranges from the target to limit. It represents situations where demand was higher than the target.

The curve of the function forms a plateau around the target and then falls off to the left and rises up to the right. The shape of the plateau can be controlled via a scale factor for the left side and right side of the function respectively.

### Parameters
From here on, we will also refer to Regions sold as 'cores' to stay congruent with RFC-1.

| Name                       | Suggested Value              | Description                                                | Constraints                     |
| -------------------------- | ---------------------------- | ---------------------------------------------------------- | ------------------------------- |
| `BULK_LIMIT`               | 45                           | The maximum number of cores being sold                     | `0 < BULK_LIMIT`                |
| `BULK_TARGET`              | 30                           | The target number of cores being sold                      | `0 < BULK_TARGET <= BULK_LIMIT` |
| `MIN_PRICE`                | 1                            | The minimum price a core will always cost.                 | `0 < MIN_PRICE`                 |
| `MAX_PRICE_INCREASE_FACTOR`| 2                            | The maximum factor by which the price can change.          | `1 < MAX_PRICE_INCREASE_FACTOR` |
| `SCALE_DOWN`               | 2                            | The steepness of the left side of the function.            | `0 < SCALE_DOWN`                |
| `SCALE_UP`                 | 2                            | The steepness of the right side of the function.           | `0 < SCALE_UP`                  |


### Function

```math
P(n) = \begin{cases} 
    (P_{\text{old}} - P_{\text{min}}) \left(1 - \left(\frac{T - n}{T}\right)^d\right) + P_{\text{min}} & \text{if } n \leq T \\
    ((F - 1) \cdot P_{\text{old}} \cdot \left(\frac{n - T}{L - T}\right)^u) + P_{\text{old}} & \text{if } n > T 
\end{cases}
```

- $P_{\text{old}}$ is the `old_price`, the price of a core in the previous period.
- $P_{\text{min}}$ is the `MIN_PRICE`, the minimum price a core will always cost.
- $F$ is the `MAX_PRICE_INCREASE_FACTOR`, the factor by which the price maximally can change from one period to another.
- $d$ is the `SCALE_DOWN`, the steepness of the left side of the function.
- $u$ is the `SCALE_UP`, the steepness of the right side of the function.
- $T$ is the `BULK_TARGET`, the target number of cores being sold.
- $L$ is the `BULK_LIMIT`, the maximum number of cores being sold.
- $n$ is `cores_sold`, the number of cores being sold.

#### Left side
The left side is a power function that describes an increasing concave downward curvature that approaches `old_price`. We realize this by using the form $y = a(1 - x^d)$, usually used as a downward sloping curve, but in our case flipped horizontally by letting the argument $x = \frac{T-n}{T}$ decrease with $n$, doubly inversing the curve.

This approach is chosen over a decaying exponential because it let's us a better control the shape of the plateau, especially allowing us to get a straight line by setting `SCALE_DOWN` to $1$.

#### Ride side
The right side is a power function of the form $y = a(x^u)$.

### Pseudo-code

```
NEW_PRICE := IF CORES_SOLD <= BULK_TARGET THEN
    (OLD_PRICE - MIN_PRICE) * (1 - ((BULK_TARGET - CORES_SOLD)^SCALE_DOWN / BULK_TARGET^SCALE_DOWN)) + MIN_PRICE
ELSE
    ((MAX_PRICE_INCREASE_FACTOR - 1) * OLD_PRICE * ((CORES_SOLD - BULK_TARGET)^SCALE_UP / (BULK_LIMIT - BULK_TARGET)^SCALE_UP)) + OLD_PRICE
END IF
```

### Properties of the Curve
#### Minimum Price
We introduce `MIN_PRICE` to control the minimum price.

The left side of the function shall be allowed to come close to 0 if cores sold approaches 0. The rationale is that if there are actually 0 cores sold, the previous sale price was too high and the price needs to adapt quickly.

#### Price forms a plateau around the target
If the number of cores is close to `BULK_TARGET`, less extreme price changes might be sensible. This ensures that a drop in sold cores or an increase doesn’t lead to immediate price changes, but rather slowly adapts. Only if more extreme changes in the number of sold cores occur, does the price slope increase.

We introduce `SCALE_DOWN` and `SCALE_UP` to control for the steepness of the left and the right side of the function respectively.

#### Max price increase factor
We introduce `MAX_PRICE_INCREASE_FACTOR` as the factor that controls how much the price may increase from one period to another.

Introducing this variable gives governance an additional control lever and avoids the necessity for a future runtime upgrade.

### Example Configurations

#### Baseline
This example proposes the baseline parameters. If not mentioned otherwise, other examples use these values. 

The minimum price of a core is 1 DOT, the price can double every 4 weeks. Price change around `BULK_TARGET` is dampened slightly.
```
BULK_TARGET = 30
BULK_LIMIT = 45
MIN_PRICE = 1
MAX_PRICE_INCREASE_FACTOR = 2
SCALE_DOWN = 2
SCALE_UP = 2
OLD_PRICE = 1000
```

#### More aggressive pricing
We might want to have a more aggressive price growth, allowing the price to triple every 4 weeks and have a linear increase in price on the right side.

```
BULK_TARGET = 30
BULK_LIMIT = 45
MIN_PRICE = 1
MAX_PRICE_INCREASE_FACTOR = 3
SCALE_DOWN = 2
SCALE_UP = 1
OLD_PRICE = 1000
```

#### Conservative pricing to ensure quick corrections in an affluent market
If governance considers the risk that a sudden surge in DOT price might price chains out from bulk coretime markets, it can ensure the model quickly reacts to a quick drop in demand, by setting 0 < SCALE_DOWN < 1 and setting the max price increase factor more conservatively.

```
BULK_TARGET = 30
BULK_LIMIT = 45
MIN_PRICE = 1
MAX_PRICE_INCREASE_FACTOR = 1.5
SCALE_DOWN = 0.5
SCALE_UP = 2
OLD_PRICE = 1000
```

#### Linear pricing
By setting the scaling factors to 1 and potentially adapting the max price increase, we can achieve a linear function

```
BULK_TARGET = 30
BULK_LIMIT = 45
MIN_PRICE = 1
MAX_PRICE_INCREASE_FACTOR = 1.5
SCALE_DOWN = 1
SCALE_UP = 1
OLD_PRICE = 1000
```


## Drawbacks
None at present.

## Prior Art and References

This pricing model is based on the requirements from the basic linear solution proposed in RFC-1, which is a simple dynamic pricing model and only used as proof. The present model adds additional considerations to make the model more adaptable under real conditions. 

## Future Possibilities

This RFC, if accepted, shall be implemented in conjunction with RFC-1.

## References

- [1] Polkadot forum post with visualizations: [Dynamic Pricing for Bulk Coretime Sales](https://forum.polkadot.network/t/dynamic-pricing-for-bulk-coretime-sales/3359)
