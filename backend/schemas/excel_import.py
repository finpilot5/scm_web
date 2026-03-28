from pydantic import BaseModel, Field


class ExcelImportResult(BaseModel):
    kind: str = Field(description="issuance_pivot | wms_inventory")
    sheet_used: str
    rows_read: int = 0
    transactions_created: int = 0
    inventory_upserted: int = 0
    errors: list[str] = Field(default_factory=list)
