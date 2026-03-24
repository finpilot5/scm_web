"use client";

import { useState } from "react";

export default function SimulationPage() {
  const [multiplierInput, setMultiplierInput] = useState("1.2");
  const [safetyAdjInput, setSafetyAdjInput] = useState("30");
  const [result, setResult] = useState<string>("");
  const multiplier = Number(multiplierInput || 0);
  const safetyAdj = Number(safetyAdjInput || 0);

  return (
    <div className="space-y-6 py-4">
      <h1 className="text-3xl font-semibold">Scenario Simulation</h1>
      <div className="rounded-2xl border bg-white p-4 shadow-soft">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">Forecast multiplier
            <input type="number" step="0.1" value={multiplierInput} onChange={(e) => setMultiplierInput(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3" />
          </label>
          <label className="text-sm">Safety stock adjustment
            <input type="number" value={safetyAdjInput} onChange={(e) => setSafetyAdjInput(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-slate-200 px-3" />
          </label>
        </div>
        <button onClick={() => setResult(`시뮬레이션 실행 완료 (multiplier=${multiplier}, safety=+${safetyAdj})`)} className="mt-4 rounded-xl bg-stock px-4 py-2 text-white">Run simulation</button>
        {result ? <p className="mt-3 text-sm text-slate-700">{result}</p> : null}
      </div>
    </div>
  );
}
