# Phase 3 — Restaurant Discovery Maturity

**Status: ⬜ Not Started**

## Scope

Restaurant discovery is entirely list-based today. This is the single most visible feature gap versus competitor halal-restaurant apps, most of which lead with a map.

## Planned Work

### Map View
- Add `react-native-maps` (not currently a dependency)
- Pin-based map showing restaurants within the current search radius, synced with the existing filter state (cuisine, certification, open-now, rating) rather than being a separate, disconnected view
- Tapping a pin should open the same restaurant detail screen used from the list, not a divergent map-specific card
- Consider a list/map toggle on the Explore tab rather than replacing the list outright — the list view's filter sheet and text search are already solid and shouldn't be lost

### Discovery Quality Improvements (enabled by map-based proximity)
- Cluster markers at low zoom levels once restaurant density grows
- "Search this area" pattern (re-query when the user pans the map) instead of a fixed radius from one geocoded point
- Revisit the current haversine-distance-based sort now that real device location is visually anchored on a map, not just a number on a card

## Dependencies

- Builds on the Explore tab's existing filter/search state (already solid as of Phase 1 — see [docs/phase1.md](./phase1.md))
- Should wait until [Phase 2](./phase2.md)'s visual consistency pass reaches the restaurant detail screen, so the map's restaurant cards/detail links aren't built against a screen about to be redesigned

## Exit Criteria

- [ ] Map view showing restaurants near the user, respecting all existing Explore filters
- [ ] List/map toggle, not a replacement of the existing list
- [ ] Tapping a map pin opens the same restaurant detail screen as the list
