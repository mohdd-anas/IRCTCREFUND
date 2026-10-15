"use client";

import { useState } from "react";
import PnrInput from "./components/PnrInput";
import RefundResultView from "./components/RefundResult";
import type { CanonicalPnr, RefundResult } from "./lib/types";

type AppState =
  | { step: "input" }
  | { step: "loading" }
  | { step: "result"; pnrData: CanonicalPnr; result: RefundResult }
  | { step: "error"; message: string };

export default function Home() {
  const [state, setState] = useState<AppState>({ step: "input" });

  const handleSubmit = async (pnr: string) => {
    setState({ step: "loading" });

    try {
      // Step 1: Lookup PNR
      const lookupRes = await fetch("/api/pnr/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pnr }),
      });

      if (!lookupRes.ok) {
        const data = await lookupRes.json().catch(() => null);
        throw new Error(
          data?.error ??
            "We couldn't find a ticket with this PNR. Please double-check the number and try again."
        );
      }

      const { pnrData } = await lookupRes.json();

      // Step 2: Calculate refund
      const calcRes = await fetch("/api/refund/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pnrData,
          calculationTime: new Date().toISOString(),
        }),
      });

      if (!calcRes.ok) {
        const data = await calcRes.json().catch(() => null);
        throw new Error(
          data?.error ??
            "Something went wrong while calculating your refund. Please try again."
        );
      }

      const { result } = await calcRes.json();
      setState({ step: "result", pnrData, result });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      setState({ step: "error", message });
    }
  };

  const handleReset = () => {
    setState({ step: "input" });
  };

  return (
    <>
      {/* Input state */}
      {(state.step === "input" || state.step === "loading") && (
        <PnrInput
          onSubmit={handleSubmit}
          isLoading={state.step === "loading"}
        />
      )}

      {/* Loading state */}
      {state.step === "loading" && (
        <div className="loading-text" aria-live="polite" role="status">
          Fetching journey details…
        </div>
      )}

      {/* Result state */}
      {state.step === "result" && (
        <RefundResultView
          pnrData={state.pnrData}
          result={state.result}
          onReset={handleReset}
        />
      )}

      {/* Error state */}
      {state.step === "error" && (
        <div className="error-card" role="alert">
          <p className="error-text">{state.message}</p>
          <button className="btn-primary" onClick={handleReset}>
            Try again
          </button>
        </div>
      )}
    </>
  );
}
