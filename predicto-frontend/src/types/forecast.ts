export interface ForecastSegment {
  segment: string;
  periods: Array<{
    period: string;
    forecast: number;
    lower_bound: number;
    upper_bound: number;
    trend: string;
  }>;
  r_squared: number;
}

export interface ForecastResponse {
  segments: ForecastSegment[];
  periods_ahead: number;
}
