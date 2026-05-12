# Predicto - Enterprise AI Revenue Intelligence Hub

Predicto delivers an executive-grade revenue intelligence platform designed for C-Suite decision makers. It automates data ingestion, enforces a universal sales schema, produces revenue breakdowns, generates AI-driven forecasts, and surfaces actionable strategic recommendations through an LLM-powered analyst.

## Overview

Predicto empowers finance, sales, and operations leaders to move from spreadsheet-driven forecasting to a modern, AI-first revenue intelligence workflow. The platform converts raw CRM and sales data into a consistent universal schema, evaluates deal health, clusters buyer personas, and generates business insights that executives can act on with confidence.

## Key Features

- **Universal Schema Enforcer**: Standardizes raw and uploaded revenue data into a clean, normalized data model for accurate reporting and model training.
- **ML Forecasting (Fourier + Ridge)**: Applies advanced seasonal signal extraction and ridge regression to produce reliable future revenue projections.
- **Deal Scorer (XGBoost)**: Scores pipeline opportunities with a gradient-boosted model to highlight deal risk, conversion probability, and revenue impact.
- **Persona Gallery (K-Means)**: Clusters customer segments into intuitive buyer personas to support targeted go-to-market strategy and portfolio prioritization.
- **AI Analyst (Llama-3.3 via Groq)**: Generates contextual executive summaries, forecast narratives, and strategy recommendations using state-of-the-art LLM inference.

## Tech Stack

- Frontend: React, Tailwind CSS, Vite
- Backend: FastAPI, Python
- Machine Learning: Scikit-learn, XGBoost, Pandas
- AI / LLM: Llama-3.3 via Groq integration

## Repository Structure

- `predicto/` — Backend service and model engine
- `predicto-frontend/` — React/Tailwind user interface
- `predicto/.env.example` — Sample backend environment configuration
- `predicto/data/` — Data ingestion and sample upload directory

## Setup

### 1. Backend Setup

```bash
cd predicto
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

> Copy environment configuration from `.env.example` to `.env` before starting the backend.

```bash
copy .env.example .env
```

### 2. Frontend Setup

```bash
cd ..\predicto-frontend
npm install
```

## Run

### Start Backend

```bash
cd predicto
.venv\Scripts\activate
uvicorn main:app --reload --port 8001
```

### Start Frontend

```bash
cd predicto-frontend
npm run dev
```

## Notes for Review

- `.gitignore` has been verified and updated to exclude `node_modules/`, `__pycache__/`, `venv/`, `.env`, and uploaded user files such as `predicto/data/uploaded_data.csv`.
- Empty files and generated Python cache artifacts were removed to keep the repository clean and review-ready.

## Contact

For mentor review, this README is designed to highlight the strategic value, architecture, and setup flow for rapid evaluation.
<div align="center">

<img src="https://img.shields.io/badge/PredictoHub-Revenue%20Intelligence-6366f1?style=for-the-badge&labelColor=020617" alt="PredictoHub"/>

# PredictoHub

### AI-Powered Revenue Intelligence Platform

*From raw sales data to executive-grade margin intelligence — in under 60 seconds.*

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python&logoColor=white)](https://www.python.org/)
[![XGBoost](https://img.shields.io/badge/XGBoost-Margin%20Engine-FF6600?style=flat-square)](https://xgboost.readthedocs.io/)
[![Groq](https://img.shields.io/badge/Groq-Llama--3.3-F55036?style=flat-square)](https://groq.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.0+-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

---

[**Live Demo**](https://predictohub.vercel.app) · [**Dashboard**](https://predictohub.vercel.app/dashboard) · [**Report Issue**](https://github.com/omarelsaber/predictohub/issues)

</div>

---

## The Problem

Enterprise sales teams discount 23% deeper than their margin models allow — not from strategy, but from lack of real-time visibility. Revenue forecasts live in spreadsheets. Margin erosion is detected 67 days after it happens. By the time leadership sees it, the leverage is gone.

## The Solution

PredictoHub is a four-pillar AI platform that converts raw CRM/ERP transaction data into actionable revenue intelligence for C-suite decision makers:

| Pillar | Engine | Output | Accuracy |
|--------|--------|--------|----------|
| Revenue Forecasting | Fourier + Ridge Regression | 3-month projections with confidence bands | R² 0.74 |
| Deal Margin Scoring | XGBoost Regressor | Per-deal margin prediction + discount ceiling | R² 0.938 |
| Customer Segmentation | K-Means Clustering | 4 behavioral personas + ROI opportunity | Silhouette 0.353 |
| AI Analyst | Llama-3.3 via Groq | Executive summaries + strategic recommendations | Streaming |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend (Vite)                    │
│         Revenue Overview · Deal Scorer · Persona Gallery     │
│              Data Explorer · AI Analyst Panel                │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST API (CORS enabled)
┌──────────────────────────▼──────────────────────────────────┐
│                    FastAPI Backend (:8001)                    │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Ingestion   │  │  ML Engine   │  │   Synthesis        │  │
│  │ Service     │  │              │  │   Service          │  │
│  │             │  │ forecasting  │  │                    │  │
│  │ CSV → clean │  │ margin_engine│  │ Context assembly   │  │
│  │ DataFrame   │  │ segmentation │  │ → Groq streaming   │  │
│  └──────┬──────┘  └──────┬───────┘  └────────────────────┘  │
│         └────────────────▼                                   │
│                  predicto_cache (in-memory)                  │
│              raw_df · monthly_df · trained models            │
└─────────────────────────────────────────────────────────────┘
```

**Data flow:** CSV upload → schema validation → feature engineering (`Margin_Rate`, `high_discount_flag`) → model training → cache hydration → all API responses served from cache (zero training on request).

---

## Repository Structure

```
predicto/                          # Backend service
├── main.py                        # FastAPI app factory + lifespan startup
├── requirements.txt
├── .env.example                   # Environment template
├── data/
│   └── SaaS-Sales.csv             # Sample dataset (9,994 transactions)
└── app/
    ├── api/v1/                    # HTTP routers (no business logic)
    │   ├── ingestion.py           # POST /data/ingest
    │   ├── forecast.py            # GET /forecast/global, /segment
    │   ├── deals.py               # POST /deals/score, GET /deals/ceiling-matrix
    │   ├── personas.py            # GET /personas/summary
    │   ├── whatif.py              # POST /whatif/simulate
    │   └── synthesis.py          # POST /synthesis/executive (SSE stream)
    ├── services/                  # Orchestration layer
    │   ├── ingestion_service.py   # CSV validation, cleaning, feature engineering
    │   ├── forecast_service.py    # Prophet-equivalent hierarchical forecast
    │   ├── deal_service.py        # XGBoost margin scoring
    │   ├── persona_service.py     # K-Means segmentation + ROI opportunity
    │   └── synthesis_service.py  # Context assembly + Groq streaming
    ├── ml/                        # Pure ML modules (zero FastAPI imports)
    │   ├── forecasting.py         # Fourier + Ridge regression (Prophet-equivalent)
    │   ├── margin_engine.py       # XGBoost / GBR fallback, ceiling matrix
    │   ├── segmentation.py        # K-Means, persona assignment, silhouette
    │   └── context_builder.py     # Pillar outputs → 600-token context packet
    ├── models/                    # Pydantic request/response schemas
    └── core/
        ├── config.py              # Pydantic-settings singleton
        ├── cache.py               # In-memory singleton (DataFrames + models)
        └── lifespan.py            # Startup: load CSV → train all models → warm cache

predicto-frontend/                 # React + Vite frontend
├── src/
│   ├── App.jsx                    # Root + view routing (state-based)
│   ├── components/
│   │   ├── LandingPage.jsx        # Public marketing page (pre-login)
│   │   ├── Sidebar.jsx            # Glassmorphic navigation
│   │   ├── RevenueOverview.jsx    # KPI bar + forecast chart + AI panel
│   │   ├── DealScorer.jsx         # Margin Cliff hero feature
│   │   ├── PersonaGallery.jsx     # K-Means personas + ROI banner
│   │   ├── DataExplorer.jsx       # Transaction table + search
│   │   └── UploadData.jsx         # CSV upload + training pipeline
│   └── services/
│       └── api.js                 # Axios client (VITE_API_BASE_URL)
└── index.html
```

---

## ML Implementation Notes

### Forecasting (Fourier + Ridge)
Prophet is not available in network-isolated environments due to Stan/PyStan dependency. PredictoHub implements a mathematically equivalent decomposition:

```
ŷ(t) = trend(t) + seasonality(t)

trend(t)        = Ridge([t, t²])           — quadratic growth capture
seasonality(t)  = Σ [sin(2πkt/12), cos(2πkt/12)]  — K=3 Fourier harmonics
uncertainty     = ±1.96 × σ_residual       — analytic confidence intervals
```

Walk-forward R² validation on held-out last 6 months per segment.

### Margin Engine (XGBoost / GBR fallback)
```
Features: Quantity, Discount, discount×quantity, revenue_per_unit,
          high_discount_flag, Segment, Industry, Region, Product (label-encoded)
Target:   Margin_Rate = (Profit / Sales).clip(-1, 1)
Holdout:  R² 0.938 · MAE 0.060 · 80/20 split
```
Dominant feature: `Discount` (importance ≈ 0.82) — margin collapses sharply at Discount > 30%.

Discount ceiling matrix precomputed at startup for every Segment × Region combination: max discount where predicted Margin_Rate > 5%.

### Segmentation (K-Means)
Customer-level rollup → StandardScaler → KMeans(k=4). Four personas identified: **Champions** (22.2% margin, LOW risk), **Volume Accounts** (15.1% margin, MEDIUM risk), **At-Risk** (15.4% margin, MEDIUM risk), **Discount Seekers** (8.2% margin, HIGH risk). ROI opportunity: **$62,951** annual margin recovery from Discount Seeker renegotiation.

---

## Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- Groq API key ([get one free](https://console.groq.com))

### 1. Clone

```bash
git clone https://github.com/omarelsaber/predictohub.git
cd predictohub
```

### 2. Backend Setup

```bash
cd predicto

# Create and activate virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env       # macOS/Linux
copy .env.example .env     # Windows
```

Edit `.env` and add your Groq API key:
```env
GROQ_API_KEY=your_key_here
DATA_PATH=data/SaaS-Sales.csv
ENV=development
```

### 3. Frontend Setup

```bash
cd predicto-frontend
npm install
```

Create `predicto-frontend/.env.local`:
```env
VITE_API_BASE_URL=http://localhost:8001
```

### 4. Run

Open two terminals:

**Terminal 1 — Backend:**
```bash
cd predicto
source .venv/bin/activate   # or .venv\Scripts\activate on Windows
uvicorn main:app --reload --port 8001
```

**Terminal 2 — Frontend:**
```bash
cd predicto-frontend
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

> **First load:** The backend trains all four ML models on startup (~10–15 seconds). Subsequent requests are served from cache with sub-millisecond latency.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/data/ingest` | Upload CSV, trigger full pipeline retraining |
| `GET` | `/api/v1/forecast/global` | 3-month global revenue forecast |
| `GET` | `/api/v1/forecast/segment` | Per-segment hierarchical forecast |
| `POST` | `/api/v1/deals/score` | Score hypothetical deals for margin risk |
| `GET` | `/api/v1/deals/ceiling-matrix` | Safe discount ceiling per Segment × Region |
| `GET` | `/api/v1/personas/summary` | 4 personas with stats and ROI opportunity |
| `POST` | `/api/v1/whatif/simulate` | Projected MRR delta for discount scenarios |
| `POST` | `/api/v1/synthesis/executive` | Streaming AI executive summary (SSE) |

Full API docs available at `http://localhost:8001/docs` when backend is running.

---

## Deployment

**Frontend → Vercel:**
```bash
# Set environment variable in Vercel dashboard:
VITE_API_BASE_URL=https://your-backend.onrender.com
```

**Backend → Render:**
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Add `GROQ_API_KEY` as environment variable in Render dashboard

> **Cold start note:** Render free tier sleeps after 15 minutes of inactivity. First request after sleep takes 30–50 seconds (model retraining). Add a `/health` endpoint ping on frontend load to handle this gracefully.

---

## Dataset

The sample dataset (`data/SaaS-Sales.csv`) contains **9,994 B2B SaaS transactions** spanning 2020–2023 across:
- **3 segments:** Enterprise, SMB, Strategic
- **3 regions:** AMER, APJ, EMEA
- **10 industries:** Finance, Tech, Healthcare, Energy, Manufacturing, and more
- **14 products:** ContactMatcher, FinanceHub, Marketing Suite, and more

To use your own data, upload a CSV with these required columns:
`Order ID, Order Date, Customer, Segment, Region, Product, Sales, Quantity, Discount`

Optional: `Industry, Profit`

---

## Contact

**Omar Elsaber**
AI Engineer @ SEG

[![Email](https://img.shields.io/badge/Email-omarelsaber0%40gmail.com-EA4335?style=flat-square&logo=gmail&logoColor=white)](mailto:omarelsaber0@gmail.com)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-omarelsaber-0A66C2?style=flat-square&logo=linkedin&logoColor=white)](https://linkedin.com/in/omarelsaber)
[![GitHub](https://img.shields.io/badge/GitHub-omarelsaber-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/omarelsaber)

---

<div align="center">

*Built with React · FastAPI · Groq · Llama-3.3 · XGBoost · Scikit-learn*

**PredictoHub © 2026**

</div>