// TODO: Code will be pasted manually
/**
 * src/hooks/useGodTierQueries.ts
 *
 * TanStack Query hooks for all V3 God-Tier analytical endpoints.
 *
 * CACHING POLICY — HEAVY ENDPOINTS:
 * These endpoints trigger MILP solvers, Double ML cross-fitting, Bayesian VAR,
 * CFR game theory iterations, and TDA Mapper computations. They MUST NOT
 * re-run automatically due to window focus, background refetch intervals,
 * or stale-time expiry during an active session.
 *
 * ALL God-Tier queries share:
 *   staleTime:              Infinity  (never stale until explicit invalidation)
 *   refetchOnWindowFocus:   false     (never)
 *   refetchOnReconnect:     false     (never)
 *   refetchInterval:        false     (never)
 *   refetchIntervalInBackground: false
 *
 * Data is fresh until useIngestZIPMutation fires and invalidates ALL_METRICS.
 * That is the ONLY trigger for re-fetching God-Tier data.
 *
 * MUTATIONS (topology optimizer, stress test) use useMutation, not useQuery,
 * because they take user-configured request bodies. They live in
 * useGodTierMutations (defined at bottom of this file).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { QUERY_KEYS } from "@/lib/queryKeys";

// API functions
import { fetchContagionNetwork } from "@/api/v2/godtier/contagionNetworkApi";
import { fetchRevenueGenome } from "@/api/v2/godtier/revenueGenomeApi";
import { fetchWarRoom } from "@/api/v2/godtier/warRoomApi";
import { fetchCounterfactual } from "@/api/v2/godtier/counterfactualApi";
import { runTopologyOptimizer } from "@/api/v2/godtier/topologyOptimizerApi";
import { runStressTest } from "@/api/v2/godtier/stressTestApi";

// Types
import type { ContagionNetworkResponse } from "@/types/godtier/contagionNetwork";
import type { RevenueGenomeResponse } from "@/types/godtier/revenueGenome";
import type { DealWarRoomResponse } from "@/types/godtier/warRoom";
import type { CounterfactualResponse } from "@/types/godtier/counterfactual";
import type {
    TopologyOptimizationRequest,
    TopologyOptimizationResponse,
} from "@/types/godtier/topologyOptimizer";
import type {
    StressTestRequest,
    StressTestResponse,
} from "@/types/godtier/stressTest";
import type { TreatmentType } from "@/types/enums";

// ── Shared heavy-endpoint options ─────────────────────────────────────────────
const HEAVY_QUERY_OPTIONS = {
    staleTime: Infinity,                    // Never automatically re-fetch
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false as const,
    refetchIntervalInBackground: false,
    retry: 1,                               // One retry only — these are expensive
    retryDelay: 5_000,                      // 5s before retry
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// CONTAGION NETWORK
// GET /api/v2/godtier/portfolio/contagion-network
// ─────────────────────────────────────────────────────────────────────────────
export function useContagionNetworkQuery(options?: { enabled?: boolean }) {
    return useQuery<ContagionNetworkResponse>({
        queryKey: QUERY_KEYS.CONTAGION_NETWORK,
        queryFn: fetchContagionNetwork,
        enabled: options?.enabled ?? true,
        ...HEAVY_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE GENOME
// GET /api/v2/godtier/portfolio/genome
// ─────────────────────────────────────────────────────────────────────────────
export function useRevenueGenomeQuery(options?: { enabled?: boolean }) {
    return useQuery<RevenueGenomeResponse>({
        queryKey: QUERY_KEYS.REVENUE_GENOME,
        queryFn: fetchRevenueGenome,
        enabled: options?.enabled ?? true,
        ...HEAVY_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// WAR ROOM
// GET /api/v2/godtier/deals/war-room
// ─────────────────────────────────────────────────────────────────────────────
export function useWarRoomQuery(options?: { enabled?: boolean }) {
    return useQuery<DealWarRoomResponse>({
        queryKey: QUERY_KEYS.WAR_ROOM,
        queryFn: fetchWarRoom,
        enabled: options?.enabled ?? true,
        ...HEAVY_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTERFACTUAL / CAUSAL ENGINE
// GET /api/v2/godtier/causal/counterfactual
// treatment param changes the query key → separate cache entry per treatment
// ─────────────────────────────────────────────────────────────────────────────
export function useCounterfactualQuery(
    treatment: TreatmentType,
    options?: { enabled?: boolean }
) {
    return useQuery<CounterfactualResponse>({
        queryKey: QUERY_KEYS.COUNTERFACTUAL(treatment),
        queryFn: () => fetchCounterfactual(treatment),
        enabled: options?.enabled ?? true,
        ...HEAVY_QUERY_OPTIONS,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// TOPOLOGY OPTIMIZER MUTATION
// POST /api/v2/godtier/optimization/topology
//
// This is a useMutation (not useQuery) because:
// 1. It takes a user-configured request body (budget constraints)
// 2. Results should NOT be cached — each run with different budgets
//    produces a different optimal schedule
// 3. Re-running should always be user-initiated (not automatic)
// ─────────────────────────────────────────────────────────────────────────────
export function useTopologyOptimizerMutation() {
    return useMutation<
        TopologyOptimizationResponse,
        Error,
        TopologyOptimizationRequest
    >({
        mutationFn: (request) => runTopologyOptimizer(request),
        // No cache invalidation on success — topology results are ephemeral
        // and tied to the specific budget inputs used to generate them.
        // The result is stored in local component state (TopologyOptimizerView).
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// STRESS TEST MUTATION
// POST /api/v2/godtier/forecast/stress-test
//
// useMutation for same reasons as topology optimizer:
// user-configured scenarios, results are session-ephemeral.
// ─────────────────────────────────────────────────────────────────────────────
export function useStressTestMutation() {
    return useMutation<StressTestResponse, Error, StressTestRequest>({
        mutationFn: (request) => runStressTest(request),
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO SIMULATOR MUTATION
// POST /api/v2/forecast/revenue-simulator
//
// Although this is a V2 endpoint (not strictly God-Tier), it shares the
// same "heavy, user-initiated, non-cacheable" characteristics, so it lives
// here alongside the other computational mutations.
//
// REFINEMENT #1 INTEGRATION:
// The request body is built by toSimulatorRequest(params) where params comes
// from useSimulatorSearchParams() — the URL is the single source of truth.
// ─────────────────────────────────────────────────────────────────────────────
import { runScenarioSimulator } from "@/api/v2/scenarioSimulatorApi";
import type { SimulatorRequest, SimulatorResponse } from "@/types/simulator";

export function useScenarioSimulatorMutation() {
    return useMutation<SimulatorResponse, Error, SimulatorRequest>({
        mutationFn: (request) => runScenarioSimulator(request),
    });
}