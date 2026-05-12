// Mock AI responses for the AI Copilot

export const mockAIResponses = [
  {
    id: 1,
    query: "Which segment is at the highest margin risk this quarter?",
    response: `Based on the latest forecast data, the **SMB segment** presents the highest margin risk at -12.5% YoY compression. This is driven by:

• **Increased competition** in the $20-50K deal range
• **Lower ACV** reducing negotiation power
• **Platform consolidation** by competitors

**Recommendation**: Implement tiered pricing for SMB with value-adds:
- Advanced analytics dashboard
- Dedicated Slack support
- Monthly strategy sessions

This could recover ~7% margin while maintaining volume. The Enterprise segment, by contrast, maintains healthy 34% gross margins due to stronger retention and upsell velocity.`
  },
  {
    id: 2,
    query: "What's driving the 52% growth in the Unicorn CFO persona?",
    response: `Excellent question. The Unicorn CFO cohort is experiencing explosive growth due to three converging factors:

**1. Market Timing** (60% of growth)
   - Venture funding surge in Q2-Q3 created 2.8K new addressable accounts
   - These companies need rapid forecasting & data infrastructure

**2. Product-Market Fit** (25% of growth)
   - Our ML models optimized for high-volatility revenue patterns
   - Unicorns' revenue can swing 40-60% quarter-to-quarter
   - We're the only platform handling this complexity well

**3. Sales Motion** (15% of growth)
   - Successfully targeting Series C/D financing windows
   - CFOs are evaluating tooling simultaneously

**Risk**: This cohort has higher churn potential (12%) if funding slows. Recommend building recession-resistant features like cash runway modeling and burn-rate optimization to deepen stickiness.`
  },
  {
    id: 3,
    query: "Analyze the forecast accuracy by segment for next quarter.",
    response: `Here's the forecast accuracy breakdown with confidence intervals:

**Enterprise (R² = 0.94)** ✅ High Confidence
- Stable revenue patterns, long contract terms
- Confidence band: ±8% accuracy expected
- Key driver: annual renewal cycles

**Mid-Market (R² = 0.87)** ✅ Medium-High Confidence
- More volatility from expansion deals
- Confidence band: ±15% accuracy expected
- Risk: Sales team quota pressure affects timing

**SMB (R² = 0.72)** ⚠️ Medium Confidence
- High churn and usage-based revenue
- Confidence band: ±22% accuracy expected
- Key blocker: Unpredictable cancellation patterns

**Growth/Strategic (R² = 0.58)** ⚠️ Caution
- Very small cohort with outsized variance
- Confidence band: ±38% accuracy expected
- Recommendation: Monitor weekly, not quarterly

For board presentations, I'd highlight Enterprise segment confidence and note that SMB/Growth forecasts are directional only.`
  },
];

export const mockStreamingResponse = `Based on real-time data, here's what's happening in your business:

**Revenue Momentum** 📈
Your Enterprise segment is up 18.5% MoM, driven by 3 new Fortune 500 logos and 2 significant expansions. This is excellent trajectory tracking.

**Segment Health**
- Enterprise: 94% net retention (healthy)
- Mid-Market: 84% net retention (watch this)
- SMB: 71% net retention (needs intervention)

**Recommendation Priority**
I'd focus on the Mid-Market segment immediately. With 14% YoY churn acceleration, we have a 60-day window to implement retention fixes before it compounds into Q4.

**Next Steps**
1. Run cohort analysis on Mid-Market churned accounts
2. Identify common characteristics
3. Build targeted win-back campaign

This could recover $180K in ARR within 90 days. Ready to dive deeper into any segment?`;
