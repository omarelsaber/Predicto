// TODO: Code will be pasted manually
/**
 * src/store/useDataStore.ts
 *
 * PRIMARY GLOBAL STORE — Zustand
 *
 * Manages only state that is genuinely cross-route and non-URL-serialisable:
 *  1. System health & ingest metadata (from POST /api/v2/ingest response)
 *  2. Ingestion log stream (REFINEMENT #2 — hydrated directly from mutation onSuccess)
 *  3. AI Analyst chat history (session-persistent, survives route navigation)
 *  4. User role (Executive | SalesRep | RevOpsAnalyst)
 *
 * REFINEMENT #2 — INGESTION LOG HYDRATION:
 * The POST /api/v2/ingest response includes a full DegradationEvent[] log.
 * Instead of re-fetching this from a separate endpoint, useIngestZIPMutation
 * calls `useDataStore.getState().hydrateFromIngestResponse(response)` in its
 * onSuccess callback. This atomically pushes the logs into the store so that
 * IngestionStatusFeed and DegradationLogTable render immediately — zero
 * additional network request.
 *
 * STORES ELIMINATED (REFINEMENT #1):
 * - useSimulatorStore.ts  → replaced by useSimulatorSearchParams.ts
 * - useWarRoomStore.ts    → replaced by useWarRoomSearchParams.ts
 *
 * STORE RETAINED (REFINEMENT #1 COMPATIBLE):
 * - useTopologyStore.ts — MILP budget inputs are NOT URL-synced by design.
 *   Topology optimizer inputs are transient computation parameters with no
 *   sharing value (a shared URL can't meaningfully encode an optimizer run).
 *   They survive Lab sub-route navigation via Zustand.
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { ChatMessage } from "@/types/analyst";
import type {
    V2IngestResponse,
    DegradationEvent,
    AIModuleStatus,
} from "@/types/health";

// ─── Enums ────────────────────────────────────────────────────────────────────
export type UserRole = "Executive" | "SalesRep" | "RevOpsAnalyst";

export type IngestionPhase =
    | "idle"          // No ingest in progress, no data loaded
    | "uploading"     // File is being transmitted
    | "processing"    // Backend is parsing + training models
    | "complete"      // Ingest finished successfully
    | "error";        // Ingest failed

// ─── Log entry type for the IngestionStatusFeed ───────────────────────────────
// This is a FRONTEND-ONLY type — it wraps DegradationEvent with UI metadata.
export interface IngestionLogEntry {
    id: string;                         // Unique key for React lists
    timestamp: string;                  // ISO-8601 when this entry was created
    severity: "success" | "warning" | "error" | "info";
    message: string;                    // Human-readable log line
    table?: string;                     // Source CSV table name, if applicable
    column?: string;                    // Source column name, if applicable
    rowsAffected?: number;              // How many rows were touched
    resolution?: string;                // What imputation was applied
}

// ─── Store shape ──────────────────────────────────────────────────────────────
export interface DataStoreState {
    // ── Health snapshot ────────────────────────────────────────────────────────
    healthScore: number;                // 0–100
    isReady: boolean;                   // /health: is_ready
    tablesLoaded: string[];             // Table names currently in cache
    tablesMissing: string[];            // Expected tables absent from last ingest
    activeModel: string | null;         // "full" | "lite" | null
    aiModules: Record<string, AIModuleStatus>;

    // ── Ingestion lifecycle ────────────────────────────────────────────────────
    ingestionPhase: IngestionPhase;
    lastIngestError: string | null;     // Error message from failed ingest
    degradationEventCount: number;      // Total events in last ingest
    lastIngestFileHash: string | null;  // SHA-256 of last uploaded file

    // ── REFINEMENT #2: Ingestion log stream (hydrated from mutation response) ──
    ingestionLog: IngestionLogEntry[];  // Ordered entries for IngestionStatusFeed

    // ── AI Analyst session ─────────────────────────────────────────────────────
    aiChatHistory: ChatMessage[];       // Full conversation history (session-only)
    aiContextTokenCount: number;        // Last known context token count from backend
    aiAnalystStatus: "idle" | "loading" | "streaming" | "error";
    activeRouteContext: string;         // Route name injected as separator in chat

    // ── User ───────────────────────────────────────────────────────────────────
    userRole: UserRole;
}

// ─── Actions shape ────────────────────────────────────────────────────────────
export interface DataStoreActions {
    // ── Ingestion lifecycle actions ────────────────────────────────────────────
    setIngestionPhase: (phase: IngestionPhase) => void;

    /**
     * REFINEMENT #2 — Primary hydration action.
     * Called by useIngestZIPMutation's onSuccess handler with the raw V2IngestResponse.
     * Atomically updates all health state AND builds the IngestionLogEntry[] feed
     * from the response's degradation_log, tables_loaded, and tables_missing arrays.
     * No follow-up GET request required.
     */
    hydrateFromIngestResponse: (response: V2IngestResponse) => void;

    /**
     * Called by useHealthQuery's onSuccess to keep health state fresh
     * during background polling (every 60s).
     */
    syncHealthSnapshot: (
        healthScore: number,
        isReady: boolean,
        tablesLoaded: string[],
        tablesMissing: string[],
        activeModel: string | null,
        aiModules: Record<string, AIModuleStatus>
    ) => void;

    setIngestionError: (errorMessage: string) => void;
    clearIngestionLog: () => void;

    // ── AI Analyst actions ─────────────────────────────────────────────────────
    appendUserMessage: (content: string) => void;
    appendAssistantMessage: (content: string, tokenCount?: number) => void;
    setAiAnalystStatus: (status: DataStoreState["aiAnalystStatus"]) => void;
    setActiveRouteContext: (routeName: string) => void;
    clearChatHistory: () => void;

    // ── User role ──────────────────────────────────────────────────────────────
    setUserRole: (role: UserRole) => void;
}

// ─── Log builder helpers ──────────────────────────────────────────────────────
let _logIdCounter = 0;

function makeLogId(): string {
    return `log-${Date.now()}-${++_logIdCounter}`;
}

function degradationToLogEntry(event: DegradationEvent): IngestionLogEntry {
    return {
        id: makeLogId(),
        timestamp: new Date().toISOString(),
        severity: event.is_fatal ? "error" : "warning",
        message: `${event.column ?? "unknown column"}: ${event.issue_type} — ${event.resolution ?? "no resolution"}`,
        table: event.table,
        column: event.column,
        rowsAffected: event.rows_affected,
        resolution: event.resolution,
    };
}

function tableLoadedEntry(table: string): IngestionLogEntry {
    return {
        id: makeLogId(),
        timestamp: new Date().toISOString(),
        severity: "success",
        message: `${table} parsed successfully`,
        table,
    };
}

function tableMissingEntry(table: string): IngestionLogEntry {
    return {
        id: makeLogId(),
        timestamp: new Date().toISOString(),
        severity: "error",
        message: `${table} not found in ZIP — models will degrade for this module`,
        table,
    };
}

function modelReadyEntry(activeModel: string | null): IngestionLogEntry {
    return {
        id: makeLogId(),
        timestamp: new Date().toISOString(),
        severity: "success",
        message: activeModel
            ? `Models re-trained: ${activeModel === "full" ? "GRU+XGBoost (full mode)" : "XGBoost cold-start (lite mode)"}`
            : "Models status unknown",
    };
}

function healthScoreEntry(score: number): IngestionLogEntry {
    return {
        id: makeLogId(),
        timestamp: new Date().toISOString(),
        severity: score >= 80 ? "success" : score >= 50 ? "warning" : "error",
        message: `Health Score: ${score}/100`,
    };
}

// ─── Store implementation ─────────────────────────────────────────────────────
export const useDataStore = create<DataStoreState & DataStoreActions>()(
    subscribeWithSelector((set, _get) => ({
        // ── Initial state ─────────────────────────────────────────────────────────
        healthScore: 0,
        isReady: false,
        tablesLoaded: [],
        tablesMissing: [],
        activeModel: null,
        aiModules: {},
        ingestionPhase: "idle",
        lastIngestError: null,
        degradationEventCount: 0,
        lastIngestFileHash: null,
        ingestionLog: [],
        aiChatHistory: [],
        aiContextTokenCount: 0,
        aiAnalystStatus: "idle",
        activeRouteContext: "IntelligenceHub",
        userRole: "RevOpsAnalyst",

        // ── Ingestion actions ─────────────────────────────────────────────────────
        setIngestionPhase: (phase) => set({ ingestionPhase: phase }),

        // REFINEMENT #2 — Atomic hydration from the ingest response body.
        // Builds the complete IngestionLogEntry[] feed in one synchronous pass
        // so the IngestionStatusFeed renders the full log without any additional
        // network request. Order of entries mirrors the real-time processing order:
        // 1. Per-table success entries
        // 2. Per-table missing entries
        // 3. Per-degradation-event warning/error entries (from degradation_log)
        // 4. Model ready entry
        // 5. Health score summary entry
        hydrateFromIngestResponse: (response) => {
            const logEntries: IngestionLogEntry[] = [];

            // Step 1: Loaded tables
            for (const table of response.tables_loaded) {
                logEntries.push(tableLoadedEntry(table));
            }

            // Step 2: Missing tables
            for (const table of response.tables_missing) {
                logEntries.push(tableMissingEntry(table));
            }

            // Step 3: Degradation events (schema repair actions)
            if (response.degradation_log && response.degradation_log.length > 0) {
                for (const event of response.degradation_log) {
                    logEntries.push(degradationToLogEntry(event));
                }
            }

            // Step 4: Model status
            logEntries.push(modelReadyEntry(response.active_model));

            // Step 5: Health score
            logEntries.push(healthScoreEntry(response.health_score));

            set({
                healthScore: response.health_score,
                isReady: response.is_ready,
                tablesLoaded: response.tables_loaded,
                tablesMissing: response.tables_missing,
                activeModel: response.active_model,
                aiModules: response.ai_modules ?? {},
                ingestionPhase: "complete",
                lastIngestError: null,
                degradationEventCount: response.degradation_log?.length ?? 0,
                lastIngestFileHash: null, // V2IngestResponse does not expose file_hash
                ingestionLog: logEntries,
            });
        },

        syncHealthSnapshot: (
            healthScore,
            isReady,
            tablesLoaded,
            tablesMissing,
            activeModel,
            aiModules
        ) =>
            set({
                healthScore,
                isReady,
                tablesLoaded,
                tablesMissing,
                activeModel,
                aiModules,
            }),

        setIngestionError: (errorMessage) =>
            set({
                ingestionPhase: "error",
                lastIngestError: errorMessage,
                ingestionLog: (prev) =>
                    // Append error entry to the existing log rather than replacing it,
                    // so the user sees which tables loaded successfully before the failure.
                    [
                        ...(prev as unknown as IngestionLogEntry[]),
                        {
                            id: makeLogId(),
                            timestamp: new Date().toISOString(),
                            severity: "error" as const,
                            message: `Ingestion failed: ${errorMessage}`,
                        },
                    ],
            } as Partial<DataStoreState>),

        clearIngestionLog: () =>
            set({
                ingestionLog: [],
                ingestionPhase: "idle",
                lastIngestError: null,
            }),

        // ── AI Analyst actions ─────────────────────────────────────────────────────
        appendUserMessage: (content) =>
            set((state) => ({
                aiChatHistory: [
                    ...state.aiChatHistory,
                    { role: "user" as const, content },
                ],
            })),

        appendAssistantMessage: (content, tokenCount) =>
            set((state) => ({
                aiChatHistory: [
                    ...state.aiChatHistory,
                    { role: "assistant" as const, content },
                ],
                aiContextTokenCount: tokenCount ?? state.aiContextTokenCount,
                aiAnalystStatus: "idle" as const,
            })),

        setAiAnalystStatus: (status) => set({ aiAnalystStatus: status }),

        // Inserts a navigation separator into the chat thread when the user changes
        // routes, giving the LLM a breadcrumb about context change.
        setActiveRouteContext: (routeName) =>
            set((state) => {
                if (state.activeRouteContext === routeName) return {};
                const separator: ChatMessage = {
                    role: "assistant",
                    content: `[Context changed to: ${routeName}]`,
                };
                return {
                    activeRouteContext: routeName,
                    aiChatHistory:
                        state.aiChatHistory.length > 0
                            ? [...state.aiChatHistory, separator]
                            : state.aiChatHistory,
                };
            }),

        clearChatHistory: () =>
            set({
                aiChatHistory: [],
                aiContextTokenCount: 0,
                aiAnalystStatus: "idle",
            }),

        setUserRole: (role) => set({ userRole: role }),
    }))
);

// ─── Derived selectors (memoised outside the component render path) ───────────
// Import these in components instead of inline selectors to prevent
// unnecessary re-renders from shallow-equality failures.

export const selectHealthScore = (s: DataStoreState) => s.healthScore;
export const selectIsReady = (s: DataStoreState) => s.isReady;
export const selectTablesLoaded = (s: DataStoreState) => s.tablesLoaded;
export const selectActiveModel = (s: DataStoreState) => s.activeModel;
export const selectIngestionPhase = (s: DataStoreState) => s.ingestionPhase;
export const selectIngestionLog = (s: DataStoreState) => s.ingestionLog;
export const selectDegradationEventCount = (s: DataStoreState) =>
    s.degradationEventCount;
export const selectAiChatHistory = (s: DataStoreState) => s.aiChatHistory;
export const selectAiAnalystStatus = (s: DataStoreState) =>
    s.aiAnalystStatus;
export const selectUserRole = (s: DataStoreState) => s.userRole;