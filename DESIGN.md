# DOCDO Design System

이 문서는 DOCDO 앱 UI의 단일 구현 기준이다. UI를 수정하는 Agent는 작업 전에 이 문서와 `mobile/src/theme.ts`를 끝까지 읽는다.

## 1. Source of truth

- 최우선 시각 기준: [DOCDO Figma](https://www.figma.com/design/Gzo8aeA7TBsxjAj9NoFblY/%EC%A0%9C%EB%AA%A9-%EC%97%86%EC%9D%8C?node-id=0-1)
- Figma page: `0:1` (`DOCDO Wireframe`)
- 기준 viewport: `402 × 874`
- 코드 토큰: `mobile/src/theme.ts`
- Figma와 이전 문서, 기존 UI가 충돌하면 Figma가 우선한다. 보안·권한·데이터 확인 규칙은 Figma보다 우선한다.
- 화면을 임의로 재해석하지 않는다. 정보 순서, 주요 색, 여백, radius, CTA 위치를 노드와 맞춘다.

### Screen map

| Flow | Figma node | App route/state |
|---|---:|---|
| 온보딩 | `9:37` | `/onboarding` |
| 홈 · 오늘 할 일 | `9:73` | `/(tabs)` |
| 문서 촬영 | `9:139` | `/document/new` camera state |
| AI 분석 | `9:175` | `/document/[id]` processing state |
| 문서 결과 | `9:217` | `/document/[id]` summary state |
| 실행 계획 | `9:265` | `/document/[id]` actions state |
| 문서 Q&A | `9:316` | `/document/ask?id={documentId}` |
| 부모님 확인 요청 | `9:364` | `/document/confirm-request?id={documentId}` |
| 문서 보관함 | `9:416` | `/(tabs)/documents` |
| 가족 공유 | `9:504` | `/(tabs)/care` |

## 2. Product character

DOCDO는 고령 부모님의 종이 문서를 읽고, 해야 할 일을 가족과 함께 처리하도록 돕는 차분한 도우미다.

- 큰 제목, 짧은 설명, 한 화면 한 행동을 쓴다.
- 사용자가 현재 상태와 다음 행동을 첫 3초 안에 이해할 수 있어야 한다.
- 날짜·금액·조건·계좌는 반드시 원문 근거와 사용자 확인을 거친다.
- 실패 화면은 막다른 길이 아니다. 실패 원인과 바로 실행할 복구 행동을 함께 보여준다.
- 색만으로 상태를 전달하지 않는다. 텍스트, 아이콘, 순서를 함께 쓴다.

## 3. Color tokens

화면 파일에서는 아래 의미 토큰을 사용하고 hex를 직접 쓰지 않는다.

```yaml
ink:               "#17191C"
white:             "#FFFFFF"

purple-700:        "#4543C7"
purple-600:        "#5E5CE6"  # primary CTA, active tab, brand
purple-300:        "#C9C7FA"
purple-200:        "#DAD8FF"
purple-100:        "#EFEEFF"  # summary, selected surface

grey-700:          "#6D737C"  # secondary text
grey-500:          "#969BA4"  # placeholder
grey-400:          "#C7CAD1"
grey-300:          "#D9DCE2"
grey-200:          "#E6E8EC"  # border/divider
grey-100:          "#F4F5F7"  # neutral surface

red-600:           "#D94D4D"
red-100:           "#FFF0F0"
orange-600:        "#B66A15"
orange-100:        "#FFF5E6"
green-600:         "#249A5A"
green-100:         "#EAF8F0"
blue-100:          "#EAF3FF"

camera-900:        "#111216"
camera-800:        "#1A1B20"
camera-700:        "#25262C"
camera-600:        "#2A2B31"
```

Semantic mapping:

```yaml
background-primary:   white
background-secondary: grey-100
background-brand:     purple-100
foreground-primary:   ink
foreground-secondary: grey-700
foreground-disabled:  grey-500
foreground-brand:     purple-600
line-default:         grey-200
line-focus:           purple-600
action-primary:       purple-600
action-pressed:       purple-700
danger:               red-600 / red-100
warning:              orange-600 / orange-100
success:              green-600 / green-100
```

### Brand mark and app icon

- 기본 마크는 `purple-600` 바탕의 흰색 문서형 `D`와 `green-600` 확인 표시다.
- 앱 아이콘 원본은 `mobile/assets/icon.svg`, 배포용 1024px 자산은 `mobile/assets/icon.png`다.
- 아이콘에는 알파 채널, 외곽 투명 여백, 플랫폼 라운드 마스크를 미리 넣지 않는다.
- 온보딩과 작은 avatar에서는 복잡한 원본을 축소하지 않고 보라색 타일 속 흰색 `D` 단순형을 쓴다.

## 4. Typography

Figma와 동일하게 Noto Sans KR을 앱 번들에 포함한다.

```yaml
regular: NotoSansKRRegular
medium:  NotoSansKRMedium
bold:    NotoSansKRBold

display: 28/38 bold
h1:      27/36 bold
h2:      25/35 bold
h3:      19/27 bold
title:   17/24 bold
body:    15/23 regular
body-sm: 14/21 regular
label:   16/22 bold
caption: 12/18 medium
micro:   11/16 regular
```

- 금액과 날짜는 `tabular-nums`를 쓴다.
- 사용자 설정 1.0 / 1.2 / 1.4 배율은 모든 `AppText`에 적용한다.
- 140%에서 텍스트가 잘리면 고정 높이를 늘리거나 스크롤한다. 폰트를 축소하지 않는다.
- 버튼과 상호작용 라벨은 최대 2줄까지 허용한다.

## 5. Layout

```yaml
base-grid: 4
screen-horizontal-padding: 20
section-gap: 32-40
control-gap: 12
button-height: 56
compact-button-height: 42
tab-bar-height: 80
minimum-hit-target: 48

radius-icon: 12-16
radius-button: 16
radius-row: 16-18
radius-card: 18-22
radius-feature: 24
radius-pill: 999
```

- 모바일은 402px 기준으로 20px 좌우 여백을 유지한다.
- 웹은 402px 비율의 단일 컬럼을 중앙에 두고 최대 720px까지만 확장한다.
- 기본 카드에는 그림자를 쓰지 않는다. Figma처럼 1px border 또는 색 surface로 구분한다.
- 보라색 주요 CTA에만 `0 7 9 rgba(0,0,0,.14)` 그림자를 허용한다.
- Safe Area는 OS가 담당하며, Figma의 가짜 상태바는 구현하지 않는다.

## 6. Core components

### Primary button

- 높이 56, radius 16, purple-600 배경, 흰색 16 bold.
- 화면당 한 개만 둔다.
- 왼쪽 화살표는 실제 동작 의미가 있을 때만 넣는다.
- 로딩 중 중복 탭을 막고 진행 문구 또는 spinner를 유지한다.

### Surface row

- 높이 70~90, radius 16~18, border grey-200.
- 왼쪽 아이콘 40~48, 가운데 제목과 메타, 오른쪽 상태 또는 chevron.
- 행 전체가 최소 48dp 터치 영역이다.

### Pill

- 높이 30, radius full, 10~12 bold.
- `확인 필요/D-day` red, `확인` orange, `완료` green, active filter purple.
- 색과 함께 상태 문구를 반드시 표시한다.

### Toggle

- 시각 크기 54×30. 전체 설정 행이 터치 영역이다.
- ON은 purple-600, OFF는 grey-100/grey-200.

### Bottom navigation

- `홈 / 문서 / 스캔 / 가족` 네 항목만 표시한다.
- 스캔은 중앙의 46px 보라색 원이 bar 위로 18px 돌출된다.
- active 아이콘과 라벨은 purple-600, inactive는 grey-700.
- 설정은 홈 우측 상단 버튼에서 접근하며 tab으로 추가하지 않는다.

## 7. Screen behavior

### Onboarding (`9:37`)

- D 로고와 DOCDO, 문서 일러스트, 2줄 헤드라인, 두 장점, `시작하기` CTA 순서다.
- 시작하기 뒤 로그인/가입으로 이동한다.
- 로그인된 사용자는 다시 보지 않는다.

### Home (`9:73`)

- 사용자 avatar/name과 오늘 확인할 문서 수를 상단에 둔다.
- 가장 기한이 가까운 문서를 red-100 hero card로 강조한다.
- `오늘 할 일`은 최대 2개, `최근 문서`는 최대 2개를 보여준다.
- 우측 상단 버튼은 설정으로 이동한다.

### Camera (`9:139`)

- `document/new` 진입 즉시 `CameraView`가 렌더링되고 권한 요청이 시작된다.
- 별도의 `카메라로 촬영` 버튼을 먼저 보여주지 않는다.
- 화면은 camera-900, 상단 닫기/플래시, 중앙 318×414 가이드, 하단 앨범/셔터/회전으로 구성한다.
- 셔터로 사진을 찍으면 미리보기·재촬영·페이지 추가·분석 동의 화면으로 전환한다.
- 권한 거부는 카메라 대신 이유, `설정 열기`, `앨범에서 선택`, `PDF 선택`을 보여준다.
- 웹은 브라우저 제한 때문에 자동 촬영 대신 파일 선택 복구 UI를 보여준다.

### Processing (`9:175`)

- 백엔드 문서 상태를 `문서 구조화 / 문서 분류 / 중요 항목 추출 / 쉬운 말 요약` 4단계로 매핑한다.
- 완료는 green, 현재 단계는 purple, 대기는 neutral로 표시한다.
- 가짜 진행률로 완료를 약속하지 않는다. 상태 기반의 결정적 비율만 쓴다.
- `READY` 또는 `NEEDS_CONFIRMATION`이 되면 같은 상세 route에서 결과 화면으로 자동 전환한다.

### Result (`9:217`)

- 상태 pill, 제목, 기관/기간, easy summary, 중요 정보, 원문 근거, 하단 CTA 순서다.
- 날짜·금액·계좌·조건은 확인 전에는 `확인 필요` 상태와 입력 UI를 제공한다.
- 우측 `원문`과 `원문 근거` 행은 권한이 있을 때만 열 수 있다.
- unsupported 문서는 행동 CTA를 만들지 않는다.

### Actions (`9:265`)

- 행동을 세로 timeline으로 표시한다.
- DONE=green check, 현재 TODO/IN_PROGRESS=purple number, 이후=pale number.
- 확인되지 않은 핵심 필드가 있으면 알림과 행동 시작을 비활성화하고 이유를 말한다.
- 추천 실행은 확인 요청과 로컬 알림이다.

### Q&A (`9:316`)

- 답변은 현재 문서의 분석과 SourceAnchor만 사용한다.
- 근거 없는 문장은 생성하지 않는다.
- 답변 bubble마다 최소 한 개의 `원문 N쪽` 또는 `근거 보기` pill을 둔다.
- 빠른 질문과 입력창을 제공하고 프롬프트 인젝션은 데이터로 취급한다.

### Parent confirmation (`9:364`)

- 연결된 가족, 큰 글씨 메시지 미리보기, 문자/카카오톡/전화 안내, 접근성 toggle을 보여준다.
- 외부 전송은 OS share/sms/deep link로 사용자가 직접 확정한다. 서버가 몰래 보내지 않는다.
- 지원되지 않는 앱은 일반 공유 시트로 복구한다.

### Documents (`9:416`)

- 검색창, `전체/납부/복지/건강/확인 필요` filter pills, 월별 목록 순서다.
- 검색은 제목, 분류, 표시 값에서 대소문자 없이 수행한다.
- 실제 데이터만 표시하며 Figma 예시 문서를 채워 넣지 않는다.

### Family (`9:504`)

- 연결 가족, 공유 설정, 최근 audit 알림 순서다.
- 기본 공유는 결과와 행동만 허용한다. 원문은 자동 공유하지 않는다.
- 공유 또는 연결 해제는 즉시 후속 접근을 차단한다.

## 8. Copy and accessibility

- 쉬운 한국어 해요체를 쓴다.
- 오류는 `무엇이 안 됐어요`와 `지금 할 수 있는 행동`을 함께 말한다.
- 아이콘 버튼에 `accessibilityLabel`, 선택 UI에 `accessibilityState`를 둔다.
- 시각 요소가 40px이어도 hitSlop 또는 wrapper는 48dp 이상이어야 한다.
- 색상 외에 문구와 아이콘으로 상태를 반복한다.
- TTS는 화면에 실제 표시된 설명과 행동만 기기에서 읽는다.

## 9. Agent checklist

1. `DESIGN.md`와 `mobile/src/theme.ts`를 먼저 읽는다.
2. 구현할 화면의 Figma node에 `get_design_context`를 호출한다.
3. 기존 `AppText`, `AppButton`, surface, status component를 재사용한다.
4. 화면 파일에 hex, 임의 font family, 임의 shadow를 넣지 않는다.
5. 예시 데이터를 실제 사용자 데이터처럼 하드코딩하지 않는다.
6. 로딩, 빈 상태, 권한 거부, 네트워크 실패, unsupported, 공유 취소 상태를 함께 구현한다.
7. 모바일 402px 및 웹 중앙 컬럼, text scale 1.0/1.4를 확인한다.
8. 아래 검사를 모두 통과시킨다.

```bash
cd mobile
npm run typecheck
npm run lint
npm test -- --runInBand
npm run web:build
```

9. 카메라, 업로드, TTS, 알림은 iPhone Release 빌드에서 검증한다.
