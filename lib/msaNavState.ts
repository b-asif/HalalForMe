/**
 * Lightweight in-memory store for the last focused top-level MSA route.
 * Used so that re-entering the MSA portal returns to wherever the admin was.
 */

let _lastRoute = '/(msa)/dashboard';

export const setLastMsaRoute = (route: string) => { _lastRoute = route; };
export const getLastMsaRoute = (): string => _lastRoute;
