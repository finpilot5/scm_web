"""
`5월 수불.xlsx` 의 `재고DB` 시트: 물류센터·품목·셀명·가용수량(중복 헤더 시 가장 오른쪽 열).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def _norm_header(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip().replace("\n", " ")


def _to_qty(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", "").strip())
    except ValueError:
        return None


@dataclass(frozen=True)
class WmsInventoryLine:
    hub_label: str
    item_code: str
    lot_label: str
    qty: float


def parse_wms_header_indices(header_row: tuple[Any, ...]) -> dict[str, int] | None:
    headers = [_norm_header(x) for x in header_row]
    try:
        idx_hub = headers.index("물류센터")
    except ValueError:
        return None
    try:
        idx_item = headers.index("품목")
    except ValueError:
        return None
    try:
        idx_cell_name = headers.index("셀명")
    except ValueError:
        return None
    avail_indices = [i for i, h in enumerate(headers) if h == "가용수량"]
    if not avail_indices:
        return None
    qty_col = max(avail_indices)
    return {
        "hub": idx_hub,
        "item": idx_item,
        "cell": idx_cell_name,
        "qty": qty_col,
    }


def parse_wms_row(
    meta: dict[str, int], row: tuple[Any, ...], rownum: int
) -> tuple[WmsInventoryLine | None, str | None]:
    """
    반환: (라인, 에러문자열). 스킵 시 (None, None).
    """
    if not row:
        return None, None

    def cell(k: str) -> Any:
        i = meta[k]
        return row[i] if i < len(row) else None

    hub = cell("hub")
    item_raw = cell("item")
    lot_raw = cell("cell")
    if item_raw is None or str(item_raw).strip() == "":
        return None, None
    hub_s = str(hub).strip() if hub is not None else ""
    if not hub_s:
        return None, f"{rownum}행: 물류센터 없음"
    item_code = str(item_raw).strip()
    lot_label = str(lot_raw).strip() if lot_raw is not None else ""
    if not lot_label:
        lot_label = f"ROW-{rownum}"
    q = _to_qty(cell("qty"))
    if q is None:
        return None, None
    return (
        WmsInventoryLine(
            hub_label=hub_s,
            item_code=item_code,
            lot_label=lot_label,
            qty=q,
        ),
        None,
    )


def parse_wms_inventory_lines(rows: list[tuple[Any, ...]]) -> tuple[list[WmsInventoryLine], list[str]]:
    errors: list[str] = []
    if not rows:
        return [], ["빈 시트입니다."]
    meta = parse_wms_header_indices(rows[0])
    if meta is None:
        return [], ["재고DB 헤더(물류센터·품목·셀명·가용수량)를 찾지 못했습니다."]
    lines: list[WmsInventoryLine] = []
    for ridx, row in enumerate(rows[1:], start=2):
        line, err = parse_wms_row(meta, row, ridx)
        if err:
            errors.append(err)
        if line:
            lines.append(line)
    if not lines:
        errors.append("유효 데이터 행이 없습니다.")
    return lines, errors
