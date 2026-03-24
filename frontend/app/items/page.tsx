"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { createItem, deleteItem, fetchItems } from "@/lib/api";
import type { Item } from "@/lib/types";

const inputClass =
  "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 shadow-soft outline-none focus:border-stock";
const UOM_OPTIONS = ["EA", "KG", "G", "L", "ML", "BOX", "PACK"] as const;

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetchItems());
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "목록을 불러오지 못했습니다.",
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
    const form = e.currentTarget;
    const fd = new FormData(form);
    const code = String(fd.get("code") || "").trim();
    const name = String(fd.get("name") || "").trim();
    const type = String(fd.get("type") || "").trim().toUpperCase();
    const uom = String(fd.get("uom") || "").trim();
    const capaRaw = String(fd.get("production_capa_per_day") || "").trim();
    const production_capa_per_day = capaRaw === "" ? null : Number(capaRaw);

    if (!code || !name || !type || !uom) {
      setMessage({ type: "err", text: "코드, 이름, 유형, 단위는 필수입니다." });
      return;
    }
    if (type !== "PRODUCT") {
      setMessage({ type: "err", text: "유형은 PRODUCT 여야 합니다." });
      return;
    }

    try {
      const created = await createItem({
        code,
        name,
        type,
        uom,
        safety_stock_qty: 0,
        lead_time_days: 0,
        production_leadtime_days: null,
        material_leadtime_days: null,
        production_capa_per_day,
        shelf_life_days: null,
        is_active: true,
      });
      // 등록 직후 목록 즉시 반영 (새로고침 없이 확인 가능)
      setItems((prev) => [...prev, created]);
      form.reset();
      setMessage({ type: "ok", text: "품목이 등록되었습니다." });
      // 백엔드 기준 데이터와 동기화 (실패해도 등록 성공 메시지는 유지)
      try {
        await load();
      } catch {
        /* ignore reload error */
      }
    } catch (err) {
      setMessage({
        type: "err",
        text:
          err instanceof Error
            ? err.message
            : "등록에 실패했습니다. Settings에서 로그인 상태를 먼저 확인하세요.",
      });
    }
  };

  const onDelete = async (id: number) => {
    if (!confirm("이 품목을 삭제할까요? (BOM·재고 등에서 참조 중이면 실패할 수 있습니다)")) return;
    try {
      await deleteItem(id);
      setMessage({ type: "ok", text: "삭제되었습니다." });
      await load();
    } catch (err) {
      setMessage({
        type: "err",
        text: err instanceof Error ? err.message : "삭제에 실패했습니다.",
      });
    }
  };

  return (
    <main className="mx-auto max-w-7xl space-y-8 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">품목 등록</h1>
        <p className="mt-1 text-sm text-slate-600">
          제품(PRODUCT)을 프론트에서 등록합니다.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          재고/리드타임/소비기한 정보는 재고 화면에서 관리합니다.
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
          <h2 className="text-lg font-medium text-slate-800">새 품목</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-slate-600">코드 *</span>
              <input name="code" className={inputClass} placeholder="예: P-CK-01" required />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">이름 *</span>
              <input name="name" className={inputClass} placeholder="예: 초코케이크" required />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">유형 *</span>
              <select name="type" className={inputClass} required defaultValue="PRODUCT">
                <option value="PRODUCT">PRODUCT (제품)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">단위(UOM) *</span>
              <select name="uom" className={inputClass} required defaultValue="EA">
                {UOM_OPTIONS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">생산 CAPA / 일</span>
              <input name="production_capa_per_day" type="number" className={inputClass} min={0} step="any" />
            </label>
          </div>
          <button
            type="submit"
            className="rounded-xl bg-stock px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            등록
          </button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-slate-800">등록된 품목</h2>
            <button
              type="button"
              onClick={() => load()}
              className="text-sm text-stock hover:underline"
            >
              새로고침
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-slate-500">불러오는 중...</p>
          ) : (
            <div className="max-h-[480px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2">코드</th>
                    <th className="p-2">이름</th>
                    <th className="p-2">유형</th>
                    <th className="p-2">단위</th>
                    <th className="p-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-slate-100">
                      <td className="p-2 font-mono text-xs">{it.code}</td>
                      <td className="p-2">{it.name}</td>
                      <td className="p-2">
                        <span
                          className={
                            it.type === "PRODUCT"
                              ? "rounded bg-blue-100 px-1.5 py-0.5 text-blue-800"
                              : "rounded bg-amber-100 px-1.5 py-0.5 text-amber-900"
                          }
                        >
                          {it.type}
                        </span>
                      </td>
                      <td className="p-2">{it.uom}</td>
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => onDelete(it.id)}
                          className="text-xs text-red-600 hover:underline"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">등록된 품목이 없습니다.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
