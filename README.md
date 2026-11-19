# 불량 판정소 (DEFECT JUDGE)

컨베이어로 들어오는 전극 시트를 보고 양품·불량을 빠르게 판정하는 도트 게임.

## 실행
- 웹 공개: https://sseongilk.github.io/defect-judge/ (GitHub Pages, `docs/index.html`)
- PC 확인: `dist/play.html`을 브라우저로 열기
- claude.ai: `dist/index.html`을 Artifact로 게시하면 공유받은 사람끼리 공용 랭킹 사용

## 조작
- 양품: 왼쪽 버튼, 왼쪽으로 밀기, ← / A / J
- 불량: 오른쪽 버튼, 오른쪽으로 밀기, → / D / L

## 규칙
- 결함 3종: 핀홀, 미코팅, 크랙 (약 45% 확률로 섞여 들어옴)
- 8개 맞힐 때마다 스테이지 상승: 제한 시간 감소(3.4초 → 최소 1.15초), 결함 크기 축소
- 스테이지 3부터 결함처럼 보이는 빛 반사(양품)가 섞임
- 틀리거나 시간 초과 시 하트 1개 감소, 3개 모두 잃으면 게임 끝
- 점수 = (100 + 남은 시간 비율 × 100) × (1 + 콤보 × 0.1, 최대 콤보 20 반영)

## 이름·랭킹
- 처음 시작할 때 이름 입력(최대 8글자), 시작 화면의 「이름 변경」으로 수정
- Artifact에서는 공용 저장소 `scores/<사용자 id>` 문서에 각자 최고 기록만 저장
  - 접근 규칙: 모두 읽기, 각자 자기 문서만 쓰기, 소유자는 모든 문서 정리 가능
  - 보기 전용(Viewer) 권한으로 공유받은 사람은 기록을 올릴 수 없음 → 참여자(Contributor) 이상으로 공유해야 함
- 웹 공개판(GitHub Pages)은 Supabase에 공용 랭킹 저장
  - 로그인 없음. 기기마다 무작위 id·비밀값을 만들어 자기 기록만 갱신, 최고 점수는 내려가지 않음
  - 설정 전이거나 연결 실패 시 이 기기 랭킹으로 동작
- 저장소를 쓸 수 없는 환경(로컬 파일)에서는 이 기기 랭킹으로 자동 전환

## Supabase 연결 (웹 공개판 공용 랭킹)
1. supabase.com에서 프로젝트 생성
2. SQL Editor에 `tools/supabase.sql` 내용을 붙여 넣고 실행
3. 프로젝트 루트에 `supabase.json` 작성 (Project Settings → API의 값, anon 키는 공개용)
   ```json
   {"url": "https://xxxx.supabase.co", "key": "anon public key"}
   ```
4. `python tools/build.py` 후 `docs/index.html` 커밋·푸시
- service_role 키는 넣지 않음
- 무료 요금제는 1주일간 접속이 없으면 일시 정지됨 → Supabase 화면에서 Restore

## 구조
- `src/game.js` : 게임 전체 (그리기, 판정, 랭킹, 입력)
- `src/page.html` : 페이지 틀 (캔버스, 이름 입력칸, 스타일)
- `tools/build.py` : 갈무리 글꼴을 필요한 글자만 잘라 넣고 `dist/`에 한 파일로 묶음
- `tools/supabase.sql` : 공용 랭킹 테이블·저장 함수
- `docs/index.html` : 빌드 결과 (GitHub Pages 게시본)
- `fonts/` : 갈무리 도트 글꼴 원본 (SIL OFL 1.1, `fonts/OFL.md`, https://github.com/quiple/galmuri)

## 빌드
```
python tools/build.py
```
화면 확인용: `dist/play.html?shot=play|over|rank|name`
