# RFC-0000: Hybrid post-quantum accounts (DRAFT)

|                 |                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------- |
| **Start Date**  | Date of initial proposal                                                                    |
| **Description** | Add host calls for post-quantum signatures and support for hybrid post-quantum accounts.    |
| **Authors**     | Jeff Burdges                                                                                |

## Summary

After NIST standardizes FN-DSA (Falcon-512) in 2026 or 2027, we shall add one or more host calls for FN-DSA, probably with public key recovery or message recovery (Falcon-MRM), and probably a host call for ML-DSA (Dilithium) too.

AssetHub adds support hybrid post-quantum user accounts that require both Falcon, probably with some recovery, as well as one of ed25519 or sr25519.  We allow hybrid upgrading an existing account by attacking a Falcon key without changing the account's existing elliptic curve key, which does not cont as a transfer and does not require unstaking, unlocking, etc.

Vault adds support for upgrading an existing elliptic curve key to a hybrid post-quantum key, by deriving the Falcon secret key using a selerate parallel purely hard derivation tree, perhaps only if the existing key decends only through hard derivations.  Vault adds support for this hybrid upgrade transaction.

## Motivation

If large enough quantum computers existed, then they could break all the public key cryptography used in most secure network protocols, including Polakdot.  We do not know if reasonable size quantum computer are really possible, or how soon they might be developed, or how they'd scale even after being developed.  We do have reasonable post-quantum KEMs and post-qantum signatures, but they should be used in hybird combinations with elliptic curve KEXs and signatures.

We elaborate upon those observations in the appendix but focus here upon more direct motivations:

1)  People want to feel secure, so if they want to adopt hybrid post-quantum account keys now, and pay say 5% higher tx fees, the why stop them?  In this, hybrid post-quantum account keys would not significantly increase blocksizes or transaction sizes, roughly 1.5 kb per treansation.  If we worried about blocksizes now then we'd adopt NOMT which should improve overall blocksizes by a factor of three or four, dwarfing this.

2)  We could avoid blanace transfers and have users merely add a post-quantum key attached to their existing sr25519 or ed25519 key, without doing any balance transfers or fighitng with staking and locks.  This solves our largest adoption hurdle. 

3)  We do pay development and maintannace costs for doing this properly once, because anything that touches acocunt cryptocraphy requires careful debugging and testing, but we belive that (a) the non-transfer hybrid transition makes roll backs possible, and (b) Kusama reduces these cost, relative to what our compeditors pay.  We doubt that quantum computers disapear from the news since researchers shall continue making some progress, however incremental or overhyped.

We choose FN-DSA (Falcon) because its the smallest easily deployable post-quantum signature scheme:  An FN-DSA signature plus public key winds up being almost 2.5 x smaller than for ML-DSA, but still 16 x larger than for sr25519/ed25519.  FN-DSA and ML-DSA both have similar verificaiton times, roughly half that of sr25519 and ed25519.  FN-DSA signers are roughly 4 x slower than ML-DSA signers, which is already 5 x slower than sr25519/ed25519.  We do not care about signers being somewhat slow however, since our signatures are verified many more times than signed. 

## Stakeholders

<!-- A brief catalogue of the primary stakeholder sets of this RFC, with some description of previous socialization of the proposal. -->
?? Signal on key or message recovery ??

?? Tor for EC keys as names for PQ keys ??

## Explanation

### Host calls

We add a host call for [FN-DSA-512](https://datatracker.ietf.org/doc/draft-ietf-cose-falcon/) (Falcon) signature verification once its standardized. 

We should explore adding variants that do key or message recovery.  Signal & others have done work on message recovery in [iacr/2026/420](https://eprint.iacr.org/2026/420), but we're unsure how this beats key recovery.  We're unsure if any recovery schemes shall be deployed or stnadardized, or when, or the future code quality, including whether constant-time signers exist.

We suggest a host call for [ML-DSA-44](https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.204.pdf) (Dilithium) too, because of its heavy adoption outside the blockchain space, and possible usage in concensus protocol.  We doubt ML-DSA sees much adoption for account signatures in other blockchains though, so blochain related features maybe less likely there too.

We should ideally research if more abstract interfaces make sense for either FN-DSA or ML-DSA.  It'd entail a larger performance hit than https://github.com/polkadot-fellows/RFCs/pull/163 though, unless the wasm boundary handles this smoothly.

### Secret key derivation

We require deterministic key derivation for all account keys, so that users can save their keys in human readable ways, and have key derivation trees.  We cannot yet deterministically derive secret keys for FN-DSA (Falcon) because [NIST has not yet standardized the secret key format and generation](https://github.com/pornin/rust-fn-dsa/pull/5) and indeed other details could change in Falcon, but we expect this should be corrected before 2028.  We should not deploy on polkadot until we know the standards situation, even if we choose non-standard modes like recoveries, but we could deploy other experemental versions to Kusama, provided we accepted the risks of doing roll backs.

As a hybrid post-quantum signature using derivation paths, we need a deterministically derived FN-DSA secret key for each possible derivaiton of the existing elliptic curve key.

We cannot derive a post-quantum key from the scalar in an (expanded) secret key for an elliptic curve signature, because the quantum comouter could break the soft parent, and then derive the secret child.  In principle, a "truly" hard derivation path constructed from hashes alone works fine here, but this never exists in practice.  In schnorrkel for example, we sadly accepted the poor design choice of allowing hard derivations based upon soft derivations, which prompted using the scalar for all derivations in `schnorrkel::{SecretKey,Keypair,MiniSecretKey}::hard_derive_mini_secret_key`.  As I recall, BIP32 works this way too, so a couple stakeholders requested the hard-soft derivations of BIP32, instead of true hard derivations. 

As a result, we need an entirely seperate true hard derivation path that uses only hash functions.  We could explore some hybrid combiners for the derivation path that intermix the elliptic curve key somehow, but afaik this brings no advantage over a seperate parallel purely hard derivation tree.  As soft derivations loose their privacy against quantum computers, we could simply abandon them and not derive FN-DSA secret keys below soft derivations.  If we do derive below soft derivations, then we retain soft derivation anonymity only against classical adversaries.

It's possible someone constructs a soft derivation for FN-DSA eventually, but if so they would necessarily entwine the FN-DSA and elliptic curve for hybrid post-quantum unlinkability, so we'd require some third hybrid post-quantum soft derivation type.

### Accounts ###

Hybrid post-quantum accounts should be identified by the hash of both their public keys keys together, ala `blake2b("hpq_account",a.fn_dsa_pk,a.sr25519_pk)`.  We should avoid two hybrid post-quantum accounts having the same elliptic curve public key, so each hybrid post-quantum account needs a free-ish alias named by its elliptic curve public key.  We could optimise this off-chain at RFC nodes for inocming payments, but we'll likely need some on-chain implementation too.

A quantum adversary could register their own FN-DSA key for any unhybridized accounts, but this concern could mostly be ignored (see Appendix).  We do however have a problem that hackers could hybid an existing unhybrided account, which makes our past rescue techniques useless.  If this borthers us, then we could add some waiting period before hybridizing takes effect, so then a hacked user could keep unhybridizing.

At some point in the future, we could require some STARK proof that the FN-DSA and sr25519 derivation paths agree.  We caution aginst this effort now for several reasons, like development being expensive, and the hybrid transition proofs being massive.  Also, there maybe better options in the 
non-imminent future but still long before quantum computers appear, like entwined hybrid soft derivations, lattice only protocols, or simply changes in how the community views unclaimed DOTs. 

### Batch verification for sr25519 and ed25519

We could expand https://github.com/polkadot-fellows/RFCs/pull/163 to ed25519-dalek, including some ark-ed25519-dalek shim, and with this add batch verification for sr25519 and ed25519.  If done well, this reduces our current CPU overhead by roughly what 100% hybrid post-quantum accounts costs.

## Drawbacks

We necessarily spend considerably more bandwidth sending the post-qauntum public keys and signatures (see performance below). 

ECDSA key recovery wound up being an incorrect design choice for blockchains like Ethereum, because it obstructs batch verification.  ECDSA key recovery only saves 32 bytes per signature, while batch verification yields massive savings in CPU time, given chains wind up bound by the CPU time of signature verificaiton (cite ourselves?). 

We think key or message recovery sound safe for Falcon for several reasons:  First, batch verification seems much harder and less rewarding for lattice based signatures like FN-DSA nd ML-DSA.  Second, lattice based signatures already have fast verification, usually like half of Ed25519.  in fact, if we add batch verification for sr25519, then FN-DSA plus sr25519 should cost roughly the CPU time of our unbatched sr25519 or ed25519 today.  Third, Signal's message recovery saves roughly 226 bytes, over 7 x more than ECDSA key recovery saves.  

Also conversely, we've care little about saving 226 bytes per signature when Polkadot has not even adopted NOMT yet, which would reduce almost parablock size by a factor of four.  We might prefer to adhere more strictly to the NIST standard, which perhaps grants some advantages, like maybe FIPS or maybe FIPS demands ML-DSA.

## Testing, Security, and Privacy

There is little reason to directly support post-quantum for accounts that do not use air gapped hardware wallets, out of which we only countrol Vault. 

There are high debugging and testing costs for anything that touches account cryptography.  If however we make some mistake, then we could roll back all the non-transfer upgrades into hybrid post-quantum accounts, and then correct the situation.  We'd require roll back support in Vault for this thought, which sounds dangerous ala downgrade attack, but more likely represents how Vault would work anyways.  If we require multiple Vault upgrades to allow and then disallow downgrades, then we might simply keep this on Kusama for longer.  And anyways Kusama should help us do this sanely by any measure.

We think [NIST level 1 schemes](https://postquantum.com/quantum-security-pqc/post-quantum/nist-pqc-security-categories/) suffice because higher level schemes represent much more powerful quantum adversaries.  

There is no privacy in regular transperent blockchain accounts and this does nothing to change that.

## Performance, Ergonomics, and Compatibility

*Performance:*  We necessarily spend considerably more bandwidth sending the post-qauntum public keys and signatures.  

[FN-DSA-512](https://datatracker.ietf.org/doc/draft-ietf-cose-falcon/) (Falcon) has 666 bye signature (21 x ed25519) and 867 byte public keys (27 x ed25519), and 1281 byte private keys.  In concret terms, a Falcon public key and signature together with recovery should costs roughly the same bandwidth as 1.5 NOMT state reads into 1 billion accounts.  It's anyways vastly less than one state read using our current inefficent storage.

A fast Falcon signer that uses floating points takes 8 x longer than sr25519/ed25519 or double the signing time for ML-DSA, but we would choose the slower constant time emulated floating point singers, which take double this again.

As a comparison, [ML-DSA-44](https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.204.pdf) (Dilithium) has 2420 byte signatures (3.6 x FN-DSA or 75 x ed25519) and 1312 byte public keys (1.5 x FN-DSA or 41 x ed25519), and 2560 byte secret keys.  Signing takes almost 5 x longer than sr25519/ed25519.  

FN-DSA and ML-DSA both need only about half the time of sr25519 or ed25519 for verification.  See also [Bas Westerbaan's 2022 remarks](https://blog.cloudflare.com/nist-post-quantum-surprise/).  We'd therefore avoid worsening CPU time by much if we deploy batch verification for sr25519 alongside or before hybrid post-quantum accounts.  

*Ergonomics & Compatibility:*  Pure post-quantum accounts would reduce overall CPU time, but they do not offer the smooth non-transfer transition of hybrid accounts.  Vault should make it straightforward to upgrade to hybrid post-quantum accounts, but users must switch over to a new vault device of course.  
We reiterate that Vault cannot allow upgrades of soft derived accounts, becuase the parent accounts would break the post-quantum properties of the child account.

We know variations on soft derivation exist for lattice based post-quantum signatures, but they might alter the underlying signature scheme and not necessarily be compatible with the NIST FN-DSA ro ML-DSA.  We think soft derivations remain somewhat risky anyways, so we could anyways push the ecosystem towards exclusively hard derivations.

In fact, there might exist better options than soft derivations in lattices, which could then be impossible for sr25519 too.  We think that not adding pure post-qantum accounts quickly might buy us time to observe if others invent useful new tools.

## Prior Art and References

We suggest using Thomas Pornin crate at https://github.com/pornin/rust-fn-dsa and upstreaming.  We reiterate however that [Vault cannot yet add support for Falcon](https://github.com/pornin/rust-fn-dsa/pull/5) becuase the secret key format was not yet agreed upon, and possibly other delays.

[FALCON with message recovery, a specification](https://eprint.iacr.org/2026/420) by Felix Gunther, Vadim Lyubashevsky, and Rolfe Schmidt

[Key Recovery from Gram-Schmidt Norm Leakage in Hash-and-Sign Signatures over NTRU Lattices](https://eprint.iacr.org/2019/1180) by Pierre-Alain Fouque, Paul Kirchner, Mehdi Tibouchi, Alexandre Wallet, and Yang Yu.  [This talk](https://csrc.nist.gov/CSRC/media/Presentations/Falcon/images-media/Falcon-April2018.pdf) gives key and message recovery sizes on page 5, but only for Falcon level 5, so not directly comparable, but roughly some 20% savings. 


[A Closer Look at Falcon](https://eprint.iacr.org/2024/1769) by Pierre-Alain Fouque, Phillip Gajland, Hubert de Groote, Jonas Janneck, and Eike Kiltz.

[FN-DSA for JOSE and COSE](https://datatracker.ietf.org/doc/draft-ietf-cose-falcon/)

[FIPS 204 (ML-DSA)](https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.204.pdf) 

## Alternatives

*Non-hyrid:*  We could add pure FN-DSA accounts but not hybrid accounts.  Imho this requires users make some choice, about which they have zero information.  In fact, Matthew Green and Filippo Valsorda have [wagered on whether ML-KEM or X25519 weaken much by 2040](https://github.com/FiloSottile/ecc-vs-lattices-long-bet).  We think hybrid signatures represent the responcible choice, unless their hybrid combiners present serious technical problems.  In particular, we should be careful that the hybrid combiner does not complicate other functionality like staking and governance.

*Transfers only:*  We could make hybrid or pure-post-quantum account upgrades be transfers.  If we do hybrid, then doing this saves relatively little code complexity.  Although annoying for stakers, if our staking rate drops dramatically because of other changes, then this might become more reasonable in the future. 

*ZKPs:*  We could make hybrid or pure-post-quantum account upgrades require some zero-knowledge proof of the full derivation path.  If we believed quantum computers existed, and wished to freeze elliptic curve accounts, then we could do so but enable transfers and upgrades from legacy pure elliptic curve accounts in this way.  Yet, if we allow elliptic curve account then this feels like massive overkill, both in on-chain computation and in complexity.

Arguably the zero-knowledge proof itself would incur little development overhead, since we could use RISC0 or another VM to which regular rust code compiles.  Yet, even VMs like RISC0 require clean minimized implementation for every user's full derivation path, which requires some complete but minimized reimpementation for the derivation path schemes used in the ecosystem, certianly both Vault and Ledger.

RISC0 reccomends 16 gigs of ram, but an iPhone 17 Pro Max has only 12 gigs.  A Pixel 9 Pro or Pixel 10 Pro fo havw 16 gig, but even a Pixel 10a has only 8 gigs, and a Pixel 8 Pro has only 12 gigs.  Vault cannot run RISC0 provers, except on the most expensive phones.  Ledger devices cannot run RISC0 provers either, not without becoming much more expensive.  You cannot outsource this proof obviously.

Also these STARKs have somewhat suspect zero-knowledge.  Starkware added zero-knowlege only in early 2025.  Google's longfellow runs on phones, but only claims zero-knowledge with $25 - \log |C|$ bits of security since [they set $\lamba=110$](https://github.com/google/longfellow-zk/issues/133).  It's likely better but nobody has stronger formal claims for the whole scheme.  It's unlikely RISC0 or other VMs provide zero-knowledge as STARKs, because they already gain much better zero-knowldge from their Groth16 wrapprs, which are not post-quantum.

## Unresolved Questions

Do we care about FIPS compliance? 

FN-DSA:  How close is key generation to standardization?  How soon could Falcon be deployed even without deterministic keys?

Recovery:  Is Signal going to deploy message recovery?  Is it oging to become standard?  How would we integrate message recovery?  How much more does message recovery save vs key recovery?

ML-DSA:  Do we need an ML-DSA host call?  Accessible in contracts?  Are other chains deploying ML-DSA now?  Bridges?

Should we care about STARKs that proove key derivations?  Imho this seems silly.

## Future Directions and Related Material

Describe future work which could be enabled by this RFC, if it were accepted, as well as related RFCs. This is a place to brain-dump and explore possibilities, which themselves may become their own RFCs.

## Appendex:  Motivation Backstory

*Unknowns:*  We do not know if quantum computer are really possible, or how soon they might be developed, or how they'd scale even after being developed.

We have only a few fringe superdeterminism theories of quantum physics that predict that quantum computers might be fundementally impossible, like [Gerard 't Hooft](https://arxiv.org/abs/1405.1548), so physicists would typically expected them to be possible.  We do have small quantum computers or something similar, but we lack any demonstration of ["quantum supremacy"](https://en.wikipedia.org/wiki/Quantum_supremacy) yet, aka some demonstration that quantum computers can really be faster.  See [Scott Aaronson's Quantum Supremacy FAQ!](https://scottaaronson.blog/?p=4317).

There are quantum computing skeptics like Gil Kalai who argue that quantum computers should not scale because of [collelations in errors](https://gilkalai.wordpress.com/quantum/roadmap-for-the-debate-on-quantum-computing/).  [Feel free to watch Scott Aaronson and Gil Kalai go back and forth.](https://gilkalai.wordpress.com/2026/03/10/scott-aaronsons-view-of-my-view-about-quantum-computing/)  Anyways, skeptics have not convinced most people who study the problem.

Yet, there exists serious problems with most work that shows quantum computers solving real problems, in that they attack artificially simply problem, usually by baking in knowledge about factoring or other similar tricks.  See [Replication of Quantum Factorisation Records with an 8-bit Home Computer, an Abacus, and a Dog](https://eprint.iacr.org/2025/1237) by Peter Gutmann and Stephan Neuhaus <!-- with the fun quote: *"This process wasn’t as simple as it first appeared because Scribble is very well behaved and almost never barks."* --> (related [slides](https://www.cs.auckland.ac.nz/~pgut001/pubs/bollocks.pdf)) or [The Case Against Quantum Computing](https://spectrum.ieee.org/the-case-against-quantum-computing) by Mikhail Dyakonov.  Yet conversely, there are good argument that [factoring is not a good benchmark](https://bas.westerbaan.name/notes/2026/04/02/factoring.html) because of scaling concerns like the base overhead in erasure coding.  And conversely again we should not expect quantum computers scale like classic computers did.

We do however have regular news stories about advances in quantum computing, which all do represent some progress, however incremental once you strp away their hype.  As an example, Google Quantum AI and Ethreum research recently demonstrated using a [zero-knowledge proof to prove improvements in quantum algorithms.](https://research.google/blog/safeguarding-cryptocurrency-by-disclosing-quantum-vulnerabilities-responsibly/)  In that case, [Marcel Tippelt and Marin Ivezic](https://groups.google.com/a/list.nist.gov/g/pqc-forum/c/TgSNl7deK8g) found the results *"not so surprising"* and *"consistent with the trajectory"*, observed that [one of the authors previous paper](https://arxiv.org/pdf/2505.15917) contains much of the technical advancement here, and noted that we're still very far from viable quantum computers.  In other words, the google and ethereum paper seems more about focusing attention upon quantum computing, post-quantum  cryptography, and zeroknowledge proofs. 

As an aside, zero-knowledge proofs address disclosure concerns poorly, because state actors could assign smart people to learn the background, and reproduce similar results.  Instead, we typically keep technolgy secrets through sheer scale, meaning there are enough hard steps that even planning replication becomes difficult.  [*"The Manhattan Project employed nearly 130,000 people at its peak and cost nearly US$2 billion (equivalent to about $28 billion in 2024)."*](https://en.wikipedia.org/wiki/Manhattan_Project) (see also [Robert J. Hansen](https://lists.gnupg.org/pipermail/gnupg-users/2026-April/068253.html))  We expect closed soruce software stays closed because of the sheer number of lines of code, and the work aligning many different components.  

*Known:*  If large enough quantum computers existed, then they could break all the public key cryptography used in most secure network protocols, including Polakdot.  

An end-to-end encrypted (e2ee) messnager like Signal must adopt hybrid post-quantum cryptography now-ish, because some adversaries record and store traffic, and they might decrypt these messages in the future once quantum computer arises (and after their nation has become a fascist dystopia).  We do not have this harvest-now-decrypt-later problem for signatures, which includes the public key cryptography used in blockchains like Polakdot.  We could adopt hybrid post-quantum cryptography much more slowly, but adoption by accound would be slow too.

There are diverse other concerns here which quickly land back in unknowns, like if the NSA or China spends $1 trillion building a quantum computer just barely powerful enough to break elliptic curves, then encryption protocols have a big problem, but crypto-curency maybe fine, since secrecy might prevent their usage and slow further scaling or cost reductions.  Nuclear weapons have not yet scaled, although all the fusion startups might make nuclear weaon scaling easier now.  Also some folks argue that STARKs could prove key derivations, so some UTXO blockchains could somewhat ignore the issue until quantum computers exist. 

*Hybrid:*  We have reasonable post-quantum KEMs and post-qantum signatures, but they should be used in hybird combinations with elliptic curve KEXs and signatures.

One should use hybrid schemes that involve both a lattice primitive and an elliptic curve primitive, because anyways the lattice primitives are younger could be broken before someone develops a quantum computer.  In general, hybrid combiners could be messy, but in our case hybrid post-quantum account keys could simply two keys used together.

As an aside, Don Coppersmith invented lattice attacks upon cryptography, after which he moved to IDA-CCR, the really clever part of the NSA.  In consequence, folks imagine that IDA-CCR and the NSA could've studdied lattices very closely for a long time, which makes them nervious when anyone proposed non-hybrid pure lattice based scheme.  We might not worry aobut the NSA, but doing hybrid just makes sense anyways.  

*Privacy:*  We have regular post-qantum signatures but lack good post-qauntum replacements for some privacy protocols built using elliptic curves, like OPRFs and small SNARKs.

In many cases, these elliptic curve protocols have perfect privacy, meaning even a computationally unbounded attacker cannot break the anonmity.  Also the large STARKs that could provide post quantum alternative have much weaker privacy:  Very few STARK have any zero-knowledge effort, because they only worried about succinctness for ETH's zk roll up push.  Starkware only added zero-knowledge in early 2025.  The formal zero-knowledge claims in google's longfellow paper work out to less than 40 bits of security for zero-knowledge.  It's likely this could be improved, and their auditor believe it secure, but nobody has made stronger formal claims.

If you have a privacy protocol that mostly defends against denial of service attacks, like Cloudflare's OPRF protocol PrivacyPass or many ring VRF use cases, then there is no reason to replace it by any known post-quantum protocol. 
