"""입출고 1건 반영 — 라우터·엑셀 import 공통."""

from __future__ import annotations

from datetime import date

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.inventory import Inventory
from models.stock_transaction import StockTransaction
from schemas.stock_transaction import StockTransactionCreate


def _norm_lot(value: str | None) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def _norm_optional_str(value: str | None) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s if s else None


def apply_stock_transaction(
    db: Session,
    payload: StockTransactionCreate,
    *,
    do_commit: bool = True,
) -> StockTransaction:
    biz_date = payload.as_of_date or date.today()
    lot_no = _norm_lot(payload.lot_no)
    unit = _norm_optional_str(payload.unit)
    source_ref = _norm_optional_str(payload.source_ref)

    trx = StockTransaction(
        item_id=payload.item_id,
        warehouse_id=payload.warehouse_id,
        trx_type=payload.trx_type,
        qty=payload.qty,
        reason=payload.reason,
        as_of_date=biz_date,
        lot_no=lot_no,
        expiry_date=payload.expiry_date,
        unit=unit,
        source_ref=source_ref,
    )
    db.add(trx)

    inv_q = (
        db.query(Inventory)
        .filter(
            Inventory.item_id == payload.item_id,
            Inventory.warehouse_id == payload.warehouse_id,
            Inventory.as_of_date == biz_date,
        )
    )
    if lot_no is None:
        inv_q = inv_q.filter(Inventory.lot_no.is_(None))
    else:
        inv_q = inv_q.filter(Inventory.lot_no == lot_no)
    inv = inv_q.first()

    if not inv:
        inv = Inventory(
            item_id=payload.item_id,
            warehouse_id=payload.warehouse_id,
            qty=0,
            as_of_date=biz_date,
            lot_no=lot_no,
            expiry_date=payload.expiry_date if payload.trx_type == "IN" else None,
        )
        db.add(inv)

    delta = payload.qty if payload.trx_type == "IN" else -payload.qty
    new_qty = float(inv.qty) + float(delta)
    if new_qty < 0:
        raise HTTPException(
            status_code=400,
            detail="입출고 후 재고가 음수가 될 수 없습니다.",
        )
    inv.qty = new_qty
    if payload.expiry_date is not None and payload.trx_type == "IN":
        inv.expiry_date = payload.expiry_date

    if do_commit:
        db.commit()
        db.refresh(trx)
    else:
        db.flush()
        db.refresh(trx)
    return trx
