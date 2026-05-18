/**
 * src/store/useTopologyStore.ts
 *
 * REFINEMENT #1 NOTE — WHY THIS STORE SURVIVES:
 *
 * useSimulatorStore and useWarRoomStore were eliminated and replaced by
 * useSimulatorSearchParams and useWarRoomSearchParams respectively.
 *
 * useTopologyStore is RETAINED and is NOT replaced by URL params.
 *
 * REASON: Topology optimizer inputs (budget constraints, planning period,
 * churn weight) are NOT shareable-link state. A URL like:
 *   /lab/topology?rep_hours=200&csm=50&campaign=10000&churn_weight=0.7
 * would reconstruct the INPUT form, but the user would still need to
 * click "Run Optimizer" to get results. The result itself (a 500-row
 * master schedule from a MILP solve) cannot be encoded in a URL.
 *
 * More critically: topology inputs are transient computation parameters
 * that change frequently as users explore different budget scenarios within
 * the same Lab session. URL history entries for every slider drag would
 * pollute the browser back-stack with meaningless intermediate states.
 *
 * This store serves one purpose: preserve the user's last-configured budget
 * inputs when they navigate away from the Topology sub-route and return,
 * so they don't have to re-enter all values. This is a UX comfort feature,
 * not a collaboration feature — Zustand is the right tool here.
 *
 * LIFETIME: Session only (no localStorage persistence). Refreshing the page
 * resets to defaults, which is correct — a new session should start fresh.
 */

import { create } from "zustand";
import type { TopologyOptimizationRequest } from "@/types/godtier/topologyOptimizer";

// ─── Store shape ──────────────────────────────────────────────────────────────
interface TopologyStoreState {
    // Budget inputs — mirror TopologyOptimizationRequest fields
    maxRepHours: number | null;
    maxCsmInterventions: number | null;
    maxCampaignSpend: number | null;
    planningPeriodDays: number;
    churnWeight: number;
    topNCustomers: number | null;

    // Derived: has the user ever run the optimizer in this session?
    hasRunOnce: boolean;
}

interface TopologyStoreActions {
    setMaxRepHours: (v: number | null) => void;
    setMaxCsmInterventions: (v: number | null) => void;
    setMaxCampaignSpend: (v: number | null) => void;
    setPlanningPeriodDays: (v: number) => void;
    setChurnWeight: (v: number) => void;
    setTopNCustomers: (v: number | null) => void;
    markHasRun: () => void;
    resetToDefaults: () => void;

    /** Serialise current store state into a TopologyOptimizationRequest for the mutation. */
    toRequest: () => TopologyOptimizationRequest;
}

const DEFAULTS: TopologyStoreState = {
    maxRepHours: 200,
    maxCsmInterventions: 50,
    maxCampaignSpend: 10_000,
    planningPeriodDays: 30,
    churnWeight: 0.7,
    topNCustomers: null,
    hasRunOnce: false,
};

export const useTopologyStore = create<
    TopologyStoreState & TopologyStoreActions
>((set, get) => ({
    ...DEFAULTS,

    setMaxRepHours: (v) => set({ maxRepHours: v }),
    setMaxCsmInterventions: (v) => set({ maxCsmInterventions: v }),
    setMaxCampaignSpend: (v) => set({ maxCampaignSpend: v }),
    setPlanningPeriodDays: (v) => set({ planningPeriodDays: v }),
    setChurnWeight: (v) => set({ churnWeight: v }),
    setTopNCustomers: (v) => set({ topNCustomers: v }),
    markHasRun: () => set({ hasRunOnce: true }),
    resetToDefaults: () => set({ ...DEFAULTS }),

    toRequest: (): TopologyOptimizationRequest => {
        const s = get();
        return {
            max_rep_hours: s.maxRepHours ?? undefined,
            max_csm_interventions: s.maxCsmInterventions ?? undefined,
            max_campaign_spend: s.maxCampaignSpend ?? undefined,
            planning_period_days: s.planningPeriodDays,
            churn_weight: s.churnWeight,
            top_n_customers: s.topNCustomers ?? undefined,
        };
    },
}));// TODO: Code will be pasted manually
