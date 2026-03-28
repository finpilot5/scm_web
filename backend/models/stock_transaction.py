from sqlalchemy import Column, Date, Integer, Numeric, String
from sqlalchemy.sql import func
from sqlalchemy.types import DateTime

from core.database import Base


class StockTransaction(Base):
    __tablename__ = "stock_transaction"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, nullable=False, index=True)
    warehouse_id = Column(Integer, nullable=False, index=True)
    trx_type = Column(String, nullable=False)  # IN / OUT / ADJUST
    qty = Column(Numeric, nullable=False)
    reason = Column(String, nullable=True)
    trx_time = Column(DateTime(timezone=True), server_default=func.now())
    # 원장(거래 기준일·로트) — docs/수불_매핑.md M2
    as_of_date = Column(Date, nullable=True, index=True)
    lot_no = Column(String, nullable=True, index=True)
    expiry_date = Column(Date, nullable=True)
    unit = Column(String, nullable=True)
    source_ref = Column(String, nullable=True)

