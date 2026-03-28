"""재고 스냅샷 upsert (재고DB 덤프 등). stock_transaction 없이 수량 덮어쓰기."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from models.inventory import Inventory


def upsert_inventory_snapshot(
    db: Session,
    *,
    item_id: int,
    warehouse_id: int,
    as_of_date: date,
    lot_no: str | None,
    qty: float,
    expiry_date: date | None = None,
) -> Inventory:
    q = (
        db.query(Inventory)
        .filter(
            Inventory.item_id == item_id,
            Inventory.warehouse_id == warehouse_id,
            Inventory.as_of_date == as_of_date,
        )
    )
    if lot_no is None:
        q = q.filter(Inventory.lot_no.is_(None))
    else:
        q = q.filter(Inventory.lot_no == lot_no)
    inv = q.first()
    if inv:
        inv.qty = qty
        if expiry_date is not None:
            inv.expiry_date = expiry_date
        return inv
    inv = Inventory(
        item_id=item_id,
        warehouse_id=warehouse_id,
        qty=qty,
        as_of_date=as_of_date,
        lot_no=lot_no,
        expiry_date=expiry_date,
    )
    db.add(inv)
    return inv
