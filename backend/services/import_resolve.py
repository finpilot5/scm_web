from __future__ import annotations

import hashlib

from sqlalchemy.orm import Session

from models.item import Item
from models.warehouse import Warehouse


def build_item_id_by_code(db: Session) -> dict[str, int]:
    out: dict[str, int] = {}
    for it in db.query(Item).all():
        k = str(it.code).strip().upper()
        out[k] = it.id
    return out


def resolve_item_id(by_code: dict[str, int], code: str) -> int | None:
    c = str(code).strip().upper()
    if c in by_code:
        return by_code[c]
    try:
        n = int(float(c.replace(",", "")))
        return by_code.get(str(n).upper())
    except ValueError:
        return None


def get_or_create_warehouse_by_label(db: Session, label: str) -> Warehouse:
    s = (label or "").strip()
    if not s:
        raise ValueError("empty_hub_label")
    w = db.query(Warehouse).filter(Warehouse.name == s).first()
    if w:
        return w
    w = db.query(Warehouse).filter(Warehouse.code == s).first()
    if w:
        return w
    base = hashlib.sha256(s.encode("utf-8")).hexdigest()[:12].upper()
    code = f"H{base}"
    step = 0
    while db.query(Warehouse).filter(Warehouse.code == code).first():
        step += 1
        code = "H" + hashlib.sha256(f"{s}{step}".encode()).hexdigest()[:12].upper()
    w = Warehouse(code=code, name=s, warehouse_type="WAREHOUSE")
    db.add(w)
    db.flush()
    return w


def resolve_default_warehouse(db: Session) -> Warehouse:
    w = db.query(Warehouse).filter(Warehouse.code == "MAIN").first()
    if w:
        return w
    w = db.query(Warehouse).first()
    if not w:
        raise ValueError("no_warehouse")
    return w
