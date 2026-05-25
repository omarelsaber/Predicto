import type { TreatmentType, FeatureAvailability } from "../enums";

export type CausalEngineMode = "FULL_DML" | "RIDGE_DML" | "OLS_BASELINE";
export type HeterogeneitySegment = "HIGH_RESPONDERS" | "LOW_RESPONDERS" | "NEGATIVE_RESPONDERS" | "UNCERTAIN";
export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

export interface CATEEstimate {
    customer_id: string;
    customer_name: string;
    segment: string;
    treatment_type: TreatmentType;
    treatment_received: boolean;
    cate: number;
    cate_lower_ci: number;
    cate_upper_ci: number;
    arr: number;
    counterfactual_arr_delta: number;
    propensity_score: number;
    effect_heterogeneity: HeterogeneitySegment;
}

export interface HistoricalAuditRecord {
    customer_id: string;
    customer_name: string;
    treatment_type: TreatmentType;
    treatment_date: string | null;
    actual_outcome_churn_delta: number;
    counterfactual_outcome_churn_delta: number;
    foregone_arr: number;
    what_if_recommendation: string;
    confidence: ConfidenceLevel;
}

export interface HeterogeneityMapEntry {
    cluster_label: HeterogeneitySegment;
    n_customers: number;
    mean_cate: number;
    mean_arr: number;
    total_arr: number;
    recommended_treatment: TreatmentType | null;
    segments_represented: string[];
    strategic_note: string;
}

export interface DMLNuisanceMetrics {
    outcome_model_r2: number;
    treatment_model_auroc: number;
    n_cross_fit_folds: number;
    n_confounders: number;
    regularisation_alpha: number;
}

export interface CounterfactualResponse {
    cate_estimates: CATEEstimate[];
    historical_audit: HistoricalAuditRecord[];
    heterogeneity_map: HeterogeneityMapEntry[];
    nuisance_metrics: DMLNuisanceMetrics;
    engine_mode: CausalEngineMode;
    treatment_analyzed: TreatmentType;
    n_treated_customers: number;
    n_control_customers: number;
    average_treatment_effect: number;
    total_foregone_arr: number;
    total_counterfactual_arr_gain: number;
    summary_narrative: string;
    data_availability: FeatureAvailability;
    overall_confidence: ConfidenceLevel;
    warnings: string[];
}
