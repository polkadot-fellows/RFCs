# RFC-0152: Decentralized Convex-Preference Coretime Market for Polkadot

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | 2025-06-30                                                                                  |
| **Description** | This RFC proposes a decentralized market mechanism for allocating Coretime on Polkadot, replacing the existing Dutch auction method (RFC17). The proposed model leverages convex preference interactions among agents, eliminating explicit bidding and centralized price determination. This ensures fairness, transparency, and decentralization.         |
| **Conflicts-With| RFC-0017                                                                                    |
| **Authors**     | Diego Correa Tristain <algoritmia@labormedia.cl>                                            |

## Summary

This RFC proposes a decentralized market mechanism for allocating Coretime on Polkadot, replacing the existing Dutch auction method (RFC17). The proposed model leverages convex preference interactions among agents, eliminating explicit bidding and centralized price determination. This ensures fairness, transparency, and decentralization.

## Motivation

The current auction-based model (RFC17) presents critical issues:

* **Front-running and timing asymmetry**: Actors with superior infrastructure or timing strategies possess unfair advantages.

* **Complexity and cognitive overhead**: Auctions pose challenges for participant comprehension and effective engagement.

* **Resource hoarding and inefficiency**: Auctions allow strategic actors to monopolize resources, restricting equitable participation.

The decentralized convex-preference model addresses these issues by facilitating asynchronous, equitable and transparent access **before** state coordination and deterministic verifiability **during and after** protocol consensus.

## Stakeholders

Primary set of stakeholders are:

- Parachain Teams & Developers
- Governance Bodies (Polkadot Fellowship, Polkadot Governance, Technical Committees)
- Core Developers & Runtime Engineers
- Application Builders / Smart Contract Developers
- End Users of Polkadot Ecosystem dApps
- Token Holders & Investors
- Researchers / Economists / Protocol Designers
- Communication Hubs (e.g., The Kusamarian, Polkadot Forum Moderators, Ecosystem Ambassadors)

## Explanation

### Guide-Level Explanation

Agents participating in the Coretime market (such as parachains, parathreads, or smart contracts) declare two parameters:

* **Asset Holdings**: Their initial allocation of Coretime and tokens (e.g., DOT).

* **Preference Parameter (α)**: A scalar value between 0 and 1 indicating their valuation preference between Coretime and tokens.

These parameters are recorded transparently on-chain. Transactions between agents are conducted through deterministic convex optimizations, ensuring local Pareto-optimal exchanges. A global equilibrium price naturally emerges from these local interactions without any centralized authority or external pricing mechanism [Tristain, 2024](https://github.com/onedge-network/Emergent_Properties_paper).

### Reference-Level Explanation

#### Economic Model

Agents' preferences are represented using a Cobb-Douglas utility function:

$U_i(x, y) = x^{α_i} y^{1-α_i}$

where:

* $x$ represents the quantity of Coretime.
* $y$ represents the quantity of tokens.
* $α_i \in [0,1]$ is the scalar preference parameter.

#### Mechanism Implementation

Implementation involves the following components:

1. **Preference Declaration:** Agents MUST explicitly register their scalar preference (α) and initial asset holdings on-chain.
2. **Interaction Module:** A dedicated runtime pallet or smart contract SHOULD manage interactions, ensuring Pareto-optimal deterministic outcomes.
3. **Convergence Enforcement:** Interaction ordering MUST follow a deterministic protocol prioritizing transactions significantly enhancing price convergence, sequencing from higher to lower exchange ratios.
4. **On-chain Verifiability:** Transaction histories and convergence processes MUST be transparently auditable and verifiable on-chain.

#### Example Flow Diagram

```
Preference & Asset Declaration → Paired-exchange Convex Optimization → Interaction Ordering (High-to-Low Exchange Impact) → Global Price Convergence → On-chain Auditability
```

## Drawbacks

### Performance

* Initial implementation complexity due to the introduction of a new runtime module.

### User Experience

* User education and UI development required for scalar preference parameter comprehension.

### Governance Burden

* Additional review and audit complexity due to innovative economic logic.

## Testing, Security, and Privacy

The implementation of this decentralized convex-preference Coretime market mechanism demands particular care in maintaining determinism, accuracy, and security in all on-chain interactions. Key considerations include:

### Precision and Determinism in Arithmetic

* The proposed mechanism relies on convex optimization over continuous variables, which REQUIRES floating-point arithmetic or high-precision fixed-point alternatives.

* To ensure deterministic behavior across all nodes, arithmetic operations MUST be implemented using deterministic libraries or Wasm-compatible fixed-point math, avoiding non-deterministic floating-point behavior across architectures.

* Verifiability of Pareto-optimal outcomes across interactions MUST be reproducible and provable, potentially leveraging range-limited arithmetic or bounded rational approximations for optimization solvers.

### Security

* Preference declarations and asset holdings MUST be immutably recorded on-chain, subject to strict validation and input constraints to prevent manipulation.

* The optimization process MUST prevent overflow, underflow, or division-by-zero attacks in edge-case preference combinations (e.g., α close to 0 or 1).

* Any deterministic interaction ordering logic MUST be auditable and resistant to manipulation or reordering incentives by privileged actors.

### Privacy

* Although the model emphasizes transparency and verifiability, it MAY be beneficial in future iterations to support privacy-preserving preference commitment schemes (e.g., via homomorphic encryption or zero-knowledge commitments).

* This MAY allow agents to express preferences without revealing them publicly, while still enabling fair participation and on-chain verification.

### Testing and Recommendations

* Simulation of multiple interacting agents with heterogeneous preferences and randomized initial allocations SHOULD be used to validate global convergence and equilibrium behavior.

* Fuzz testing and symbolic execution SHOULD be applied to the interaction module to identify corner cases in the optimization pipeline.

* Formal verification of convergence routines and boundedness of the optimization space is RECOMMENDED for high-assurance deployments.

## Performance, Ergonomics, and Compatibility

This leads to a more fluid, computation-bound system where efficiency stems from algorithmic design and verification speed, not from externally imposed timing constraints. Compatibility with existing Substrate pallets can be explored through modular implementation.

### Performance

The system's performance depends on the availability of computational resources, not on arbitrary time windows or rounds. Price discovery and convergence are calculated as fast as the system can process the deterministic interaction rules. Pair-wise interactions can be batched and accumulated asynchronously. This enhances real-time responsiveness while removing artificial scheduling constraints.

### Ergonomics

Agents only need to express a simple scalar preference and their token/Coretime holdings, removing cognitive complexity. This lightweight interaction model improves usability, especially for smaller participants.

### Compatibility

The mechanism is fully compatible with asynchronous execution architectures. Because it relies on deterministic local state transitions, it integrates seamlessly with Byzantine fault-tolerant consensus protocols and supports scalable, decentralized implementations.

## Prior Art and References

[RFC-1](https://github.com/polkadot-fellows/RFCs/blob/6f29561a4747bbfd95307ce75cd949dfff359e39/text/0001-agile-coretime.md)

Initial Forum Discussion (superseded) : [Invitation to Critically Evaluate Core Time Pricing Model Framework](https://forum.polkadot.network/t/invitation-to-critically-evaluate-core-time-pricing-model-framework/13404)

RFC Draft Proposal Preliminary Forum Thread: RFC: Decentralized Convex-Preference Coretime Market for Polkadot [Draft](https://forum.polkadot.network/t/rfc-decentralized-convex-preference-coretime-market-for-polkadot-draft/13573)

"Emergent Properties of Distributed Agents with Two-Stage Convex Zero-Sum Optimal Exchange Network": [Tristain, 2024](https://github.com/onedge-network/Emergent_Properties_paper)

Personally, I want to express a special gratitude to [Edmundo Beteta](https://www.researchgate.net/profile/Edmundo-Beteta) for introduccing me to Microeconomics Theory and guiding my curiosity at the Faculty of Economics and Administration, Universidad de Chile.

## Unresolved Questions

* Optimal method for initial rollout (experimental sandbox vs. partial deployment on Polkadot).

* OPTIONAL criteria and heuristics for deterministic interaction ordering.

## Future Directions and Related Material

* Extend the model to support multi-asset allocations with additional priority mechanisms.

* Apply similar decentralized convex-preference principles to broader decentralized resource allocation challenges (e.g. JAM, energy/resource coordination, price stabilization).
