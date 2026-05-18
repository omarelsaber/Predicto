// TODO: Code will be pasted manually
/**
 * src/types/churn.ts
 *
 * REFINEMENT #3 demonstration: ChurnCustomerRecord is composed
 * from shared base interfaces rather than duplicating fields.
 *
 * Before (duplication):
 *   interface ChurnCustomerRecord {
 *     customer_id: string;      ← copied from 6 other interfaces
 *     customer_name: string;    ← copied
 *     arr: number;              ← copied
 *     segment: string;          ← copied
 *     churn_probability: number;
 *     ... churn-specific fields
 *   }
 *
 * After (composition):
 *   type ChurnCustomerRecord = CustomerIdentity & ArrRiskFields & {
 *     ... only churn-specific fields here
 *   }
 *
 * If CustomerIdentity.segment is renamed → compiler error here immediately.
 */

import type {
    CustomerIdentity,
    ArrRiskFields,
    SnapshotFields,
    ResponseMetadata,
    FeatureAvailability,
} from "@/types/shared";

export type ChurnAlertLevel = "CRITICAL" | "WARNING" | "MONITOR";
export type ChurnScorerMode = "ml" | "heuristic";

// Compose: identity + risk baseline + optional snapshot fields + churn-specific
export type ChurnCustomerRecord = CustomerIdentity &
    ArrRiskFields &
    Partial<SnapshotFields> & {
        alert_level: ChurnAlertLevel;
        top_risk_signal: string;
        recommended_action: string;
        months_since_last_expansion: number | null;
    };

export type CompetitiveChurnResponse = ResponseMetadata & {
    customers: ChurnCustomerRecord[];
    total_customers: number;
    critical_count: number;
    warning_count: number;
    total_arr_at_risk: number;
    scorer_mode: ChurnScorerMode;
    active_model: string | null;
    missing_features: string[];
};