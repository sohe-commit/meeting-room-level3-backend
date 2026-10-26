# 사내 회의실 예약 시스템 — 백엔드 (NestJS)

(주)가상테크 사내 회의실 예약 시스템의 서버예요. 예약 규칙은 모두 이 서버가 지켜요.
화면(프론트엔드)은 별도 저장소의 Next.js 앱이에요.

> 회사, 직원, 연락처, 예약은 **모두 가상 데이터**예요.

## 내 컴퓨터에서 실행하기

```bash
npm install
cp .env.example .env   # 값을 채워 주세요 (아래 표 참고)
npm run start:dev      # http://localhost:4100
```

- 처음 켤 때 DB에 `meeting_room` 스키마와 테이블 5개를 만들고, 비어 있으면 가상 데이터를 자동으로 채워요.
- 상태 확인: <http://localhost:4100/health> → `{"status":"ok","db":"connected", ...}`
- 규칙 테스트: `npm test`

## 설정값 (.env)

`.env`는 GitHub에 올라가지 않아요. `.env.example`을 복사해서 만드세요.

| 이름 | 설명 |
|---|---|
| `PORT` | 서버 포트 (기본 4100) |
| `DATABASE_URL` | PostgreSQL 주소 |
| `DB_SCHEMA` | 이 과제 전용 스키마 이름 (기본 `meeting_room`). 다른 과제 테이블과 섞이지 않아요. |
| `JWT_SECRET` | 로그인 증표를 만드는 긴 무작위 문자열 |
| `GPT_API_KEY` | OpenAI GPT API 키 (AI 예약에 사용, 백엔드에만 둠) |
| `GPT_MODEL` | GPT 모델 이름 (기본 `gpt-4o-mini`) |
| `FRONTEND_URL` | 접속을 허용할 프론트엔드 주소. 여러 개면 쉼표로 구분 |

## 확인용 가상 계정

모든 계정의 비밀번호는 `test1234`예요.

| 역할 | 이메일 |
|---|---|
| 관리자 (총무팀 박총무) | admin@example.com |
| 직원 (개발팀 김가상) | user@example.com |
| 그 밖의 직원 | user03@example.com ~ user20@example.com |

## 백엔드가 지키는 규칙

| # | 규칙 |
|---|---|
| R1 | 예약은 10:00~19:00 안에서만 |
| R2 | 30분 단위 |
| R3 | 한 번에 최소 30분, 최대 3시간 |
| R4 | 지난 시간 불가, 오늘부터 30일 뒤까지 |
| R5 | 같은 회의실 시간 겹침 금지 (끝=시작은 허용, 동시에 눌러도 한 명만 성공) |
| R6 | 참석 인원 ≤ 정원 |
| R7 | 사용 중지된 회의실은 예약 불가 |
| R8 | 취소는 본인만, 회의 끝 시각 전까지 (관리자도 남의 예약은 취소 불가) |
| R9 | 회의실 관리·현황판·전체 예약·제보 관리·데이터 초기화는 관리자만 |
| R10 | AI 예약도 R1~R7을 똑같이 통과해야 예약됨 |
| R11 | 시설 제보는 분류 필수, 내용 2~200자, 쓴 뒤 수정·삭제 불가 |
| R12 | 제보 처리 완료는 관리자만, 한 번 처리하면 되돌릴 수 없음 |
| R13 | 장비 고장 제보는 그 회의실에 있는 장비(또는 기타 장비)만 고를 수 있음 |

모든 날짜·시간은 한국 시간 기준으로 계산해요. (Render 서버가 UTC여도 같은 결과)

## 주소 목록

| 기능 | 주소 | 누가 |
|---|---|---|
| 상태 확인 | `GET /health` | 누구나 |
| 로그인 / 내 정보 | `POST /auth/login`, `GET /auth/me` | 누구나 / 로그인 |
| 부서 목록 | `GET /departments` | 로그인 |
| 회의실 목록(필터) / 상세 | `GET /rooms?minCapacity=&tv=&videoConf=&whiteboard=&projector=`, `GET /rooms/:id?date=` | 로그인 |
| 회의실 등록 / 수정·사용 중지 | `POST /rooms`, `PATCH /rooms/:id` | 관리자 |
| 하루 예약표 | `GET /reservations/timeline?date=` | 로그인 |
| 예약 등록 / 내 예약 / 상세 / 취소 | `POST /reservations`, `GET /reservations/me?status=`, `GET /reservations/:id`, `PATCH /reservations/:id/cancel` | 로그인 (취소는 본인) |
| 전체 예약 (필터·검색) | `GET /reservations?date=&roomId=&departmentId=&status=&q=` | 관리자 |
| 시설 제보 보기 / 쓰기 | `GET /rooms/:id/issues`, `POST /rooms/:id/issues` | 로그인 |
| 전체 제보 / 처리 완료 | `GET /issues?roomId=&category=&equipment=&status=`, `PATCH /issues/:id/resolve` | 관리자 |
| AI 예약 | `POST /ai/reserve` | 로그인 |
| 현황판 | `GET /admin/dashboard` | 관리자 |
| 가상 데이터 다시 채우기 | `POST /admin/seed` | 관리자 |

## Render에 올릴 때

- Build Command: `npm install && npm run build`
- Start Command: `npm run start:prod`
- Environment: 위 표의 값을 Render 화면에 직접 넣어요. `DATABASE_URL`은 같은 Render 안이면 Internal Database URL을 써도 돼요. `FRONTEND_URL`에는 Vercel 주소를 넣어요.
