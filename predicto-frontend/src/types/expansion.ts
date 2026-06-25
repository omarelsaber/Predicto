import type { CustomerIdentity, ResponseMetadata } from "@/types/shared";

export type ExpansionCluster = "Champion" | "Growth" | "Stable" | "At-Risk";

export type ExpansionCandidateRecord = CustomerIdentity & {
  predicted_expansion_arr: number;
  cluster: ExpansionCluster;
  expansion_score: number;
  top_signal: string;
  recommended_action: string;
};

export type ExpansionCandidatesResponse = ResponseMetadata & {
  candidates: ExpansionCandidateRecord[];
  total_candidates: number;
  total_expansion_opportunity: number;
  cluster_distribution: Record<string, number>;
  attribution_data_available: boolean;
  scorer_mode: string;
};
