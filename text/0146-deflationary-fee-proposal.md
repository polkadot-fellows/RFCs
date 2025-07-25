# RFC-0146: Deflationary Transaction Fee Model for the Relay Chain and its System Parachains

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 20th May 2025                                                            |
| **Description** | This RFC proposes burning 80% of transaction fees on the Relay Chain and all its system parachains, adding to the existing deflationary capacity.     |
| **Authors**     | Jonas Gehrlein                                                           |

## Summary

This RFC proposes **burning 80% of transaction fees** accrued on Polkadot’s **Relay Chain** and, more significantly, on all its **system parachains**. The remaining 20% would continue to incentivize Validators (on the Relay Chain) and Collators (on system parachains) for including transactions. The 80:20 split is motivated by preserving the incentives for Validators, which are crucial for the security of the network, while establishing a consistent fee policy across the Relay Chain and all system parachains.

* On the **Relay Chain**, the change simply redirects the share that currently goes to the Treasury toward burning. Given the move toward a [minimal Relay](https://polkadot-fellows.github.io/RFCs/approved/0032-minimal-relay.html) ratified by RFC0032, a change to the fee policy will likely be symbolic for the future, but contributes to overall coherence.

* On **system parachains**, the Collator share would be reduced from 100% to 20%, with 80% burned. Since the rewards of Collators do not significantly contribute to the shared security model, this adjustment should not negatively affect the network's integrity.

This proposal extends the system's **deflationary direction** and is enabling direct value capture for DOT holders of an overall increased activity on the network.

## Motivation

Historically, transaction fees on both the Relay Chain and the system parachains (with a few exceptions) have been relatively low. This is by design—Polkadot is built to scale and offer low-cost transactions. While this principle remains unchanged, growing network activity could still result in a meaningful accumulation of fees over time. 

Implementing this RFC ensures that potentially increasing activity manifesting in more fees is captured for all token holders. It further aligns the way that the network is handling fees (such as from transactions or for coretime usage) is handled. The arguments in support of this are close to those outlined in [RFC0010](https://polkadot-fellows.github.io/RFCs/approved/0010-burn-coretime-revenue.html). Specifically, burning transaction fees has the following benefits:

### Compensation for Coretime Usage

System parachains do not participate in open-market bidding for coretime. Instead, they are granted a special status through governance, allowing them to consume network resources without explicitly paying for them. Burning transaction fees serves as a simple and effective way to compensate for the revenue that would otherwise have been generated on the open market.

### Value Accrual and Deflationary Pressure

By burning the transaction fees, the system effectively reduces the token supply and thereby increase the scarcity of the native token. This deflationary pressure can increase the token's long-term value and ensures that the value captured is translated equally to all existing token holders.


This proposal requires only minimal code changes, making it inexpensive to implement, yet it introduces a consistent policy for handling transaction fees across the network. Crucially, it positions Polkadot for a future where fee burning could serve as a counterweight to an otherwise inflationary token model, ensuring that value generated by network usage is returned to all DOT holders.

## Stakeholders

* **All DOT Token Holders**: Benefit from reduced supply and direct value capture as network usage increases.

* **System Parachain Collators**: This proposal effectively reduces the income currently earned by system parachain Collators. However, the impact on the status-quo is negligible, as fees earned by Collators have been minimal (around $1,300 monthly across all system parachains with data between November 2024 and April 2025). The vast majority of their compensation comes from Treasury reimbursements handled through bounties. As such, we do not expect this change to have any meaningful effect on Collator incentives or behavior.

* **Validators**: Remain unaffected, as their rewards stay unchanged.


## Sidenote: Fee Assets

Some system parachains may accept other assets deemed **sufficient** for transaction fees. This has no implication for this proposal as the **asset conversion pallet** ensures that DOT is ultimately used to pay for the fees, which can be burned.