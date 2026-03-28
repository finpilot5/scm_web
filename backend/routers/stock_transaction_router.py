from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from models.inventory import Inventory
from models.stock_transaction import StockTransaction
from schemas.stock_transaction import StockTransactionCreate, StockTransactionRead


router = APIRouter(prefix="/api/stock-transactions", tags=["stock_transactions"])


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


@router.get("", response_model=list[StockTransactionRead])
def list_stock_transactions(db: Session = Depends(get_db)):
    return db.query(StockTransaction).all()


@router.post("", response_model=StockTransactionRead)
def create_stock_transaction(payload: StockTransactionCreate, db: Session = Depends(get_db)):
    biz_date = payload.as_of_date or date.today()
    lot_no = _norm_lot(payload.lot_no)
    unit = _norm_optional_str(payload.unit)
    source_ref = _norm_optional_str(payload.source_ref)

    # 1) 입출고 이력 생성
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

    # 2) 품목/창고/기준일/(로트) 단위 재고 스냅샷 업데이트 — docs/수불_매핑.md
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

    db.commit()
    db.refresh(trx)
    return trx


@router.get("/{trx_id}", response_model=StockTransactionRead)
def get_stock_transaction(trx_id: int, db: Session = Depends(get_db)):
    trx = db.query(StockTransaction).get(trx_id)
    if not trx:
        raise HTTPException(status_code=404, detail="입출고 이력을 찾을 수 없습니다.")
    return trx
