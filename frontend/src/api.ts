const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('scm_token') : null;
  const h: HeadersInit = { 'Content-Type': 'application/json' };
  if (token) (h as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  return h;
}

type LoginResponse = {
  access_token: string;
  token_type: string;
};

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      username: email,
      password,
    }).toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || '로그인에 실패했습니다.');
  }

  const data = (await res.json()) as LoginResponse;
  return data.access_token;
}

export type RegisterInput = { email: string; name: string; password: string };

export async function register(input: RegisterInput): Promise<MeResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      throw new Error(j.detail || text);
    } catch {
      throw new Error(text || '회원가입에 실패했습니다.');
    }
  }
  return (await res.json()) as MeResponse;
}

export type MeResponse = {
  id: number;
  email: string;
  name: string;
  role: string;
};

export async function fetchMe(token: string): Promise<MeResponse> {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error('사용자 정보를 가져오지 못했습니다.');
  }

  return (await res.json()) as MeResponse;
}

// 품목 API
export type Item = {
  id: number;
  code: string;
  name: string;
  type: string;
  uom: string;
  unit_price?: number | null;
  safety_stock_qty: number;
  lead_time_days: number;
  is_active: boolean;
};

export type ItemCreateInput = Omit<Item, 'id'>;

export async function fetchItems(): Promise<Item[]> {
  const res = await fetch(`${API_BASE_URL}/api/items`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('품목 목록을 가져오지 못했습니다.');
  return (await res.json()) as Item[];
}

export async function createItem(input: ItemCreateInput): Promise<Item> {
  const res = await fetch(`${API_BASE_URL}/api/items`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || '품목 생성에 실패했습니다.');
  }
  return (await res.json()) as Item;
}

// 창고
export type Warehouse = { id: number; code: string; name: string };
export async function fetchWarehouses(): Promise<Warehouse[]> {
  const res = await fetch(`${API_BASE_URL}/api/warehouses`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('창고 목록을 가져오지 못했습니다.');
  return (await res.json()) as Warehouse[];
}

// 수요예측
export type DemandForecast = {
  id: number;
  item_id: number;
  period_start: string;
  period_end: string;
  quantity: number;
  method: string | null;
};
export type DemandForecastCreateInput = Omit<DemandForecast, 'id'> & { method?: string | null };
export async function fetchDemandForecasts(): Promise<DemandForecast[]> {
  const res = await fetch(`${API_BASE_URL}/api/demand-forecasts`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('수요예측 목록을 가져오지 못했습니다.');
  return (await res.json()) as DemandForecast[];
}
export async function createDemandForecast(input: DemandForecastCreateInput): Promise<DemandForecast> {
  const res = await fetch(`${API_BASE_URL}/api/demand-forecasts`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || '수요예측 등록에 실패했습니다.');
  }
  return (await res.json()) as DemandForecast;
}

// 생산계획
export type ProductionPlan = {
  id: number;
  item_id: number;
  period_start: string;
  period_end: string;
  quantity: number;
  status: string;
  version: string | null;
};
export type ProductionPlanCreateInput = Omit<ProductionPlan, 'id'> & { version?: string | null };
export async function fetchProductionPlans(): Promise<ProductionPlan[]> {
  const res = await fetch(`${API_BASE_URL}/api/production-plans`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('생산계획 목록을 가져오지 못했습니다.');
  return (await res.json()) as ProductionPlan[];
}
export async function createProductionPlan(input: ProductionPlanCreateInput): Promise<ProductionPlan> {
  const res = await fetch(`${API_BASE_URL}/api/production-plans`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || '생산계획 등록에 실패했습니다.');
  }
  return (await res.json()) as ProductionPlan;
}

// 재고 스냅샷
export type Inventory = { id: number; item_id: number; warehouse_id: number; qty: number; as_of_date: string };
export async function fetchInventories(): Promise<Inventory[]> {
  const res = await fetch(`${API_BASE_URL}/api/inventories`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('재고 목록을 가져오지 못했습니다.');
  return (await res.json()) as Inventory[];
}

// 입출고 이력
export type StockTransaction = {
  id: number;
  item_id: number;
  warehouse_id: number;
  trx_type: string;
  qty: number;
  reason: string | null;
  trx_time: string;
  as_of_date?: string | null;
  lot_no?: string | null;
  expiry_date?: string | null;
  unit?: string | null;
  source_ref?: string | null;
};
export type StockTransactionCreateInput = Omit<StockTransaction, 'id' | 'trx_time'> & {
  reason?: string | null;
  as_of_date?: string | null;
  lot_no?: string | null;
  expiry_date?: string | null;
  unit?: string | null;
  source_ref?: string | null;
};
export async function fetchStockTransactions(): Promise<StockTransaction[]> {
  const res = await fetch(`${API_BASE_URL}/api/stock-transactions`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('입출고 이력을 가져오지 못했습니다.');
  return (await res.json()) as StockTransaction[];
}
export async function createStockTransaction(input: StockTransactionCreateInput): Promise<StockTransaction> {
  const res = await fetch(`${API_BASE_URL}/api/stock-transactions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || '입출고 등록에 실패했습니다.');
  }
  return (await res.json()) as StockTransaction;
}

// MRP
export type MrpResult = {
  id: number;
  item_id: number;
  required_qty: number;
  on_hand_qty: number;
  safety_stock_qty: number;
  shortage_qty: number;
  suggested_order_date: string | null;
  required_date: string | null;
  plan_version: string | null;
};
export type MrpCalcInput = { item_id: number; required_qty: number; required_date?: string | null };
export async function fetchMrpResults(): Promise<MrpResult[]> {
  const res = await fetch(`${API_BASE_URL}/api/mrp/results`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('MRP 결과를 가져오지 못했습니다.');
  return (await res.json()) as MrpResult[];
}
export async function runMrpCalc(input: MrpCalcInput): Promise<MrpResult> {
  const res = await fetch(`${API_BASE_URL}/api/mrp/calc`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || 'MRP 계산에 실패했습니다.');
  }
  return (await res.json()) as MrpResult;
}

// 발주
export type PurchaseOrder = {
  id: number;
  order_no: string;
  vendor_name: string;
  order_date: string;
  status: string;
};
export type PurchaseOrderCreateInput = Omit<PurchaseOrder, 'id'>;
export type PurchaseOrderLine = {
  id: number;
  purchase_order_id: number;
  item_id: number;
  order_qty: number;
  due_date: string;
};
export type PurchaseOrderLineCreateInput = Omit<PurchaseOrderLine, 'id'>;
export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const res = await fetch(`${API_BASE_URL}/api/purchase-orders`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('발주 목록을 가져오지 못했습니다.');
  return (await res.json()) as PurchaseOrder[];
}
export async function createPurchaseOrder(input: PurchaseOrderCreateInput): Promise<PurchaseOrder> {
  const res = await fetch(`${API_BASE_URL}/api/purchase-orders`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || '발주 등록에 실패했습니다.');
  }
  return (await res.json()) as PurchaseOrder;
}
export async function fetchPurchaseOrderLines(poId: number): Promise<PurchaseOrderLine[]> {
  const res = await fetch(`${API_BASE_URL}/api/purchase-orders/${poId}/lines`, { headers: getAuthHeaders() });
  if (!res.ok) throw new Error('발주 라인을 가져오지 못했습니다.');
  return (await res.json()) as PurchaseOrderLine[];
}
export async function createPurchaseOrderLine(poId: number, input: PurchaseOrderLineCreateInput): Promise<PurchaseOrderLine> {
  const res = await fetch(`${API_BASE_URL}/api/purchase-orders/${poId}/lines`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ...input, purchase_order_id: poId }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || '발주 라인 등록에 실패했습니다.');
  }
  return (await res.json()) as PurchaseOrderLine;
}

// SCM 계산 (다제품 BOM + 재고)
export type CalculatePlanLine = { product_id: number; planned_quantity: number };
export type CalculateMaterialSimple = {
  material_id: string;
  name: string;
  unit: string;
  required: number;
  stock: number;
  shortage: number;
  order: number;
};
export type CalculateResponse = {
  period: string;
  product_ids: string;
  materials: CalculateMaterialSimple[];
  kpis: {
    total_shortage_materials: number;
    total_required_procurement_qty: number;
    estimated_procurement_cost: number;
    most_critical_material: string;
  };
  stock_vs_required: unknown[];
  forecast: unknown[];
};
export async function postCalculate(
  period: string,
  productionPlan: CalculatePlanLine[]
): Promise<CalculateResponse> {
  const res = await fetch(`${API_BASE_URL}/api/calculate`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ period, production_plan: productionPlan }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || '계산 요청에 실패했습니다.');
  }
  return (await res.json()) as CalculateResponse;
}

