// TODO: Code will be pasted manually
/**
 * src/hooks/useIngestMutations.ts
 *
 * REFINEMENT #2 — Ingestion Pipeline Hot-Wiring
 *
 * PATTERN: onSuccess → hydrateFromIngestResponse
 * When the ZIP upload succeeds, the mutation's onSuccess handler:
 *  1. Calls useDataStore.hydrateFromIngestResponse(response) to atomically
 *     push all DegradationEvent logs, table status, model mode, and health
 *     score into the global store — zero additional GET request.
 *  2. Calls queryClient.invalidateQueries() to trigger background refetches
 *     across all cached ML metric queries (the atomic refresh cascade).
 *
 * This means IngestionStatusFeed and DegradationLogTable are reactive to the
 * store, not to a separate polling endpoint. They render the full log within
 * the same React paint cycle as the mutation completing.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDataStore } from "@/store/useDataStore";
import { ingestZip } from "@/api/v2/ingestZipApi";
import { ingestCsv } from "@/api/v1/ingestV1Api";
import { QUERY_KEYS } from "@/lib/queryKeys";
import type { V2IngestResponse } from "@/types/health";
import type { V1IngestResponse } from "@/types/health";

// ─── ZIP Ingest Mutation ──────────────────────────────────────────────────────
/**
 * useIngestZIPMutation
 *
 * Uploads a ZIP file to POST /api/v2/data/ingest.
 * On success: hydrates the global store AND invalidates all ML query caches
 * so every active view receives fresh data in the background.
 *
 * The queryClient.invalidateQueries cascade is intentionally broad:
 * ALL_METRICS is the root key family — invalidating it triggers background
 * refetches for every stable query (forecast, personas, churn, expansion, etc.)
 * simultaneously, matching the Blueprint's "atomic background UI refresh".
 */
export function useIngestZIPMutation() {
    const queryClient = useQueryClient();
    const hydrateFromIngestResponse = useDataStore(
        (s) => s.hydrateFromIngestResponse
    );
    const setIngestionPhase = useDataStore((s) => s.setIngestionPhase);
    const setIngestionError = useDataStore((s) => s.setIngestionError);

    return useMutation<V2IngestResponse, Error, File>({
        mutationFn: (file: File) => {
            setIngestionPhase("uploading");
            return ingestZip(file);
        },

        onMutate: () => {
            setIngestionPhase("uploading");
        },

        onSuccess: (response: V2IngestResponse) => {
            // ── REFINEMENT #2: Atomic store hydration ──────────────────────────────
            // Builds the full IngestionLogEntry[] from the response fields and pushes
            // all health state in a single synchronous set() call.
            // IngestionStatusFeed will re-render once with the complete log.
            hydrateFromIngestResponse(response);

            // ── Cascade invalidation: all ML metric caches ─────────────────────────
            // TanStack Query will refetch these in the background. Views that are
            // currently mounted receive updated data without user interaction.
            // The order is deliberate: invalidate all before any individual refetch
            // starts so no query re-renders with partially-stale sibling data.
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ALL_METRICS });
        },

        onError: (error: Error) => {
            setIngestionError(error.message);
        },
    });
}

// ─── CSV Ingest Mutation (V1 legacy) ──────────────────────────────────────────
/**
 * useIngestCSVMutation
 *
 * Uploads a single CSV to POST /api/v1/ingest (legacy V1 path).
 * Applies the same invalidation cascade but uses a lighter store update
 * since the V1 response shape lacks the full degradation_log.
 */
export function useIngestCSVMutation() {
    const queryClient = useQueryClient();
    const setIngestionPhase = useDataStore((s) => s.setIngestionPhase);
    const setIngestionError = useDataStore((s) => s.setIngestionError);
    const syncHealthSnapshot = useDataStore((s) => s.syncHealthSnapshot);

    return useMutation<V1IngestResponse, Error, File>({
        mutationFn: (file: File) => ingestCsv(file),

        onMutate: () => {
            setIngestionPhase("uploading");
        },

        onSuccess: (_response: V1IngestResponse) => {
            // V1 response has no degradation_log — signal complete and refetch health.
            setIngestionPhase("complete");

            // Invalidate health query first to pull the updated health snapshot.
            void queryClient.invalidateQueries({
                queryKey: QUERY_KEYS.HEALTH_V2,
            });

            // Then invalidate all ML metrics.
            void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.ALL_METRICS });
        },

        onError: (error: Error) => {
            setIngestionError(error.message);
        },
    });
}