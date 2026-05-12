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
