# RFC-0155: Polkadot$

|                 |                                                                 |
| --------------- | --------------------------------------------------------------- |
| **Start Date**  | 2025-09-11                                                      |
| **Description** | Polkadot native stablecoin on Asset Hub                         |
| **Authors**     | Bryan Chen                                                      |

## Summary

Polkadot$ / Polkadot Dollar / PDD (exact name TBD) is a new DOT-collateralized stablecoin deployed on Asset Hub. It is an overcollateralized stablecoin backed purely by DOT. The implementation follows the Honzon protocol pioneered by Acala. In addition, this RFC introduces an opt-in PDD Savings module that lets holders lock PDD to earn interest funded from stability fees.

## Motivation

> "Polkadot Hub should have a native DOT backed stable coin because people need it and otherwise we will haemorrhage benefits, liquidity and/or security." - Gav

Primary use cases of PDD:
- As with any overcollateralized stablecoin, PDD lets users borrow against their DOT so they can spend PDD without selling DOT immediately.
- PDD is designed to integrate with the Polkadot Treasury so payments can be made in PDD instead of DOT, avoiding the need for the Treasury to manage a stablecoin reserve.
- Eventually PDD may be used for staking rewards to replace DOT inflation.
- Passive holding option: PDD holders can lock into the Savings module to earn interest, strengthening demand-side support for the peg.

## Stakeholders

- PDD holders
- Polkadot Treasury
- Ecosystem projects
- Protocol developers

## Explanation

PDD is implemented using the Honzon protocol stack used to power aUSD, adapted for DOT-only collateral on Asset Hub.

### Protocol Overview

The Honzon protocol functions as a lending system where users can:
1. **Deposit collateral**: Lock DOT as collateral in Collateralized Debt Positions (CDPs).
2. **Mint PDD**: Generate PDD stablecoins against collateral value.
3. **Accrue interest**: Pay interest over time via the debit exchange rate (stability fee).
4. **Maintain health**: Keep CDPs above the liquidation ratio to avoid liquidation.
5. **Liquidation**: Underwater CDPs are liquidated via DEX and/or auctions to keep the system solvent.

### Oracle Infrastructure

The PDD system relies on robust oracle infrastructure to maintain accurate price feeds for DOT and ensure proper collateral valuations.

**Oracle source**
- **DEX price feeds**: Real-time DOT prices aggregated from decentralized exchanges across parachains via XCM messaging or state-proofs. A time-weighted average price (TWAP) will be used to resist short-term manipulation.

**Price aggregation mechanism**
- **Deviation filtering**: Price feeds that deviate significantly from the median are flagged and may be excluded from calculations. Circuit breakers pause updates on extreme moves to protect solvency.

### Issuance

DOT holders can open a vault (CDP) to lock their DOT and borrow up to a protocol-defined percentage of its value as PDD, subject to a required collateral ratio and debt ceilings.

### Redemption

At any time, the vault owner can repay PDD (principal plus accrued interest via the debit exchange rate) to unlock DOT, fully or partially.

### Liquidation

When a vault's collateral ratio falls below the liquidation ratio, it becomes unsafe and is liquidated. The system employs a tiered liquidation approach to maximize efficiency and minimize market impact.

**Primary liquidation: DEX-first approach**
1. **Instant settlement**: Liquidation is executed immediately through available DEX liquidity on Asset Hub.
2. **Market-rate execution**: DOT is sold at current market rates with minimal slippage, reducing the liquidation penalty for vault owners.
3. **Automated execution**: Off-chain workers continuously monitor vault health and trigger DEX liquidations automatically when ratios fall below thresholds.
4. **Slippage protection**: Maximum slippage limits prevent excessive losses during low-liquidity periods.

**Fallback liquidation: auction mechanism**
- When DEX liquidity is insufficient or slippage exceeds acceptable limits, the system falls back to a traditional auction system.

**Liquidation process flow**
1. **Health check**: Off-chain workers monitor collateral ratios continuously.
2. **Trigger**: When a ratio falls below the liquidation threshold, liquidation is queued.
3. **DEX attempt**: The system attempts to sell required collateral through the Asset Hub DEX.
4. **Auction fallback**: If DEX liquidation fails or is insufficient, collateral enters the auction system.
5. **Settlement**: Proceeds repay CDP debt plus penalties; excess collateral is returned to the owner.
6. **Bad debt handling**: Any shortfalls become bad debt managed by CDP treasury mechanisms.

Any excess collateral after repaying debt and penalties is refunded to the owner. Shortfalls become bad debt and are handled by CDP treasury mechanisms.

### Incentives: PDD Savings (opt-in)

The protocol includes a Savings module that allows PDD holders to lock tokens and earn interest paid from stability fees.

**Design goals**
- Create baseline demand for PDD, improving peg robustness.
- Return a configurable share of stability fees to long-term holders after safety buffers.
- Keep UX simple and native to Asset Hub.

**Mechanics**
- **Locking**: Users deposit PDD into the Savings pallet to receive an internal savings balance (no separate token required) or an sPDD receipt token (implementation choice).
- **Interest source**: Interest is funded by the stability fees collected from CDP debt via the debit exchange rate.
- **Distribution rule (waterfall)**:
  1. Cover realized bad debt.
  2. Top up a protocol reserve buffer to a target level.
  3. Distribute remaining fees to Savings depositors pro rata as the Savings Rate.
  4. Any residual can flow to Treasury per governance.
- **Rate model**: A governance-set annualized Savings Rate (SR) that parameterized as a share of the effective stability fee.
- **Accrual**: Interest accrues continuously via an exchange rate (savings index). Accounting can update per block or in discrete epochs.
- **Controls and limits**:
  - Global cap on total Savings deposits (optional) to protect liquidity.
  - No leverage: Savings cannot be used as collateral.

**Parameter examples (TBD by governance)**
- Savings Rate bounds: 0 to 80 percent of net stability fees after safety buffer.

### Governance

A Financial Fellowship (within the broader Polkadot on-chain governance framework) will govern risk parameters and Treasury actions to ensure economic safety. The Fellowship can also perform emergency actions, such as freezing the oracle price feed if manipulation is detected.

Governance-managed parameters include (non-exhaustive):
- Collateral ratios, liquidation ratios, stability fee schedule, and debt ceilings.
- Liquidation penalties, DEX slippage limits, auction parameters.
- Oracle selection and circuit-breaker thresholds.
- Savings parameters: Savings Rate, fee share split, reserve buffer target, deposit caps, and emergency throttles.

### Emergency Shutdown

As a last resort, an emergency shutdown can be performed by the Fellowship to halt minting/liquidation and allow equitable settlement: lock oracle prices, cancel auctions, and let users settle PDD against collateral at the locked rates. Savings deposits remain redeemable 1:1 for PDD at the last savings index; interest accrual stops at shutdown.

## Drawbacks

- **Oracle dependencies**: The system's safety relies heavily on accurate and timely price feeds. Oracle manipulation or failures could lead to incorrect liquidations or allow undercollateralized positions to remain open.
- **Governance overhead**: Proper risk management requires active governance to adjust parameters like collateral ratios, stability fees, Savings Rate, and debt ceilings based on market conditions and system health.
- **Rate complexity**: Introducing a Savings module adds parameter complexity and potential user confusion if rate and fee policies change frequently.

## Testing, Security, and Privacy

**Testing requirements**
- Comprehensive stress testing of liquidation mechanisms under various market-volatility scenarios.
- Integration testing with the Asset Hub DEX to ensure adequate liquidity for liquidation swaps.
- Emergency-shutdown procedure testing to ensure graceful system halt and equitable settlement.
- Economic testing of incentive structures for liquidators and system stability.
- Savings accounting tests: exchange-rate accuracy, fee-waterfall correctness, boundary cases on caps/cooldowns, and epoch transitions.

**Security considerations**
- **Oracle security**: Oracles must be resistant to manipulation. Implement circuit breakers for sudden price movements and multiple sources where possible.
- **Liquidation MEV**: Liquidation opportunities may be exploited by MEV searchers, potentially disadvantaging regular users. Consider implementing Dutch auction mechanisms or short delays to mitigate.
- **Governance attacks**: Risk-parameter changes must have appropriate time delays and safeguards to prevent malicious adjustments that could trigger mass liquidations.
- **Savings abuse**: Prevent rate-change gaming and flash-deposit capture by using epoch-based accrual, previous-epoch supply snapshots, or short cool-downs. Ensure fee-waterfall priority cannot be bypassed.

## Performance, Ergonomics, and Compatibility

### Performance

This proposal introduces necessary computational overhead to Asset Hub for CDP management, liquidation monitoring, and Savings accounting. The impact is minimized through:

- **Off-chain worker optimization**: Liquidation monitoring runs in off-chain workers to avoid on-chain computational overhead.
- **Index accrual efficiency**: Savings index updates can be amortized per block or per epoch with O(1) per-account reads/writes.

### Ergonomics

The proposal optimizes for several key usage patterns:

- **Treasury integration**: Treasury payment workflows are streamlined with native PDD support, eliminating the need for complex stablecoin reserve management and reducing operational overhead for Treasury administrators.
- **Holder experience**: A single "Earn with Savings" flow with clear APR and risk notes encourages organic PDD demand without leverage.
- **Developer integration**: Asset Hub's native asset infrastructure allows seamless integration with existing wallets and DeFi protocols without requiring new asset registration flows or custom interfaces.

### Compatibility

- **Asset Hub compatibility**: PDD integrates with existing Asset Hub infrastructure including native asset transfers, fee payment mechanisms, and XCM asset handling. No breaking changes to existing Asset Hub functionality.
- **Wallet compatibility**: As a native Asset Hub asset, PDD works with all existing Polkadot ecosystem wallets without requiring wallet updates or custom integration work.

## Prior Art and References

The implementation follows the Honzon protocol pioneered by Acala for their aUSD stablecoin system. Key references include:
- Acala's Honzon protocol documentation and implementation.
- MakerDAO's CDP system, which inspired many overcollateralized stablecoin designs.
- MakerDAO's Dai Savings Rate (DSR), which informs the Savings module design and fee distribution mechanics.

## Unresolved Questions

- **Financial Fellowship governance model**: How should the Financial Fellowship be structured and selected? What specific powers should it have over risk parameters, and what checks and balances should exist to prevent governance capture or misaligned incentives?
- **Oracle infrastructure design**: How exactly should we get price data from other parachains (via XCM or state-proofs)? How do we ensure the implementation is not fragile to runtime upgrades?
- **Emergency powers scope**: What conditions should trigger emergency shutdown, and who should have the authority to execute it? How can the system balance responsiveness to crises with protection against governance attacks?
- **Treasury integration**: Should the Treasury automatically mint PDD when making a payout? How should the Treasury manage its CDP positions?
- **Savings policy**: What is the initial Savings Rate, fee share split, cap size, and reserve buffer target? Under what conditions can throttles be enabled, and what notice is required?

## Future Directions and Related Material

### Smart-Contract Liquidation Participation

Future versions of the system will allow smart contracts to register as liquidation participants, enabling:
- **Automated liquidation bots**: Smart contracts can participate automatically, providing more reliable liquidation services and potentially better prices for distressed positions.
- **DeFi protocol integration**: Other DeFi protocols can integrate directly with the liquidation system, allowing for more sophisticated strategies and cross-protocol arbitrage.
- **Custom logic**: Registered smart contracts can implement custom liquidation strategies, such as gradual liquidation over time or cross-chain liquidation via XCM bridges.

### Treasury Payment Transition

In a later phase, staking rewards may be paid in PDD instead of DOT inflation, requiring:
- Economic modeling to determine appropriate reward conversion rates.
- Governance framework for managing the transition from DOT to PDD rewards.
- Technical implementation of PDD-based reward distribution systems.
- Impact assessment on DOT tokenomics and staking participation rates.