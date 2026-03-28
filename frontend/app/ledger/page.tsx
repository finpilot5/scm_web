"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  createStockTransaction,
  ensureMainWarehouse,
  fetchItems,
  fetchStockTransactions,
  fetchWarehouses,
} from "@/lib/api";
import { parseLedgerWorkbook } from "@/lib/ledgerExcel";
import type { Item, StockTransactionRecord, Warehouse } from "@/lib/types";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-soft outline-none focus:border-stock";

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolveItemId(code: string, items: Item[]): number | null {
  const c = code.trim();
  if (!c) return null;
  const by = new Map(items.map((i) => [String(i.code).trim().toUpperCase(), i.id]));
  const direct = by.get(c.toUpperCase());
  if (direct !== undefined) return direct;
  const num = Number(c.replace(/,/g, ""));
  if (Number.isFinite(num)) {
    const alt = by.get(String(num).toUpperCase());
    if (alt !== undefined) return alt;
  }
  return null;
}

function resolveWarehouseId(
  code: string | null,
  warehouses: Warehouse[],
  mainId: number
): number {
  if (!code || !code.trim()) return mainId;
  const u = code.trim().toUpperCase();
  const w = warehouses.find((x) => x.code.toUpperCase() === u || x.name.toUpperCase() === u);
  return w?.id ?? mainId;
}

export default function LedgerPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [mainWhId, setMainWhId] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<StockTransactionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const whById = useMemo(() => new Map(warehouses.map((w) => [w.id, w])), [warehouses]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const main = await ensureMainWarehouse();
      setMainWhId(main.id);
      const [it, wh, trx] = await Promise.all([
        fetchItems(),
        fetchWarehouses(),
        fetchStockTransactions(),
      ]);
      setItems(it);
      setWarehouses(wh);
      const sorted = [...trx].sort(
        (a, b) => new Date(b.trx_time).getTime() - new Date(a.trx_time).getTime()
      );
      setTransactions(sorted);
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "불러오기 실패",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onSubmitTrx = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const main = mainWhId ?? (await ensureMainWarehouse()).id;
    const fd = new FormData(e.currentTarget);
    const item_id = Number(fd.get("item_id"));
    const warehouse_id = Number(fd.get("warehouse_id")) || main;
    const trx_type = String(fd.get("trx_type") || "IN").toUpperCase();
    const qty = Number(fd.get("qty"));
    const reason = String(fd.get("reason") || "").trim() || null;
    const as_of_raw = String(fd.get("as_of_date") || "").trim();
    const as_of_date = as_of_raw || null;
    const lot_no = String(fd.get("lot_no") || "").trim() || null;
    const expiry_raw = String(fd.get("expiry_date") || "").trim();
    const expiry_date = expiry_raw || null;
    const unit = String(fd.get("unit") || "").trim() || null;
    const source_ref = String(fd.get("source_ref") || "").trim() || null;
    if (!item_id || !Number.isFinite(qty) || qty <= 0) {
      setMessage({ type: "err", text: "품목·수량을 확인하세요." });
      return;
    }
    if (trx_type !== "IN" && trx_type !== "OUT") {
      setMessage({ type: "err", text: "구분은 입고(IN) 또는 출고(OUT)만 지원합니다." });
      return;
    }
    try {
      await createStockTransaction({
        item_id,
        warehouse_id,
        trx_type,
        qty,
        reason,
        as_of_date,
        lot_no,
        expiry_date,
        unit,
        source_ref,
      });
      setMessage({
        type: "ok",
        text: "수불이 등록되었습니다. 기준일·로트(있는 경우)에 맞춰 재고 스냅샷이 갱신됩니다.",
      });
      await load();
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "저장 실패",
      });
    }
  };

  const onUpload = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = (e.currentTarget.elements.namedItem("file") as HTMLInputElement | null)?.files?.[0];
    if (!input) {
      setMessage({ type: "err", text: "파일을 선택하세요." });
      return;
    }
    setUploadBusy(true);
    setMessage(null);
    try {
      const main = mainWhId ?? (await ensureMainWarehouse()).id;
      const { sheetName, ok, errors } = await parseLedgerWorkbook(input);
      if (errors.length > 0 && ok.length === 0) {
        setMessage({ type: "err", text: `${sheetName}: ${errors.join(" ")}` });
        return;
      }
      const rowErrs: string[] = [...errors];
      let success = 0;
      for (let i = 0; i < ok.length; i++) {
        const row = ok[i];
        const itemId = resolveItemId(row.itemCode, items);
        if (itemId === null) {
          rowErrs.push(`${i + 1}번째 행: 품목코드 '${row.itemCode}'에 해당하는 품목이 없습니다.`);
          continue;
        }
        const whId = resolveWarehouseId(row.warehouseCode, warehouses, main);
        try {
          await createStockTransaction({
            item_id: itemId,
            warehouse_id: whId,
            trx_type: row.trxType,
            qty: row.qty,
            reason: row.note,
          });
          success += 1;
        } catch (ex) {
          rowErrs.push(
            `${row.itemCode}: ${ex instanceof Error ? ex.message : "API 오류"}`
          );
        }
      }
      const tail = rowErrs.length ? ` / 일부 오류: ${rowErrs.slice(0, 5).join("; ")}${rowErrs.length > 5 ? "…" : ""}` : "";
      setMessage({
        type: rowErrs.length && success === 0 ? "err" : "ok",
        text: `시트「${sheetName}」에서 ${success}건 반영했습니다.${tail}`,
      });
      await load();
    } catch (ex) {
      setMessage({
        type: "err",
        text: ex instanceof Error ? ex.message : "업로드 처리 실패",
      });
    } finally {
      setUploadBusy(false);
      (e.currentTarget.elements.namedItem("file") as HTMLInputElement).value = "";
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">월간 수불 (입고·출고)</h1>
        <p className="mt-1 text-sm text-slate-600">
          <code className="rounded bg-slate-100 px-1">5월 수불.xlsx</code>의 <strong>재고DB</strong>·
          <strong>출고량</strong>·완제품/원재료 분석 시트와 동일한 데이터 축을 웹에서 다루기 위한{" "}
          <strong>입출고 원장</strong>입니다. 등록 시 서버가{" "}
          <strong>기준일(as_of_date)·창고·로트(선택)</strong> 단위로 재고 스냅샷을 갱신합니다.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          엑셀의 &quot;출고량&quot; 시트처럼 일자별 컬럼이 피벗된 형식은 이 화면에서 직접 읽지 않습니다.
          아래 템플릿 컬럼으로 시트를 만들어 업로드하거나, 수동으로 행을 등록하세요.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-2xl border p-4 text-sm ${
            message.type === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="grid gap-8 lg:grid-cols-2">
        <form
          onSubmit={onSubmitTrx}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft"
        >
          <h2 className="text-lg font-medium text-slate-800">수동 등록</h2>
          <label className="block text-sm">
            <span className="text-slate-600">품목</span>
            <select name="item_id" className={inputClass} required defaultValue="">
              <option value="" disabled>
                선택
              </option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  [{i.code}] {i.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">창고 / 거점</span>
            <select
              name="warehouse_id"
              className={inputClass}
              defaultValue={mainWhId ?? ""}
              key={`${mainWhId ?? 0}-${warehouses.length}`}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  [{w.code}] {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">구분</span>
            <select name="trx_type" className={inputClass} required>
              <option value="IN">입고 (IN)</option>
              <option value="OUT">출고 (OUT)</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">수량</span>
            <input name="qty" type="number" className={inputClass} step="any" min={0.0001} required />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">거래 기준일 (as_of_date)</span>
            <input name="as_of_date" type="date" className={inputClass} defaultValue={todayISODate()} />
            <span className="mt-0.5 block text-xs text-slate-500">비우면 서버가 당일로 저장합니다.</span>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Lot / 로케이션</span>
            <input name="lot_no" className={inputClass} placeholder="예: A01-2503" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">소비기한 (입고 시 권장)</span>
            <input name="expiry_date" type="date" className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">단위 (선택)</span>
            <input name="unit" className={inputClass} placeholder="EA, 개 …" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">출처 참조 (source_ref)</span>
            <input name="source_ref" className={inputClass} placeholder="엑셀 시트·행, BL 등" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">비고</span>
            <input name="reason" className={inputClass} placeholder="기타 메모" />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-stock px-4 py-2.5 text-sm font-medium text-white"
          >
            원장에 반영
          </button>
        </form>

        <form
          onSubmit={onUpload}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft"
        >
          <h2 className="text-lg font-medium text-slate-800">엑셀 일괄 업로드</h2>
          <p className="text-sm text-slate-600">
            첫 행 헤더에 아래 컬럼을 포함한 시트를 넣습니다. 통합 문서에서는{" "}
            <strong>유효 행이 가장 많은 시트</strong>를 자동 선택합니다.
          </p>
          <ul className="list-inside list-disc text-xs text-slate-500">
            <li>
              <strong>품목코드</strong> (또는 품목) — 등록된 품목 <code>code</code>와 일치
            </li>
            <li>
              <strong>구분</strong> — IN / OUT 또는 입고 / 출고
            </li>
            <li>
              <strong>수량</strong>
            </li>
            <li>거점코드 / 물류센터 (선택) — 창고 코드 또는 이름, 없으면 MAIN</li>
            <li>비고, Lot, 소비기한 (선택)</li>
          </ul>
          <input
            name="file"
            type="file"
            accept=".xlsx,.xls"
            className="block w-full text-sm text-slate-600"
            required
          />
          <button
            type="submit"
            disabled={uploadBusy}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 disabled:opacity-50"
          >
            {uploadBusy ? "처리 중…" : "업로드 후 API 반영"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-lg font-medium text-slate-800">수불 원장</h2>
        {loading ? (
          <p className="text-sm text-slate-500">불러오는 중…</p>
        ) : (
          <div className="max-h-[520px] overflow-auto text-sm">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2">시각</th>
                  <th className="p-2">기준일</th>
                  <th className="p-2">구분</th>
                  <th className="p-2">품목</th>
                  <th className="p-2">거점</th>
                  <th className="p-2">Lot</th>
                  <th className="p-2">수량</th>
                  <th className="p-2">단위</th>
                  <th className="p-2">출처</th>
                  <th className="p-2">비고</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => {
                  const it = itemById.get(t.item_id);
                  const wh = whById.get(t.warehouse_id);
                  return (
                    <tr key={t.id} className="border-t border-slate-100">
                      <td className="whitespace-nowrap p-2 text-slate-600">
                        {new Date(t.trx_time).toLocaleString("ko-KR")}
                      </td>
                      <td className="whitespace-nowrap p-2 text-slate-600">
                        {t.as_of_date ?? "—"}
                      </td>
                      <td className="p-2 font-medium">{t.trx_type}</td>
                      <td className="p-2">
                        {it ? `[${it.code}] ${it.name}` : t.item_id}
                      </td>
                      <td className="p-2">{wh ? `[${wh.code}] ${wh.name}` : t.warehouse_id}</td>
                      <td className="p-2 text-slate-600">{t.lot_no ?? "—"}</td>
                      <td className="p-2">{t.qty}</td>
                      <td className="p-2 text-slate-600">{t.unit ?? "—"}</td>
                      <td className="p-2 max-w-[140px] truncate text-slate-600" title={t.source_ref ?? ""}>
                        {t.source_ref ?? "—"}
                      </td>
                      <td className="p-2 text-slate-600">{t.reason ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {transactions.length === 0 && (
              <p className="py-8 text-center text-slate-500">등록된 수불이 없습니다.</p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
