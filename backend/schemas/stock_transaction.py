from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator


class StockTransactionBase(BaseModel):
    item_id: int
    warehouse_id: int
    trx_type: str  # IN / OUT / ADJUST
    qty: float
    reason: str | None = None
    as_of_date: date | None = Field(
        default=None,
        description="거래 기준일. 생략 시 서버가 당일로 저장하고 재고 키에 사용한다.",
    )
    lot_no: str | None = None
    expiry_date: date | None = None
    unit: str | None = Field(default=None, description="EA, kg 등 (item.uom과 별도 기록)")
    source_ref: str | None = Field(
        default=None,
        description="엑셀 파일·행·BL 등 원문 참조",
    )


class StockTransactionCreate(StockTransactionBase):
    pass


class StockTransactionRead(StockTransactionBase):
    id: int
    trx_time: datetime

    @model_validator(mode="after")
    def fill_as_of_date_from_trx_time(self) -> "StockTransactionRead":
        if self.as_of_date is None and self.trx_time is not None:
            return self.model_copy(update={"as_of_date": self.trx_time.date()})
        return self

    class Config:
        from_attributes = True
