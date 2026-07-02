/**
 * Module-level flag tracking whether a guest was explicitly directed to the
 * login screen by in-app code (e.g. tapping "Sign In" from a Save alert).
 *
 * This lets the root layout distinguish intentional auth navigation from
 * stale Expo Router nav-state restoration on cold start, so guests are only
 * kept on the login screen when they actually asked to be there.
 */

let _active = false;

export function setGuestLoginIntent(active: boolean) { _active = active; }
export function getGuestLoginIntent() { return _active; }

/**
 * Tracks whether the guest has completed onboarding in this session.
 * Set synchronously before router.replace so the routing effect sees it
 * immediately — avoids the race where AsyncStorage hasn't updated yet.
 */
let _guestOnboardingSeen = false;

export function setGuestOnboardingSeen() { _guestOnboardingSeen = true; }
export function getGuestOnboardingSeen() { return _guestOnboardingSeen; }

/**
 * Tracks whether any user (guest or signed-in) completed onboarding in this
 * session. Set synchronously before router.replace so the routing effect sees
 * it immediately — avoids the race where AsyncStorage hasn't updated yet.
 */
let _onboardingSeenThisSession = false;

export function setOnboardingSeenThisSession() { _onboardingSeenThisSession = true; }
export function getOnboardingSeenThisSession() { return _onboardingSeenThisSession; }
