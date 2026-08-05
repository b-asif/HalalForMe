# Phase 2 — Visual & Reliability Polish

**Status: 🟡 In Progress**

## Scope

Two threads: (1) finish extending the cream/deep-green/gold visual redesign to every screen that still carries the older look, and (2) close out reliability gaps in features that are functionally built but not yet fully verified on real devices.

## Visual Consistency Pass

**Already migrated to `Brand`:** Home, Qibla, onboarding, Explore, Scanner, Profile.

**Still on the legacy `Colors` palette / local hardcoded colors:**
- Restaurant detail (`app/restaurant/[id].tsx`)
- Submit-restaurant and claim-restaurant flows
- Account screens: Saved, My Reviews, My Submissions, My Photos, Blocked Users
- Legal pages: Privacy Policy, Terms of Service, Certification Guide, Help
- Auth screens: Login, Signup, Forgot/Reset Password, OTP Verification
- Admin panel (all screens) — lowest priority, internal-only surface

See [DESIGN_SYSTEM.md](../DESIGN_SYSTEM.md) for the exact token mapping (`Colors.bg` → `Brand.cream`, etc.) and the reasoning for why this isn't just a find-and-replace — the background color shift from cool light-grey to warm cream is the visual core of the redesign.

**Recommended order:** restaurant detail first (highest-traffic remaining screen), then the submit/claim flows (next most visible to engaged users), then account screens, then legal/auth (low-frequency but still user-facing), then admin last.

## Qibla Enhancements

- **Rotating true-north compass rose.** Currently a fixed dial with only the needle rotating. A properly rotating rose (the dial itself rotates to track true north, with the needle staying fixed relative to the phone's heading, or vice versa depending on the chosen interaction model) is a more standard compass UX and was deliberately deferred until the visual redesign was locked in, since this is a correctness-sensitive change that needs its own on-device verification pass.
- **Live distance-to-Kaaba readout.** A straightforward addition once the rose rework is in — compute great-circle distance from the resolved coordinates to the Kaaba's fixed coordinates, alongside the existing bearing/heading/accuracy readout.

## Reliability Verification

- **Background refresh, end-to-end on a device.** The background task that keeps the prayer notification schedule current (`expo-background-task` + `expo-task-manager`, registered via unconditional import in `app/_layout.tsx`) has never actually been exercised over a real multi-day background period on a physical device. Needs a real test: install, background the app (don't force-quit), wait through the OS's actual background-refresh interval, and confirm the notification schedule window has advanced.
- **iOS notification delivery** — this was a known open investigation as of the original vision document; it has since been root-caused and fixed (DATE-type triggers, not CALENDAR-type — see [CLAUDE.md](../CLAUDE.md)). Included here as a reminder to keep watching for regressions, since it was a subtle, hard-won fix.

## Exit Criteria

- [ ] All screens listed above migrated to the `Brand` palette
- [ ] Qibla compass rose rotates correctly relative to true north, verified on-device
- [ ] Distance-to-Kaaba displayed and spot-checked against known city-to-Mecca distances
- [ ] Background refresh confirmed working over a real multi-day period without the app being opened
