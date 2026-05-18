// TODO: Code will be pasted manually
/**
 * src/hooks/useSimulatorSearchParams.ts
 *
 * REFINEMENT #1 — URL as Single Source of Truth for Shareable State
 *
 * ARCHITECTURAL DECISION:
 * useSimulatorStore.ts and useWarRoomStore.ts are ELIMINATED.
 * All shareable parameter state (Simulator levers, War Room deal/tradeoff)
 * lives exclusively in URL search params — the single source of truth.
 *
 * This hook provides a typed, two-way binding between URL search params and
 * strongly-typed state objects. It replaces Zustand for these two domains.
 *
 * STATE DIVERGENCE HAZARD ELIMINATED:
 * Previously: Zustand held { discountCeiling: 0.2 } while the URL held
 * ?discount_ceiling=0.15 after a back-navigation — causing the UI to render
 * one value while the mutation would fire with another.
 * Now: The URL IS the state. There is no secondary store to drift.
 *
 * USAGE:
 *   const [params, setParams] = useSimulatorSearchParams();
 *   // params.discountCeiling is always in sync with the URL
 *   // setParams({ discountCeiling: 0.25 }) pushes a new history entry
 */

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { SimulatorRequest } from "@/types/simulator";

// ─── Canonical defaults ────────────────────────────────────────────────────────
// These are the values used when a param is absent from the URL.
// They must mirror the backend's SimulatorRequest field defaults exactly.
export const SIMULATOR_DEFAULTS = {
    discountCeiling: null as number | null,
    churnInterventionThreshold: null as number | null,
    expansionActivationClusters: [] as string[],
    forecastMonths: 9,
} as const;

// ─── Typed read/write surface ─────────────────────────────────────────────────
export interface SimulatorParams {
    discountCeiling: number | null;
    churnInterventionThreshold: number | null;
    expansionActivationClusters: string[];
    forecastMonths: number;
}

// ─── Serialiser / Deserialiser helpers ────────────────────────────────────────
function parseNullableFloat(raw: string | null): number | null {
    if (raw === null || raw === "") return null;
    const n = parseFloat(raw);
    return isNaN(n) ? null : n;
}

function parseInt(raw: string | null, fallback: number): number {
    if (raw === null) return fallback;
    const n = parseInt(raw, 10);
    return isNaN(n) ? fallback : n;
}

function parseStringArray(raw: string | null): string[] {
    if (!raw) return [];
    return raw.split(",").filter(Boolean);
}

function serialiseNullable(value: number | null): string {
    return value === null ? "" : String(value);
}

function serialiseArray(values: string[]): string {
    return values.join(",");
}

// ─── Primary hook ─────────────────────────────────────────────────────────────
export function useSimulatorSearchParams(): [
    SimulatorParams,
    (patch: Partial<SimulatorParams>) => void,
    () => void,
] {
    const [searchParams, setSearchParams] = useSearchParams();

    // ── Deserialise URL → typed state (computed on every render, zero overhead) ──
    const params: SimulatorParams = {
        discountCeiling: parseNullableFloat(
            searchParams.get("discount_ceiling")
        ),
        churnInterventionThreshold: parseNullableFloat(
            searchParams.get("churn_threshold")
        ),
        expansionActivationClusters: parseStringArray(
            searchParams.get("expansion_clusters")
        ),
        forecastMonths: parseInt(
            searchParams.get("forecast_months"),
            SIMULATOR_DEFAULTS.forecastMonths
        ),
    };

    // ── Serialise typed patch → URL (immutable merge, preserves other params) ────
    const setParams = useCallback(
        (patch: Partial<SimulatorParams>) => {
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);

                    if ("discountCeiling" in patch) {
                        const v = serialiseNullable(patch.discountCeiling ?? null);
                        v ? next.set("discount_ceiling", v) : next.delete("discount_ceiling");
                    }
                    if ("churnInterventionThreshold" in patch) {
                        const v = serialiseNullable(
                            patch.churnInterventionThreshold ?? null
                        );
                        v
                            ? next.set("churn_threshold", v)
                            : next.delete("churn_threshold");
                    }
                    if ("expansionActivationClusters" in patch) {
                        const v = serialiseArray(patch.expansionActivationClusters ?? []);
                        v
                            ? next.set("expansion_clusters", v)
                            : next.delete("expansion_clusters");
                    }
                    if ("forecastMonths" in patch) {
                        const v = patch.forecastMonths ?? SIMULATOR_DEFAULTS.forecastMonths;
                        v === SIMULATOR_DEFAULTS.forecastMonths
                            ? next.delete("forecast_months")
                            : next.set("forecast_months", String(v));
                    }

                    return next;
                },
                { replace: false } // push history entry → back button restores prior scenario
            );
        },
        [setSearchParams]
    );

    // ── Reset to defaults ─────────────────────────────────────────────────────
    const resetParams = useCallback(() => {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                ["discount_ceiling", "churn_threshold", "expansion_clusters", "forecast_months"].forEach(
                    (k) => next.delete(k)
                );
                return next;
            },
            { replace: true } // reset does NOT push a history entry
        );
    }, [setSearchParams]);

    return [params, setParams, resetParams];
}

// ─── Conversion helper: SimulatorParams → SimulatorRequest (API shape) ───────
// Used by useScenarioSimulatorMutation to build the POST body.
export function toSimulatorRequest(params: SimulatorParams): SimulatorRequest {
    return {
        discount_ceiling: params.discountCeiling ?? undefined,
        churn_intervention_threshold:
            params.churnInterventionThreshold ?? undefined,
        expansion_activation_clusters:
            params.expansionActivationClusters.length > 0
                ? params.expansionActivationClusters
                : undefined,
        forecast_months: params.forecastMonths,
    };
}