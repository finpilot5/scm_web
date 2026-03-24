"use client";

import { useEffect, useMemo, useState } from "react";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { fetchBoms, fetchInventories, fetchItems } from "@/lib/api";
import type { BomRecord, InventoryRecord, Item } from "@/lib/types";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-soft outline-none focus:border-stock";

type PlanRow = {
  label: string;
  dayIndex: number;
  demand: number;
  production: number;
  order: number;
  projectedInventory: number;
  demandDate: string;
  productionDate: string;
  orderDate: string;
};

type CalendarTodo = {
  id: string;
  productId: number;
  productName: string;
  type: "order" | "production" | "demand";
  date: string;
  label: string;
  qty: number;
  projectedInventory: number;
};

const FORECAST_TODOS_KEY = "scm_forecast_calendar_todos";
const MONTH_LABELS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"] as const;

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export default function ForecastPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [boms, setBoms] = useState<BomRecord[]>([]);
  const [inventories, setInventories] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string>("");

  const [productId, setProductId] = useState<number>(0);
  const [periodDays, setPeriodDays] = useState<number>(30);
  const [avgDailySales, setAvgDailySales] = useState<number>(10);
  const [trendPct, setTrendPct] = useState<number>(0);
  const [seasonalityPct, setSeasonalityPct] = useState<number>(0);
  const [seasonalityByMonth, setSeasonalityByMonth] = useState<number[]>(
    () => new Array(12).fill(0)
  );
  const [safetyStock, setSafetyStock] = useState<number>(20);
  const [productionLeadDays, setProductionLeadDays] = useState<number>(5);
  const [materialLeadDays, setMaterialLeadDays] = useState<number>(20);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [it, bm, inv] = await Promise.all([fetchItems(), fetchBoms(), fetchInventories()]);
        setItems(it);
        setBoms(bm);
        setInventories(inv);
        const firstProduct = it.find((x) => x.type === "PRODUCT");
        if (firstProduct) setProductId(firstProduct.id);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Forecast 초기 데이터 로딩 실패");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const products = useMemo(() => items.filter((i) => i.type === "PRODUCT"), [items]);
  const raws = useMemo(() => items.filter((i) => i.type === "RAW"), [items]);
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );

  const itemStockMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const inv of inventories) {
      map.set(inv.item_id, (map.get(inv.item_id) ?? 0) + Number(inv.qty || 0));
    }
    return map;
  }, [inventories]);

  const currentProductStock = selectedProduct ? itemStockMap.get(selectedProduct.id) ?? 0 : 0;

  const scheduleRows = useMemo<PlanRow[]>(() => {
    const buckets = Math.max(1, Math.ceil(periodDays / 7));
    const base = new Date();

    // 1) 트렌드/시즌성 반영 수요 계산
    const demandRows: Array<{ span: number; demand: number; demandDate: Date; productionDate: Date; orderDate: Date; label: string; dayIndex: number }> = [];
    for (let i = 0; i < buckets; i += 1) {
      const start = i * 7;
      const end = Math.min(periodDays, start + 7);
      const span = Math.max(1, end - start);
      const demandDate = addDays(base, end);
      const productionDate = addDays(demandDate, -productionLeadDays);
      const orderDate = addDays(productionDate, -materialLeadDays);

      // 트렌드: 구간이 지날수록 누적(장기 방향)
      const trendFactor = Math.pow(1 + trendPct / 100, i);
      // 시즌성: 해당 월의 반복 계수(월별 패턴)
      const monthFactor = 1 + (seasonalityByMonth[demandDate.getMonth()] ?? 0) / 100;
      // 시즌성 전체 보정치(기존 단일 입력)도 유지
      const globalSeasonalityFactor = 1 + seasonalityPct / 100;
      const demand = clampNonNegative(avgDailySales * span * trendFactor * monthFactor * globalSeasonalityFactor);

      demandRows.push({
        span,
        demand,
        demandDate,
        productionDate,
        orderDate,
        label: `W${i + 1}`,
        dayIndex: end,
      });
    }

    const forecastTotal = demandRows.reduce((acc, r) => acc + r.demand, 0);
    const requiredProdTotal = clampNonNegative(forecastTotal - currentProductStock + safetyStock);

    // 2) 생산/재고 시뮬레이션
    const rows: PlanRow[] = [];
    let projectedInventory = currentProductStock;
    let producedAcc = 0;
    for (let i = 0; i < demandRows.length; i += 1) {
      const r = demandRows[i];
      const remaining = demandRows.length - i;
      const production =
        remaining === 1
          ? clampNonNegative(requiredProdTotal - producedAcc)
          : clampNonNegative(requiredProdTotal / Math.max(demandRows.length, 1));
      producedAcc += production;
      projectedInventory = projectedInventory - r.demand + production;
      rows.push({
        label: r.label,
        dayIndex: r.dayIndex,
        demand: Number(r.demand.toFixed(2)),
        production: Number(production.toFixed(2)),
        order: Number(production.toFixed(2)),
        projectedInventory: Number(projectedInventory.toFixed(2)),
        demandDate: toISO(r.demandDate),
        productionDate: toISO(r.productionDate),
        orderDate: toISO(r.orderDate),
      });
    }
    return rows;
  }, [
    periodDays,
    avgDailySales,
    trendPct,
    seasonalityByMonth,
    seasonalityPct,
    currentProductStock,
    safetyStock,
    productionLeadDays,
    materialLeadDays,
  ]);

  const forecastSales = useMemo(
    () => scheduleRows.reduce((acc, r) => acc + r.demand, 0),
    [scheduleRows]
  );
  const requiredProduction = clampNonNegative(forecastSales - currentProductStock + safetyStock);

  const bomForProduct = useMemo(
    () => boms.filter((b) => b.parent_item_id === productId),
    [boms, productId]
  );

  const materialOrders = useMemo(() => {
    return bomForProduct
      .map((b) => {
        const material = raws.find((r) => r.id === b.child_item_id) ?? items.find((r) => r.id === b.child_item_id);
        const required = clampNonNegative(requiredProduction * Number(b.qty_per || 0));
        const stock = itemStockMap.get(b.child_item_id) ?? 0;
        const order = clampNonNegative(required - stock);
        return {
          materialId: b.child_item_id,
          materialName: material ? material.name : `ITEM-${b.child_item_id}`,
          unit: material?.uom ?? "EA",
          required,
          stock,
          order,
        };
      })
      .filter((x) => x.required > 0 || x.order > 0);
  }, [bomForProduct, raws, items, requiredProduction, itemStockMap]);

  const chartData = useMemo(
    () =>
      scheduleRows.map((r) => ({
        label: r.label,
        실제판매: Number(r.demand.toFixed(2)),
        예측판매: Number(r.demand.toFixed(2)),
        재고: Number(r.projectedInventory.toFixed(2)),
      })),
    [scheduleRows]
  );

  const calendarTodos = useMemo<CalendarTodo[]>(() => {
    if (!selectedProduct) return [];
    const rows: CalendarTodo[] = [];
    for (const r of scheduleRows) {
      rows.push({
        id: `${selectedProduct.id}-${r.label}-order`,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        type: "order",
        date: r.orderDate,
        label: `${r.label} 원부자재 발주`,
        qty: r.order,
        projectedInventory: r.projectedInventory,
      });
      rows.push({
        id: `${selectedProduct.id}-${r.label}-prod`,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        type: "production",
        date: r.productionDate,
        label: `${r.label} 생산`,
        qty: r.production,
        projectedInventory: r.projectedInventory,
      });
      rows.push({
        id: `${selectedProduct.id}-${r.label}-demand`,
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        type: "demand",
        date: r.demandDate,
        label: `${r.label} 판매예측`,
        qty: r.demand,
        projectedInventory: r.projectedInventory,
      });
    }
    return rows;
  }, [scheduleRows, selectedProduct]);

  const syncToCalendar = () => {
    if (!selectedProduct) {
      setMessage("상품을 선택한 뒤 캘린더 연동을 진행하세요.");
      return;
    }
    if (typeof window === "undefined") return;
    window.localStorage.setItem(FORECAST_TODOS_KEY, JSON.stringify(calendarTodos));
    setMessage(`캘린더 일정 생성 완료 (${calendarTodos.length}건). Calendar 화면에서 확인하세요.`);
  };

  return (
    <div className="space-y-6 py-4">
      <h1 className="text-3xl font-semibold">Forecast (SCM 계산 모듈)</h1>

      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          초기 데이터를 불러오는 중입니다...
        </div>
      ) : null}

      {message ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {message}
        </div>
      ) : null}

      <div className="rounded-2xl border bg-white p-4 shadow-soft">
        <p className="mb-3 text-xs text-slate-600">
          입력값 설명: 상품/기간/판매패턴(평균·트렌드·시즌성)과 안전재고·리드타임을 기준으로 생산/발주 계획을 계산합니다.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">상품(SKU)</span>
            <select
              className={inputClass}
              value={productId || ""}
              onChange={(e) => setProductId(Number(e.target.value || 0))}
            >
              <option value="">상품 선택</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  [{p.code}] {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">예측 기간</span>
            <select className={inputClass} value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))}>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">최근 일평균 판매량</span>
            <input
              type="number"
              className={inputClass}
              value={avgDailySales}
              onChange={(e) => setAvgDailySales(Number(e.target.value || 0))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">안전재고</span>
            <input
              type="number"
              className={inputClass}
              value={safetyStock}
              onChange={(e) => setSafetyStock(Number(e.target.value || 0))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">트렌드(%)</span>
            <input
              type="number"
              className={inputClass}
              value={trendPct}
              onChange={(e) => setTrendPct(Number(e.target.value || 0))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">시즌성(%)</span>
            <input
              type="number"
              className={inputClass}
              value={seasonalityPct}
              onChange={(e) => setSeasonalityPct(Number(e.target.value || 0))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">생산 리드타임(일)</span>
            <input
              type="number"
              className={inputClass}
              value={productionLeadDays}
              onChange={(e) => setProductionLeadDays(Number(e.target.value || 0))}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-600">원부자재 리드타임(일)</span>
            <input
              type="number"
              className={inputClass}
              value={materialLeadDays}
              onChange={(e) => setMaterialLeadDays(Number(e.target.value || 0))}
            />
          </label>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-soft">
        <p className="mb-2 text-sm font-semibold text-slate-800">트렌드 vs 시즌성</p>
        <div className="grid gap-1 text-xs text-slate-600">
          <p>트렌드: 시간이 지날수록 누적되는 장기 증가/감소(예: 매달 2% 성장).</p>
          <p>시즌성: 특정 월/시점에 반복되는 변동(예: 여름 +10%, 비수기 -5%).</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-6">
          {MONTH_LABELS.map((label, idx) => (
            <label key={label} className="block text-xs">
              <span className="mb-1 block text-slate-600">{label} 시즌성(%)</span>
              <input
                type="number"
                className={inputClass}
                value={seasonalityByMonth[idx] ?? 0}
                onChange={(e) => {
                  const v = Number(e.target.value || 0);
                  setSeasonalityByMonth((prev) => {
                    const next = [...prev];
                    next[idx] = Number.isFinite(v) ? v : 0;
                    return next;
                  });
                }}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={syncToCalendar}
          className="rounded-xl bg-stock px-4 py-2 text-sm font-medium text-white"
        >
          Forecast 결과를 Calendar 일정으로 생성
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-4 shadow-soft">
          <p className="text-xs text-slate-500">예측 판매량</p>
          <p className="text-2xl font-semibold">{forecastSales.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-soft">
          <p className="text-xs text-slate-500">현재 재고</p>
          <p className="text-2xl font-semibold">{currentProductStock.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-soft">
          <p className="text-xs text-slate-500">필요 생산량</p>
          <p className="text-2xl font-semibold">{requiredProduction.toFixed(2)}</p>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-soft">
          <p className="text-xs text-slate-500">원재료 발주 항목 수</p>
          <p className="text-2xl font-semibold">{materialOrders.length}</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-soft">
        <h2 className="mb-3 text-lg font-semibold">재고 시뮬레이션 (실판매/예측/재고)</h2>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="실제판매" stroke="#64748b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="예측판매" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="재고" stroke="#16a34a" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-soft">
        <h2 className="mb-3 text-lg font-semibold">원부자재 발주 계산 (BOM)</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-2 text-left">원부자재</th>
              <th className="p-2 text-right">필요량</th>
              <th className="p-2 text-right">현재 재고</th>
              <th className="p-2 text-right">권장 발주량</th>
              <th className="p-2 text-left">단위</th>
            </tr>
          </thead>
          <tbody>
            {materialOrders.map((m) => (
              <tr key={m.materialId} className="border-t">
                <td className="p-2">{m.materialName}</td>
                <td className="p-2 text-right">{m.required.toFixed(2)}</td>
                <td className="p-2 text-right">{m.stock.toFixed(2)}</td>
                <td className="p-2 text-right">{m.order.toFixed(2)}</td>
                <td className="p-2">{m.unit}</td>
              </tr>
            ))}
            {materialOrders.length === 0 ? (
              <tr className="border-t">
                <td className="p-3 text-slate-500" colSpan={5}>
                  BOM이 없거나 필요 생산량이 0입니다.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-soft">
        <h2 className="mb-3 text-lg font-semibold">일정/계획 테이블</h2>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="p-2 text-left">구간</th>
              <th className="p-2 text-right">판매예측</th>
              <th className="p-2 text-right">재고(예상)</th>
              <th className="p-2 text-right">생산</th>
              <th className="p-2 text-right">발주</th>
              <th className="p-2 text-left">발주일</th>
              <th className="p-2 text-left">생산일</th>
              <th className="p-2 text-left">판매기준일</th>
            </tr>
          </thead>
          <tbody>
            {scheduleRows.map((r) => (
              <tr key={r.label} className="border-t">
                <td className="p-2">{r.label}</td>
                <td className="p-2 text-right">{r.demand.toFixed(2)}</td>
                <td className="p-2 text-right">{r.projectedInventory.toFixed(2)}</td>
                <td className="p-2 text-right">{r.production.toFixed(2)}</td>
                <td className="p-2 text-right">{r.order.toFixed(2)}</td>
                <td className="p-2">{r.orderDate}</td>
                <td className="p-2">{r.productionDate}</td>
                <td className="p-2">{r.demandDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
