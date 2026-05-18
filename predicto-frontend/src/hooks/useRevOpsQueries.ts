/**
 * src/hooks/useRevOpsQueries.ts
 *
 * Primary TanStack Query hook file for all stable ML metric endpoints.
 *
 * CACHING POLICY:
 * ┌─────────────────────────────────────┬──────────┬────────────────────────┐
 * │ Query                               │ staleTime│ refetchOnWindowFocus   │
 * ├─────────────────────────────────────┼──────────┼────────────────────────┤
 * │ Intelligence Hub (hub)              │ 5 min    │ false                  │
 * │ Forecast (Fourier+Ridge)            │ 5 min    │ false                  │
 * │ Personas (K-Means)                  │ 5 min    │ false                  │
 * │ Revenue Overview                    │ 5 min    │ false                  │
 * │ RevOps KPIs                         │ 5 min    │ false                  │
 * │ Deal Priority                       │ 3 min    │ false                  │
 * │ Churn Warnings                      │ 5 min    │ false                  │
 * │ Expansion Candidates                │ 5 min    │ false                  │
 * │ Cliff Detector                      │ 5 min    │ false                  │
 * │ Cohort Lifecycle                    │ 5 min    │ false                  │
 * │ Rep Playbooks                       │ 5 min    │ false                  │
 * │ Campaign ROI                        │ 5 min    │ false                  │
 * │ Health V2 (polling)                 │ 1 min    │ false (uses refetchInterval)│
 * └─────────────────────────────────────┴──────────┴────────────────────────┘
 *
 * WHY refetchOnWindowFocus = false everywhere:
 * These are ML model outputs over 2500+ customer records. A tab-switch
 * should never silently re-invoke a backend model training run just because
 * the user alt-tabbed. staleTime of 5 minutes means view switches within
 * that window are instant (zero-lag) from the TanStack Query cache.
 *
 * REFINEMENT #2 INTEGRATION:
 * useHealthV2Query calls syncHealthSnapshot in its onSuccess handler,
 * keeping the global store in sync during background polling.
 */

import { useQuery } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";
import { STALE_TIME_STABLE, STALE_TIME_HEALTH } from "@/constants/queryConfig";
import { useDataStore } from "@/store/useDataStore";

// API functions
import { fetchIntelligenceHub } from "@/api/v2/intelligenceHubApi";
import { fetchForecast } from "@/api/v1/forecastApi";
import { fetchPersonas } from "@/api/v1/personasApi";
import { fetchRevenueOverview } from "@/api/v1/revenueOverviewApi";
import { fetchRevOpsKpis } from "@/api/v2/revOpsKpisApi";
import { fetchDealPriority } from "@/api/v2/dealPriorityApi";
import { fetchChurnWarnings } from "@/api/v2/churnCompetitiveApi";
import { fetchExpansionCandidates } from "@/api/v2/expansionCandidatesApi";
import { fetchCliffDetector } from "@/api/v2/cliffDetectorApi";
import { fetchCohortLifecycle } from "@/api/v2/cohortLifecycleApi";
import { fetchRepPlaybooks } from "@/api/v2/repPlaybooksApi";
import { fetchCampaignRoi } from "@/api/v2/campaignRoiApi";
import { fetchHealthV2 } from "@/api/v2/healthApi";

// Types
import type { IntelligenceHubResponse } from "@/types/intelligenceHub";
import type { ForecastResponse } from "@/types/forecast";
import type { PersonasResponse } from "@/types/personas";
import type { RevOpsKPIResponse } from "@/types/revOpsKpis";
import type { DealPriorityResponse } from "@/types/deals";
import type { CompetitiveChurnResponse } from "@/types/churn";
import type { ExpansionCandidatesResponse } from "@/types/expansion";
import type { CliffDetectorResponse } from "@/types/cliffDetector";
import type { CampaignROIResponse } from "@/types/campaignRoi";
import type { V2HealthResponse } from "@/types/health";

// ── Shared options for all stable ML metrics ──────────────────────────────────
const STABLE_QUERY_OPTIONS = {
    staleTime: STALE_TIME_STABLE,        // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: true,                // Always fetch on first mount (cold start)
    retry: 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 10_000),
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// INTELLIGENCE HUB
// ─────────────────────────────────────────────────────────────────────────────
export function useIntelligenceHubQuery(options?: { enabled?: boolean }) {
    return useQuery<IntelligenceHubResponse>({
        queryKey: QUERY_KEYS.INTELLIGENCE_HUB,
        queryFn: fetchIntelligenceHub,
        enabled: options?.enabled ?? true,
        ...STABLE_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// FORECAST
// ─────────────────────────────────────────────────────────────────────────────
export function useForecastQuery(
    periods: number = 3,
    options?: { enabled?: boolean }
) {
    return useQuery<ForecastResponse>({
        queryKey: QUERY_KEYS.FORECAST(periods),
        queryFn: () => fetchForecast(periods),
        enabled: options?.enabled ?? true,
        ...STABLE_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// PERSONAS
// ─────────────────────────────────────────────────────────────────────────────
export function usePersonasQuery(options?: { enabled?: boolean }) {
    return useQuery<PersonasResponse>({
        queryKey: QUERY_KEYS.PERSONAS,
        queryFn: fetchPersonas,
        enabled: options?.enabled ?? true,
        ...STABLE_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// REVOPS KPIs
// ─────────────────────────────────────────────────────────────────────────────
export function useRevOpsKpisQuery(options?: { enabled?: boolean }) {
    return useQuery<RevOpsKPIResponse>({
        queryKey: QUERY_KEYS.REV_OPS_KPIS,
        queryFn: fetchRevOpsKpis,
        enabled: options?.enabled ?? true,
        ...STABLE_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// DEAL PRIORITY
// ─────────────────────────────────────────────────────────────────────────────
export function useDealPriorityQuery(options?: { enabled?: boolean }) {
    return useQuery<DealPriorityResponse>({
        queryKey: QUERY_KEYS.DEAL_PRIORITY,
        queryFn: fetchDealPriority,
        enabled: options?.enabled ?? true,
        ...STABLE_QUERY_OPTIONS,
        staleTime: 3 * 60 * 1000,          // Deal priority refreshes slightly faster
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// CHURN WARNINGS
// ─────────────────────────────────────────────────────────────────────────────
export function useChurnWarningsQuery(options?: { enabled?: boolean }) {
    return useQuery<CompetitiveChurnResponse>({
        queryKey: QUERY_KEYS.CHURN_WARNINGS,
        queryFn: fetchChurnWarnings,
        enabled: options?.enabled ?? true,
        ...STABLE_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPANSION CANDIDATES
// ─────────────────────────────────────────────────────────────────────────────
export function useExpansionCandidatesQuery(options?: { enabled?: boolean }) {
    return useQuery<ExpansionCandidatesResponse>({
        queryKey: QUERY_KEYS.EXPANSION_CANDIDATES,
        queryFn: fetchExpansionCandidates,
        enabled: options?.enabled ?? true,
        ...STABLE_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIFF DETECTOR
// ─────────────────────────────────────────────────────────────────────────────
export function useCliffDetectorQuery(options?: { enabled?: boolean }) {
    return useQuery<CliffDetectorResponse>({
        queryKey: QUERY_KEYS.CLIFF_DETECTOR,
        queryFn: fetchCliffDetector,
        enabled: options?.enabled ?? true,
        ...STABLE_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// COHORT LIFECYCLE
// ─────────────────────────────────────────────────────────────────────────────
export function useCohortLifecycleQuery(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: QUERY_KEYS.COHORT_LIFECYCLE,
        queryFn: fetchCohortLifecycle,
        enabled: options?.enabled ?? true,
        ...STABLE_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// REP PLAYBOOKS
// ─────────────────────────────────────────────────────────────────────────────
export function useRepPlaybooksQuery(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: QUERY_KEYS.REP_PLAYBOOKS,
        queryFn: fetchRepPlaybooks,
        enabled: options?.enabled ?? true,
        ...STABLE_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// CAMPAIGN ROI
// ─────────────────────────────────────────────────────────────────────────────
export function useCampaignRoiQuery(options?: { enabled?: boolean }) {
    return useQuery<CampaignROIResponse>({
        queryKey: QUERY_KEYS.CAMPAIGN_ROI,
        queryFn: fetchCampaignRoi,
        enabled: options?.enabled ?? true,
        ...STABLE_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH V2 — background polling + store sync (REFINEMENT #2)
// ─────────────────────────────────────────────────────────────────────────────
export function useHealthV2Query() {
    const syncHealthSnapshot = useDataStore((s) => s.syncHealthSnapshot);

    return useQuery<V2HealthResponse>({
        queryKey: QUERY_KEYS.HEALTH_V2,
        queryFn: fetchHealthV2,
        staleTime: STALE_TIME_HEALTH,       // 1 minute
        refetchOnWindowFocus: false,
        refetchInterval: 60_000,             // Poll every 60s for live health badge
        retry: 1,

        // REFINEMENT #2 integration: keep the store's health snapshot in sync
        // so the topbar SystemHealthBadge and SystemHealthBanner always show
        // the latest state without the UI needing to subscribe to this query directly.
        select: (data) => {
            syncHealthSnapshot(
                data.health_score,
                data.is_ready,
                data.tables_loaded,
                data.tables_missing,
                data.active_model ?? null,
                data.ai_modules ?? {}
            );
            return data;
        },
    });
}