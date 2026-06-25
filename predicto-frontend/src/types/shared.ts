/**
 * src/types/shared.ts
 *
 * REFINEMENT #3 — Shared base types with Utility Type patterns
 *
 * Rule: Any type that appears in >1 domain file lives here.
 * Components never re-declare these — they Pick or Omit from this module.
 */

// ═════════════════════════════════════════════════════════════════════════════
// Core discriminators — mirror Python Enum classes 1:1
// ═════════════════════════════════════════════════════════════════════════════

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";
export type FeatureAvailability = "ACTIVE" | "PARTIAL" | "OFFLINE";
export type AnalystResponseStatus = "success" | "fallback" | "error";

// ═════════════════════════════════════════════════════════════════════════════
// API Error envelope — normalised by apiClient.ts interceptor
// ═════════════════════════════════════════════════════════════════════════════

export interface ApiError {
    status: number;
    code: string;
    message: string;
    detail?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
// Shared customer identity fields
// Used via Pick<CustomerIdentity, "customer_id" | "customer_name">
// in ChurnCustomerRecord, ExpansionCandidateRecord, ContagionNodeRisk, etc.
// Any rename here propagates everywhere at compile time.
// ═════════════════════════════════════════════════════════════════════════════

export interface CustomerIdentity {
    customer_id: string;
    customer_name: string;
    segment: "Enterprise" | "Mid-Market" | "SMB";
    arr: number;
}

/**
 * Reusable ARR + risk pairing.
 * Used by churn, contagion, cliff detector, and topology optimizer records.
 * Compose: type MyRecord = CustomerIdentity & ArrRiskFields & { ... }
 */
export interface ArrRiskFields {
    arr: number;
    churn_probability: number;           // 0–1
}

/**
 * Standard engagement KPI trio (EDI, SBS, FAV).
 * Reused across ChurnCustomerRecord, CustomerRenewalRecord,
 * and ContagionNodeRisk via intersection.
 */
export interface EngagementKpiFields {
    edi_score: number;                   // Engagement Decay Index
    sbs_score: number;                   // Support Burden Score
    fav_score: number;                   // Feature Adoption Velocity
}

/**
 * Snapshot-sourced optional fields.
 * Many records conditionally expose these — use Partial<SnapshotFields>
 * or explicit optional fields depending on backend nullability.
 */
export interface SnapshotFields {
    nps_at_last_snapshot: number | null;
    feature_adoption_score: number | null;
    months_as_customer: number | null;
    support_ticket_trend: "rising" | "stable" | "falling" | null;
}

// ═════════════════════════════════════════════════════════════════════════════
// Confidence + availability metadata block
// Reused by every V2/V3 response via intersection.
// Example: type MyResponse = { ...fields } & ResponseMetadata
// ═════════════════════════════════════════════════════════════════════════════

export interface ResponseMetadata {
    data_availability: FeatureAvailability;
    overall_confidence: ConfidenceLevel;
    warnings: string[];
}
