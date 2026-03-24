"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { fetchItems, generate52wPlan } from "@/lib/api";
import type { Generate52wResponse, Item } from "@/lib/types";

type DayMetrics = {
  stock: number;
  plannedOrder: number;
  actualOrder: number;
  replenishment: number;
};

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-soft outline-none focus:border-stock";

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonthLabel(date: Date): string {
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function toISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDayKey(date: Date): string {
  return toISODate(date);
}

function buildMonthGrid(anchorMonth: Date): Date[] {
  const first = startOfMonth(anchorMonth);
  const firstWeekday = first.getDay(); // 0:Sun ... 6:Sat
  const gridStart = addDays(first, -firstWeekday);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i += 1) {
    cells.push(addDays(gridStart, i));
  }
  return cells;
}

function weekRowDate(startDate: string, week: number): Date {
  return addDays(new Date(startDate), (week - 1) * 7);
}

export default function CalendarPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [monthDate, setMonthDate] = useState<Date>(startOfMonth(new Date()));
  const [startDate, setStartDate] = useState<string>(toISODate(new Date()));
  const [message, setMessage] = useState<string>("");
  const [result, setResult] = useState<Generate52wResponse | null>(null);

  const products = useMemo(() => items.filter((i) => i.type === "PRODUCT"), [items]);
  const monthGrid = useMemo(() => buildMonthGrid(monthDate), [monthDate]);

  const dayMetricsMap = useMemo(() => {
    const out = new Map<string, DayMetrics>();
    if (!result) return out;
    for (const row of result.plans) {
      const d = weekRowDate(startDate, row.week);
      const k = toDayKey(d);
      out.set(k, {
        stock: Number(row.inventory || 0),
        plannedOrder: Number(row.production || 0),
        actualOrder: 0, // 실발주 API 연동 전까지 0으로 표시
        replenishment: Number(row.production || 0),
      });
    }
    return out;
  }, [result, startDate]);

  useEffect(() => {
    fetchItems()
      .then((list) => setItems(list))
      .catch(() => {
        // 로그인/네트워크 실패는 생성 시 메시지로 안내
      });
  }, []);

  const moveMonth = (delta: number) => {
    setMonthDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const onGenerate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const productId = Number(fd.get("product_id") || 0);
    const currentInventory = Number(fd.get("current_inventory") || 0);
    const targetStock = Number(fd.get("target_stock") || 0);
    const weeklyForecast = Number(fd.get("weekly_forecast") || 0);
    const capaRaw = String(fd.get("production_capa_per_day") || "").trim();
    const productionCapaPerDay = capaRaw === "" ? null : Number(capaRaw);

    if (!productId) {
      setMessage("제품을 선택하세요.");
      return;
    }
    const product = products.find((p) => p.id === productId);
    if (!product) {
      setMessage("선택한 제품 정보를 찾을 수 없습니다.");
      return;
    }

    const forecastByWeek: Record<number, number> = {};
    for (let w = 1; w <= 52; w += 1) forecastByWeek[w] = weeklyForecast;

    try {
      const out = await generate52wPlan({
        product_id: productId,
        product_name: product.name,
        start_date: startDate,
        current_inventory: currentInventory,
        safety_stock: targetStock,
        moq: null,
        production_leadtime_days: 5,
        material_leadtime_days: 0,
        production_capa_per_day: productionCapaPerDay,
        forecast_by_week: forecastByWeek,
      });
      setResult(out);
      setMessage("월간 캘린더 데이터 생성 완료");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "캘린더 생성 실패");
    }
  };

  return (
    <div className="space-y-6 py-4">
      <h1 className="text-3xl font-semibold">월간 SCM 캘린더</h1>

      <form onSubmit={onGenerate} className="grid gap-3 rounded-2xl border bg-white p-4 shadow-soft md:grid-cols-6">
        <select name="product_id" className={inputClass} defaultValue="" required>
          <option value="" disabled>
            제품 선택
          </option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input type="date" className={inputClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input name="current_inventory" type="number" className={inputClass} placeholder="현재 재고" defaultValue={100} />
        <input name="target_stock" type="number" className={inputClass} placeholder="목표 재고" defaultValue={50} />
        <input name="weekly_forecast" type="number" className={inputClass} placeholder="주간 수요예측" defaultValue={80} />
        <div className="flex gap-2">
          <input name="production_capa_per_day" type="number" className={inputClass} placeholder="일 CAPA" defaultValue={300} />
          <button type="submit" className="rounded-xl bg-stock px-4 py-2 text-white whitespace-nowrap">
            생성
          </button>
        </div>
      </form>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}

      <div className="rounded-2xl border bg-white p-4 shadow-soft">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-lg border px-3 py-1 text-sm text-slate-700" onClick={() => moveMonth(-1)}>
              이전
            </button>
            <button type="button" className="rounded-lg border px-3 py-1 text-sm text-slate-700" onClick={() => moveMonth(1)}>
              다음
            </button>
          </div>
          <p className="text-xl font-semibold">{formatMonthLabel(monthDate)}</p>
          <div className="text-xs text-slate-500">수치 단위: EA</div>
        </div>

        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-semibold text-slate-600">
          <div className="py-2 text-rose-500">Sun</div>
          <div className="py-2">Mon</div>
          <div className="py-2">Tue</div>
          <div className="py-2">Wed</div>
          <div className="py-2">Thu</div>
          <div className="py-2">Fri</div>
          <div className="py-2 text-blue-500">Sat</div>
        </div>

        <div className="grid grid-cols-7">
          {monthGrid.map((d) => {
            const inCurrentMonth = d.getMonth() === monthDate.getMonth();
            const key = toDayKey(d);
            const metrics = dayMetricsMap.get(key);
            return (
              <div
                key={key}
                className={`min-h-[130px] border-b border-r border-slate-200 p-2 ${
                  inCurrentMonth ? "bg-white" : "bg-slate-50 text-slate-400"
                }`}
              >
                <div className="mb-2 text-sm font-semibold">{d.getDate()}</div>
                <div className="space-y-1 text-[11px] leading-4">
                  <div>재고: {metrics ? metrics.stock : "-"}</div>
                  <div>계획 발주량: {metrics ? metrics.plannedOrder : "-"}</div>
                  <div>실제 발주량: {metrics ? metrics.actualOrder : "-"}</div>
                  <div>재고 보충량: {metrics ? metrics.replenishment : "-"}</div>
                </div>
              </div>
            );
          })}
        </div>

        {!result ? (
          <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            생성 버튼을 누르면 월간 캘린더에 수치가 채워집니다.
          </div>
        ) : null}

        {result ? (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            현재 <strong>실제 발주량</strong>은 실적 API 연동 전까지 0으로 표시됩니다.
            추후 발주 실적 데이터와 연결하면 자동 반영됩니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}
