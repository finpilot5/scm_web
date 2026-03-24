"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { fetchItems, generate52wPlan } from "@/lib/api";
import type { Generate52wResponse, Item } from "@/lib/types";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-soft outline-none focus:border-stock";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export default function PlanPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [result, setResult] = useState<Generate52wResponse | null>(null);
  const [message, setMessage] = useState<string>("");

  const products = useMemo(() => items.filter((i) => i.type === "PRODUCT"), [items]);

  useEffect(() => {
    fetchItems()
      .then((list) => setItems(list))
      .catch(() => {
        // 인증/네트워크 오류는 submit 시 메시지로 안내
      });
  }, []);

  async function ensureItemsLoaded() {
    if (items.length > 0) return;
    setItems(await fetchItems());
  }

  const onGenerate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setMessage("");
    await ensureItemsLoaded();
    const fd = new FormData(e.currentTarget);
    const product_id = Number(fd.get("product_id"));
    const start_date = String(fd.get("start_date") || todayISO());
    const current_inventory = Number(fd.get("current_inventory") || 0);
    const safety_stock = Number(fd.get("safety_stock") || 0);
    const production_leadtime_days = Number(fd.get("production_leadtime_days") || 0);
    const capaRaw = String(fd.get("production_capa_per_day") || "").trim();
    const production_capa_per_day = capaRaw === "" ? null : Number(capaRaw);
    const weekly = Number(fd.get("weekly_forecast") || 0);

    const p = products.find((x) => x.id === product_id);
    if (!p) {
      setMessage("제품을 선택하세요.");
      return;
    }

    const forecast_by_week: Record<number, number> = {};
    for (let w = 1; w <= 52; w += 1) forecast_by_week[w] = weekly;

    try {
      const out = await generate52wPlan({
        product_id,
        product_name: p.name,
        start_date,
        current_inventory,
        safety_stock,
        moq: null,
        production_leadtime_days,
        material_leadtime_days: 0,
        production_capa_per_day,
        forecast_by_week,
      });
      setResult(out);
      setMessage(`52주 계획 생성 완료 (${out.plans.length}주)`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "계획 생성 실패");
    }
  };

  return (
    <div className="space-y-6 py-4">
      <h1 className="text-3xl font-semibold">52주 SCM 계획</h1>
      <form onSubmit={onGenerate} className="grid gap-3 rounded-2xl border bg-white p-4 shadow-soft md:grid-cols-4">
        <select name="product_id" className={inputClass} required onFocus={ensureItemsLoaded} defaultValue="">
          <option value="" disabled>
            제품 선택
          </option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input name="start_date" type="date" className={inputClass} defaultValue={todayISO()} />
        <input name="current_inventory" type="number" className={inputClass} placeholder="현재 재고" defaultValue={100} />
        <input name="safety_stock" type="number" className={inputClass} placeholder="목표 재고" defaultValue={50} />
        <input name="production_leadtime_days" type="number" className={inputClass} placeholder="생산 리드타임(일)" defaultValue={5} />
        <input name="production_capa_per_day" type="number" className={inputClass} placeholder="일 생산 CAPA" defaultValue={300} />
        <input name="weekly_forecast" type="number" className={inputClass} placeholder="주간 수요예측" defaultValue={80} />
        <button type="submit" className="rounded-xl bg-stock px-4 py-2 text-white">
          생성
        </button>
      </form>
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
        {result ? (
          <>
            <table className="min-w-[1800px] text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 p-2 text-left">
                    항목
                  </th>
                  {result.plans.map((p) => (
                    <th key={p.week} className="border-b border-slate-200 p-2 text-center">
                      {p.week}주
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <th className="sticky left-0 z-10 bg-white p-2 text-left font-medium">재고</th>
                  {result.plans.map((p) => (
                    <td key={`inv-${p.week}`} className="p-2 text-center">
                      {p.inventory}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <th className="sticky left-0 z-10 bg-white p-2 text-left font-medium">
                    예상 사용량
                  </th>
                  {result.plans.map((p) => (
                    <td key={`forecast-${p.week}`} className="p-2 text-center">
                      {p.demand}
                    </td>
                  ))}
                </tr>
                <tr className="border-b border-slate-100">
                  <th className="sticky left-0 z-10 bg-white p-2 text-left font-medium">
                    실제 사용량
                  </th>
                  {result.plans.map((p) => (
                    <td key={`actual-${p.week}`} className="p-2 text-center text-slate-500">
                      {p.demand}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="sticky left-0 z-10 bg-white p-2 text-left font-medium">
                    생산필요량
                  </th>
                  {result.plans.map((p) => (
                    <td key={`prod-${p.week}`} className="p-2 text-center">
                      {p.production}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-3 text-xs text-slate-500">
              실제 사용량은 현재 실적 데이터 연동 전까지 예상 사용량과 동일하게 표시됩니다.
            </p>
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
            조건 입력 후 <strong>생성</strong>을 누르면 52주 매트릭스 결과가 표시됩니다.
          </div>
        )}
      </div>
    </div>
  );
}
