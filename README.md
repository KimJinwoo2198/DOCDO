# DOCDO

DOCDO는 고지서와 공공기관·보험/금융 안내문을 쉬운 말로 설명하고, 중요한 날짜와 금액을 사용자가 직접 확인한 뒤 해야 할 일과 기한 알림으로 연결하는 문서 처리 에이전트입니다. 사용자는 초대코드로 보호자를 연결하고 문서별로 결과·행동 관리·원문 열람 권한을 나눠 공유할 수 있습니다.

이 MVP는 실제 납부, 신청, 서명 또는 기관 처리 완료를 대신하거나 보증하지 않습니다. 전화·공식 HTTPS 페이지 연결, 준비물 확인, 담당자 지정, 자기보고식 완료 기록까지만 제공합니다.

## MVP 범위

- 지원 문서: 고지서, 공공기관 통지서, 보험·금융 안내문
- 입력: JPEG/PNG 사진 1~10장 또는 10페이지 이하 PDF
- 분석: 품질 확인 → Upstage Document Parse → Solar 구조화 추출 → 원문 근거 검증
- 확인: 날짜·금액·계좌·대상 조건은 항상 사용자 확인 필요
- 처리: 확인 완료 후 행동 상태 변경과 기기 로컬 알림 허용
- 보호자: 15분·1회용 초대코드, 문서별 권한, 승인 요청 푸시, 공유 취소 즉시 접근 차단
- 보관: AES-GCM 암호화 원본은 7일 후 삭제하고 확인 결과·행동·감사 이력은 유지

지원 범위 밖 문서는 `UNSUPPORTED`로 분류하고 자동 행동 안내를 생성하지 않습니다.

## 구성

- `backend/`: FastAPI, SQLAlchemy, Alembic, Celery, Upstage/mock provider
- `mobile/`: Expo 57, Expo Router, TanStack Query, 기기 TTS·로컬 알림
- `infra/`: PostgreSQL, Redis, 비공개 MinIO, API/worker/beat, Caddy

```text
Expo (사용자/보호자)
  └─ FastAPI + JWT
      ├─ PostgreSQL: 분석·확인·행동·권한·감사 이력
      ├─ Redis/Celery: 비동기 분석·7일 원본 삭제
      ├─ MinIO: AES-GCM 암호화 원본
      ├─ Upstage: Document Parse + Solar
      └─ Expo Push: 보호자 승인 요청·답변 알림
```

## 로컬 실행

필수 런타임은 Python 3.12, uv, Node 22.13 이상, npm입니다. 저장소의 `.nvmrc`를 사용할 수 있습니다.

백엔드:

```bash
cp backend/.env.example backend/.env
cd backend
uv sync --all-groups
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

기본값은 Upstage Studio Agent를 사용하는 `PROVIDER_MODE=studio`입니다. API 키나 Studio Agent/Config ID가 없으면 서버가 시작 단계에서 실패하므로 실제 앱이 고정 mock 결과를 사용자에게 보여주지 않습니다. 로컬 데이터는 SQLite와 암호화 파일 저장소를 사용하며, API 문서는 [http://localhost:8000/docs](http://localhost:8000/docs)에서 확인합니다.

모바일:

```bash
cp mobile/.env.example mobile/.env
cd mobile
npm install
npm run start
```

실기기에서는 `EXPO_PUBLIC_API_BASE_URL`을 개발 PC의 LAN 주소(예: `http://192.168.0.10:8000`)로 바꿉니다. 웹 정적 빌드는 `npm run web:build`로 생성합니다.

### 보호자 푸시 설정

실제 보호자 푸시는 Expo Push Service를 사용합니다. `expo-notifications`만 설치해서는 Android 푸시가 전달되지 않으므로 다음 외부 설정이 필요합니다.

1. `cd mobile && npx eas login && npx eas init`으로 Expo 프로젝트를 연결합니다. 연결된 UUID는 `app.json`의 `extra.eas.projectId`에 저장됩니다.
2. Firebase에 Android 앱 `com.junctionasia.docdo`를 만들고 `google-services.json`을 `mobile/`에 둡니다.
3. `app.json`의 `android.googleServicesFile`을 `./google-services.json`으로 지정합니다.
4. Firebase 서비스 계정 JSON은 저장소에 넣지 않고 `eas credentials`에서 FCM V1 자격증명으로 업로드합니다.
5. 다른 Expo 프로젝트로 빌드할 때만 `mobile/.env`의 `EXPO_PUBLIC_EAS_PROJECT_ID`로 프로젝트 UUID를 덮어씁니다.
6. 보호자 실기기에서 앱을 한 번 열고 알림 권한을 허용한 뒤 확인 요청을 보냅니다.

잠금 화면 푸시에는 문서 제목·금액·기한을 넣지 않습니다. 알림 탭 뒤 JWT와 활성 공유 권한을 다시 확인한 경우에만 승인 내용을 보여줍니다.

## 대표 데모

mock provider는 CI와 명시적인 데모에서만 사용합니다. 아래 흐름을 재현할 때만 `backend/.env`의 `PROVIDER_MODE=mock`으로 바꾸며, 실제 촬영 문서에는 사용하지 않습니다. mock provider는 파일명으로 대표 문서를 고릅니다.

| 파일명 예시 | 분류 | 반드시 확인할 정보 |
|---|---|---|
| `bill.jpg` | 고지서 | 납부 금액 58,320원, 기한 2026-09-10 |
| `public-notice.jpg` | 공공기관 통지서 | 제출 기한 2026-09-15 |
| `insurance.jpg` | 보험·금융 안내 | 보험료 420,000원, 기한 2026-09-30 |
| `unsupported.jpg` | 지원 범위 밖 | 행동을 생성하지 않음 |

골든 플로우:

1. 사용자 계정으로 가입하고 `bill.jpg`를 업로드합니다.
2. 금액과 날짜를 원문 인용과 비교해 확인합니다.
3. 문서 상태가 `READY`가 되면 행동을 시작하고 기한 하루 전 알림을 만듭니다.
4. 보호자 계정에서 사용자의 6자리 초대코드를 수락합니다.
5. 사용자가 확인 요청을 보내면 보호자 기기에 개인정보 없는 푸시가 도착합니다.
6. 보호자가 알림을 눌러 금액·기한·원문 근거를 확인하고 승인합니다.
7. 승인 뒤에만 기관의 공식 HTTPS 납부 화면을 열고, 마지막 결제는 사용자가 직접 확정합니다.
8. 사용자가 활동 이력을 확인한 뒤 공유를 취소합니다.
9. 보호자가 같은 문서와 승인 요청에 다시 접근하면 `404`로 차단됩니다.

`blurry-bill.jpg` 또는 `cropped-bill.jpg`는 재촬영 흐름을 재현합니다. 재촬영 화면에서 강행하면 모든 핵심 필드가 다시 확인 대상으로 설정됩니다.

## Upstage Studio 실제 연동

[Upstage Console](https://console.upstage.ai/api-keys)에서 API 키를 만든 뒤 `backend/.env` 또는 배포 환경의 비밀 저장소에 다음 값을 설정합니다. 키는 모바일의 `.env`, Expo 번들, 저장소, 채팅에 넣지 않습니다.

```dotenv
PROVIDER_MODE=studio
UPSTAGE_API_KEY=up_...
UPSTAGE_BASE_URL=https://api.upstage.ai/v1
UPSTAGE_DOCUMENT_MODEL=document-parse
UPSTAGE_SOLAR_MODEL=solar-pro4
UPSTAGE_STUDIO_BASE_URL=https://api.upstage.ai/v2
UPSTAGE_STUDIO_AGENT_ID=agt_...
UPSTAGE_STUDIO_CONFIG_ID=1
UPSTAGE_STUDIO_TIMEOUT_SECONDS=240
UPSTAGE_STUDIO_POLL_SECONDS=1
```

백엔드는 안정 버전 Document Parse로 원문 element와 좌표를 확보한 뒤, 원본 파일을 Studio v2 `/files`에 등록하고 `/responses`에서 Studio Agent를 실행합니다. Studio Agent는 `Parse → Classify → 유형별 Extract → 쉬운 설명 Instruct → 안전 검토 Instruct`를 수행합니다. 앱에 저장하기 전 Studio citation을 직접 파싱한 element와 다시 대조하여 `SourceAnchor(page, element_id, bbox, quote)`가 없는 필드·행동은 제거합니다. Agent ID와 Config ID는 provider 감사 로그와 분석 모델 버전에 기록하며, Studio 실패를 mock 결과로 대체하지 않습니다.

현재 DOCDO Studio Agent는 `BILL`, `PUBLIC_NOTICE`, `INSURANCE_FINANCE`, `UNSUPPORTED`를 분류하고 문서 유형별로 날짜·금액·조건·문의처·준비물·계좌와 citation을 추출합니다. `PROVIDER_MODE=upstage`는 Studio 장애를 자동 우회하는 fallback이 아니라 개발자가 명시적으로 선택하는 직접 Parse+Solar 진단 모드입니다.

## API와 클라이언트 생성

주요 API는 `/v1/documents`, `/v1/care-invitations`, `/v1/care-relationships`, `/v1/approval-requests`, `/v1/push-tokens`, `/v1/reminders`, `/v1/dashboard`, `/v1/events` 아래에 있습니다. 응답에는 전체 OCR 텍스트나 저장소 키가 포함되지 않습니다.

FastAPI를 실행한 뒤 생성 클라이언트를 갱신합니다. `mobile/src/api/generated`는 직접 수정하지 않습니다.

```bash
cd mobile
npm run api:generate
```

## 검증

```bash
make backend-lint
make backend-test
make mobile-check
make mobile-web
```

백엔드 CI는 대표 문서 3종의 분류·근거·확인 계약, 품질/악성 MIME, 권한 분리와 공유 취소, 초대코드 만료·재사용·대입 제한, 원본 암호화·7일 삭제, 문서/계정 삭제를 검증합니다. 실제 Upstage smoke test는 API 키가 있는 환경에서 별도로 수행하고 mock 검증은 항상 실행합니다.

## Docker 배포

```bash
cp infra/.env.example infra/.env
# DOMAIN, CORS_ORIGINS, JWT/암호화/DB/MinIO 비밀키를 교체
docker compose --env-file infra/.env -f infra/docker-compose.yml config
docker compose --env-file infra/.env -f infra/docker-compose.yml up --build -d
```

Caddy가 TLS를 종료합니다. PostgreSQL과 MinIO 볼륨에는 별도 백업 정책을 적용해야 하며, `DOCUMENT_ENCRYPTION_KEY`를 잃으면 기존 원본을 복호화할 수 없습니다.

## 배포 전 확인

- 개인정보 처리방침과 원본 7일 보관·삭제 절차
- Upstage 위탁 처리 및 국외 이전 여부 고지
- 금융·보험·행정 안내의 책임 제한 문구
- 운영 비밀키 회전, 접근 로그, 백업·복구 절차
- 고령자·문해력 취약층 대상 실기기 접근성 테스트
