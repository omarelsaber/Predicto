export type InterventionType = "REP_CALL" | "CSM_TOUCH" | "MARKETING_CAMPAIGN" | "NO_ACTION";

export interface TopologyOptimizationRequest {
    max_rep_hours?: number;
    max_csm_interventions?: number;
    max_campaign_spend?: number;
    planning_period_days: number;
    churn_weight: number;
    top_n_customers?: number;
}

export interface CustomerIntervention {
    customer_id: string;
    customer: string;
    segment: string;
    arr: number;
    intervention_type: InterventionType;
    rep_hours_allocated: number;
    csm_interventions_allocated: number;
    campaign_spend_allocated: number;
    projected_churn_reduction: number;
    projected_arr_retained: number;
    roi_score: number;
    priority_rank: number;
    action_deadline_days: number;
    rationale: string;
}

export interface BudgetConstraintSummary {
    resource: string;
    budget_total: number;
    budget_used: number;
    budget_slack: number;
    utilisation_pct: number;
}

export interface SegmentAllocationSummary {
    segment: string;
    n_customers: number;
    total_rep_hours: number;
    total_csm_interventions: number;
    total_campaign_spend: number;
    projected_arr_retained: number;
    avg_churn_reduction: number;
}

export interface TopologyOptimizationResponse {
    master_schedule: CustomerIntervention[];
    budget_utilisation: BudgetConstraintSummary[];
    segment_breakdown: SegmentAllocationSummary[];
}
