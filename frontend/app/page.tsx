"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { InventoryRequiredChart } from "@/components/InventoryRequiredChart";
import { KpiStatCard } from "@/components/KpiStatCard";
import { PeriodToggle } from "@/components/PeriodToggle";
import { ProcurementForecastChart } from "@/components/ProcurementForecastChart";
import { ProductFilter } from "@/components/ProductFilter";
import { TodoItem } from "@/components/TodoItem";
import { checkApiHealth, fetchInventories, fetchItems, generate52wPlan, getDashboardData } from "@/lib/api";
import type { DashboardResponse, Generate52wResponse, InventoryRecord, Item, MaterialRow, Period } from "@/lib/types";

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dateToISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function periodToHorizonWeeks(period: Period): number {
  if (period === "3M") return 13;
  if (period === "6M") return 26;
  return 52;
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>("3M");
  const [productId, setProductId] = useState<string>("");
  const [initialInventoryInput, setInitialInventoryInput] = useState<string>("100");
  const [initialInventoryTouched, setInitialInventoryTouched] = useState(false);
  const [avgDailyUsageInput, setAvgDailyUsageInput] = useState<string>("10");
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [apiHealth, setApiHealth] = useState<{ ok: boolean; detail: string } | null>(null);
  const [inventories, setInventories] = useState<InventoryRecord[]>([]);
  const [schedule, setSchedule] = useState<Generate52wResponse | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [chartGranularity, setChartGranularity] = useState<"week" | "day">("week");
  const scheduleStartISO = useMemo(() => todayISO(), []);

  const productItems = useMemo(() => allItems.filter((i) => i.type === "PRODUCT"), [allItems]);
  const selectedProduct = useMemo(
    () => productItems.find((p) => String(p.id) === productId) ?? null,
    [productItems, productId]
  );

  const avgDailyUsage = useMemo(() => {
    const n = Number(avgDailyUsageInput);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [avgDailyUsageInput]);

  const initialInventory = useMemo(() => {
    const n = Number(initialInventoryInput);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [initialInventoryInput]);

  const productionQtyForDashboard = useMemo(() => {
    const horizonWeeks = periodToHorizonWeeks(period);
    const horizonDays = horizonWeeks * 7;
    return Math.max(0, avgDailyUsage * horizonDays);
  }, [period, avgDailyUsage]);

  useEffect(() => {
    checkApiHealth().then(setApiHealth);
    fetchItems().then((items) => {
      setAllItems(items);
      const first = items.find((i) => i.type === "PRODUCT");
      if (first) setProductId(String(first.id));
    });
  }, []);

  useEffect(() => {
    if (!productId) return;
    getDashboardData(period, productId, productionQtyForDashboard).then(setData);
  }, [period, productId, productionQtyForDashboard]);

  useEffect(() => {
    fetchInventories()
      .then((inv) => setInventories(inv))
      .catch(() => setInventories([]));
  }, []);

  const currentProductInventory = useMemo(() => {
    if (!selectedProduct) return 0;
    return inventories
      .filter((inv) => inv.item_id === selectedProduct.id)
      .reduce((acc, inv) => acc + Number(inv.qty || 0), 0);
  }, [inventories, selectedProduct]);

  useEffect(() => {
    // 사용자가 초깃값을 직접 수정하지 않았다면, 선택된 제품의 현재 재고 합계를 자동으로 채운다.
    if (initialInventoryTouched) return;
    setInitialInventoryInput(String(currentProductInventory));
  }, [currentProductInventory, initialInventoryTouched]);

  useEffect(() => {
    if (!selectedProduct) return;

    const horizonWeeks = periodToHorizonWeeks(period);
    // 52주 일정 엔진의 forecast_by_week(=주간 수요)는 일평균 예상 사용량(일 단위)을 7로 환산해 넣는다.
    const weekly = avgDailyUsage * 7;
    const forecast_by_week: Record<number, number> = {};
    for (let w = 1; w <= 52; w += 1) forecast_by_week[w] = w <= horizonWeeks ? weekly : 0;

    const safety_stock = Number(selectedProduct.safety_stock_qty ?? 0);
    const production_leadtime_days = Number(selectedProduct.production_leadtime_days ?? 0);
    const material_leadtime_days = Number(selectedProduct.material_leadtime_days ?? 0);
    const production_capa_per_day = selectedProduct.production_capa_per_day ?? null;
    const moq = selectedProduct.moq ?? null;

    setScheduleLoading(true);
    generate52wPlan({
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      start_date: scheduleStartISO,
      current_inventory: initialInventory,
      safety_stock,
      moq,
      production_leadtime_days,
      material_leadtime_days,
      production_capa_per_day,
      forecast_by_week,
    })
      .then((out) => setSchedule(out))
      .catch(() => setSchedule(null))
      .finally(() => setScheduleLoading(false));
  }, [period, selectedProduct, scheduleStartISO, avgDailyUsage, initialInventory]);

  const chartDataWeek = useMemo(() => {
    if (!schedule || !selectedProduct) return [];
    const safetyStock = Number(selectedProduct.safety_stock_qty ?? 0);
    return schedule.plans.map((p) => ({
      week: p.week,
      inventory: p.inventory,
      safetyStock,
    }));
  }, [schedule, selectedProduct]);

  const chartDataDaily = useMemo(() => {
    if (!schedule || !selectedProduct) return [];
    const safetyStock = Number(selectedProduct.safety_stock_qty ?? 0);

    const totalWeeks = schedule.plans.length;
    const totalDays = totalWeeks * 7;
    const base = new Date(`${scheduleStartISO}T00:00:00`);

    // week1에 대해: inventory_end = inventory_start - demand + production
    // => inventory_start = inventory_end + demand - production
    const week1 = schedule.plans[0];
    const inventoryStart = week1.inventory + week1.demand - week1.production;

    return Array.from({ length: totalDays }).map((_, dayOffset) => {
      const weekIndex = Math.floor(dayOffset / 7); // 0-based
      const dayInWeek = dayOffset % 7; // 0..6

      const currentWeek = schedule.plans[weekIndex];
      const prevInventory =
        weekIndex === 0 ? inventoryStart : schedule.plans[weekIndex - 1].inventory;
      const currentInventory = currentWeek.inventory;

      // 일별 선형 보간(대략적인 시각화용)
      const ratio = (dayInWeek + 1) / 7;
      const inventory = prevInventory + (currentInventory - prevInventory) * ratio;

      return {
        date: dateToISO(addDays(base, dayOffset)),
        inventory,
        safetyStock,
      };
    });
  }, [schedule, selectedProduct, scheduleStartISO]);

  const chartData = chartGranularity === "week" ? chartDataWeek : chartDataDaily;

  const orderDateByWeek = useMemo(() => {
    const m = new Map<number, string>();
    if (!schedule) return m;
    for (const t of schedule.todos) {
      if (t.type === "order") m.set(t.week, String(t.date));
    }
    return m;
  }, [schedule]);

  const productionStartDateByWeek = useMemo(() => {
    const m = new Map<number, string>();
    if (!schedule) return m;
    for (const t of schedule.todos) {
      if (t.type === "production_start") m.set(t.week, String(t.date));
    }
    return m;
  }, [schedule]);

  const actionWeeks = useMemo(() => {
    if (!schedule) return [];
    const set = new Set<number>();
    for (const t of schedule.todos) {
      if (t.type === "order" || t.type === "production_start") set.add(t.week);
    }
    return [...set].sort((a, b) => a - b).slice(0, 12);
  }, [schedule]);

  const actionPlanRows = useMemo(() => {
    if (!schedule) return [];
    const set = new Set(actionWeeks);
    return schedule.plans.filter((p) => set.has(p.week)).sort((a, b) => a.week - b.week);
  }, [schedule, actionWeeks]);

  const todoItems = useMemo(() => {
    if (!schedule) return [];
    return schedule.todos
      .filter((t) => t.type === "order" || t.type === "production_start")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 8)
      .map((t) => ({
        title: t.type === "order" ? `원재료 발주: ${t.description}` : `생산 시작: ${t.description}`,
        date: String(t.date),
      }));
  }, [schedule]);

  return (
    <div className="space-y-6 py-4">
      <h1 className="text-4xl font-bold tracking-tight">SCM Dashboard</h1>

      <div className={`rounded-2xl border px-4 py-2 text-xs ${apiHealth?.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
        API Health: {apiHealth?.ok ? "Connected" : `Disconnected (${apiHealth?.detail ?? "checking"})`}
      </div>

      {productItems.length === 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          제품이 없습니다. <Link href="/items" className="font-semibold underline">Products</Link>에서 등록하세요.
        </div>
      ) : null}

      <section className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
        <ProductFilter
          products={productItems.map((p) => ({ id: String(p.id), name: p.name }))}
          value={productId}
          onChange={setProductId}
        />
        <PeriodToggle value={period} onChange={setPeriod} />
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step="any"
            value={initialInventoryInput}
            onChange={(e) => {
              setInitialInventoryTouched(true);
              setInitialInventoryInput(e.target.value);
            }}
            className="h-10 w-36 rounded-xl border border-slate-200 px-3 text-sm"
            placeholder="초기재고"
            aria-label="초기재고"
          />
          <input
            type="number"
            min={0}
            step="any"
            value={avgDailyUsageInput}
            onChange={(e) => setAvgDailyUsageInput(e.target.value)}
            className="h-10 w-44 rounded-xl border border-slate-200 px-3 text-sm"
            placeholder="일평균예상사용량"
            aria-label="일평균예상사용량"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <KpiStatCard
          title="예상 발주비(추정)"
          value={data ? Math.round(data.kpis.estimatedProcurementCost).toLocaleString() : "-"}
          hint="BOM 기반 권장 발주수량 × 단가(백엔드 계산 결과)를 합산한 값입니다."
        />
        <KpiStatCard
          title="리스크 SKU(원재료)"
          value={data?.kpis.totalShortageMaterials ?? "-"}
          tone="danger"
          hint="선택 기간 내 부족 발생(권장 발주량 > 0)한 원재료 SKU 개수입니다."
        />
        <KpiStatCard
          title="기간 총 수요(=생산계획)"
          value={productionQtyForDashboard}
          hint="일평균예상사용량 × 기간 일수(3M/6M/12M)를 계산한 값입니다."
        />
        <KpiStatCard
          title="권장 발주 수량(총)"
          value={data?.kpis.totalRequiredProcurementQty ? data.kpis.totalRequiredProcurementQty.toFixed(2) : "-"}
          tone="warning"
          hint="선택 기간 동안 BOM 전개 후, 현재 재고 대비 부족분을 합산한 권장 발주량입니다."
        />
        <KpiStatCard
          title="소비기한 임박(예정)"
          value={"-"}
          tone="warning"
          hint="MVP에서는 소비기한 기반 경고 기능이 아직 연동되지 않았습니다."
        />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <InventoryRequiredChart rows={((data?.stockVsRequired ?? []) as MaterialRow[])} />
        <ProcurementForecastChart data={data?.forecast ?? []} />
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
          <h2 className="mb-2 text-lg font-semibold">52주 재고 부족 & 발주 시점</h2>
          <p className="mb-3 text-xs text-slate-600">
            여기서 <strong>부족</strong>은 해당 주차 <strong>예상 재고</strong>가 <strong>안전재고</strong> 미만인 경우를 뜻하고,
            <br />
            <strong>발주일</strong>과 <strong>생산 시작일</strong>은 리드타임을 역산한 권장 일정입니다.
          </p>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setChartGranularity("week")}
              className={`rounded-xl border px-3 py-1 text-xs font-medium ${
                chartGranularity === "week" ? "border-stock bg-stock text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              주차(52주)
            </button>
            <button
              type="button"
              onClick={() => setChartGranularity("day")}
              className={`rounded-xl border px-3 py-1 text-xs font-medium ${
                chartGranularity === "day" ? "border-stock bg-stock text-white" : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              일자(52주 펼침)
            </button>
            <span className="text-xs text-slate-500">표는 주차 기준으로 표시됩니다.</span>
          </div>

          {scheduleLoading ? (
            <div className="text-sm text-slate-600">리드타임 기반 52주 계획을 계산하는 중입니다...</div>
          ) : chartData.length === 0 ? (
            <div className="text-sm text-slate-600">계획 데이터가 없습니다. 제품/재고/리드타임을 확인해 주세요.</div>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey={chartGranularity === "week" ? "week" : "date"}
                      interval={
                        chartGranularity === "day"
                          ? Math.max(1, Math.ceil(chartDataDaily.length / 28))
                          : "preserveStartEnd"
                      }
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="inventory" stroke="#16a34a" strokeWidth={2} dot={false} name="재고" />
                    <Line type="monotone" dataKey="safetyStock" stroke="#ef4444" strokeWidth={2} dot={false} name="안전재고" strokeDasharray="6 6" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="px-2 py-2">주차</th>
                      <th className="px-2 py-2 text-right">재고(예상)</th>
                      <th className="px-2 py-2 text-right">안전재고</th>
                      <th className="px-2 py-2">부족</th>
                      <th className="px-2 py-2 text-left">발주일</th>
                      <th className="px-2 py-2 text-left">생산 시작일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {actionPlanRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-2 py-3 text-slate-500">
                          계획 내 발주/생산 시작 일정이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      actionPlanRows.map((p) => (
                        <tr
                          key={p.week}
                          className={`border-b border-slate-100 ${p.shortage_risk ? "bg-red-50/30" : ""}`}
                        >
                          <td className="px-2 py-2 font-medium text-slate-800">{p.week}주</td>
                          <td className="px-2 py-2 text-right">{p.inventory.toFixed(2)}</td>
                          <td className="px-2 py-2 text-right">{chartData[0]?.safetyStock?.toFixed(2) ?? "-"}</td>
                          <td className="px-2 py-2">
                            <span
                              className={`rounded-md px-2 py-1 text-xs font-semibold ${
                                p.shortage_risk ? "bg-shortage text-white" : "bg-safe text-white"
                              }`}
                            >
                              {p.shortage_risk ? "예" : "아니오"}
                            </span>
                          </td>
                          <td className="px-2 py-2">{orderDateByWeek.get(p.week) ?? "-"}</td>
                          <td className="px-2 py-2">{productionStartDateByWeek.get(p.week) ?? "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-soft">
          <h2 className="mb-2 text-lg font-semibold">재고 부족 → 발주/생산 시작 To-Do</h2>
          {scheduleLoading ? (
            <div className="text-sm text-slate-600">일정 데이터를 불러오는 중입니다...</div>
          ) : todoItems.length === 0 ? (
            <div className="text-sm text-slate-600">할 일 일정이 없습니다.</div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-2">
              {todoItems.map((t) => (
                <TodoItem key={`${t.title}-${t.date}`} title={t.title} date={t.date} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
