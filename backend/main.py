from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

from core.config import settings
from core.database import Base, engine
from routers import (
    auth_router,
    bom_router,
    calculate_router,
    dashboard_router,
    demand_forecast_router,
    import_excel_router,
    inventory_router,
    item_router,
    lead_time_router,
    mrp_router,
    production_plan_router,
    purchase_order_router,
    scm_schedule_router,
    stock_transaction_router,
    warehouse_router,
)


def create_app() -> FastAPI:
    app = FastAPI(title="SCM Backend API")

    # CORS 설정
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 라우터 등록
    app.include_router(auth_router.router)
    app.include_router(item_router.router)
    app.include_router(warehouse_router.router)
    app.include_router(bom_router.router)
    app.include_router(lead_time_router.router)
    app.include_router(demand_forecast_router.router)
    app.include_router(production_plan_router.router)
    app.include_router(inventory_router.router)
    app.include_router(stock_transaction_router.router)
    app.include_router(import_excel_router.router)
    app.include_router(mrp_router.router)
    app.include_router(purchase_order_router.router)
    app.include_router(dashboard_router.router)
    app.include_router(calculate_router.router)
    app.include_router(scm_schedule_router.router)

    return app


app = create_app()


@app.on_event("startup")
def on_startup():
    # 필요한 경우 여기서 테이블 생성 (초기 개발용)
    # 운영에서는 Alembic 마이그레이션으로 관리하는 것을 권장
    Base.metadata.create_all(bind=engine)
    # 기존 SQLite DB에 컬럼이 없을 때만 추가 (create_all은 ALTER 미수행)
    try:
        insp = inspect(engine)
        item_cols = {c["name"] for c in insp.get_columns("item")}
        warehouse_cols = {c["name"] for c in insp.get_columns("warehouse")}
        inv_cols = {c["name"] for c in insp.get_columns("inventory")}
        stk_cols = {c["name"] for c in insp.get_columns("stock_transaction")}

        alters: list[str] = []
        if "unit_price" not in item_cols:
            alters.append("ALTER TABLE item ADD COLUMN unit_price NUMERIC")
        if "moq" not in item_cols:
            alters.append("ALTER TABLE item ADD COLUMN moq NUMERIC")
        if "production_leadtime_days" not in item_cols:
            alters.append("ALTER TABLE item ADD COLUMN production_leadtime_days INTEGER")
        if "material_leadtime_days" not in item_cols:
            alters.append("ALTER TABLE item ADD COLUMN material_leadtime_days INTEGER")
        if "production_capa_per_day" not in item_cols:
            alters.append("ALTER TABLE item ADD COLUMN production_capa_per_day NUMERIC")
        if "shelf_life_days" not in item_cols:
            alters.append("ALTER TABLE item ADD COLUMN shelf_life_days INTEGER")
        if "warehouse_type" not in warehouse_cols:
            alters.append("ALTER TABLE warehouse ADD COLUMN warehouse_type VARCHAR")
        if "lot_no" not in inv_cols:
            alters.append("ALTER TABLE inventory ADD COLUMN lot_no VARCHAR")
        if "expiry_date" not in inv_cols:
            alters.append("ALTER TABLE inventory ADD COLUMN expiry_date DATE")
        if "as_of_date" not in stk_cols:
            alters.append("ALTER TABLE stock_transaction ADD COLUMN as_of_date DATE")
        if "lot_no" not in stk_cols:
            alters.append("ALTER TABLE stock_transaction ADD COLUMN lot_no VARCHAR")
        if "expiry_date" not in stk_cols:
            alters.append("ALTER TABLE stock_transaction ADD COLUMN expiry_date DATE")
        if "unit" not in stk_cols:
            alters.append("ALTER TABLE stock_transaction ADD COLUMN unit VARCHAR")
        if "source_ref" not in stk_cols:
            alters.append("ALTER TABLE stock_transaction ADD COLUMN source_ref VARCHAR")

        if alters:
            with engine.begin() as conn:
                for q in alters:
                    conn.execute(text(q))

        # stock_transaction.as_of_date 백필 (레거시 행) — ALTER 이후 컬럼 목록 재조회
        try:
            insp2 = inspect(engine)
            stk_after = {c["name"] for c in insp2.get_columns("stock_transaction")}
            if "as_of_date" in stk_after:
                with engine.begin() as conn:
                    if engine.dialect.name == "postgresql":
                        conn.execute(
                            text(
                                "UPDATE stock_transaction SET as_of_date = "
                                "(trx_time AT TIME ZONE 'UTC')::date WHERE as_of_date IS NULL"
                            )
                        )
                    else:
                        conn.execute(
                            text(
                                "UPDATE stock_transaction SET as_of_date = date(trx_time) "
                                "WHERE as_of_date IS NULL"
                            )
                        )
        except Exception:
            pass
    except Exception:
        pass

