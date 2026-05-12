// Mock analytics data for the Analytics Hub

export const mockForecastData = [
  { month: 'Jan', enterprise: 85000, midmarket: 62000, smb: 28000, growth: 15000, strategic: 10000 },
  { month: 'Feb', enterprise: 92000, midmarket: 68000, smb: 31000, growth: 18000, strategic: 12000 },
  { month: 'Mar', enterprise: 98000, midmarket: 72000, smb: 35000, growth: 22000, strategic: 14000 },
  { month: 'Apr', enterprise: 105000, midmarket: 78000, smb: 38000, growth: 25000, strategic: 16000 },
  { month: 'May', enterprise: 112000, midmarket: 85000, smb: 42000, growth: 29000, strategic: 18000 },
  { month: 'Jun', enterprise: 118000, midmarket: 91000, smb: 45000, growth: 32000, strategic: 21000 },
  { month: 'Jul', enterprise: 125000, midmarket: 98000, smb: 49000, growth: 36000, strategic: 24000 },
  { month: 'Aug', enterprise: 132000, midmarket: 105000, smb: 52000, growth: 40000, strategic: 27000 },
  { month: 'Sep', enterprise: 138000, midmarket: 111000, smb: 56000, growth: 44000, strategic: 30000 },
  { month: 'Oct', enterprise: 145000, midmarket: 118000, smb: 60000, growth: 48000, strategic: 33000 },
  { month: 'Nov', enterprise: 152000, midmarket: 125000, smb: 64000, growth: 52000, strategic: 36000 },
  { month: 'Dec', enterprise: 158000, midmarket: 131000, smb: 68000, growth: 56000, strategic: 39000 },
];

export const mockSegmentData = [
  { name: 'Enterprise', value: 40, color: '#6366f1' },
  { name: 'Mid-Market', value: 35, color: '#a855f7' },
  { name: 'SMB', value: 20, color: '#ec4899' },
  { name: 'Growth', value: 3, color: '#f59e0b' },
  { name: 'Strategic', value: 2, color: '#06b6d4' },
];

export const mockPersonaData = [
  {
    name: 'Fortune 500 VP',
    lifetime_value: 850,
    growth_rate: 35,
    churn_risk: 8,
    deal_size: 150,
    contract_length: 24,
    color: '#6366f1',
  },
  {
    name: 'Unicorn CFO',
    lifetime_value: 720,
    growth_rate: 52,
    churn_risk: 12,
    deal_size: 120,
    contract_length: 18,
    color: '#a855f7',
  },
  {
    name: 'Regional CEO',
    lifetime_value: 450,
    growth_rate: 28,
    churn_risk: 15,
    deal_size: 75,
    contract_length: 12,
    color: '#ec4899',
  },
];

export const mockRadarData = [
  { metric: 'Lifetime Value', 'Fortune 500 VP': 85, 'Unicorn CFO': 72, 'Regional CEO': 45 },
  { metric: 'Growth Rate', 'Fortune 500 VP': 35, 'Unicorn CFO': 52, 'Regional CEO': 28 },
  { metric: 'Churn Risk', 'Fortune 500 VP': 8, 'Unicorn CFO': 12, 'Regional CEO': 15 },
  { metric: 'Deal Size', 'Fortune 500 VP': 75, 'Unicorn CFO': 60, 'Regional CEO': 37 },
  { metric: 'Contract Length', 'Fortune 500 VP': 80, 'Unicorn CFO': 60, 'Regional CEO': 40 },
];

export const mockAnalyticsMetrics = {
  totalRevenue: '$1.2M',
  revenueGrowth: '+28%',
  avgDealSize: '$95K',
  conversionRate: '18.5%',
  accountHealth: '92%',
  churnRate: '-2.3%',
};
