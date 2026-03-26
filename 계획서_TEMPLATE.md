# SCM 자동 일정 관리 시스템 계획서

## 1. 프로젝트 범위
### 1.1 포함 범위
- 제품/원재료, BOM, 재고, 판매예측, 생산계획, 발주 데이터 통합
- 52주 생산/발주 계획 자동 생성
- 캘린더 기반 To-Do 자동 생성
- 소비기한/재고 위험 알림

### 1.2 제외 범위(초기)
- ERP/회계 완전 통합
- 고급 APS 스케줄링 최적화
- 공급사 양방향 EDI 완전 자동화

---

## 2. 아키텍처 설계
### 2.1 시스템 구성
사용자 -> Next.js -> FastAPI -> PostgreSQL

### 2.2 기술 스택
- Frontend: Next.js + TypeScript + Tailwind + Chart/Calendar 컴포넌트
- Backend: FastAPI + SQLAlchemy + 계산 엔진 서비스
- DB: PostgreSQL
- 배포: Vercel(프론트), Railway/Render/Supabase(백엔드)

---

## 3. 데이터베이스 설계(핵심)
### 3.1 마스터
- product (카테고리, shelf_life, safety_stock, production_capa)
- material (lead_time, moq, supplier)
- warehouse

### 3.2 운영 데이터
- inventory (warehouse별, lot별, expiry_date 포함)
- demand_forecast (week 기준)
- production_plan (week 기준)
- purchase_order (order/arrival)
- scm_todo_calendar (event_type, due_date, status)

---

## 4. 자동 계산/스케줄 엔진 설계
### 4.1 주차 계산 단위
- Planning Horizon: 52주
- 기준 주 시작일(월요일) 고정

### 4.2 계산 순서
1) 주차별 예상 수요 생성
2) 필요 생산량 계산
   - need = forecast + safety_stock - on_hand
   - on_hand는 (기초재고 + 수불 IN - 수불 OUT) 누적으로 산출된 값 기준
3) 생산 CAPA 반영
   - cap 초과분은 다음 주 이월
4) 자재 소요량 계산(BOM 전개)
5) MOQ 반영 발주량 계산
   - order_qty = max(shortage, 0), then ceil to MOQ
6) 리드타임 역산 일정 생성
   - 생산 시작일, 발주일, 입고일 계산
7) To-Do 이벤트 생성

### 4.3 소비기한/FIFO 반영
- 출고 시 만료 임박 lot 우선 소비
- FIFO lot 소진의 입력소스: 월간 수불 원장 OUT(출고) 라인/로트/소비기한 정보
- 만료 임계치(예: 14일) 이하 알림 이벤트 생성

---

## 5. API 설계 (MVP+)
- `POST /api/calculate-52w` : 52주 계획 생성
- `GET /api/scm-calendar` : To-Do 일정 조회
- `POST /api/scm-calendar/ack` : 일정 확인/완료 처리
- 기존 CRUD API(items, boms, inventories, production-plans, purchase-orders) 활용

---

## 6. 단계별 구현 계획
### Phase 1 (주 1~2): 데이터 정합/기초
- safety_stock, moq, capa, lot/expiry 필드 정리
- 입력 UI 보강
- 완료 기준: 계산 입력 데이터 결손률 낮춤

### Phase 2 (주 2~4): 52주 계산 엔진
- 주차별 수요/생산/발주 계산 구현
- MOQ/CAPA/리드타임 반영
- 완료 기준: 샘플 SKU 20개 기준 계획 자동 생성

### Phase 3 (주 4~5): 캘린더 To-Do
- 이벤트 생성 규칙 구현
- 주/월/연 보기
- 완료 기준: 발주/생산/출고 일정 자동 표시

### Phase 4 (주 5~6): 알림/시뮬레이션
- 재고 위험/소비기한 알림
- 입력값 변경 시 재계산
- 완료 기준: what-if 시나리오 반영 가능

---

## 7. 리스크 및 대응
| 리스크 | 영향도 | 대응 |
| --- | --- | --- |
| 예측 오차 과대 | High | 시뮬레이션과 수동 보정 UI 제공 |
| 마스터 데이터 불완전 | High | 필수 필드 검증/초기 정합 점검 |
| 일정 충돌(CAPA 초과) | High | 자동 이월 + 경고 |
| 소비기한 데이터 누락 | Medium | lot 입력 강제/검증 룰 |
| 배포 API 미연결 | High | env 체크 + 오류 가이드 |

---

## 8. 테스트 계획
### 8.1 단위 테스트
- MOQ 반올림
- CAPA 초과 이월
- 리드타임 역산
- FIFO lot 선택

### 8.2 통합 테스트
- 수요예측 -> 52주 계획 -> 캘린더 생성
- 재고 변경 -> 재계산 결과 반영

### 8.3 E2E 테스트
- 배포 주소에서 데이터 입력/계획 생성/일정 확인

---

## 9. 배포 계획
1. main 브랜치 푸시
2. Vercel 자동 배포
3. 환경변수(`NEXT_PUBLIC_API_URL`) 및 CORS 점검
4. Smoke test

---

## 10. 완료 기준 (DoD)
- [ ] 52주 자동 계획 생성 성공
- [ ] 캘린더 To-Do 자동 생성/상태관리 가능
- [ ] MOQ/CAPA/소비기한 반영 계산 검증 완료
- [ ] 운영 문서/체크리스트 최신화 완료
