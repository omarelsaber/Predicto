// TODO: Code will be pasted manually
/**
 * src/hooks/useWarRoomSearchParams.ts
 *
 * REFINEMENT #1 — War Room URL Search Params (replaces useWarRoomStore.ts)
 *
 * State managed here:
 *  - selectedDealId     → which deal is loaded in the War Room
 *  - tradeoffBias       → 0.0 (max margin) → 1.0 (max win rate), slider position
 *  - competitorContext  → optional free-text competitor label
 *
 * Shareable URL example:
 *  /lab/war-room?deal_id=uuid-123&tradeoff=0.65&competitor=Competitor+A
 *
 * Copying this URL and opening it in a new tab renders exactly the same
 * War Room state — including the Pareto chart position and the recommended move.
 */

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface WarRoomParams {
    /** UUID of the selected deal. null = no deal selected yet (setup phase). */
    selectedDealId: string | null;
    /**
     * Tradeoff bias: 0.0 = pure margin preservation, 1.0 = pure win-rate maximisation.
     * Maps to the epsilon parameter in the Nash equilibrium calculation.
     * Default 0.5 = balanced.
     */
    tradeoffBias: number;
    /** Free-text competitor label for context injection. null = unset. */
    competitorContext: string | null;
}

export const WAR_ROOM_DEFAULTS: WarRoomParams = {
    selectedDealId: null,
    tradeoffBias: 0.5,
    competitorContext: null,
};

// ─── Primary hook ─────────────────────────────────────────────────────────────
export function useWarRoomSearchParams(): [
    WarRoomParams,
    (patch: Partial<WarRoomParams>) => void,
    () => void,
] {
    const [searchParams, setSearchParams] = useSearchParams();

    // ── Deserialise ────────────────────────────────────────────────────────────
    const rawTradeoff = searchParams.get("tradeoff");
    const parsedTradeoff =
        rawTradeoff !== null ? parseFloat(rawTradeoff) : WAR_ROOM_DEFAULTS.tradeoffBias;

    const params: WarRoomParams = {
        selectedDealId: searchParams.get("deal_id") ?? null,
        tradeoffBias: isNaN(parsedTradeoff)
            ? WAR_ROOM_DEFAULTS.tradeoffBias
            : Math.min(1, Math.max(0, parsedTradeoff)),
        competitorContext: searchParams.get("competitor") ?? null,
    };

    // ── Serialise & merge ──────────────────────────────────────────────────────
    const setParams = useCallback(
        (patch: Partial<WarRoomParams>) => {
            setSearchParams(
                (prev) => {
                    const next = new URLSearchParams(prev);

                    if ("selectedDealId" in patch) {
                        patch.selectedDealId
                            ? next.set("deal_id", patch.selectedDealId)
                            : next.delete("deal_id");
                    }
                    if ("tradeoffBias" in patch) {
                        const v = patch.tradeoffBias ?? WAR_ROOM_DEFAULTS.tradeoffBias;
                        v === WAR_ROOM_DEFAULTS.tradeoffBias
                            ? next.delete("tradeoff")
                            : next.set("tradeoff", v.toFixed(2));
                    }
                    if ("competitorContext" in patch) {
                        patch.competitorContext
                            ? next.set("competitor", patch.competitorContext)
                            : next.delete("competitor");
                    }

                    return next;
                },
                { replace: false }
            );
        },
        [setSearchParams]
    );

    const resetParams = useCallback(() => {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                ["deal_id", "tradeoff", "competitor"].forEach((k) => next.delete(k));
                return next;
            },
            { replace: true }
        );
    }, [setSearchParams]);

    return [params, setParams, resetParams];
}