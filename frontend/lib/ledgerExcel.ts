/**
 * 수불(IN/OUT) 엑셀 업로드 — `5월 수불.xlsx`와 별도로 제공하는 **간이 템플릿** 또는
 * 동일 헤더를 가진 시트를 파싱한다. (출고량 시트의 일자별 피벗 형식은 지원하지 않음)
 */
import * as XLSX from "xlsx";

function norm(s: string): string {
  return s.replace(/\s|_/g, "").toLowerCase();
}

function getCell(row: Record<string, unknown>, aliases: string[]): unknown {
  const entries = Object.entries(row);
  for (const [key, val] of entries) {
    const nk = norm(key);
    for (const a of aliases) {
      if (nk === norm(a)) return val;
    }
  }
  for (const [key, val] of entries) {
    const nk = norm(key);
    for (const a of aliases) {
      const na = norm(a);
      if (nk.includes(na) || na.includes(nk)) return val;
    }
  }
  return undefined;
}

function parseTrxType(raw: unknown): "IN" | "OUT" | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const s = String(raw).trim().toUpperCase();
  if (s === "IN" || s === "입고" || s === "I" || s === "RCPT" || s === "RECEIPT") return "IN";
  if (s === "OUT" || s === "출고" || s === "O" || s === "ISSUE" || s === "SHIP") return "OUT";
  return null;
}

function parseQty(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  const n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type LedgerUploadRow = {
  itemCode: string;
  trxType: "IN" | "OUT";
  qty: number;
  warehouseCode: string | null;
  note: string | null;
};

export type LedgerParseResult = {
  sheetName: string;
  ok: LedgerUploadRow[];
  errors: string[];
};

function mapRowsToLedger(rows: Record<string, unknown>[]): { ok: LedgerUploadRow[]; errors: string[] } {
  const ok: LedgerUploadRow[] = [];
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const codeRaw = getCell(row, [
      "품목코드",
      "품목",
      "item_code",
      "code",
      "sku",
      "자재코드",
      "제품코드",
    ]);
    const trxRaw = getCell(row, ["구분", "유형", "type", "trx_type", "trx", "입출고"]);
    const qtyRaw = getCell(row, ["수량", "qty", "quantity", "입고수량", "출고수량"]);

    const itemCode = codeRaw !== undefined && codeRaw !== null && codeRaw !== "" ? String(codeRaw).trim() : "";
    if (!itemCode) {
      const hasOther = trxRaw !== undefined && trxRaw !== "" && qtyRaw !== undefined && qtyRaw !== "";
      if (!hasOther) return;
      errors.push(`${line}행: 품목코드가 비어 있습니다.`);
      return;
    }

    const trxType = parseTrxType(trxRaw);
    if (!trxType) {
      errors.push(`${line}행 (${itemCode}): 구분은 IN/OUT 또는 입고/출고여야 합니다.`);
      return;
    }

    const qty = parseQty(qtyRaw);
    if (qty === null) {
      errors.push(`${line}행 (${itemCode}): 수량은 0보다 큰 숫자여야 합니다.`);
      return;
    }

    const whRaw = getCell(row, ["거점코드", "물류센터", "warehouse", "창고", "창고코드", "센터"]);
    const warehouseCode =
      whRaw !== undefined && whRaw !== null && String(whRaw).trim() !== ""
        ? String(whRaw).trim()
        : null;

    const lot = getCell(row, ["lot", "로트", "lot_no", "lotno"]);
    const exp = getCell(row, ["소비기한", "expiry", "유통기한"]);
    const memo = getCell(row, ["비고", "reason", "메모", "note"]);
    const parts: string[] = [];
    if (memo !== undefined && memo !== null && String(memo).trim() !== "") parts.push(String(memo).trim());
    if (lot !== undefined && lot !== null && String(lot).trim() !== "") parts.push(`Lot:${String(lot).trim()}`);
    if (exp !== undefined && exp !== null && String(exp).trim() !== "") parts.push(`소비기한:${String(exp).trim()}`);
    const note = parts.length > 0 ? parts.join(" | ") : null;

    ok.push({ itemCode, trxType, qty, warehouseCode, note });
  });

  return { ok, errors };
}

function scoreSheet(rows: Record<string, unknown>[]): number {
  if (rows.length === 0) return 0;
  const { ok } = mapRowsToLedger(rows);
  return ok.length;
}

/**
 * 통합 문서에서 **첫 번째로 유효 행이 있는 시트**를 선택한다.
 */
export async function parseLedgerWorkbook(file: File): Promise<LedgerParseResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  let bestName: string | null = null;
  let bestRows: Record<string, unknown>[] = [];
  let bestScore = 0;

  const priority = (name: string): number => {
    const n = norm(name);
    if (n.includes("수불") || n.includes("입출고")) return 3;
    if (n.includes("재고db") || n.includes("재고")) return 1;
    return 0;
  };

  const scored: { name: string; rows: Record<string, unknown>[]; score: number; pri: number }[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const score = scoreSheet(rows);
    scored.push({ name, rows, score, pri: priority(name) });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.pri - a.pri;
  });

  const top = scored[0];
  if (top && top.score > 0) {
    bestName = top.name;
    bestRows = top.rows;
    bestScore = top.score;
  }

  if (!bestName || bestScore === 0) {
    return {
      sheetName: wb.SheetNames[0] ?? "(없음)",
      ok: [],
      errors: [
        "입고/출고 행을 찾지 못했습니다. 첫 행에 품목코드·구분(IN/OUT 또는 입고/출고)·수량 컬럼이 있는 시트를 넣거나, 별도 '수불' 시트를 추가하세요.",
      ],
    };
  }

  const { ok, errors } = mapRowsToLedger(bestRows);
  return { sheetName: bestName, ok, errors };
}
