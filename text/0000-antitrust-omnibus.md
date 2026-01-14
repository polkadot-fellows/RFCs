# RFC-0XXX: The Ecosystem Anti-Trust & Market Structure Omnibus

- **RFC ID:** 0xxx-antitrust-omnibus  
- **Created:** 2026-01-13  
- **Authors:** [Diego Correa Tristain / algoritmia@labormedia.cl]  
- **License:** CC0-1.0  
- **Supersedes / Amends:** RFC-0032, RFC-0078, RFC-0149, RFC-0097, RFC-0007  
- **Related:** RFC-0000 (this RFC amends `0000-template.md`)  

---

## 1. Summary

This RFC establishes **Anti-Trust and Contestability** as operational security requirements for the Polkadot ecosystem by adopting three coordinated changes:

1. **Process Standard (Meta):** Amend the Fellowship RFC Template to require a mandatory **Market Structure Impact** analysis for future RFCs.  
2. **Open Utilities (Infrastructure):** Amend **RFC-0032** and **RFC-0078** to enforce **neutrality**, **proof-carrying portability**, and **multi-source resilience** for System Chains and Metadata distribution.  
3. **Fair Markets (Economics):** Amend **RFC-0149**, **RFC-0097**, and **RFC-0007** to enforce **anti-hoarding invariants**, **rule-based exit**, and **sunsetting of discretionary privileged sets** (Invulnerables).  

This package is intended as a “constitutional” upgrade to design standards: it makes capture-resistance **specifiable, reviewable, and enforceable**.

---

## 2. Motivation

Polkadot increasingly relies on protocol-adjacent institutions: System Chains, Coretime Markets, and Collectives. While technically efficient, these structures introduce **institutional capture surfaces**:

- **Incumbency Entrenchment:** renewal mechanics or pricing predictability that structurally favors early movers.  
- **Infrastructure Monopolies:** single points of failure in “public truth” (identity registries, metadata pipelines).  
- **Soft Cartels:** discretionary governance appointments (e.g., Invulnerables) without objective rotation or contestability.  

Capture is a **security failure**. If a market cannot be contested, a registry cannot be substituted, or an asset cannot be exited in a rule-based way, decentralization becomes non-credible. This RFC converts anti-trust from a political ideal into an **engineering constraint**: explicit threat model, explicit metrics, explicit mitigations.

---

## 3. Threat Model

This RFC considers an **economic/institutional adversary** that aims to:

- Monopolize scarce resources (coretime) and deny rivals.  
- Dominate exit capacity (unstaking) to trap smaller participants or create instability.  
- Capture public-truth rails (identity, metadata distribution) to gate innovation or de-platform competitors.  
- Form soft cartels via discretionary privileged sets (invulnerables, whitelists).  

The adversary may use capital concentration, sybil splitting (multiple accounts), broker aggregation (off-chain consolidation), UI/coordination capture, and timing manipulation.

---

## 4. Prior Art & Related Work

This RFC generalizes protections already present in specific Polkadot subsystems. Current Coretime designs already treat collusion and price manipulation as technical failure modes (e.g., Dutch auction mechanics). Similarly, Staking safeguards (bag lists) protect against list-stuffing attacks. This RFC extends that "security mindset" to institutional capture, mandating that market structure risks be treated with the same rigor as consensus risks.

---

## 5. Non-Goals

This RFC does **not**:

- Prescribe treasury procurement policy outside protocol-governed mechanisms.  
- Define “correct” editorial governance or media policy.  
- Require a single identity system or forbid alternative identity schemes.  
- Introduce discretionary “censorship” logic (only validity predicates are allowed as exclusion rules).  
- Claim that all capture can be eliminated—only that major capture surfaces must be **identified and bounded**.  

---

## 6. Normative Definitions

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY** are to be interpreted as described in IETF RFC 2119.

### 6.1 Validity Predicate

A **validity predicate** is a rule that determines whether a transaction is admissible **solely** based on objective protocol correctness (e.g., signature validity, fee payment, weight/length bounds, state transition validity, deterministic spam limits).

### 6.2 Discrimination (Transaction Inclusion)

**Discrimination** is any transaction inclusion/exclusion rule keyed on non-validity attributes (e.g., origin identity category, affiliation, politics, social reputation), rather than protocol correctness.

### 6.3 Registry / Public-Truth Rail

A **registry** (or **public-truth rail**) is a protocol component whose outputs are treated by third parties as a de facto reference for correctness or admissibility (e.g., identity attestations, metadata commitments, governance interface records).

### 6.4 Canonical Utility State

**Canonical utility state** refers to registry outputs that external parties interpret as a common reference (e.g., identity attestations/claims, governance interface records used for verification, metadata commitments). It does not imply all state on a system chain is subject to these requirements.

### 6.5 Portability / Proof-Carrying Export

**Portability** means the ability to export **verifiable claims** (proof-carrying attestations or proof-carrying state snapshots) that can be validated by a light client (or equivalent) without trusting a server. Portability **does not** imply unilateral state migration or duplication of canonical balances.

### 6.6 Purchaser (Coretime)

A **purchaser** is the on-chain account that submits a Coretime purchase or renewal transaction (or is recorded as the buyer in the settlement event). Concentration metrics for Coretime MUST be computable at least over purchaser accounts, as they are observable.

### 6.7 Controller (Staking)

A **controller** is the on-chain entity that submits unstake/unbond actions and receives the effect of those actions. The exact definition is chain-specific but MUST be protocol-defined and observable.

### 6.8 Re-Entry Event (Coretime)

A **re-entry event** is a rule-based mechanism that forces renewed capacity to re-enter open competition, either deterministically after N renewals, or probabilistically/conditionally based on utilization and/or concentration metrics.

### 6.9 Multi-Source Resilience

**Multi-source resilience** means clients and tooling can obtain the same verified artifact from multiple independent distribution sources and validate it against on-chain commitments (hash roots, signatures), preventing a single distributor from becoming a gatekeeper.

### 6.10 Concentration Metric

A **concentration metric** is an observable measure of market power concentration, such as:

- **Top-N share** of purchases/renewals over a window,  
- **HHI** computed over purchasers/renewers over a window,  
- **Gini** (if computable from observable events).  

### 6.11 Utilization Proxy (Coretime)

A **utilization proxy** is an on-chain observable signal that purchased coretime was activated or consumed (e.g., an activation event, recorded usage, or other protocol-defined indicator). The specific proxy used by an implementation MUST be explicitly specified and auditable.

### 6.12 Exit-Latency Metric

An **exit-latency metric** is an observable measure of the time and/or probability required to complete an exit operation (e.g., unstaking/unbonding), such as median and p95 time-to-exit, queue depth-to-exit mapping, or probability of exit within T epochs under load.

---

## 7. Specification

### Part I: Meta-Standard (Process Layer)

**Subject:** Amendment to `0000-template.md` (Fellowship RFC template)

#### 7.1 Requirement

All future Fellowship RFCs MUST include a section titled **Market Structure Impact**. Unless explicitly justified as **Not Applicable**, the section MUST address:

1. **Contestability:** Does the proposal increase incumbency advantage? What is the minimum viable path for a new competitor to enter?  
2. **Privilege Surfaces:** Does the RFC create privileged origins, whitelists, or curated sets? If yes, specify the **Rotation Mechanism** (must be rule-based, not discretionary).  
3. **Portability:** If creating a registry, is state exportable via proof-carrying snapshots verified by a light client?  
4. **Economic Safety:** For markets/queues, does the design resist whale jamming and sybil splitting?  
5. **Metrics:** Authors MUST define at least one **Concentration Metric** (§6.10) OR one **Exit-Latency Metric** (§6.12), computable from observable on-chain events.  

#### 7.2 Enforcement

The Fellowship SHOULD NOT accept or approve RFCs if this section is missing or materially non-responsive.

---

### Part II: Open Utility Amendments (Infrastructure Layer)

**Subject:** Amendments to **RFC-0032 (Minimal Relay / System Chains)** and **RFC-0078 (Merkleized Metadata)**

#### 7.3 RFC-0032 Amendment A — Common-Carrier Neutrality

System chains hosting **Canonical Utility State** MUST NOT discriminate transaction inclusion based on non-validity attributes.

- **Permitted exceptions:** only validity predicates (see §6.1).  
- Any exclusion logic MUST be deterministic, protocol-defined, and reviewable as part of runtime logic.  

#### 7.4 RFC-0032 Amendment B — Proof-Carrying State Export

System chains MUST provide a standards-defined export mechanism for **Canonical Utility State** such that exported artifacts can be verified by a light client or equivalent proof system without a trusted server.

#### 7.5 RFC-0032 Amendment C — Multi-Attestation Compatibility (Application Layer)

Where a system chain provides a canonical baseline registry, the ecosystem SHOULD preserve the ability for applications/parachains to accept alternative attestations, provided they are cryptographically verifiable and standards-defined. Applications MUST NOT be prevented by protocol-level restrictions from accepting alternative attestations.

*Note: This requirement preserves application-layer freedom of interpretation; it does not require the protocol to treat all attestations as semantically equivalent, nor does it impose a universal attestation format beyond being verifiable and standards-defined.*

#### 7.6 RFC-0078 Amendment — Anti-Registry Capture & Multi-Source Resilience

The metadata standard MUST NOT assume a single canonical endpoint as a trust or availability anchor.

- Wallets/tooling **MUST** support retrieving metadata proofs from **at least two** independent distribution sources, or implement an explicit offline-safe fallback mode defined by the client.  
- Metadata artifacts SHOULD be distributed via content-addressed mechanisms (e.g., IPFS, Git mirrors, hash-keyed object stores), enabling many distributors and preventing gatekeeping.  
- Clients MUST validate artifacts against on-chain commitments/signatures as defined in RFC-0078.  

---

### Part III: Fair Market Amendments (Economic Layer)

**Subject:** Amendments to **RFC-0149 (Coretime Renewal Adjustment)**, **RFC-0097 (Unbonding Queue)**, and **RFC-0007 (Collator Selection)**

#### 7.7 RFC-0149 Amendment — Anti-Hoarding Invariants

##### 7.7.1 Contestability Invariant & Re-Entry

Coretime allocation MUST ensure periodic contestability. A renewed core MUST trigger a **Re-Entry Event** under at least one of the following conditions:

- **Deterministic:** after **N_RENEWALS_MAX** consecutive renewals.  
- **Conditional:** if a protocol-defined **Utilization Proxy** (§6.11) over window **U_WINDOW** falls below **U_MIN**.  
- **Metric-triggered:** if concentration over window **C_WINDOW** exceeds **C_MAX**.  

##### 7.7.2 Concentration Friction

Renewal pricing MUST incorporate a premium (or reduced renewal advantage) as concentration rises.

- Concentration metrics MUST be computable over observable **Purchaser** accounts (§6.6) from purchase/renewal events.  
- If implementations additionally model higher-order “economic identity,” the method MUST be explicitly specified and MUST remain auditable.  

##### 7.7.3 Gameability Notes (Required)

The amended design MUST include an explicit “Gameability & Evasion” subsection addressing sybil splitting, broker aggregation, and timing manipulation.

#### 7.8 RFC-0097 Amendment — Exit Neutrality & Anti-Jamming

##### 7.8.1 Rule-Based Ordering

The unbonding queue MUST be purely rule-based (FIFO or pro-rata). No privileged origins or manual fast lanes.

##### 7.8.2 Per-Controller Rate Limits

A single **Controller** (§6.7) MUST NOT consume more than **EXIT_CAP_PER_CONTROLLER** of global exit capacity per **unstaking epoch** (the runtime-defined scheduling unit for unstaking effects).

- When a controller hits the cap, any remaining unstake effect for that controller **MUST remain queued in its original order** and become eligible in subsequent epochs, without reducing the available capacity to other controllers.  
- This MUST NOT introduce a global slowdown; it is a local limiter.  

#### 7.9 RFC-0007 Amendment — Sunsetting Invulnerables

##### 7.9.1 Sunset Clause

Discretionary invulnerable status MUST be time-bounded. Existing invulnerables MUST transition to a rule-based selection mechanism by **INVULN_SUNSET**.

##### 7.9.2 Liveness Safety

If a rule-based replacement mechanism is not activated by **INVULN_SUNSET**, the invulnerable set MUST decay to zero over a bounded schedule.

- **Constraint:** Decay MUST be bounded by liveness thresholds (parameterized as **INVULN_MIN_FLOOR**) such that the set is not reduced below the minimum safe operational level unless open participation mechanisms demonstrably compensate.

##### 7.9.3 Replacement Mechanism Requirements

Replacement/renewal MUST be rule-based, incorporate objective performance proofs, and MUST NOT be determined solely by bond size.

---

## 8. Market Structure Impact (Self-Analysis)

- **Contestability:** Increases via re-entry events (coretime) and sunsetting discretionary invulnerables.  
- **Privilege Surfaces:** Reduces privilege by enforcing neutrality on system chains and removing manual appointment.  
- **Portability:** Enforces proof-carrying exports, reducing lock-in to specific system chains.  
- **Economic Safety:** Adds anti-jamming constraints for exit capacity and requires concentration metrics.  

---

## 9. Parameters (Normative Constraints & Recommended Defaults)

### 9.1 Normative Constraints

- All parameters introduced in §7 MUST be runtime-configurable (or equivalent) and updated only through rule-based governance processes.  
- **EXIT_CAP_PER_CONTROLLER** MUST be bounded (e.g., within [0.5%, 10%]) to allow governance tuning without enabling privileged lanes.  
- **INVULN_MIN_FLOOR** MUST be runtime-configurable and bounded to ensure network liveness safety.  
- Parameter updates MUST be transparent and auditable.  
- Parameter changes SHOULD be justified using metrics defined in §11.1.  

### 9.2 Recommended Defaults (Initial Values)

#### 9.2.1 Coretime

- **N_RENEWALS_MAX:** 8  
- **U_WINDOW:** 4 sale periods  
- **U_MIN:** 60% activation/utilization proxy  
- **C_WINDOW:** 30 days (or 30 sale periods)  
- **C_MAX (example):** Top-10 purchasers/renewers > 40% share, or HHI > 0.12  
- *Note: These defaults are intentionally conservative and are expected to be tuned based on observed purchaser/renewal distributions and simulation results.*  

#### 9.2.2 Unbonding

- **EXIT_CAP_PER_CONTROLLER:** 2% per unstaking epoch  
- **M_EPOCHS:** 3 epochs (for optional local circuit breaker)  

#### 9.2.3 Invulnerables

- **INVULN_SUNSET:** 2 release cycles from enactment (or block height fixed at enactment)  
- **Max continuous tenure during transition:** 6 months equivalent epochs  
- **Decay schedule if replacement mechanism is not activated:** Linear decay over 4 unstaking epochs (or equivalent runtime unit), bounded by **INVULN_MIN_FLOOR**.  

---

## 10. Backwards Compatibility

- **Template change (Part I):** No runtime impact; applies to future RFC submissions.  
- **RFC-0078 amendments:** Primarily operational/client distribution requirements; existing verification logic remains valid.  
- **RFC-0032 portability:** Requires additional export interfaces/proofs; does not invalidate existing state.  
- **Coretime changes (RFC-0149):** Affects renewal strategy; requires transition rules to avoid disrupting existing commitments.  
- **Unbonding changes (RFC-0097):** Introduces per-controller caps; requires clear deterministic carry-over behavior.  
- **Invulnerables sunset (RFC-0007):** Requires a migration plan to maintain liveness during transition.  

---

## 11. Implementation and Transition Plan

This Omnibus RFC SHOULD be implemented as three independently reviewable PRs:

1. **PR-A (Meta):** Update `0000-template.md`.  
2. **PR-B (Open Utilities):** Patch RFC-0032 and RFC-0078.  
3. **PR-C (Fair Markets):** Patch RFC-0149, RFC-0097, RFC-0007.  

**PR-C MUST** include explicit enactment conditions (block/epoch) and a deprecation schedule for legacy behavior for each amended mechanism.

### 11.1 Monitoring Requirements

Implementations MUST publish (on-chain or via standard telemetry) at least:

- **Coretime:** Top-N purchaser share over **C_WINDOW**, and renewal share distribution (purchaser-level).  
- **Unbonding:** Queue length, median and p95 exit latency, and per-controller cap-hit frequency.  
- **Invulnerables:** Count over time and progress toward sunset/decay schedule.  

---

## 12. Security Considerations

Institutional capture is treated as a security threat model. Mitigations in this RFC are designed to be rule-based, measurable, and resistant to single-point discretion: rotation, re-entry, verifiable portability, multi-source resilience, and deterministic exit limits.
