// TODO: Code will be pasted manually
/**
 * src/constants/queryConfig.ts
 *
 * Centralised cache timing constants.
 * All staleTime values are defined here and imported by hooks.
 * Changing a number here updates every hook that uses it.
 */

/** 5 minutes — used for all stable ML metrics (forecast, personas, churn, etc.) */
export const STALE_TIME_STABLE = 5 * 60 * 1000;

/** 3 minutes — deal priority refreshes slightly faster (operational use) */
export const STALE_TIME_DEALS = 3 * 60 * 1000;

/** 1 minute — health polling (drives topbar badge) */
export const STALE_TIME_HEALTH = 1 * 60 * 1000;

/**
 * Infinity — God-Tier heavy computation endpoints.
 * Only invalidated by useIngestZIPMutation's onSuccess cascade.
 */
export const STALE_TIME_HEAVY = Infinity;

/** Global garbage collection time — how long unused cache entries persist */
export const GC_TIME = 10 * 60 * 1000;   // 10 minutes