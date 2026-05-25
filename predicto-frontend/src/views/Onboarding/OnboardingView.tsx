/**
 * OnboardingView.tsx
 * Welcome screen shown on first visit (no username in localStorage).
 * Asks the user for their name and saves it before proceeding.
 */

import React, { useState } from "react";

interface OnboardingViewProps {
  onComplete: (name: string) => void;
}

const OnboardingView: React.FC<OnboardingViewProps> = ({ onComplete }) => {
  const [name, setName] = useState("");
  const [shake, setShake] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      return;
    }
    onComplete(trimmed);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(ellipse 70% 50% at 50% 40%, rgba(94,106,210,0.12) 0%, transparent 70%), linear-gradient(170deg, #0a0c1a 0%, #050710 50%, #020308 100%)",
      }}
    >
      {/* Card */}
      <div
        style={{
          width: 420,
          maxWidth: "92vw",
          background: "rgba(15,16,22,0.85)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 18,
          padding: "40px 36px 36px",
          backdropFilter: "blur(30px)",
          boxShadow:
            "0 0 60px rgba(94,106,210,0.08), 0 24px 48px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 0,
          animation: "fade-in 0.5s ease-out",
        }}
      >
        {/* Logo */}
        <img
          src="/predicto-logo.png"
          alt="Predicto"
          style={{
            height: 42,
            marginBottom: 20,
            filter: "drop-shadow(0 0 12px rgba(94,106,210,0.25))",
          }}
        />

        {/* Heading */}
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 600,
            color: "#e8eaed",
            letterSpacing: "-0.4px",
            margin: 0,
            marginBottom: 6,
          }}
        >
          Welcome to Predicto
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "rgba(160,165,185,0.7)",
            margin: 0,
            marginBottom: 28,
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          Personalize your intelligence workspace to begin.
        </p>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}
        >
          <div>
            <label
              htmlFor="onboarding-name"
              style={{
                display: "block",
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "1.2px",
                textTransform: "uppercase",
                color: "rgba(160,165,185,0.5)",
                marginBottom: 7,
              }}
            >
              What should we call you?
            </label>
            <input
              id="onboarding-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name or organization"
              autoFocus
              autoComplete="off"
              style={{
                width: "100%",
                padding: "11px 14px",
                background: "rgba(255,255,255,0.03)",
                border: shake
                  ? "1px solid rgba(229,72,77,0.5)"
                  : "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10,
                color: "#e8eaed",
                fontSize: 14,
                fontFamily: "var(--font-body)",
                outline: "none",
                transition: "border-color 200ms, box-shadow 200ms",
                boxSizing: "border-box",
                animation: shake ? "shake 0.4s ease-in-out" : "none",
              }}
              onFocus={(e) => {
                if (!shake) {
                  e.currentTarget.style.borderColor = "rgba(94,106,210,0.4)";
                  e.currentTarget.style.boxShadow =
                    "0 0 0 3px rgba(94,106,210,0.08)";
                }
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "12px 0",
              background:
                "linear-gradient(135deg, #5e6ad2 0%, #7c8cf5 100%)",
              border: "none",
              borderRadius: 10,
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "var(--font-body)",
              cursor: "pointer",
              transition: "transform 100ms, box-shadow 200ms",
              boxShadow: "0 4px 20px rgba(94,106,210,0.25)",
              letterSpacing: "-0.2px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
              e.currentTarget.style.boxShadow =
                "0 6px 28px rgba(94,106,210,0.35)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow =
                "0 4px 20px rgba(94,106,210,0.25)";
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = "translateY(0) scale(0.98)";
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = "translateY(-1px)";
            }}
          >
            Get Started →
          </button>
        </form>
      </div>

      {/* Shake animation keyframes */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-6px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(4px); }
        }
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default OnboardingView;
