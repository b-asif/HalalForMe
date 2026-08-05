# Phase 7 — Monetization

**Status: ⬜ Not Started**

## Scope

No ads SDK and no subscription/in-app-purchase library exist in the codebase today. This phase exists because sustainability eventually requires a revenue model — but it's deliberately sequenced *after* the discovery, trust, and engagement work in Phases 2-6, not before, since monetizing an app that hasn't yet closed its most visible gaps (map view, community activity, push coverage) would be premature.

## Hard Constraint: Must Not Compromise the Privacy Commitment

Per [PRODUCT_VISION.md](../PRODUCT_VISION.md#4-what-we-wont-do"), the app has made explicit public commitments that any monetization plan must respect:
- **No selling or sharing of location data** — location is used only to compute prayer times, Qibla direction, and nearby restaurants.
- **No ad SDKs** — no tracking-based advertising, regardless of what model is chosen.
- **No account requirement for core functionality** — guest browsing must remain fully functional even if a paid tier exists.

This rules out the two most common mobile monetization defaults (ad networks, and paywalling core functionality) and points toward an **optional premium tier** as the most likely fit.

## Candidate Directions (Not Yet Decided)

- **Premium tier** — e.g. additional calculation-method customization, richer notification controls (custom sounds, per-prayer scheduling beyond the current precaution-buffer model), ad-free is moot since there are no ads, but could include things like extended scan history, priority support, or early access to new features (map view, community features).
- **One-time purchase vs. subscription** — a subscription model is more sustainable long-term but is a harder sell for a religious-utility app where users may reasonably expect core features to stay free indefinitely; a one-time "supporter" purchase (no functional gate, just goodwill + maybe a badge) is worth evaluating as an alternative or complement.
- **Restaurant/business-side revenue** — e.g. a paid "verified/featured" placement for restaurant owners who've already gone through the claim-ownership flow, which doesn't touch the consumer-facing privacy commitments at all and may be the least conflicted option.

## Work Required Regardless of Direction

- Add and configure a payments library (`react-native-iap` or Expo's in-app-purchase equivalent, or RevenueCat as a cross-platform abstraction layer)
- App Store / Play Store subscription or IAP product configuration
- Server-side entitlement verification (a client-only "is premium" flag is trivially bypassable) — likely needs receipt validation via a new Edge Function
- Decide how a premium tier interacts with the existing guest/account model — presumably premium requires an account even though free tier doesn't, which needs careful UX so it doesn't read as a bait-and-switch on the no-account-required promise

## Exit Criteria

- [ ] A specific monetization direction chosen and documented here (replacing "candidate directions" above with a decision)
- [ ] Payments library integrated with server-side entitlement verification
- [ ] No degradation to guest browsing or any feature currently free — a premium tier must be additive, not a retroactive paywall
