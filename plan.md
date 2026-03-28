# 실행 계획 — 마일스톤 우선

`requirements.md`를 만족시키기 위한 **마일스톤 순서**와, 각 마일스톤 안의 **원자적 작업**이다.  
한 서브에이전트/한 스프린트는 **가능하면 마일스톤 내 1~3개 작업**만 맡긴다.

---

## 마일스톤 순서 (고정)

| 순서 | ID | 이름 | 목표 한 줄 |
| --- | --- | --- | --- |
| 1 | **M1** | 매핑·정책 고정 | 엑셀 시트/컬럼 ↔ DB·API 필드 매핑표와 재고 누적 정책 문서화 |
| 2 | **M2** | 원장 스키마 | `stock_transaction`(또는 동급 테이블)에 R1 필드 반영 + 마이그레이션 |
| 3 | **M3** | 원장→재고 반영 | as_of_date(및 lot)를 반영한 재고 갱신 로직 + 테스트 |
| 4 | **M4** | 출고량 엑셀 | `출고량` 시트 피벗 파싱 → OUT 행 생성 API 또는 배치 |
| 5 | **M5** | 재고DB 엑셀 | `재고DB` 시트 → 스냅샷/트랜잭션 반영 (M1에서 확정한 방식) |
| 6 | **M6** | Reconciliation | 기초+입고−출고 vs 기말 비교 UI 또는 엔드포인트 |
| 7 | **M7** | FIFO·실사용량 | OUT 기반 로트 소진 계산 + 52주/대시보드 연동(예측과 분리 표기) |
| 8 | **M8** | 소비기한·알림 | §2.5·2.7 UI/배치 (선택 후속) |

의존성: M2 → M3 → (M4·M5 병렬 가능) → M6 → M7. M8은 M7 이후.

---

## M1 — 매핑·정책 고정

- [x] `5월 수불.xlsx` 시트별(재고DB, 출고량, 완제품/원재료) **헤더 행**과 API 필드 매핑표를 `docs/` 또는 본 파일 하단 부록에 표로 적는다. → **`docs/수불_매핑.md`**
- [x] **재고 누적 정책**을 한 가지로 선택해 문장으로 고정한다. → **`(item_id, warehouse_id, as_of_date, lot_no)` 키**, 원장은 거래 `as_of_date` 기준 증감; roll-forward 전 기간 재계산은 1차 비범위(M6~옵션).
- [x] `재고DB` 반영 방식: **스냅샷 덮어쓰기(upsert)** 로 확정.

**완료 기준**: 팀(또는 본인)이 M2 구현 시 참고할 표·문단이 저장소에 커밋되어 있다.

---

## M2 — 원장 스키마

- [x] DB 모델에 `as_of_date`, `lot_no`, `expiry_date`, `unit`, `source_ref` 추가.
- [x] `main.py` startup `ALTER` + `migrations/002_stock_transaction_ledger.sql` (Postgres 수동).
- [x] Pydantic 스키마·`POST/GET` 응답 필드 정리 (`StockTransactionRead`에서 레거시 `as_of_date` NULL 시 `trx_time` 날짜로 보정).
- [x] `backend/tests/test_stock_transaction.py` 보강·`conftest` in-memory DB.
- [x] 프론트 `StockTransactionRecord`·`/ledger` 폼·표.

**완료 기준**: 마이그레이션 적용 후 테스트 그린, API 문서 또는 타입과 일치.  
*(로컬에서 `pip install -r requirements-dev.txt` 후 `pytest` 권장.)*

---

## M3 — 원장→재고 반영

- [x] `create_stock_transaction`에서 **Inventory** 키를 `(item_id, warehouse_id, as_of_date, lot_no)` 로 갱신 (M2에 함께 반영).
- [x] 동일 품목·창고·일자·로트 버킷 규칙.
- [x] `test_stock_transaction_respects_as_of_date_and_lot` 추가.

**남음 (후속)**: 과거일 입력 후 **이후 일자 잔고 roll-forward** 자동 재계산은 M6 옵션.

---

## M4 — 출고량 엑셀

- [x] `출고량` 시트: 헤더 행(첫 열 `품목`, 5열부터 일자) 자동 탐지 (`services/issuance_pivot_parser.py`).
- [x] 셀 값 → `StockTransaction` OUT + 재고 차감 (`POST /api/imports/excel/issuance-pivot`).
- [x] `/ledger`에서 파일 업로드 + 창고·시트명 선택.

**완료 기준**: 실제 `5월 수불.xlsx`의 `출고량` 시트 한 번에 import 가능(오류 행 리포트 포함 권장).

---

## M5 — 재고DB 엑셀

- [x] `재고DB` 헤더·가용수량(가장 오른쪽 열)·물류센터·품목·셀명 파싱 (`services/wms_inventory_parser.py`).
- [x] 거점 자동 생성·품목 미매칭 시 오류 수집, `inventory` 스냅샷 upsert (`POST /api/imports/excel/wms-inventory?as_of_date=`).
- [x] `/ledger` UI + `max_rows` 상한(기본 10만).

**완료 기준**: 샘플 파일로 한 사이클 성공.

---

## M6 — Reconciliation

- [ ] 집계 쿼리 또는 서비스: 기간·거점·품목별 입고/출고 합계와 기말 재고 비교.
- [ ] `/ledger` 인근 또는 전용 페이지에 표·CSV보내기(선택).

**완료 기준**: 사용자가 “맞음/틀림”을 한눈에 볼 수 있다.

---

## M7 — FIFO·실사용량·52주

- [ ] 로트 단위 잔고에서 OUT 시 FIFO 소진 알고리즘.
- [ ] `fifo_consumption` 또는 동등 구조 저장·조회.
- [ ] 대시보드/52주 API에 **실적 수요** 필드 추가(예측과 분리).

**완료 기준**: 기획서 §4 입력 목록과 용어가 맞는 최소 데모.

---

## M8 — 소비기한·위험 알림 (후속)

- [ ] 임박 기준 정의 + 목록 API/UI.
- [ ] §2.7 유형별 최소 1종씩 표시.

---

## 진행 상태

| 마일스톤 | 상태 | 메모 |
| --- | --- | --- |
| M1 | DONE | `docs/수불_매핑.md` |
| M2 | DONE | 스키마·API·프론트·마이그레이션 SQL |
| M3 | DONE | 재고 키 일반화 (roll-forward 제외) |
| M4 | DONE | issuance-pivot import |
| M5 | DONE | wms-inventory import |
| M6 | TODO | |
| M7 | TODO | |
| M8 | TODO | |

*(구현이 끝날 때마다 위 표를 `DONE`/`진행중`으로 갱신한다.)*
