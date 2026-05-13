"""
app/api/v1/data_router.py
─────────────────────────────────────────────────────────────────────────────
All non-streaming data endpoints:

  POST /api/v1/ingest          — Accept CSV upload, re-ingest, re-train all models
  GET  /api/v1/forecast        — Per-segment revenue forecasts
  GET  /api/v1/personas        — K-Means economic persona profiles
  POST /api/v1/deals/score     — Single-deal margin scorer
  GET  /api/v1/report          — Printable HTML executive report
  GET  /api/v1/preview         — First 100 rows for Data Explorer

Every endpoint that requires trained models returns 503 + ErrorResponse
if called before the lifespan startup completes.
"""

from __future__ import annotations

import logging
import math
import shutil
import time
from pathlib import Path

import pandas as pd

from fastapi import APIRouter, HTTPException, UploadFile, File, status
from fastapi.responses import HTMLResponse, Response

from app.core.cache import predicto_cache
from app.core.config import get_settings
from app.ml.forecasting import train_forecast_models
from app.ml.margin_engine import score_deals, train_margin_engine
from app.ml.segmentation import train_segmentation
from app.models.schemas import (
    DealScoreRequest,
    DealScoreResponse,
    ErrorResponse,
    ForecastResponse,
    ForecastSegmentResponse,
    IngestResponse,
    PersonaResponse,
    PersonasResponse,
    DataPreviewResponse,
    DataPreviewRecord,
    RevenueOverviewResponse,
    RevenueForecastPoint,
    MatrixRow,
)
from app.services.deal_service import get_margin_input
from app.services.forecast_service import get_forecast_inputs
from app.services.ingestion_service import ingest, IngestionValidationError
from app.services.persona_service import get_segmentation_input

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Data"])


# ─────────────────────────────────────────────────────────────────────────────
# Guard helper
# ─────────────────────────────────────────────────────────────────────────────

def _require_models_ready() -> None:
    """Raise HTTP 503 with a typed ErrorResponse body if models aren't loaded."""
    if not predicto_cache.models_ready():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ErrorResponse(
                error="service_unavailable",
                message="Models are still initialising. Please retry in a few seconds.",
                detail="predicto_cache.models_ready() returned False",
            ).model_dump(),
        )


def _ml_and_data_available() -> bool:
    """True when pillars are trained and transaction rows exist."""
    return predicto_cache.models_ready() and predicto_cache.has_transaction_data()


# ─────────────────────────────────────────────────────────────────────────────
# POST /ingest — File Upload + Re-Train Pipeline
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/ingest",
    response_model=IngestResponse,
    summary="Upload a CSV file, re-ingest data, and re-train all ML models",
    responses={
        200: {"description": "Ingestion and training completed successfully"},
        400: {"model": ErrorResponse, "description": "Invalid file or ingestion failure"},
        503: {"model": ErrorResponse, "description": "Startup not yet complete"},
    },
)
async def ingest_upload(
    file: UploadFile = File(None),
) -> IngestResponse:
    """
    SaaS ingestion endpoint.

    If a CSV file is uploaded:
      1. Save to data/uploaded_data.csv
      2. Re-ingest via ingestion_service.ingest()
      3. Re-train all 3 ML pillars (Forecast, Margin, Segmentation)
      4. Return summary stats

    If no file is uploaded, return current cache row counts (works in empty state).
    """
    settings = get_settings()

    if file is None or file.filename == "":
        # Status-only mode: report current ingestion state
        raw_df = predicto_cache.get_raw_data()
        monthly_df = predicto_cache.get_monthly_data()

        rows_raw = len(raw_df) if raw_df is not None else 0
        rows_monthly = len(monthly_df) if monthly_df is not None else 0
        file_hash: str = getattr(predicto_cache, "current_file_hash", None) or ("0" * 64)

        return IngestResponse(
            status="ok",
            rows_raw=rows_raw,
            rows_monthly=rows_monthly,
            file_hash=file_hash,
        )

    # ── File upload mode ──────────────────────────────────────────────────
    logger.info("CSV upload received: %s (%s)", file.filename, file.content_type)

    # 1. Save uploaded file
    upload_path = settings.data_dir / "uploaded_data.csv"
    try:
        contents = await file.read()
        upload_path.write_bytes(contents)
        logger.info("Saved uploaded CSV to %s (%d bytes)", upload_path, len(contents))
    except Exception as exc:
        logger.error("Failed to save uploaded file: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="upload_failed",
                message="Failed to save the uploaded file.",
                detail=str(exc),
            ).model_dump(),
        ) from exc

    # 2. Re-ingest (runs the strict 4-step validation layer)
    total_start = time.perf_counter()
    try:
        result = ingest(upload_path)
        if result.status == "error":
            # Validation error surfaced as IngestionResult.detail
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse(
                    error="validation_failed",
                    message=result.detail,
                    detail=(
                        "The CSV failed data validation. "
                        "Check column names, data types, and value constraints. "
                        "Required columns: Order ID, Order Date, Customer, Segment, "
                        "Region, Product, Sales, Quantity, Discount. "
                        "Sales and Quantity must be > 0. Discount must be between 0 and 1."
                    ),
                ).model_dump(),
            )
        logger.info(
            "Re-ingestion complete: %d rows loaded, %d dropped, %d validation issue(s)",
            result.rows_loaded, result.rows_dropped, len(result.validation_errors),
        )
    except HTTPException:
        raise
    except IngestionValidationError as exc:
        # Direct ValueError from the validation layer (e.g. missing column)
        logger.error("Data validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse(
                error="validation_failed",
                message=str(exc),
                detail="The uploaded CSV did not pass schema or data quality validation.",
            ).model_dump(),
        ) from exc
    except Exception as exc:
        logger.error("Re-ingestion failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="ingestion_failed",
                message="CSV ingestion failed unexpectedly.",
                detail=str(exc),
            ).model_dump(),
        ) from exc

    # 3. Re-train all 3 ML pillars
    try:
        logger.info("Re-training Pillar 1 — Forecasting …")
        forecast_models = train_forecast_models()

        logger.info("Re-training Pillar 2 — Margin Engine …")
        margin_models = train_margin_engine()

        logger.info("Re-training Pillar 3 — K-Means Segmentation …")
        segmentation_result = train_segmentation()

        # Atomic commit to cache
        predicto_cache.set_models(
            forecast=forecast_models,
            margin=margin_models,
            segmentation=segmentation_result,
        )

        elapsed = time.perf_counter() - total_start
        logger.info("Full re-training pipeline complete in %.2f s", elapsed)

    except Exception as exc:
        logger.error("Re-training failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="training_failed",
                message="Model re-training failed after ingestion.",
                detail=str(exc),
            ).model_dump(),
        ) from exc

    raw_df = predicto_cache.get_raw_data()
    monthly_df = predicto_cache.get_monthly_data()
    file_hash = getattr(predicto_cache, "current_file_hash", None) or ("0" * 64)

    return IngestResponse(
        status="ok",
        rows_raw=len(raw_df) if raw_df is not None else 0,
        rows_monthly=len(monthly_df) if monthly_df is not None else 0,
        rows_dropped=result.rows_dropped,
        file_hash=file_hash,
        validation_errors=result.validation_errors,
        warnings=result.warnings,
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /forecast
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/forecast",
    response_model=ForecastResponse,
    summary="Per-segment Fourier+Ridge revenue forecasts",
    responses={
        200: {"description": "Forecast data for all segments"},
        503: {"model": ErrorResponse, "description": "Models not yet ready"},
    },
)
async def forecast(periods: int = 3) -> ForecastResponse:
    """
    Return next-N-period revenue forecasts for every segment found in the
    monthly DataFrame, including confidence bounds and trend direction.

    Query params
    ------------
    periods : int
        Number of future periods to forecast (default: 3).
    """
    if not _ml_and_data_available():
        return ForecastResponse(segments=[], periods_ahead=periods)

    try:
        inputs = get_forecast_inputs(periods=periods)
    except RuntimeError as exc:
        logger.error("Forecast inputs failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="forecast_error",
                message="Forecast computation failed.",
                detail=str(exc),
            ).model_dump(),
        ) from exc

    segments = [
        ForecastSegmentResponse(
            segment=fi.segment,
            next_period_revenue=fi.yhat_next,
            confidence_lower=fi.yhat_lower_next,
            confidence_upper=fi.yhat_upper_next,
            pct_change_vs_current=f"{fi.pct_change * 100:+.1f}%",
            trend_direction=fi.trend_direction,
            r2_validation=fi.r2_validation,
        )
        for fi in inputs
    ]

    logger.info("Forecast response: %d segment(s), periods=%d", len(segments), periods)
    return ForecastResponse(segments=segments, periods_ahead=periods)


# ─────────────────────────────────────────────────────────────────────────────
# GET /personas
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/personas",
    response_model=PersonasResponse,
    summary="K-Means economic persona profiles",
    responses={
        200: {"description": "Persona profiles for all clusters"},
        503: {"model": ErrorResponse, "description": "Models not yet ready"},
    },
)
async def personas() -> PersonasResponse:
    """
    Return K-Means cluster personas enriched with deal-value, discount,
    margin, churn-risk, and top-region statistics.
    """
    if not _ml_and_data_available():
        return PersonasResponse(personas=[], n_clusters=0, silhouette_score=0.0)

    try:
        seg_input = get_segmentation_input()
    except RuntimeError as exc:
        logger.error("Segmentation input failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="personas_error",
                message="Persona data unavailable.",
                detail=str(exc),
            ).model_dump(),
        ) from exc

    persona_list = [
        PersonaResponse(
            segment=p.segment,
            persona_label=p.persona_label,
            avg_deal_value=p.avg_deal_value,
            avg_discount=f"{p.avg_discount * 100:.1f}%",
            avg_margin=f"{p.avg_margin * 100:.1f}%",
            churn_risk=p.churn_risk,
            top_region=p.top_region,
            cluster_size=p.cluster_size,
        )
        for p in seg_input.personas
    ]

    logger.info("Personas response: %d cluster(s)", len(persona_list))
    return PersonasResponse(
        personas=persona_list,
        n_clusters=seg_input.n_clusters,
        silhouette_score=seg_input.silhouette_score,
    )


# ─────────────────────────────────────────────────────────────────────────────
# POST /deals/score
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/deals/score",
    response_model=DealScoreResponse,
    summary="Score a single deal's predicted margin and safe discount ceiling",
    responses={
        200: {"description": "Margin rating and discount recommendation"},
        422: {"description": "Validation error (e.g. revenue_per_unit ≤ 0)"},
        503: {"model": ErrorResponse, "description": "Models not yet ready"},
    },
)
async def score_deal(request: DealScoreRequest) -> DealScoreResponse:
    """
    Predict the margin rate and maximum safe discount for a proposed deal.

    The request is validated by `DealScoreRequest`'s model-level validator
    (revenue_per_unit > 0). The ML scorer expects the same feature columns
    produced by `ingestion_service`; they are reconstructed here from the
    request fields.
    """
    _require_models_ready()

    margin_models = predicto_cache.get_margin_models()
    if margin_models is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=ErrorResponse(
                error="service_unavailable",
                message="Margin models not loaded.",
            ).model_dump(),
        )

    # ── Build a single-row DataFrame matching ingestion_service feature schema ─
    revenue_per_unit = float(request.sales) / float(request.quantity)

    row = pd.DataFrame([{
        "Segment":          request.segment,
        "Region":           request.region,
        "Industry":         request.industry,
        "Product":          request.product,
        "Quantity":         int(request.quantity),
        "Sales":            float(request.sales),
        "Discount":         float(request.discount),
        "Revenue_Per_Unit": revenue_per_unit,
    }])

    try:
        scores = score_deals(margin_models, row)
    except Exception as exc:  # noqa: BLE001
        logger.error("score_deals failed: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="scoring_error",
                message="Deal scoring failed unexpectedly.",
                detail=str(exc),
            ).model_dump(),
        ) from exc

    if not scores:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse(
                error="scoring_empty",
                message="Scorer returned no results for the provided deal.",
            ).model_dump(),
        )

    deal_score = scores[0]
    logger.info(
        "Deal scored: margin=%.3f  max_safe_discount=%.3f  segment=%s",
        deal_score.predicted_margin_rate,
        deal_score.discount_ceiling if deal_score.discount_ceiling is not None else 0.0,
        request.segment,
    )
    return DealScoreResponse.build(
        segment=request.segment,
        region=request.region,
        predicted_margin_rate=deal_score.predicted_margin_rate,
        max_safe_discount=deal_score.discount_ceiling if deal_score.discount_ceiling is not None else 0.0,
        recommendation=deal_score.recommendation
    )

# ─────────────────────────────────────────────────────────────────────────────
# GET /report — Printable HTML Report (PDF fallback)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/report",
    summary="Download Executive Report (printable HTML)",
    responses={
        200: {"description": "Printable HTML report"},
        503: {"model": ErrorResponse, "description": "Models not yet ready"},
    },
)
async def generate_report() -> HTMLResponse:
    """
    Generate an Executive Report as a printable HTML page.
    Uses window.print() for PDF generation via the browser's built-in
    print dialog, avoiding WeasyPrint dependency issues on Windows.
    """
    _require_models_ready()

    try:
        # Fetch current data from models
        forecast_inputs = get_forecast_inputs(periods=3)
        seg_input = get_segmentation_input()

        # Build Forecast HTML snippet
        forecast_rows = ""
        for i, f in enumerate(forecast_inputs, 1):
            trend_color = "#10b981" if f.trend_direction == "up" else ("#ef4444" if f.trend_direction == "down" else "#eab308")
            bg_color = f"{trend_color}15"
            forecast_rows += f"""
            <tr>
                <td style="font-weight:600;color:#0f172a;">{f.segment}</td>
                <td style="text-align:right;font-family:monospace;font-weight:600;">${f.yhat_next:,.0f}</td>
                <td style="text-align:right;color:{trend_color};font-weight:700;">{f.pct_change*100:+.1f}%</td>
                <td style="text-align:center;">
                    <span class="badge" style="background:{bg_color};color:{trend_color};">{f.trend_direction.upper()}</span>
                </td>
            </tr>"""

        # Build Persona HTML snippet
        persona_rows = ""
        for p in seg_input.personas:
            risk_color = "#ef4444" if p.churn_risk == "high" else ("#f59e0b" if p.churn_risk == "medium" else "#10b981")
            bg_color = f"{risk_color}15"
            persona_rows += f"""
            <tr>
                <td style="font-weight:600;color:#0f172a;">{p.persona_label}</td>
                <td style="color:#64748b;">{p.segment}</td>
                <td style="text-align:right;font-family:monospace;">${p.avg_deal_value:,.0f}</td>
                <td style="text-align:right;font-weight:600;">{p.avg_margin*100:.1f}%</td>
                <td style="text-align:center;">
                    <span class="badge" style="background:{bg_color};color:{risk_color};">{p.churn_risk.upper()}</span>
                </td>
                <td style="color:#64748b;">{p.top_region}</td>
            </tr>"""

        # Build Full HTML page with auto-print
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Predicto Executive Report — {time.strftime('%Y-%m-%d')}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #1e293b;
            padding: 0;
            line-height: 1.5;
            background: #fff;
            -webkit-print-color-adjust: exact;
        }}
        .top-border {{
            height: 8px;
            background: linear-gradient(90deg, #4f46e5 0%, #7c3aed 50%, #db2777 100%);
            width: 100%;
        }}
        .container {{
            padding: 50px 70px;
            max-width: 1000px;
            margin: 0 auto;
        }}
        .header {{
            display: flex; 
            justify-content: space-between; 
            align-items: flex-start;
            margin-bottom: 50px;
            padding-bottom: 30px;
            border-bottom: 1px solid #f1f5f9;
        }}
        .brand {{
            display: flex;
            align-items: center;
            gap: 14px;
        }}
        .brand img {{
            height: 36px;
            width: auto;
        }}
        .brand h1 {{
            font-size: 26px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -1px;
        }}
        .brand h1 span {{
            color: #6366f1;
        }}
        .header .report-meta {{
            text-align: right;
        }}
        .report-meta h2 {{
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: #64748b;
            margin-bottom: 4px;
            font-weight: 700;
        }}
        .report-meta .date {{
            color: #0f172a;
            font-size: 14px;
            font-weight: 600;
        }}
        .section {{ margin-bottom: 50px; }}
        .section h3 {{
            font-size: 14px; 
            color: #475569; 
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 15px;
        }}
        .section h3::after {{
            content: "";
            flex: 1;
            height: 1px;
            background: #f1f5f9;
        }}
        table {{
            width: 100%; 
            border-collapse: collapse; 
            font-size: 13px;
            border: 1px solid #f1f5f9;
            border-radius: 12px;
            overflow: hidden;
        }}
        thead th {{
            background: #0f172a; 
            color: #fff; 
            font-weight: 600; 
            font-size: 11px;
            text-transform: uppercase; 
            letter-spacing: 1px;
            padding: 16px; 
            text-align: left;
        }}
        tbody tr:nth-child(even) {{
            background: #f8fafc;
        }}
        tbody td {{
            padding: 16px;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: middle;
        }}
        .badge {{
            display: inline-block;
            padding: 6px 12px;
            border-radius: 6px;
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }}
        .footer {{
            margin-top: 80px; 
            padding-top: 30px; 
            border-top: 1px solid #f1f5f9;
            text-align: center; 
            color: #94a3b8; 
            font-size: 11px;
            font-weight: 500;
            letter-spacing: 0.5px;
        }}
        .print-btn {{
            position: fixed;
            bottom: 40px;
            right: 40px;
            background: #0f172a; 
            color: #fff; 
            border: none; 
            padding: 16px 30px;
            border-radius: 50px; 
            font-size: 14px; 
            font-weight: 700;
            cursor: pointer; 
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            transition: all 0.2s;
            z-index: 100;
            display: flex;
            align-items: center;
            gap: 12px;
            border: 1px solid rgba(255,255,255,0.1);
        }}
        .print-btn:hover {{ transform: translateY(-3px); background: #1e293b; box-shadow: 0 25px 50px rgba(0,0,0,0.4); }}
        @media print {{
            .no-print {{ display: none !important; }}
            body {{ padding: 0; }}
            .container {{ padding: 0; width: 100%; max-width: none; }}
            .top-border {{ height: 12px; }}
            @page {{ margin: 1.5cm; }}
        }}
    </style>
</head>
<body>
    <div class="top-border"></div>
    <button class="print-btn no-print" onclick="window.print()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        Export PDF
    </button>

    <div class="container">
        <div class="header">
            <div class="brand">
                <img src="http://localhost:5173/predicto-logo.png" alt="" onerror="this.style.display='none'">
                <h1>Predicto<span>Hub</span></h1>
            </div>
            <div class="report-meta">
                <h2>Executive Intelligence Report</h2>
                <div class="date">{time.strftime('%B %d, %Y')}</div>
            </div>
        </div>

        <div class="section">
            <h3>Revenue Forecast Analysis</h3>
            <table>
                <thead>
                    <tr>
                        <th>Segment</th>
                        <th style="text-align:right;">Projected Revenue</th>
                        <th style="text-align:right;">Growth</th>
                        <th style="text-align:center;">Trend Confidence</th>
                    </tr>
                </thead>
                <tbody>{forecast_rows}</tbody>
            </table>
        </div>

        <div class="section">
            <h3>Persona Clustering & Risk</h3>
            <table>
                <thead>
                    <tr>
                        <th>Behavioral Persona</th>
                        <th>Segment</th>
                        <th style="text-align:right;">Avg Deal</th>
                        <th style="text-align:right;">Avg Margin</th>
                        <th style="text-align:center;">Churn Risk</th>
                        <th>Core Region</th>
                    </tr>
                </thead>
                <tbody>{persona_rows}</tbody>
            </table>
        </div>

        <div class="footer">
            CONFIDENTIAL &bull; Generated by Predicto Intelligence Pipeline &bull; {len(forecast_inputs)} segments analyzed &bull; {seg_input.n_clusters} clusters identified
        </div>
    </div>

    <script>
        // Auto-trigger print dialog after a short delay
        setTimeout(function() {{ window.print(); }}, 1200);
    </script>
</body>
</html>"""

        return HTMLResponse(content=html_content)

    except Exception as exc:
        logger.error("Failed to generate report: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=str(exc)
        )


# ─────────────────────────────────────────────────────────────────────────────
# GET /preview — First 100 rows for Data Explorer (canonical)
# Legacy: GET /data/preview — same payload
# ─────────────────────────────────────────────────────────────────────────────


def _build_data_preview_response() -> DataPreviewResponse:
    """
    Read raw transactions from ``predicto_cache`` (filled at ingestion), take the
    first 100 rows, format margin from ``Margin_Rate`` when present.
    """
    df = predicto_cache.get_raw_data()
    if df is None or df.empty:
        return DataPreviewResponse(status="no_data", count=0, data=[])

    total_count = len(df)
    preview_df = df.head(100).copy()

    preview_df = preview_df.fillna({
        "Profit": 0.0,
        "Discount": 0.0,
        "Industry": "Unknown",
        "Region": "Global",
    })

    rows_out: list[DataPreviewRecord] = []
    has_margin_rate = "Margin_Rate" in preview_df.columns

    for r in preview_df.to_dict(orient="records"):
        try:
            sales = float(r.get("Sales"))
            if math.isnan(sales):
                sales = 0.0
        except (TypeError, ValueError):
            sales = 0.0

        if has_margin_rate and r.get("Margin_Rate") is not None:
            try:
                mr = float(r["Margin_Rate"])
                if math.isnan(mr):
                    raise ValueError
                margin_str = f"{round(mr * 100, 1)}%"
            except (TypeError, ValueError):
                profit = float(r.get("Profit") or 0.0)
                m = (profit / sales) if sales != 0 else 0.0
                margin_str = f"{m * 100:.1f}%"
        else:
            profit = float(r.get("Profit") or 0.0)
            m = (profit / sales) if sales != 0 else 0.0
            margin_str = f"{m * 100:.1f}%"

        od = r.get("Order Date")
        if hasattr(od, "strftime"):
            order_date_str = od.strftime("%Y-%m-%d")
        else:
            order_date_str = "" if od is None else str(od)

        rows_out.append(
            DataPreviewRecord(
                order_id=str(r.get("Order ID", "")),
                order_date=order_date_str,
                customer=str(r.get("Customer", "")),
                segment=str(r.get("Segment", "")),
                region=str(r.get("Region", "")),
                product=str(r.get("Product", "")),
                sales=sales,
                margin=margin_str,
            )
        )

    return DataPreviewResponse(
        status="success",
        count=total_count,
        data=rows_out,
    )


@router.get(
    "/transactions",
    response_model=DataPreviewResponse,
    response_model_by_alias=True,
    summary="Fetch all cleaned transaction records",
    responses={
        200: {"description": "Full dataset from cache"},
        503: {"model": ErrorResponse, "description": "Models not yet ready"},
    },
)
async def get_all_transactions() -> DataPreviewResponse:
    """Returns all transaction-level data currently held in cache."""
    df = predicto_cache.get_raw_data()
    if df is None or df.empty:
        return DataPreviewResponse(status="no_data", count=0, data=[])
    
    # Use the existing build helper but without the .head(100) limit
    # We'll just build it manually here for full data
    total_count = len(df)
    rows_out: list[DataPreviewRecord] = []
    has_margin_rate = "Margin_Rate" in df.columns

    for r in df.to_dict(orient="records"):
        sales = float(r.get("Sales") or 0.0)
        
        if has_margin_rate and r.get("Margin_Rate") is not None:
            mr = float(r["Margin_Rate"])
            margin_str = f"{round(mr * 100, 1)}%"
        else:
            profit = float(r.get("Profit") or 0.0)
            m = (profit / sales) if sales != 0 else 0.0
            margin_str = f"{m * 100:.1f}%"

        od = r.get("Order Date")
        order_date_str = od.strftime("%Y-%m-%d") if hasattr(od, "strftime") else str(od or "")

        rows_out.append(
            DataPreviewRecord(
                order_id=str(r.get("Order ID", "")),
                order_date=order_date_str,
                customer=str(r.get("Customer", "")),
                segment=str(r.get("Segment", "")),
                region=str(r.get("Region", "")),
                product=str(r.get("Product", "")),
                sales=sales,
                margin=margin_str,
            )
        )

    return DataPreviewResponse(
        status="success",
        count=total_count,
        data=rows_out,
    )


@router.get(
    "/preview",
    response_model=DataPreviewResponse,
    response_model_by_alias=True,
    summary="Fetch the first 100 rows of cleaned transaction data",
    responses={
        200: {"description": "Sample of the cleaned dataset"},
        503: {"model": ErrorResponse, "description": "Models not yet ready"},
    },
)
async def get_data_preview() -> DataPreviewResponse:
    """Canonical Data Explorer endpoint."""
    if not predicto_cache.has_transaction_data():
        return DataPreviewResponse(status="no_data", count=0, data=[])
    _require_models_ready()
    return _build_data_preview_response()

@router.get(
    "/revenue/overview",
    response_model=RevenueOverviewResponse,
    summary="Unified revenue, margin, and risk overview for the main dashboard",
)
async def get_revenue_overview() -> RevenueOverviewResponse:
    """
    Landing page endpoint. Aggregates data from all 3 ML pillars.
    """
    if not _ml_and_data_available():
        # Fallback to empty state if models aren't ready
        return RevenueOverviewResponse(
            next_quarter_revenue="$0.0k",
            revenue_growth="+0%",
            portfolio_margin_health=0.0,
            margin_target=25.0,
            risk_alerts=0,
            recovery_opportunity="$0.0M",
            forecast_data=[],
            sparkline_revenue=[],
            discount_matrix=[],
            model_health={"Margin Engine": 0.0, "Forecast Model": 0.0}
        )

    # ── 1. Pull Context ──────────────────────────────────────────────────
    forecast_inputs = get_forecast_inputs(periods=3)
    margin_input = get_margin_input()
    raw_df = predicto_cache.get_raw_data()
    monthly_df = predicto_cache.get_monthly_data()

    # ── 2. Top-Level Metrics ─────────────────────────────────────────────
    total_next_rev = sum(f.yhat_next for f in forecast_inputs)
    next_rev_str = f"${total_next_rev/1000:.1f}k"
    
    # Growth heuristic: mean of % changes across segments
    # ForecastInput.pct_change is a float (e.g., 0.05 for 5%)
    avg_growth = sum(f.pct_change * 100 for f in forecast_inputs) / len(forecast_inputs) if forecast_inputs else 0
    growth_str = f"{avg_growth:+.1f}%"

    margin_health = raw_df["Margin_Rate"].mean() * 100
    
    # Risk alerts count (Margin_Rate < 0.05)
    risk_alerts_count = len(raw_df[raw_df["Margin_Rate"] < 0.05])
    
    # Recovery Opportunity heuristic: (Target 20% - Current Mean Margin) * Sales Value
    # Sourced from deals that are at risk
    total_at_risk_sales = raw_df[raw_df["Margin_Rate"] < 0.05]["Sales"].sum()
    recovery_opp = total_at_risk_sales * 0.15 # Assume we can recover 15% margin on at-risk deals
    recovery_str = f"${recovery_opp/1_000_000:.1f}M"

    # ── 3. Forecast Chart ────────────────────────────────────────────────
    # Transform monthly_df + forecast_inputs into RevenueForecastPoint
    forecast_pts: list[RevenueForecastPoint] = []
    
    if monthly_df is None or monthly_df.empty:
        hist_months = []
    else:
        # Defensive check: if Month became index, bring it back
        if "Month" not in monthly_df.columns and monthly_df.index.name == "Month":
            monthly_df = monthly_df.reset_index()
        
        hist_months = sorted(monthly_df["Month"].unique())[-12:]
    for m in hist_months:
        m_df = monthly_df[monthly_df["Month"] == m]
        forecast_pts.append(RevenueForecastPoint(
            month=m.strftime("%b %y"),
            Enterprise=float(m_df[m_df["Segment"] == "Enterprise"]["Sales"].sum()),
            SMB=float(m_df[m_df["Segment"] == "SMB"]["Sales"].sum()),
            Strategic=float(m_df[m_df["Segment"] == "Strategic"]["Sales"].sum()),
            isForecast=False
        ))

    # Future (next 3 periods)
    for i in range(3):
        # We simulate a slight monthly roll for the 3-period forecast display
        # In a real app, you'd call a multi-step forecast service
        forecast_pts.append(RevenueForecastPoint(
            month=f"Forecast P{i+1}",
            Enterprise=float(next((f.yhat_next for f in forecast_inputs if f.segment == "Enterprise"), 0) * (1 + 0.02 * i)),
            SMB=float(next((f.yhat_next for f in forecast_inputs if f.segment == "SMB"), 0) * (1 + 0.01 * i)),
            Strategic=float(next((f.yhat_next for f in forecast_inputs if f.segment == "Strategic"), 0) * (1 + 0.03 * i)),
            isForecast=True
        ))

    # Sparkline: last 6 months total revenue
    sparkline = []
    for m in hist_months[-6:]:
        sparkline.append({"value": float(monthly_df[monthly_df["Month"] == m]["Sales"].sum())})

    # ── 4. Discount Matrix ───────────────────────────────────────────────
    matrix_rows = []
    for seg, regions in margin_input.discount_ceiling_matrix.items():
        matrix_rows.append(MatrixRow(
            segment=seg,
            NA=f"{regions.get('North America', 0.1) * 100:.0f}%",
            EU=f"{regions.get('Europe', 0.12) * 100:.0f}%",
            APAC=f"{regions.get('APAC', 0.15) * 100:.0f}%"
        ))

    return RevenueOverviewResponse(
        next_quarter_revenue=next_rev_str,
        revenue_growth=growth_str,
        portfolio_margin_health=round(margin_health, 1),
        margin_target=25.0,
        risk_alerts=risk_alerts_count,
        recovery_opportunity=recovery_str,
        forecast_data=forecast_pts,
        sparkline_revenue=sparkline,
        discount_matrix=matrix_rows,
        model_health={
            "Margin Engine": margin_input.model_r2,
            "Forecast Model": sum(f.r2_validation for f in forecast_inputs) / len(forecast_inputs)
        }
    )


@router.get(
    "/data/preview",
    response_model=DataPreviewResponse,
    response_model_by_alias=True,
    summary="[Legacy] Same as /preview",
    include_in_schema=False,
    responses={
        200: {"description": "Sample of the cleaned dataset"},
        503: {"model": ErrorResponse, "description": "Models not yet ready"},
    },
)
async def get_data_preview_legacy() -> DataPreviewResponse:
    """Backward-compatible alias for older clients."""
    if not predicto_cache.has_transaction_data():
        return DataPreviewResponse(status="no_data", count=0, data=[])
    _require_models_ready()
    return _build_data_preview_response()