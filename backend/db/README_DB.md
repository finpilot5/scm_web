# DB 운용 메모 (초기 버전)

- 테이블과 인덱스는 `Base.metadata.create_all(bind=engine)`를 통해 생성된다.
- 컬럼 정의에서 `primary_key=True`, `index=True`, `unique=True`로 설정된 부분이 실제 인덱스로 반영된다.
- 운영 환경에서는 Alembic 등을 사용해 마이그레이션을 관리하는 것을 권장한다.
- Postgres 수동 반영: `migrations/002_stock_transaction_ledger.sql` (원장 컬럼 확장). SQLite·로컬은 `main.py` startup의 `ALTER`로도 추가된다.

## 기본 마스터 데이터 세팅

- `seed_master_data.sql`을 psql에서 실행하면 예시 품목/창고 데이터가 들어간다.

```bash
psql -U scm_user -d scm_db -f backend/db/seed_master_data.sql
```

## 환경 분리 메모

- 개발: EC2 내 Postgres (`scm_db`), `.env`에 DB URL 설정.
- 운영/스테이징: 추후 별도 인스턴스 또는 관리형 Postgres로 분리하고, 환경변수로 접속 정보를 분리 관리한다.

