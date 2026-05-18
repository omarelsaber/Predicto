/**
 * src/lib/queryKeys.ts
 *
 * Centralised QueryKey factory.
 * ALL TanStack Query keys are defined here.
 * This is the contract between useIngestMutations invalidation cascade
 * and every individual query hook.
 *
 * INVALIDATION TREE:
 * ALL_METRICS
 * ├── HEALTH_V2
 * ├── INTELLIGENCE_HUB
 * ├── FORECAST(periods)
 * ├── PERSONAS
 * ├── REV_OPS_KPIS
 * ├── DEAL_PRIORITY
 * ├── CHURN_WARNINGS
 * ├── EXPANSION_CANDIDATES
 * ├── CLIFF_DETECTOR
 * ├── COHORT_LIFECYCLE
 * ├── REP_PLAYBOOKS
 * ├── CAMPAIGN_ROI
 * └── GOD_TIER
 *     ├── CONTAGION_NETWORK
 *     ├── REVENUE_GENOME
 *     ├── WAR_ROOM
 *     ├── COUNTERFACTUAL(treatment)
 *     └── STRESS_TEST(scenarios,iterations)
 *
 * useIngestZIPMutation calls:
 *   queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ALL_METRICS })
 * This matches every key in the tree because TanStack Query does prefix matching.
 */

export const QUERY_KEYS = {
    // Root — invalidating this cascades to every branch
    ALL_METRICS: ["metrics"] as const,

    // Health
    HEALTH_V1: ["metrics", "health", "v1"] as const,
    HEALTH_V2: ["metrics", "health", "v2"] as const,

    // Intelligence Hub
    INTELLIGENCE_HUB: ["metrics", "intelligence", "hub"] as const,

    // V1 Core
    FORECAST: (periods: number) =>
        ["metrics", "forecast", periods] as const,
    PERSONAS: ["metrics", "personas"] as const,
    REVENUE_OVERVIEW: ["metrics", "revenue", "overview"] as const,
    PREVIEW: ["metrics", "preview"] as const,
    TRANSACTIONS: ["metrics", "transactions"] as const,

    // V2 RevOps
    REV_OPS_KPIS: ["metrics", "revops", "kpis"] as const,
    DEAL_PRIORITY: ["metrics", "deals", "priority"] as const,
    CHURN_WARNINGS: ["metrics", "churn", "warnings"] as const,
    EXPANSION_CANDIDATES: ["metrics", "expansion", "candidates"] as const,
    CLIFF_DETECTOR: ["metrics", "risk", "cliff"] as const,
    COHORT_LIFECYCLE: ["metrics", "cohort", "lifecycle"] as const,
    REP_PLAYBOOKS: ["metrics", "rep", "playbooks"] as const,
    CAMPAIGN_ROI: ["metrics", "campaign", "roi"] as const,

    // V3 God-Tier
    GOD_TIER_ROOT: ["metrics", "godtier"] as const,
    CONTAGION_NETWORK: ["metrics", "godtier", "contagion"] as const,
    REVENUE_GENOME: ["metrics", "godtier", "genome"] as const,
    WAR_ROOM: ["metrics", "godtier", "warroom"] as const,
    COUNTERFACTUAL: (treatment: string) =>
        ["metrics", "godtier", "counterfactual", treatment] as const,
    STRESS_TEST: (scenarios: string[], iterations: number) =>
        ["metrics", "godtier", "stresstest", scenarios.sort().join(","), iterations] as const,
} as const;// TODO: Code will be pasted manually
