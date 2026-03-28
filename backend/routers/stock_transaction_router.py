from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from models.stock_transaction import StockTransaction
from schemas.stock_transaction import StockTransactionCreate, StockTransactionRead
from services.stock_movement import apply_stock_transaction


router = APIRouter(prefix="/api/stock-transactions", tags=["stock_transactions"])


@router.get("", response_model=list[StockTransactionRead])
def list_stock_transactions(db: Session = Depends(get_db)):
    return db.query(StockTransaction).all()


@router.post("", response_model=StockTransactionRead)
def create_stock_transaction(payload: StockTransactionCreate, db: Session = Depends(get_db)):
    return apply_stock_transaction(db, payload, do_commit=True)


@router.get("/{trx_id}", response_model=StockTransactionRead)
def get_stock_transaction(trx_id: int, db: Session = Depends(get_db)):
    trx = db.query(StockTransaction).get(trx_id)
    if not trx:
        raise HTTPException(status_code=404, detail="입출고 이력을 찾을 수 없습니다.")
    return trx
