export interface PersonaRecord {
  segment: string;
  persona_label: string;
  avg_deal_value: number;
  avg_discount: string;
  avg_margin: string;
  churn_risk: "low" | "medium" | "high";
  top_region: string;
  cluster_size: number;
}

export interface PersonasResponse {
  personas: PersonaRecord[];
  n_clusters: number;
  silhouette_score: number;
}
