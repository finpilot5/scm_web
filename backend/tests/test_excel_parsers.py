from datetime import date, datetime

from services.issuance_pivot_parser import IssuancePivotLine, parse_issuance_pivot_lines
from services.wms_inventory_parser import parse_wms_inventory_lines, parse_wms_row


def test_parse_issuance_pivot_lines_basic() -> None:
    rows = [
        ("품목", "품목명", "전월", "평균", datetime(2025, 1, 10), datetime(2025, 1, 11)),
        (100, "A", 0, 0, 3, 0),
    ]
    lines, errs = parse_issuance_pivot_lines(rows)
    assert not errs
    assert lines == [
        IssuancePivotLine(item_code="100", as_of_date=date(2025, 1, 10), qty=3.0),
    ]


def test_parse_wms_header_duplicate_avail() -> None:
    rows = [
        (
            "물류센터",
            "존코드",
            "로케이션코드",
            "셀",
            "셀명",
            "화주",
            "화주명",
            "품목",
            "품목명",
            "가용수량",
            "가용수량",
        ),
        ("H1", "S", "L", "c", "LOT-1", "0", "n", 999, "이름", 0, 12.5),
    ]
    lines, errs = parse_wms_inventory_lines(rows)
    assert not errs
    assert len(lines) == 1
    assert lines[0].hub_label == "H1"
    assert lines[0].item_code == "999"
    assert lines[0].lot_label == "LOT-1"
    assert lines[0].qty == 12.5


def test_parse_wms_row_error_empty_hub() -> None:
    from services.wms_inventory_parser import parse_wms_header_indices

    hdr = ("물류센터", "품목", "셀명", "가용수량")
    meta = parse_wms_header_indices(hdr)
    assert meta is not None
    row = ("", "100", "L-1", 3)
    line, err = parse_wms_row(meta, row, 5)
    assert line is None
    assert err is not None
