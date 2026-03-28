import { buildMockDashboard } from "./mock-data";
import {
  BomRecord,
  CalculateResponse,
  DashboardResponse,
  ExcelImportResult,
  Generate52wResponse,
  InventoryRecord,
  Item,
  ItemCreatePayload,
  Period,
  ProductionPlanRecord,
  StockTransactionRecord,
  Warehouse,
} from "./types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

function networkErrorMessage(): string {
  return `API 서버 연결에 실패했습니다. Vercel 환경 변수 NEXT_PUBLIC_API_URL에 공개 백엔드(https://...)를 설정했는지 확인하세요.`;
}

function buildRequestInitWithAuth(init?: RequestInit): RequestInit | undefined {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem("scm_token") : null;
  if (!token) return init;
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return { ...(init ?? {}), headers };
}

function buildRequestInitWithoutAuth(init?: RequestInit): RequestInit | undefined {
  if (!init) return init;
  const headers = new Headers(init.headers ?? {});
  headers.delete("Authorization");
  return { ...init, headers };
}

function canAutoAuth(): boolean {
  return typeof window !== "undefined";
}

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  role?: string;
}): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        name: input.name,
        role: input.role ?? "ADMIN",
      }),
    });
  } catch {
    throw new Error(networkErrorMessage());
  }
  if (!res.ok) {
    throw new Error(await parseError(res));
  }
}

async function registerGuestIfNeeded(email: string, password: string): Promise<void> {
  try {
    await registerUser({
      email,
      password,
      name: "Guest Admin",
      role: "ADMIN",
    });
  } catch {
    // 네트워크 실패는 상위 로그인 시도에서 처리
  }
}

async function tryAutoLoginGuest(): Promise<boolean> {
  if (!canAutoAuth()) return false;
  const host = window.location.host.replace(/[^a-zA-Z0-9]/g, "_");
  // pydantic EmailStr 검증에서 special-use 도메인(.local 등)이 거부될 수 있어 .com 사용
  const email = `guest_${host}@scm-demo.com`;
  const password = "scm-guest-1234";
  try {
    await registerGuestIfNeeded(email, password);
    await loginAndStoreToken(email, password);
    return true;
  } catch {
    return false;
  }
}

async function isAuthErrorResponse(res: Response): Promise<boolean> {
  if (res.status === 401 || res.status === 403) return true;
  try {
    const t = (await res.clone().text()).toLowerCase();
    return (
      t.includes("not authenticated") ||
      t.includes("invalid token") ||
      t.includes("유효하지 않은 토큰")
    );
  } catch {
    return false;
  }
}

async function apiFetch(input: string, init?: RequestInit, retried = false): Promise<Response> {
  try {
    const res = await fetch(input, buildRequestInitWithAuth(init));
    const authError = await isAuthErrorResponse(res);
    if (authError && !retried) {
      const authed = await tryAutoLoginGuest();
      if (authed) {
        const retryRes = await apiFetch(input, init, true);
        if (!(await isAuthErrorResponse(retryRes))) {
          return retryRes;
        }
      }
      // 일부 배포에서는 토큰/인증 방식 차이로 막히므로 무토큰으로 1회 재시도
      return fetch(input, buildRequestInitWithoutAuth(init));
    }
    return res;
  } catch {
    throw new Error(networkErrorMessage());
  }
}

export async function checkApiHealth(): Promise<{ ok: boolean; detail: string }> {
  try {
    // 루트(/)가 404인 배포가 있어서 실제 사용 엔드포인트(/api/items) 기준으로 체크
    const res = await fetch(`${API_BASE_URL}/api/items`, { cache: "no-store" });
    if (res.status === 401 || res.status === 403) {
      return { ok: true, detail: `인증 필요 (${res.status})` };
    }
    if (!res.ok) {
      return { ok: false, detail: `HTTP ${res.status} (/api/items)` };
    }
    return { ok: true, detail: "OK" };
  } catch {
    return { ok: false, detail: networkErrorMessage() };
  }
}

type LoginResponse = {
  access_token: string;
  token_type: string;
};

type MeResponse = {
  id: number;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
};

export async function loginAndStoreToken(email: string, password: string): Promise<void> {
  const form = new URLSearchParams({
    username: email,
    password,
  });
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch {
    throw new Error(networkErrorMessage());
  }
  if (!res.ok) {
    throw new Error("로그인에 실패했습니다. 계정 정보를 확인하세요.");
  }
  const data = (await res.json()) as LoginResponse;
  if (typeof window !== "undefined") {
    window.localStorage.setItem("scm_token", data.access_token);
  }
}

export async function fetchMe(): Promise<MeResponse> {
  const res = await apiFetch(`${API_BASE_URL}/api/auth/me`, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as MeResponse;
}

export function clearStoredToken(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem("scm_token");
  }
}

export function hasStoredToken(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.localStorage.getItem("scm_token"));
}

export async function getDashboardData(
  period: Period,
  productId: string,
  productionQty: number
): Promise<DashboardResponse> {
  try {
    const params = new URLSearchParams({
      period,
      product_id: productId,
      production_qty: String(productionQty),
    });
    const res = await apiFetch(`${API_BASE_URL}/api/dashboard?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Dashboard API error: ${res.status}`);
    }
    const raw = (await res.json()) as {
      period: Period;
      product_id: string;
      kpis: {
        total_shortage_materials: number;
        total_required_procurement_qty: number;
        estimated_procurement_cost: number;
        most_critical_material: string;
      };
      stock_vs_required: Array<{
        material_id: string;
        material_name: string;
        current_stock: number;
        required_qty: number;
        shortage_qty: number;
        suggested_order_qty: number;
        unit: string;
      }>;
      forecast: Array<{ month: string; m3: number; m6: number; m12: number }>;
    };

    return {
      period: raw.period,
      productId: raw.product_id,
      kpis: {
        totalShortageMaterials: raw.kpis.total_shortage_materials,
        totalRequiredProcurementQty: raw.kpis.total_required_procurement_qty,
        estimatedProcurementCost: raw.kpis.estimated_procurement_cost,
        mostCriticalMaterial: raw.kpis.most_critical_material,
      },
      stockVsRequired: raw.stock_vs_required.map((row) => ({
        materialId: row.material_id,
        materialName: row.material_name,
        currentStock: row.current_stock,
        requiredQty: row.required_qty,
        shortageQty: row.shortage_qty,
        suggestedOrderQty: row.suggested_order_qty,
        unit: row.unit,
      })),
      forecast: raw.forecast,
    };
  } catch {
    return buildMockDashboard(period, productId);
  }
}

export async function fetchItems(): Promise<Item[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/items`, { cache: "no-store" });
  if (!res.ok) throw new Error("품목 목록을 가져오지 못했습니다.");
  return (await res.json()) as Item[];
}

async function parseError(res: Response): Promise<string> {
  const t = await res.text();
  try {
    const j = JSON.parse(t) as { detail?: unknown };
    if (typeof j.detail === "string") {
      const detailLower = j.detail.toLowerCase();
      if (
        detailLower.includes("forbidden") ||
        j.detail.includes("접근할 권한이 없습니다")
      ) {
        return "접근 오류가 발생했습니다. Settings에서 다시 로그인 후 재시도해 주세요.";
      }
      if (
        detailLower.includes("not authenticated") ||
        detailLower.includes("invalid token") ||
        j.detail.includes("유효하지 않은 토큰")
      ) {
        if (typeof window !== "undefined") {
          window.localStorage.removeItem("scm_token");
        }
        return "인증 토큰이 없거나 만료되었습니다. Settings에서 로그인하거나 잠시 후 다시 시도해 주세요.";
      }
      return j.detail;
    }
    if (Array.isArray(j.detail)) return JSON.stringify(j.detail);
  } catch {
    /* ignore */
  }
  return t || `HTTP ${res.status}`;
}

export async function createItem(payload: ItemCreatePayload): Promise<Item> {
  const res = await apiFetch(`${API_BASE_URL}/api/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: payload.code,
      name: payload.name,
      type: payload.type,
      uom: payload.uom,
      unit_price: payload.unit_price ?? null,
      safety_stock_qty: payload.safety_stock_qty ?? 0,
      moq: payload.moq ?? null,
      lead_time_days: payload.lead_time_days ?? 0,
      production_leadtime_days: payload.production_leadtime_days ?? null,
      material_leadtime_days: payload.material_leadtime_days ?? null,
      production_capa_per_day: payload.production_capa_per_day ?? null,
      shelf_life_days: payload.shelf_life_days ?? null,
      is_active: payload.is_active ?? true,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Item;
}

export async function deleteItem(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/items/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchWarehouses(): Promise<Warehouse[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/warehouses`, { cache: "no-store" });
  if (!res.ok) throw new Error("창고 목록을 가져오지 못했습니다.");
  return (await res.json()) as Warehouse[];
}

export async function createWarehouse(input: {
  code: string;
  name: string;
  warehouse_type?: string | null;
}): Promise<Warehouse> {
  const res = await apiFetch(`${API_BASE_URL}/api/warehouses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Warehouse;
}

export async function deleteWarehouse(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/warehouses/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchBoms(): Promise<BomRecord[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/boms`, { cache: "no-store" });
  if (!res.ok) throw new Error("BOM 목록을 가져오지 못했습니다.");
  return (await res.json()) as BomRecord[];
}

export async function createBom(input: {
  parent_item_id: number;
  child_item_id: number;
  qty_per: number;
  valid_from?: number | null;
  valid_to?: number | null;
}): Promise<BomRecord> {
  const res = await apiFetch(`${API_BASE_URL}/api/boms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      parent_item_id: input.parent_item_id,
      child_item_id: input.child_item_id,
      qty_per: input.qty_per,
      valid_from: input.valid_from ?? null,
      valid_to: input.valid_to ?? null,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as BomRecord;
}

export async function deleteBom(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/boms/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function fetchInventories(): Promise<InventoryRecord[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/inventories`, { cache: "no-store" });
  if (!res.ok) throw new Error("재고 목록을 가져오지 못했습니다.");
  return (await res.json()) as InventoryRecord[];
}

export async function createInventory(input: {
  item_id: number;
  warehouse_id: number;
  qty: number;
  as_of_date: string;
  lot_no?: string | null;
  expiry_date?: string | null;
}): Promise<InventoryRecord> {
  const res = await apiFetch(`${API_BASE_URL}/api/inventories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as InventoryRecord;
}

export async function fetchProductionPlans(): Promise<ProductionPlanRecord[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/production-plans`, { cache: "no-store" });
  if (!res.ok) throw new Error("생산계획을 가져오지 못했습니다.");
  return (await res.json()) as ProductionPlanRecord[];
}

export async function createProductionPlan(input: {
  item_id: number;
  period_start: string;
  period_end: string;
  quantity: number;
  status?: string;
  version?: string | null;
}): Promise<ProductionPlanRecord> {
  const res = await apiFetch(`${API_BASE_URL}/api/production-plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_id: input.item_id,
      period_start: input.period_start,
      period_end: input.period_end,
      quantity: input.quantity,
      status: input.status ?? "DRAFT",
      version: input.version ?? null,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as ProductionPlanRecord;
}

export async function deleteProductionPlan(id: number): Promise<void> {
  const res = await apiFetch(`${API_BASE_URL}/api/production-plans/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(await parseError(res));
}

export type CalculatePlanLine = { product_id: number; planned_quantity: number };

/** 다제품 생산계획 합산 계산 (BOM + 재고). period: 3M 또는 3m 등 */
export async function postCalculate(
  period: string,
  productionPlan: CalculatePlanLine[]
): Promise<CalculateResponse> {
  const res = await apiFetch(`${API_BASE_URL}/api/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ period, production_plan: productionPlan }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `Calculate API error: ${res.status}`);
  }
  const raw = (await res.json()) as {
    period: Period;
    product_ids: string;
    materials: Array<{
      material_id: string;
      name: string;
      unit: string;
      required: number;
      stock: number;
      shortage: number;
      order: number;
    }>;
    kpis: {
      total_shortage_materials: number;
      total_required_procurement_qty: number;
      estimated_procurement_cost: number;
      most_critical_material: string;
    };
    stock_vs_required: Array<{
      material_id: string;
      material_name: string;
      current_stock: number;
      required_qty: number;
      shortage_qty: number;
      suggested_order_qty: number;
      unit: string;
    }>;
    forecast: DashboardResponse["forecast"];
  };

  return {
    period: raw.period,
    productIds: raw.product_ids,
    materials: raw.materials.map((m) => ({
      material_id: m.material_id,
      name: m.name,
      unit: m.unit,
      required: m.required,
      stock: m.stock,
      shortage: m.shortage,
      order: m.order,
    })),
    kpis: {
      totalShortageMaterials: raw.kpis.total_shortage_materials,
      totalRequiredProcurementQty: raw.kpis.total_required_procurement_qty,
      estimatedProcurementCost: raw.kpis.estimated_procurement_cost,
      mostCriticalMaterial: raw.kpis.most_critical_material,
    },
    stockVsRequired: raw.stock_vs_required.map((row) => ({
      materialId: row.material_id,
      materialName: row.material_name,
      currentStock: row.current_stock,
      requiredQty: row.required_qty,
      shortageQty: row.shortage_qty,
      suggestedOrderQty: row.suggested_order_qty,
      unit: row.unit,
    })),
    forecast: raw.forecast,
  };
}

export async function generate52wPlan(input: {
  product_id: number;
  product_name: string;
  start_date: string;
  current_inventory: number;
  safety_stock: number;
  moq?: number | null;
  production_leadtime_days?: number;
  material_leadtime_days?: number;
  production_capa_per_day?: number | null;
  forecast_by_week: Record<number, number>;
}): Promise<Generate52wResponse> {
  const res = await apiFetch(`${API_BASE_URL}/api/scm/generate-52w`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Generate52wResponse;
}

export async function ensureMainWarehouse(): Promise<Warehouse> {
  const list = await fetchWarehouses();
  const existing = list.find((w) => w.code.toUpperCase() === "MAIN");
  if (existing) return existing;
  try {
    return await createWarehouse({
      code: "MAIN",
      name: "기본 창고",
      warehouse_type: "WAREHOUSE",
    });
  } catch {
    const refreshed = await fetchWarehouses();
    const fallback = refreshed.find((w) => w.code.toUpperCase() === "MAIN");
    if (fallback) return fallback;
    if (refreshed.length > 0) return refreshed[0];
    throw new Error("기본 창고(MAIN)를 생성하지 못했습니다.");
  }
}

export async function createInventorySimple(input: {
  item_id: number;
  qty: number;
  as_of_date: string;
  lot_no?: string | null;
  expiry_date?: string | null;
}): Promise<InventoryRecord> {
  const main = await ensureMainWarehouse();
  return createInventory({
    item_id: input.item_id,
    warehouse_id: main.id,
    qty: input.qty,
    as_of_date: input.as_of_date,
    lot_no: input.lot_no ?? null,
    expiry_date: input.expiry_date ?? null,
  });
}

export async function fetchStockTransactions(): Promise<StockTransactionRecord[]> {
  const res = await apiFetch(`${API_BASE_URL}/api/stock-transactions`, { cache: "no-store" });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as StockTransactionRecord[];
}

export async function createStockTransaction(input: {
  item_id: number;
  warehouse_id: number;
  trx_type: string;
  qty: number;
  reason?: string | null;
  as_of_date?: string | null;
  lot_no?: string | null;
  expiry_date?: string | null;
  unit?: string | null;
  source_ref?: string | null;
}): Promise<StockTransactionRecord> {
  const res = await apiFetch(`${API_BASE_URL}/api/stock-transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      item_id: input.item_id,
      warehouse_id: input.warehouse_id,
      trx_type: input.trx_type,
      qty: input.qty,
      reason: input.reason ?? null,
      as_of_date: input.as_of_date ?? null,
      lot_no: input.lot_no ?? null,
      expiry_date: input.expiry_date ?? null,
      unit: input.unit ?? null,
      source_ref: input.source_ref ?? null,
    }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as StockTransactionRecord;
}

export async function importIssuancePivotExcel(
  file: File,
  opts?: { warehouseId?: number; sheetName?: string }
): Promise<ExcelImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  const q = new URLSearchParams();
  if (opts?.warehouseId != null) q.set("warehouse_id", String(opts.warehouseId));
  if (opts?.sheetName) q.set("sheet_name", opts.sheetName);
  const qs = q.toString();
  const url = `${API_BASE_URL}/api/imports/excel/issuance-pivot${qs ? `?${qs}` : ""}`;
  const res = await apiFetch(url, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as ExcelImportResult;
}

export async function importWmsInventoryExcel(
  file: File,
  asOfDate: string,
  opts?: { sheetName?: string; maxRows?: number }
): Promise<ExcelImportResult> {
  const fd = new FormData();
  fd.append("file", file);
  const q = new URLSearchParams();
  q.set("as_of_date", asOfDate);
  if (opts?.sheetName) q.set("sheet_name", opts.sheetName);
  if (opts?.maxRows != null) q.set("max_rows", String(opts.maxRows));
  const res = await apiFetch(`${API_BASE_URL}/api/imports/excel/wms-inventory?${q.toString()}`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as ExcelImportResult;
}
