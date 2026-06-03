/**
 * src/views/DataWorkspace/DataWorkspaceView.tsx
 *
 * Predicto V3 — Data Workspace View
 * Linear dark aesthetic · Tremor v3 · Tailwind v4
 *
 * Layout:
 *  ┌─────────────────────────────────────────────────────────────┐
 *  │  TOP HALF — Ingestion Zone (2-col)                          │
 *  │  ┌──────────────────────┐  ┌──────────────────────────────┐ │
 *  │  │  Ingest Dropzone     │  │  Real-Time Status Feed       │ │
 *  │  │  (glassmorphic drop) │  │  (dark terminal / console)   │ │
 *  │  └──────────────────────┘  └──────────────────────────────┘ │
 *  ├─────────────────────────────────────────────────────────────┤
 *  │  BOTTOM HALF — Tabs                                         │
 *  │  [Degradation Log]  [Data Preview]                          │
 *  │   Tremor Table          Tremor Table                        │
 *  └─────────────────────────────────────────────────────────────┘
 */

import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Card,
  Table,
  TableHead,
  TableRow,
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
  Tab,
  TabGroup,
  TabList,
  TabPanel,
  TabPanels,
} from "@tremor/react";
import {
  Upload,
  FileArchive,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Loader2,
  Database,
  Terminal,
  TableProperties,
  RefreshCw,
  Download,
  Filter,
  ChevronRight,
} from "lucide-react";

/* ─────────────────────────────────────────────────────────────────────────────
   MOCK DATA
   ───────────────────────────────────────────────────────────────────────────── */

export type LogLevel = "success" | "warning" | "error" | "info" | "muted";

export interface LogEntry {
  id: string | number;
  ts: string;
  level: LogLevel;
  message: string;
}

export interface DegradationRow {
  table: string;
  column: string;
  strategy: string;
  n_affected: number;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SMALL HELPERS / SUB-COMPONENTS
   ───────────────────────────────────────────────────────────────────────────── */

/** Returns colour + Tremor Badge colour prop for severity */
function severityBadgeProps(s: "HIGH" | "MEDIUM" | "LOW"): {
  color: "red" | "yellow" | "gray";
  label: string;
} {
  return s === "HIGH"
    ? { color: "red",    label: "HIGH"   }
    : s === "MEDIUM"
    ? { color: "yellow", label: "MEDIUM" }
    : { color: "gray",   label: "LOW"    };
}

/** Returns Tremor Badge colour for resolution type */
function resolutionBadgeProps(r: string): {
  color: "emerald" | "blue" | "amber" | "orange" | "red" | "violet";
  label: string;
} {
  const map: Record<
    string,
    { color: "emerald" | "blue" | "amber" | "orange" | "red" | "violet"; label: string }
  > = {
    imputed:  { color: "blue",    label: "Imputed"  },
    coerced:  { color: "violet",  label: "Coerced"  },
    clamped:  { color: "amber",   label: "Clamped"  },
    merged:   { color: "emerald", label: "Merged"   },
    skipped:  { color: "red",     label: "Skipped"  },
    flagged:  { color: "orange",  label: "Flagged"  },
  };
  return map[String(r || "").toLowerCase()] || { color: "blue", label: "Imputed" };
}

/** Returns colour for stage badge */
function stageBadgeColor(stage: string): "emerald" | "red" | "blue" | "amber" | "gray" | "violet" {
  const s = String(stage || "").toLowerCase();
  if (s.includes("won"))  return "emerald";
  if (s.includes("lost")) return "red";
  if (s.includes("negotiation") || s.includes("legal")) return "blue";
  if (s.includes("proposal"))    return "amber";
  if (s.includes("discovery") || s.includes("qualification")) return "gray";
  return "violet";
}

/** Log level → inline style for text colour */
function logTextStyle(level: LogLevel): React.CSSProperties {
  const base: React.CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize:   13,
    lineHeight: "1.65",
    whiteSpace: "pre",
  };
  switch (level) {
    case "success": return { ...base, color: "#4ade80" };
    case "warning": return { ...base, color: "#fbbf24" };
    case "error":   return { ...base, color: "#f87171" };
    case "info":    return { ...base, color: "#818cf8" };
    case "muted":   return { ...base, color: "#62666d" };
  }
}

/** Log level → prefix glyph */
function logTimestampStyle(): React.CSSProperties {
  return {
    fontFamily:  "var(--font-mono)",
    fontSize:    11,
    color:       "#3e3e44",
    flexShrink:  0,
    lineHeight:  "1.65",
    letterSpacing: "0.2px",
    marginRight: 14,
    userSelect:  "none",
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
   INGEST DROPZONE
   ───────────────────────────────────────────────────────────────────────────── */

type DropState = "idle" | "hovering" | "uploading" | "complete" | "error";

export interface DropzoneProps {
  dropState: DropState;
  fileName: string | null;
  progress: number;
  onFileSelected: (file: File) => void;
  onReset: () => void;
}

const IngestDropzone: React.FC<DropzoneProps> = ({ dropState, fileName, progress, onFileSelected, onReset }) => {
  const { t } = useTranslation();
  const [isHovering, setIsHovering] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsHovering(false);
      const file = e.dataTransfer.files?.[0];
      if (file && (dropState === "idle" || dropState === "error")) {
        onFileSelected(file);
      }
    },
    [dropState, onFileSelected]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && (dropState === "idle" || dropState === "error")) {
        onFileSelected(file);
      }
      if (inputRef.current) inputRef.current.value = ""; // reset
    },
    [dropState, onFileSelected]
  );

  const reset = () => {
    onReset();
  };

  /* ── Idle / hovering content ── */
  const renderIdle = () => (
    <>
      {/* Icon cluster */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <div
          style={{
            width: 64, height: 64,
            borderRadius: 16,
            background: "rgba(94, 106, 210, 0.10)",
            border: "1px solid rgba(94, 106, 210, 0.22)",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: dropState === "hovering"
              ? "0 0 24px rgba(94, 106, 210, 0.30), inset 0 1px 0 rgba(255,255,255,0.06)"
              : "inset 0 1px 0 rgba(255,255,255,0.04)",
            transition: "box-shadow 200ms ease",
          }}
        >
          <FileArchive size={28} color={dropState === "hovering" ? "#828fff" : "#5e6ad2"} />
        </div>
        {/* Corner pulse */}
        <span
          style={{
            position: "absolute",
            top: -4, right: -4,
            width: 14, height: 14,
            borderRadius: "50%",
            background: dropState === "hovering" ? "#828fff" : "#5e6ad2",
            opacity: dropState === "hovering" ? 1 : 0.5,
            transition: "all 200ms ease",
            boxShadow: dropState === "hovering" ? "0 0 10px rgba(130,143,255,0.7)" : "none",
          }}
        />
      </div>

      {/* Headline */}
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 15,
          fontWeight: 500,
          letterSpacing: "-0.2px",
          color: dropState === "hovering" ? "var(--p-ink)" : "var(--p-ink-muted)",
          marginBottom: 6,
          transition: "color 180ms ease",
          textAlign: "center",
        }}
      >
        {dropState === "hovering" ? t("dataWorkspace.dropzone.release") : t("dataWorkspace.dropzone.dropZip")}
      </p>

      {/* Sub-line */}
      <p
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          color: "var(--p-ink-tertiary)",
          marginBottom: 20,
          textAlign: "center",
          letterSpacing: "0.1px",
        }}
      >
        {t("dataWorkspace.dropzone.acceptedFormats")}
      </p>

      {/* Pill CTA */}
      <button
        className="btn btn-secondary"
        style={{ fontSize: 13, padding: "6px 16px", minHeight: 34 }}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        <Upload size={13} />
        {t("dataWorkspace.dropzone.browseFile")}
      </button>
    </>
  );

  /* ── Uploading content ── */
  const renderUploading = () => (
    <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <Loader2 size={32} color="#5e6ad2" style={{ animation: "spin 1s linear infinite" }} />
      <p style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 500, color: "var(--p-ink-muted)", letterSpacing: "-0.1px" }}>
        {fileName}
      </p>
      {/* Progress bar */}
      <div style={{ width: "90%", height: 4, background: "var(--p-hairline)", borderRadius: 99, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${progress.toFixed(1)}%`,
            background: "linear-gradient(90deg, #5e6ad2, #828fff)",
            borderRadius: 99,
            transition: "width 140ms ease",
            boxShadow: "0 0 8px rgba(130,143,255,0.5)",
          }}
        />
      </div>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--p-ink-tertiary)" }}>
        {progress.toFixed(0)}% — {t("dataWorkspace.dropzone.validating")}
      </p>
    </div>
  );

  /* ── Complete content ── */
  const renderComplete = () => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
      <CheckCircle2 size={36} color="#4ade80" style={{ filter: "drop-shadow(0 0 8px rgba(74,222,128,0.4))" }} />
      <p style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 500, color: "#4ade80", letterSpacing: "-0.1px" }}>
        {t("dataWorkspace.dropzone.complete")}
      </p>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--p-ink-tertiary)", textAlign: "center" }}>
        {fileName}
      </p>
      <button
        className="btn btn-ghost"
        style={{ fontSize: 12, padding: "4px 12px", minHeight: 30, marginTop: 4 }}
        onClick={reset}
        type="button"
      >
        <RefreshCw size={11} />
        {t("dataWorkspace.dropzone.uploadAnother")}
      </button>
    </div>
  );

  /* ── Border + glow state ── */
  const borderColor =
    dropState === "hovering"  ? "rgba(94, 106, 210, 0.65)"  :
    dropState === "complete"  ? "rgba(74, 222, 128, 0.35)"  :
    dropState === "uploading" ? "rgba(94, 106, 210, 0.40)"  :
                                "rgba(255, 255, 255, 0.09)";

  const bgColor =
    dropState === "hovering"  ? "rgba(94, 106, 210, 0.07)"  :
    dropState === "complete"  ? "rgba(74, 222, 128, 0.04)"  :
    dropState === "uploading" ? "rgba(94, 106, 210, 0.05)"  :
                                "rgba(20, 21, 22, 0.72)";

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 280,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 32,
        /* glassmorphism */
        backdropFilter: "blur(16px) saturate(160%)",
        WebkitBackdropFilter: "blur(16px) saturate(160%)",
        background: bgColor,
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 16,
        transition: "background 200ms ease, border-color 200ms ease",
        cursor: dropState === "idle" || dropState === "hovering" ? "pointer" : "default",
        position: "relative",
        overflow: "hidden",
      }}
      onDragOver={(e) => { e.preventDefault(); if (dropState === "idle") setIsHovering(true); }}
      onDragLeave={() => { setIsHovering(false); }}
      onDrop={handleDrop}
      onClick={() => { if (dropState === "idle" || dropState === "error") inputRef.current?.click(); }}
      role="button"
      tabIndex={0}
      aria-label={t("dataWorkspace.dropzone.ariaLabel")}
      onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && (dropState === "idle" || dropState === "error")) inputRef.current?.click(); }}
    >
      {/* subtle grid overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          pointerEvents: "none",
          borderRadius: 14,
        }}
      />

      {dropState === "idle" || dropState === "error" ? renderIdle() :
       dropState === "uploading"                     ? renderUploading() :
                                                       renderComplete()}

      <input
        ref={inputRef}
        type="file"
        accept=".zip,.csv,.json"
        style={{ display: "none" }}
        onChange={handleChange}
        aria-hidden
      />
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   TERMINAL FEED
   ───────────────────────────────────────────────────────────────────────────── */

export const TerminalFeed: React.FC<{ logs: LogEntry[], running: boolean }> = ({ logs, running }) => {
  const { t } = useTranslation();
  const bottomRef = useRef<HTMLDivElement>(null);

  /* Auto-scroll to bottom */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 280,
        display: "flex",
        flexDirection: "column",
        background: "#050507",
        border: "1px solid var(--p-hairline)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      {/* Terminal title bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 14px",
          background: "#0a0a0c",
          borderBottom: "1px solid var(--p-hairline)",
          flexShrink: 0,
        }}
      >
        {/* Traffic-light dots */}
        <div style={{ display: "flex", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57", opacity: 0.9 }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e", opacity: 0.9 }} />
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840", opacity: 0.9 }} />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <Terminal size={11} color="#62666d" />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#62666d", letterSpacing: "0.3px" }}>
            {t("dataWorkspace.console.consoleLabel")}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {running && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "#4ade80",
                letterSpacing: "0.4px",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#4ade80",
                  boxShadow: "0 0 6px rgba(74,222,128,0.8)",
                  animation: "pulse 1s ease-in-out infinite",
                }}
              />
              {t("dataWorkspace.console.live")}
            </span>
          )}
          {!running && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#62666d", letterSpacing: "0.4px" }}>
              {t("dataWorkspace.console.complete")}
            </span>
          )}
        </div>
      </div>

      {/* Log scroll area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 16px 16px",
          display: "flex",
          flexDirection: "column",
        }}
      >


        {logs.map((log, index) => (
          <div
            key={`${log.id}-${index}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              animation: "fade-in 160ms ease both",
            }}
          >
            <span style={logTimestampStyle()}>{log.ts}</span>
            <span style={logTextStyle(log.level)}>
              {log.translationKey ? t(log.translationKey, log.translationOptions) : log.message}
            </span>
          </div>
        ))}

        {/* Blinking cursor while running */}
        {running && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <span
              style={{
                display: "inline-block",
                width: 7,
                height: 14,
                background: "#5e6ad2",
                opacity: 0.85,
                animation: "blink 1.1s step-end infinite",
                borderRadius: 1,
              }}
            />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <style>{`
        @keyframes blink { 0%, 100% { opacity: 0.85; } 50% { opacity: 0; } }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        @keyframes spin  { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   DEGRADATION LOG TABLE
   ───────────────────────────────────────────────────────────────────────────── */

const DegradationLogTable: React.FC<{ data: DegradationRow[] }> = ({ data }) => {
  const { t } = useTranslation();
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell style={{ color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.4px", textTransform: "uppercase", fontWeight: 500 }}>
              {t("dataWorkspace.degradationTable.headers.table")}
            </TableHeaderCell>
            <TableHeaderCell style={{ color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.4px", textTransform: "uppercase", fontWeight: 500 }}>
              {t("dataWorkspace.degradationTable.headers.column")}
            </TableHeaderCell>
            <TableHeaderCell style={{ color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.4px", textTransform: "uppercase", fontWeight: 500 }}>
              {t("dataWorkspace.degradationTable.headers.strategy")}
            </TableHeaderCell>
            <TableHeaderCell style={{ color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.4px", textTransform: "uppercase", fontWeight: 500, textAlign: "right" }}>
              {t("dataWorkspace.degradationTable.headers.count")}
            </TableHeaderCell>
            <TableHeaderCell style={{ color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.4px", textTransform: "uppercase", fontWeight: 500 }}>
              {t("dataWorkspace.degradationTable.headers.severity")}
            </TableHeaderCell>
            <TableHeaderCell style={{ color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", fontSize: 11, letterSpacing: "0.4px", textTransform: "uppercase", fontWeight: 500 }}>
              {t("dataWorkspace.degradationTable.headers.resolution")}
            </TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.length === 0 && (
             <TableRow>
               <TableCell colSpan={6}>
                 <div style={{ padding: "20px", textAlign: "center", color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", fontSize: 13 }}>
                    {t("dataWorkspace.degradationTable.noEvents")}
                 </div>
               </TableCell>
             </TableRow>
          )}
          {data.map((row, i) => {
            const sev = severityBadgeProps("MEDIUM");
            const res = resolutionBadgeProps("imputed");
            return (
              <TableRow
                key={i}
                style={{
                  borderTop: "1px solid var(--p-hairline)",
                  transition: "background 140ms ease",
                }}
                className="hover:bg-[#141516]"
              >
                <TableCell>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--p-ink-muted)" }}>
                    {row.table}
                  </span>
                </TableCell>
                <TableCell>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--p-ink-subtle)" }}>
                    {row.column}
                  </span>
                </TableCell>
                <TableCell>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--p-ink-muted)" }}>
                    {row.strategy}
                  </span>
                </TableCell>
                <TableCell style={{ textAlign: "right" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--p-ink)", fontVariantNumeric: "tabular-nums" }}>
                    {row.n_affected.toLocaleString()}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge color={sev.color} size="xs">
                    {t("dataWorkspace.degradationTable.severity." + sev.label)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge color={res.color} size="xs">
                    {t("dataWorkspace.degradationTable.resolution." + res.label.toLowerCase())}
                  </Badge>
                  <span style={{ marginInlineStart: 8, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--p-ink-subtle)" }}>
                    {row.strategy}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   DATA PREVIEW TABLE
   ───────────────────────────────────────────────────────────────────────────── */

const DataPreviewTable: React.FC<{ data: any[] }> = ({ data }) => {
  const { t } = useTranslation();
  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      {/* File chip */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span className="status-pill info">
          <Database size={10} />
          sales_table.csv
        </span>
        <span className="status-pill success">
          <CheckCircle2 size={10} />
          {t("dataWorkspace.previewTable.schemaValidated")}
        </span>
        <span style={{ marginInlineStart: "auto" }}>
          <button className="btn btn-secondary" style={{ fontSize: 12, padding: "5px 12px", minHeight: 30 }}>
            <Download size={11} />
            {t("dataWorkspace.previewTable.exportCsv")}
          </button>
        </span>
      </div>

      <Table>
        <TableHead>
          <TableRow>
            {[
              t("dataWorkspace.previewTable.headers.opportunityId"),
              t("dataWorkspace.previewTable.headers.accountName"),
              t("dataWorkspace.previewTable.headers.rep"),
              t("dataWorkspace.previewTable.headers.stage"),
              t("dataWorkspace.previewTable.headers.amountUsd"),
              t("dataWorkspace.previewTable.headers.arrUsd"),
              t("dataWorkspace.previewTable.headers.closeDate"),
              t("dataWorkspace.previewTable.headers.region"),
              t("dataWorkspace.previewTable.headers.tier"),
              t("dataWorkspace.previewTable.headers.winProb"),
            ].map((h) => (
              <TableHeaderCell
                key={h}
                style={{
                  color: "var(--p-ink-tertiary)",
                  fontFamily: "var(--font-body)",
                  fontSize: 11,
                  letterSpacing: "0.4px",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  whiteSpace: "nowrap",
                }}
              >
                {h}
              </TableHeaderCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.length === 0 && (
            <TableRow>
              <TableCell colSpan={10}>
                <div style={{ padding: "20px", textAlign: "center", color: "var(--p-ink-tertiary)", fontFamily: "var(--font-body)", fontSize: 13 }}>
                   {t("dataWorkspace.previewTable.noPreview")}
                </div>
              </TableCell>
            </TableRow>
          )}
          {data.map((row, i) => {
            const region = String(row.region || "").toUpperCase();
            const winProbStr = String(row.win_probability || row.win_prob || "0");
            const winProb = parseFloat(winProbStr);
            const winProbColor = 
              isNaN(winProb) ? "var(--p-ink-subtle)" :
              winProb >= 80 ? "#4ade80" :
              winProb >= 50 ? "#fbbf24" :
              winProb === 0 ? "#f87171" :
                              "var(--p-ink-subtle)";

            return (
              <TableRow
                key={row.deal_id || row.opportunity_id || row.id || `row-${i}`}
                style={{ borderTop: "1px solid var(--p-hairline)" }}
                className="hover:bg-[#141516]"
              >
                <TableCell>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--p-primary-hover)" }}>
                    {row.deal_id || row.opportunity_id || t("dataWorkspace.previewTable.unknown")}
                  </span>
                </TableCell>
                <TableCell>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--p-ink)", fontWeight: 500 }}>
                    {row.account_name || row.account || t("dataWorkspace.previewTable.unknown")}
                  </span>
                </TableCell>
                <TableCell>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--p-ink-muted)" }}>
                    {row.sales_rep || row.rep_name || t("dataWorkspace.previewTable.unknown")}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge color={stageBadgeColor(row.win_loss_status || row.stage)} size="xs">
                    {String(row.win_loss_status || row.stage || t("dataWorkspace.previewTable.unknown"))}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--p-ink)", fontVariantNumeric: "tabular-nums" }}>
                    {row.amount || row.amount_usd || ""}
                  </span>
                </TableCell>
                <TableCell>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--p-ink-subtle)", fontVariantNumeric: "tabular-nums" }}>
                    {row.arr || row.arr_usd || ""}
                  </span>
                </TableCell>
                <TableCell>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--p-ink-tertiary)" }}>
                    {row.close_date || ""}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "1px 7px",
                      borderRadius: 4,
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                      fontWeight: 500,
                      background:
                        region === "AMER" ? "rgba(94,106,210,0.10)"  :
                        region === "EMEA" ? "rgba(232,163,10,0.10)"  :
                        region === "APAC" ? "rgba(39,166,68,0.10)"   :
                                            "rgba(255,255,255,0.05)",
                      color:
                        region === "AMER" ? "#818cf8" :
                        region === "EMEA" ? "#fbbf24" :
                        region === "APAC" ? "#4ade80" :
                                            "var(--p-ink-tertiary)",
                      border: "1px solid " +
                        (region === "AMER" ? "rgba(94,106,210,0.20)"  :
                         region === "EMEA" ? "rgba(232,163,10,0.20)"  :
                         region === "APAC" ? "rgba(39,166,68,0.20)"   :
                                             "rgba(255,255,255,0.10)"),
                    }}
                  >
                    {row.region || t("dataWorkspace.previewTable.unknown")}
                  </span>
                </TableCell>
                <TableCell>
                  <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--p-ink-subtle)" }}>
                    {row.product_tier || row.tier || t("dataWorkspace.previewTable.unknown")}
                  </span>
                </TableCell>
                <TableCell>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                      fontVariantNumeric: "tabular-nums",
                      color: winProbColor,
                    }}
                  >
                    {winProbStr}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN VIEW
   ───────────────────────────────────────────────────────────────────────────── */

const DataWorkspaceView: React.FC = () => {
  const { t } = useTranslation();
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab]       = useState<number>(0);

  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, ts: new Date().toLocaleTimeString([], { hour12: false }), level: "info", message: "Predicto Engine v3.0 ready. Awaiting payload...", translationKey: "dataWorkspace.console.ready" }
  ]);
  const [degradations, setDegradations] = useState<DegradationRow[]>([]);
  const [previews, setPreviews] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({ tables: 0, degradationCount: 0, missing: 0 });

  const [dropState, setDropState] = useState<DropState>("idle");
  const [progress, setProgress] = useState(0);

  const handleReset = () => {
     setDropState("idle");
     setUploadedFile(null);
     setProgress(0);
     setLogs([{ id: 1, ts: new Date().toLocaleTimeString([], { hour12: false }), level: "info", message: "Predicto Engine v3.0 ready. Awaiting payload...", translationKey: "dataWorkspace.console.ready" }]);
     setDegradations([]);
     setPreviews([]);
     setStats({ tables: 0, degradationCount: 0, missing: 0 });
  };

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";
        const res = await fetch(`${API_URL}/api/v2/data/health`);
        if (res.ok) {
          const healthData = await res.json();
          if (healthData.is_ready) {
            setDegradations(healthData.degradation_log || []);
            setPreviews(healthData.sales_preview || []);
            setStats({
              tables: healthData.tables_loaded?.length || 0,
              degradationCount: healthData.degradation_log?.length || 0,
              missing: healthData.tables_missing?.length || 0,
            });
            setLogs(prev => [
              ...prev,
              {
                id: Date.now(),
                ts: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message: `✓ Reconnected to active session. Health Score: ${healthData.health_score}`,
                translationKey: "dataWorkspace.console.reconnected",
                translationOptions: { score: healthData.health_score }
              }
            ]);
            setDropState("complete");
          }
        }
      } catch (err) {
        console.error("Failed to fetch initial health", err);
      }
    };
    fetchHealth();
  }, []);

  const handleFileUpload = async (file: File) => {
    setUploadedFile(file);
    setDropState("uploading");
    setProgress(10);
    
    const addLog = (level: LogLevel, message: string, translationKey?: string, translationOptions?: any) => {
      setLogs(prev => [...prev, { id: Date.now() + Math.random(), ts: new Date().toLocaleTimeString([], { hour12: false }), level, message, translationKey, translationOptions }]);
    };

    addLog("info", `Incoming upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`, "dataWorkspace.console.incoming", { name: file.name, size: (file.size / 1024 / 1024).toFixed(2) });
    addLog("muted", "Initiating ingestion pipeline...", "dataWorkspace.console.initiating");

    const timeouts: number[] = [];
    const addTimeoutLog = (level: LogLevel, message: string, delay: number, translationKey?: string) => {
      const id = window.setTimeout(() => addLog(level, message, translationKey), delay);
      timeouts.push(id);
    };

    addTimeoutLog("info", "Extracting artifacts...", 800, "dataWorkspace.console.extracting");
    addTimeoutLog("info", "Running LLM Schema Alignment (Groq)...", 2200, "dataWorkspace.console.aligning");
    addTimeoutLog("info", "Applying schema degradation...", 3800, "dataWorkspace.console.applyingDegradation");
    addTimeoutLog("info", "Fitting Hybrid Fusion Model...", 5500, "dataWorkspace.console.fittingModel");

    const formData = new FormData();
    formData.append("files", file);

    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8001";
      
      setProgress(40);
      const res = await fetch(`${API_URL}/api/v2/data/ingest`, {
        method: "POST",
        body: formData
      });

      timeouts.forEach(clearTimeout);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP error! status: ${res.status}`);
      }

      setProgress(80);
      const data = await res.json();
      
      addLog("success", `✓ Upload complete! Health Score: ${data.health_score}`, "dataWorkspace.console.uploadComplete", { score: data.health_score });
      addLog("info", data.message);
      
      if (data.tables_loaded && data.tables_loaded.length > 0) {
          addLog("muted", `Tables loaded: ${data.tables_loaded.join(", ")}`, "dataWorkspace.console.tablesLoaded", { tables: data.tables_loaded.join(", ") });
      }

      addLog("muted", "Fetching degradation log...", "dataWorkspace.console.fetchingLogs");
      const healthRes = await fetch(`${API_URL}/api/v2/data/health`);
      if (healthRes.ok) {
        const healthData = await healthRes.json();
        if (healthData.degradation_log) {
          setDegradations(healthData.degradation_log);
          addLog("success", `✓ Found ${healthData.degradation_log.length} degradation events.`, "dataWorkspace.console.foundEvents", { count: healthData.degradation_log.length });
        } else {
          setDegradations([]);
        }
        if (healthData.sales_preview) {
          setPreviews(healthData.sales_preview);
        } else {
          setPreviews([]);
        }
      }

      setStats({
        tables: data.tables_loaded?.length || 0,
        degradationCount: data.degradation_events || 0,
        missing: data.tables_missing?.length || 0,
      });

      // ── Also trigger V1 ingest to train ML models (Forecast, Margin, Segmentation) ──
      // This enables the /api/v1/report endpoint.
      try {
        addLog("info", "Training ML models (Forecast · Margin · Segmentation)…", "dataWorkspace.console.trainingModels");
        const v1Form = new FormData();
        v1Form.append("file", file);
        const v1Res = await fetch(`${API_URL}/api/v1/ingest`, {
          method: "POST",
          body: v1Form,
        });
        if (v1Res.ok) {
          const v1Data = await v1Res.json();
          addLog("success", `✓ ML models trained — ${v1Data.rows_raw} rows ingested.`, "dataWorkspace.console.modelsTrained", { rows: v1Data.rows_raw });
        } else {
          addLog("muted", "V1 model training skipped (non-critical).", "dataWorkspace.console.v1Skipped");
        }
      } catch {
        addLog("muted", "V1 model training skipped (backend unavailable).", "dataWorkspace.console.v1Unreachable");
      }

      setProgress(100);
      setDropState("complete");
    } catch (err: any) {
      timeouts.forEach(clearTimeout);
      addLog("error", `✗ Upload failed: ${err.message}`, "dataWorkspace.console.uploadFailed", { message: err.message });
      setDropState("error");
      setProgress(0);
    }
  };

  return (
    <div
      className="animate-fade-in"
      style={{
        display:        "flex",
        flexDirection:  "column",
        gap:            24,
        padding:        "28px 32px 40px",
        minHeight:      "100%",
        background:     "var(--p-canvas)",
      }}
    >
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span className="t-eyebrow" style={{ color: "var(--p-ink-tertiary)" }}>
              {t("dataWorkspace.predictoPlatform")}
            </span>
            <ChevronRight size={12} color="var(--p-hairline-tertiary)" />
            <span className="t-eyebrow" style={{ color: "var(--p-primary)" }}>
              {t("dataWorkspace.title")}
            </span>
          </div>
          <p style={{ fontSize: 13, color: "var(--p-ink-subtle)", marginTop: 4, letterSpacing: "-0.05px" }}>
            {t("dataWorkspace.subtitle")}
          </p>
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 4 }}>
          <button className="btn btn-secondary" style={{ fontSize: 13 }}>
            <Filter size={13} />
            {t("dataWorkspace.filter")}
          </button>
          <button
            className="btn btn-primary"
            style={{ fontSize: 13 }}
            onClick={() => alert(t("dataWorkspace.integrationsComing"))}
          >
            <Database size={13} />
            {t("dataWorkspace.integrations")}
          </button>
        </div>
      </div>

      {/* ── TOP HALF — Ingestion Zone ────────────────────────────────────────── */}
      <div
        style={{
          display:             "grid",
          gridTemplateColumns: "1fr 1fr",
          gap:                 20,
          alignItems:          "stretch",
        }}
      >
        {/* Left — Ingest Dropzone */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Zone header */}
          <div className="zone-header" style={{ marginBottom: 0 }}>
            <span className="zone-title">
              <Upload size={12} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
              {t("dataWorkspace.dropzone.title")}
            </span>
            {uploadedFile && (
              <span className="status-pill success">
                <CheckCircle2 size={10} />
                {t("dataWorkspace.dropzone.fileAccepted")}
              </span>
            )}
          </div>

          {/* Drop area */}
          <IngestDropzone 
            dropState={dropState} 
            fileName={uploadedFile?.name || null} 
            progress={progress} 
            onFileSelected={handleFileUpload} 
            onReset={handleReset} 
          />

          {/* Supported formats note */}
          <p style={{ fontSize: 11, color: "var(--p-ink-tertiary)", fontFamily: "var(--font-mono)", letterSpacing: "0.2px" }}>
            {t("dataWorkspace.dropzone.acceptedFormats")}
          </p>
        </div>

        {/* Right — Real-Time Status Feed */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="zone-header" style={{ marginBottom: 0 }}>
            <span className="zone-title">
              <Terminal size={12} style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
              {t("dataWorkspace.console.title")}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            </div>
          </div>

          <TerminalFeed logs={logs} running={dropState === "uploading"} />
        </div>
      </div>

      {/* Divider */}
      <hr className="divider" />

      {/* ── BOTTOM HALF — Tabs ───────────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Summary stat chips */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span className="status-pill">
            <Database size={9} />
            {t("dataWorkspace.stats.tablesCount", { count: stats.tables })}
          </span>
          <span className={`status-pill ${stats.degradationCount > 0 ? "warning" : "success"}`}>
            {stats.degradationCount > 0 ? <AlertTriangle size={9} /> : <CheckCircle2 size={9} />}
            {t("dataWorkspace.stats.degradationCount", { count: stats.degradationCount })}
          </span>
          {stats.missing > 0 && (
            <span className="status-pill danger">
              <XCircle size={9} />
              {t("dataWorkspace.stats.missingCount", { count: stats.missing })}
            </span>
          )}
        </div>

        {/* Tremor TabGroup */}
        <TabGroup
          index={activeTab}
          onIndexChange={setActiveTab}
        >
          <TabList
            style={{
              borderBottom: "1px solid var(--p-hairline)",
              gap: 0,
              marginBottom: 20,
            }}
          >
            <Tab
              style={{
                fontFamily:     "var(--font-body)",
                fontSize:       14,
                fontWeight:     500,
                padding:        "8px 16px",
                color:          activeTab === 0 ? "var(--p-ink)" : "var(--p-ink-tertiary)",
                borderBottom:   activeTab === 0 ? "2px solid var(--p-primary)" : "2px solid transparent",
                transition:     "color 140ms ease, border-color 140ms ease",
                background:     "transparent",
                cursor:         "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={13} />
                {t("dataWorkspace.tabs.degradationLog")}
                <span
                  style={{
                    display:      "inline-flex",
                    alignItems:   "center",
                    justifyContent: "center",
                    minWidth:     18,
                    height:       18,
                    padding:      "0 5px",
                    borderRadius: 9999,
                    background:   activeTab === 0 ? "rgba(229,72,77,0.15)" : "var(--p-surface-2)",
                    color:        activeTab === 0 ? "#f87171" : "var(--p-ink-tertiary)",
                    fontFamily:   "var(--font-mono)",
                    fontSize:     10,
                    fontWeight:   500,
                    letterSpacing: "0",
                  }}
                >
                  {degradations.length}
                </span>
              </div>
            </Tab>

            <Tab
              style={{
                fontFamily:   "var(--font-body)",
                fontSize:     14,
                fontWeight:   500,
                padding:      "8px 16px",
                color:        activeTab === 1 ? "var(--p-ink)" : "var(--p-ink-tertiary)",
                borderBottom: activeTab === 1 ? "2px solid var(--p-primary)" : "2px solid transparent",
                transition:   "color 140ms ease, border-color 140ms ease",
                background:   "transparent",
                cursor:       "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <TableProperties size={13} />
                {t("dataWorkspace.tabs.dataPreview")}
                <span
                  style={{
                    display:       "inline-flex",
                    alignItems:    "center",
                    justifyContent:"center",
                    minWidth:      18,
                    height:        18,
                    padding:       "0 5px",
                    borderRadius:  9999,
                    background:    activeTab === 1 ? "rgba(94,106,210,0.15)" : "var(--p-surface-2)",
                    color:         activeTab === 1 ? "var(--p-primary-hover)" : "var(--p-ink-tertiary)",
                    fontFamily:    "var(--font-mono)",
                    fontSize:      10,
                    fontWeight:    500,
                  }}
                >
                  {previews.length}
                </span>
              </div>
            </Tab>
          </TabList>

          <TabPanels>
            {/* ── Degradation Log tab ── */}
            <TabPanel>
              <Card
                style={{
                  background:    "var(--p-surface-1)",
                  border:        "1px solid var(--p-hairline)",
                  borderRadius:  12,
                  padding:       "20px 0 0",
                  boxShadow:     "inset 0 1px 0 rgba(255,255,255,0.04)",
                  overflow:      "hidden",
                }}
              >
                {/* Card toolbar */}
                <div
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    padding:        "0 20px 16px",
                    borderBottom:   "1px solid var(--p-hairline)",
                  }}
                >
                  <div>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 500, color: "var(--p-ink)", letterSpacing: "-0.1px" }}>
                      {t("dataWorkspace.degradationTable.title")}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--p-ink-tertiary)", marginTop: 2 }}>
                      {t("dataWorkspace.degradationTable.subtitle", { issues: degradations.length, tables: stats.tables })}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: "5px 12px", minHeight: 30 }}>
                      <Filter size={11} />
                      {t("dataWorkspace.filter")}
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 12, padding: "5px 12px", minHeight: 30 }}>
                      <Download size={11} />
                      {t("dataWorkspace.degradationTable.export")}
                    </button>
                  </div>
                </div>

                <DegradationLogTable data={degradations} />
              </Card>
            </TabPanel>

            {/* ── Data Preview tab ── */}
            <TabPanel>
              <Card
                style={{
                  background:   "var(--p-surface-1)",
                  border:       "1px solid var(--p-hairline)",
                  borderRadius: 12,
                  padding:      "20px 0 0",
                  boxShadow:    "inset 0 1px 0 rgba(255,255,255,0.04)",
                  overflow:     "hidden",
                }}
              >
                {/* Card toolbar */}
                <div
                  style={{
                    display:        "flex",
                    alignItems:     "center",
                    justifyContent: "space-between",
                    padding:        "0 20px 16px",
                    borderBottom:   "1px solid var(--p-hairline)",
                  }}
                >
                  <div>
                    <p style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 500, color: "var(--p-ink)", letterSpacing: "-0.1px" }}>
                      {t("dataWorkspace.previewTable.title")}
                    </p>
                    <p style={{ fontSize: 12, color: "var(--p-ink-tertiary)", marginTop: 2 }}>
                      {t("dataWorkspace.previewTable.showingRows", { count: previews.length })}
                    </p>
                  </div>

                </div>

                <div style={{ padding: "16px 20px 0" }}>
                  <DataPreviewTable data={previews} />
                </div>
              </Card>
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </div>
    </div>
  );
};

export default DataWorkspaceView;
