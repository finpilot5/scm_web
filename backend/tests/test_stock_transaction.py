from datetime import date, timedelta

from sqlalchemy.orm import Session

from models.inventory import Inventory
from models.item import Item


def test_stock_transaction_updates_inventory(db_session: Session, client) -> None:
    """
    입고/출고 등록 시 Inventory 스냅샷이 함께 업데이트되는지 검증.
    """
    item = Item(
        code="STK-001",
        name="재고 테스트 품목",
        type="RAW",
        uom="KG",
        safety_stock_qty=0,
        lead_time_days=0,
        is_active=True,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    # 초기 재고 0에서 10 입고
    resp_in = client.post(
        "/api/stock-transactions",
        json={
            "item_id": item.id,
            "warehouse_id": 1,
            "trx_type": "IN",
            "qty": 10,
            "reason": "초기 입고",
        },
    )
    assert resp_in.status_code == 200

    today = date.today()
    inv = (
        db_session.query(Inventory)
        .filter(
            Inventory.item_id == item.id,
            Inventory.warehouse_id == 1,
            Inventory.as_of_date == today,
        )
        .first()
    )
    assert inv is not None
    assert float(inv.qty) == 10

    # 5 출고 → 재고 5
    resp_out = client.post(
        "/api/stock-transactions",
        json={
            "item_id": item.id,
            "warehouse_id": 1,
            "trx_type": "OUT",
            "qty": 5,
            "reason": "테스트 출고",
        },
    )
    assert resp_out.status_code == 200

    inv = (
        db_session.query(Inventory)
        .filter(
            Inventory.item_id == item.id,
            Inventory.warehouse_id == 1,
            Inventory.as_of_date == today,
        )
        .first()
    )
    assert float(inv.qty) == 5


def test_stock_transaction_prevents_negative_inventory(db_session: Session, client) -> None:
    """
    출고로 인해 재고가 음수가 되려 하면 400 에러를 반환하는지 검증.
    """
    item = Item(
        code="STK-NEG",
        name="재고 음수 테스트",
        type="RAW",
        uom="KG",
        safety_stock_qty=0,
        lead_time_days=0,
        is_active=True,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    # 재고 0 상태에서 1 출고 시도 → 400
    resp = client.post(
        "/api/stock-transactions",
        json={
            "item_id": item.id,
            "warehouse_id": 1,
            "trx_type": "OUT",
            "qty": 1,
            "reason": "음수 재고 시도",
        },
    )
    assert resp.status_code == 400


def test_stock_transaction_respects_as_of_date_and_lot(db_session: Session, client) -> None:
    """as_of_date·lot_no별로 inventory 행이 분리되는지 검증."""
    item = Item(
        code="STK-DATE-LOT",
        name="일자·로트 테스트",
        type="RAW",
        uom="EA",
        safety_stock_qty=0,
        lead_time_days=0,
        is_active=True,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    d0 = date.today() - timedelta(days=3)
    d1 = date.today() - timedelta(days=2)

    assert (
        client.post(
            "/api/stock-transactions",
            json={
                "item_id": item.id,
                "warehouse_id": 1,
                "trx_type": "IN",
                "qty": 10,
                "as_of_date": d0.isoformat(),
                "lot_no": "L-A",
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/stock-transactions",
            json={
                "item_id": item.id,
                "warehouse_id": 1,
                "trx_type": "IN",
                "qty": 5,
                "as_of_date": d0.isoformat(),
                "lot_no": "L-B",
            },
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/stock-transactions",
            json={
                "item_id": item.id,
                "warehouse_id": 1,
                "trx_type": "OUT",
                "qty": 3,
                "as_of_date": d0.isoformat(),
                "lot_no": "L-A",
            },
        ).status_code
        == 200
    )

    inv_la = (
        db_session.query(Inventory)
        .filter(
            Inventory.item_id == item.id,
            Inventory.warehouse_id == 1,
            Inventory.as_of_date == d0,
            Inventory.lot_no == "L-A",
        )
        .first()
    )
    inv_lb = (
        db_session.query(Inventory)
        .filter(
            Inventory.item_id == item.id,
            Inventory.warehouse_id == 1,
            Inventory.as_of_date == d0,
            Inventory.lot_no == "L-B",
        )
        .first()
    )
    assert inv_la is not None and float(inv_la.qty) == 7
    assert inv_lb is not None and float(inv_lb.qty) == 5

    # 다른 기준일에는 해당 로트 재고가 없으면 출고 실패
    resp_bad = client.post(
        "/api/stock-transactions",
        json={
            "item_id": item.id,
            "warehouse_id": 1,
            "trx_type": "OUT",
            "qty": 1,
            "as_of_date": d1.isoformat(),
            "lot_no": "L-A",
        },
    )
    assert resp_bad.status_code == 400

