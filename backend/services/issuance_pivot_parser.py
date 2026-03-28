"""
`5월 수불.xlsx` 의 `출고량` 시트 형식: 품목·품목명·전월·평균 뒤 일자 열(피벗).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any


def _norm_header(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip().replace("\n", " ")


def _cell_to_date(v: Any) -> date | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    return None


def _to_positive_qty(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        q = float(v)
        return q if q > 0 else None
    try:
        q = float(str(v).replace(",", "").strip())
        return q if q > 0 else None
    except ValueError:
        return None


@dataclass(frozen=True)
class IssuancePivotLine:
    item_code: str
    as_of_date: date
    qty: float


def find_issuance_pivot_header_row(rows: list[tuple[Any, ...]]) -> int | None:
    for i, row in enumerate(rows):
        if not row:
            continue
        if _norm_header(row[0]) != "품목":
            continue
        if len(row) < 5:
            continue
        for c in range(4, min(len(row), 400)):
            if _cell_to_date(row[c]) is not None:
                return i
    return None


def build_date_column_indices(header_row: tuple[Any, ...]) -> list[tuple[int, date]]:
    out: list[tuple[int, date]] = []
    for i in range(4, len(header_row)):
        d = _cell_to_date(header_row[i])
        if d is not None:
            out.append((i, d))
    return out


def parse_issuance_pivot_lines(rows: list[tuple[Any, ...]]) -> tuple[list[IssuancePivotLine], list[str]]:
    errors: list[str] = []
    lines: list[IssuancePivotLine] = []
    hidx = find_issuance_pivot_header_row(rows)
    if hidx is None:
        return [], ["출고량 형식 헤더(첫 열 '품목', 5열부터 일자)를 찾지 못했습니다."]
    header = rows[hidx]
    cols = build_date_column_indices(header)
    if not cols:
        return [], ["일자 열을 찾지 못했습니다."]

    for ridx in range(hidx + 1, len(rows)):
        row = rows[ridx]
        if not row:
            continue
        raw_code = row[0]
        if raw_code is None or str(raw_code).strip() == "":
            continue
        item_code = str(raw_code).strip()
        for col_i, day in cols:
            if col_i >= len(row):
                continue
            q = _to_positive_qty(row[col_i])
            if q is None:
                continue
            lines.append(IssuancePivotLine(item_code=item_code, as_of_date=day, qty=q))

    if not lines and len(rows) > hidx + 1:
        errors.append("데이터 행은 있으나 출고 수량(양수) 셀이 없습니다.")
    return lines, errors
