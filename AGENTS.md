# DOCDO agent guide

- UI를 만들거나 수정하기 전에 루트의 `DESIGN.md`를 끝까지 읽는다.
- 색상, 글자, 간격, 모서리는 `mobile/src/theme.ts`의 토큰을 사용하고 화면에 임의 값을 추가하지 않는다.
- 사용자에게 보이는 문장은 쉬운 한국어 해요체로 쓰고, 오류 뒤에는 항상 복구 행동을 제공한다.
- 핵심 본문은 18sp 이상, 모든 터치 영역은 48dp 이상으로 유지한다.
- 카메라·원문·보호자 공유는 개인정보 경계이므로 권한과 보관 안내를 UI에서 숨기지 않는다.
- 변경 후 `npm run typecheck`, `npm run lint`, `npm test`, `npm run web:build`를 실행한다.
