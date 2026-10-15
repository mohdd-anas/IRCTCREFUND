"use client";

import { useState, useRef, useEffect } from "react";

interface PnrInputProps {
  onSubmit: (pnr: string) => void;
  isLoading: boolean;
}

export default function PnrInput({ onSubmit, isLoading }: PnrInputProps) {
  const [pnr, setPnr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip non-digits, cap at 10
    const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPnr(digits);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pnr.length === 10 && !isLoading) {
      onSubmit(pnr);
    }
  };

  return (
    <div className="ticket-stub">
      <h1>Calculate your train ticket refund</h1>
      <p className="subtitle">
        Enter your 10-digit PNR and get an estimated refund based on your ticket
        details.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="pnr-field">
          <label htmlFor="pnr-input">PNR number</label>
          <div className="pnr-input-wrap">
            <input
              ref={inputRef}
              id="pnr-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              className="pnr-input"
              placeholder="0000000000"
              value={pnr}
              onChange={handleChange}
              maxLength={10}
              aria-describedby="pnr-hint"
              disabled={isLoading}
            />
            <span className="pnr-char-count" aria-hidden="true">
              {pnr.length}/10
            </span>
          </div>
          <span id="pnr-hint" className="sr-only">
            Enter 10 digits from your railway ticket
          </span>
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={pnr.length !== 10 || isLoading}
        >
          {isLoading ? "Checking…" : "Check refund"}
        </button>
      </form>

      <p className="disclaimer">
        Independent service. Not affiliated with IRCTC or Indian Railways.
        Refund amounts are estimates; actual refunds are determined by the
        applicable railway rules and ticketing system.
      </p>
    </div>
  );
}
