"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  createInventorySimple,
  fetchInventories,
  fetchItems,
} from "@/lib/api";
import type { InventoryRecord, Item } from "@/lib/types";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-soft outline-none focus:border-stock";

function todayISODate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function InventoryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [inventories, setInventories] = useState<InventoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const selectableItems = useMemo(() => items, [items]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [it, inv] = await Promise.all([
        fetchItems(),
        fetchInventories(),
      ]);
      setItems(it);
      setInventories(inv);
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

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const item_id = Number(fd.get("item_id"));
    const qty = Number(fd.get("qty"));
    const as_of_date = String(fd.get("as_of_date") || todayISODate());
    const lot_no = String(fd.get("lot_no") || "").trim() || null;
    if (!item_id || !Number.isFinite(qty)) {
      setMessage({ type: "err", text: "품목·수량을 확인하세요." });
      return;
    }
    try {
      await createInventorySimple({ item_id, qty, as_of_date, lot_no, expiry_date: null });
      setMessage({
        type: "ok",
        text: "재고가 저장되었습니다. (기본 창고 MAIN 기준)",
      });
      await load();
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "저장 실패",
      });
    }
  };

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">재고 입력</h1>
        <p className="mt-1 text-sm text-slate-600">
          재고 스냅샷을 등록합니다. 기본값 <strong>MAIN</strong> 창고를 자동 사용합니다.
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
          onSubmit={onSubmit}
          className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-soft"
        >
          <h2 className="text-lg font-medium text-slate-800">재고 등록 / 수정</h2>
          <label className="block text-sm">
            <span className="text-slate-600">품목</span>
            <select name="item_id" className={inputClass} required defaultValue="">
              <option value="" disabled>
                선택
              </option>
              {selectableItems.map((i) => (
                <option key={i.id} value={i.id}>
                  [{i.code}] {i.name} ({i.uom})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">수량</span>
            <input name="qty" type="number" className={inputClass} step="any" required />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">기준일 (as_of_date)</span>
            <input
              name="as_of_date"
              type="date"
              className={inputClass}
              defaultValue={todayISODate()}
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Lot번호 (선택)</span>
            <input name="lot_no" className={inputClass} placeholder="예: LOT-202603" />
          </label>
          <button
            type="submit"
            className="rounded-xl bg-stock px-4 py-2.5 text-sm font-medium text-white"
          >
            저장
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <h2 className="mb-4 text-lg font-medium text-slate-800">등록된 재고 스냅샷</h2>
          {loading ? (
            <p className="text-sm text-slate-500">불러오는 중...</p>
          ) : (
            <div className="max-h-[400px] overflow-auto text-sm">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2">품목</th>
                    <th className="p-2">수량</th>
                    <th className="p-2">기준일</th>
                    <th className="p-2">Lot번호</th>
                  </tr>
                </thead>
                <tbody>
                  {inventories.map((inv) => {
                    const it = byId.get(inv.item_id);
                    return (
                      <tr key={inv.id} className="border-t border-slate-100">
                        <td className="p-2">{it ? `${it.code} · ${it.name}` : inv.item_id}</td>
                        <td className="p-2">{inv.qty}</td>
                        <td className="p-2">{inv.as_of_date}</td>
                        <td className="p-2">{inv.lot_no ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {inventories.length === 0 && (
                <p className="py-6 text-center text-slate-500">재고 데이터가 없습니다.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
