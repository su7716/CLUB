# 원우회 관리 앱 개발 설계 (v0.1)

기준 문서: PRD.txt, 컨펌 전 디자인 목업(9안), 운영자 요청 이미지(회원정보·조직도·회칙·회의록).

## 1. 결정 사항

| 항목 | 결정 | 이유 |
|---|---|---|
| 형태 | 반응형 웹 + PWA(홈 화면 추가) | PRD가 네이티브 앱 제외. 휴대폰·태블릿·PC 모두 같은 주소 |
| 프레임워크 | Next.js (App Router) + TypeScript + Tailwind | PRD 기술 스택 |
| 데이터베이스 | **구글 시트** (서비스 계정, 서버에서만 접근) | 사용자 요청. PRD의 Supabase 대체 |
| 실시간 | 서버 폴링 2초 + 서버 캐시 | 구글 시트는 분당 요청 한도가 낮아 서버가 결과를 모아서 내려줌 |
| 인증 | 이름 선택 + 초대코드, 서명 쿠키(jose). 관리자는 권한 목록 | 회원가입 없음 |
| AI | Anthropic Claude API(서버 호출) | 인터뷰·소개글·템플릿 제작 |
| 호스팅 | Vercel (서울 icn1) | PRD |

## 2. 구글 시트 한도 대응 (가장 큰 위험)

- 구글 시트 API: 프로젝트당 분당 읽기 300회, 사용자(서비스 계정)당 분당 60회가 기본.
- 대응 1: 모든 읽기는 서버 `SheetStore`가 탭 단위로 1~2초 캐시하고 `batchGet`으로 묶는다.
- 대응 2: 현장 동기화(투표 집계, 사회자 상태)는 **상태 전용 탭 1개**(`LiveState`)만 읽는다. 20명이 2초마다 요청해도 서버 캐시 1회로 처리.
- 대응 3: 쓰기는 `append`/`batchUpdate`로 묶고, 투표는 한 행 추가로 처리해 20명 동시에도 충돌하지 않게 한다.
- 한계: Vercel은 인스턴스가 여러 개일 수 있어 캐시가 완벽히 공유되지 않는다. 20명 규모에서는 충분하지만 "투표 반영 2초 이내"는 보장이 아니라 목표다. 현장 리허설에서 측정한다.
- 개발 중에는 `SheetStore` 인터페이스의 로컬 파일 구현(`LocalStore`)으로 구글 시트 없이 동작한다.

## 3. 시트(탭) 구조

| 탭 | 주요 열 |
|---|---|
| Settings | key, value(JSON) — 원우회 이름, 초대코드 해시, 회원구분 값/정의, 직책 값 |
| Members | id, 성명, 회원구분, 직책, 성별, 회사명, 직위, 생년월일, 연락처, 연령대, 권한(admin 권한 목록), 추가열(JSON) |
| Org | id, 부서, 직책, member_id, 소모임명, 모임횟수, 리더 |
| Rules | 조번호, 조문, 버전, 확정여부 |
| Minutes | id, 일시, 장소, 참석자, 안건, 상태, 후속조치 |
| Events | id, 유형(전체정기모임/워크숍/소모임), 이름, 일시, 장소, 예약정보, 상태, 개요공개 |
| EventApplies | event_id, member_id, 응답(참석/불참), 날짜(11,12), 회비입금, 입금확인일 |
| EventFees / EventCosts | 회비 금액, 비용 항목, 예산, 집행, 담당 |
| EventPrep / EventSchedule | 준비물, 일정 |
| EventActivities | event_id, template_id, template_version, 설정 덮어쓰기(JSON), 상태 |
| ActivityTemplates | id, 이름, 버전, 설정(JSON), 만든방식(기본/AI) |
| Teams / Carpools | 조편성(활동별), 카풀(왕복/갈때/올때) |
| LiveState | event_activity_id, 단계, 투표열림, 작성열림, 현재 대상, 타이머 |
| Profiles / TruthLies / Guesses / Votes / Worries / Capsule* | PRD 7장 데이터 모델 |

개인 답변 원문, 생년월일은 로그에 남기지 않는다. 타임캡슐 본문은 서버 키로 암호화해 저장하고 열림 일시 전에는 API가 내려주지 않는다.

## 4. 활동 템플릿 설정 (사용자 최종 요청 반영)

활동이 어떻게 반응할지는 **코드가 아니라 템플릿 설정**이 결정한다. 행사에 템플릿을 넣으면 설정이 복사되고(`EventActivities`), 행사별로 덮어쓸 수 있다.

```jsonc
{
  "id": "who-am-i", "name": "내가 누굴까요?", "version": 1,
  "preEvent": {                      // 행사 전 사전 작성
    "enabled": true,                 // false면 사전 작성 단계 자체가 없음
    "opensBeforeDays": 14, "closesBeforeDays": 7,
    "steps": ["ai_interview", "truth_lies", "reading_optional"]
  },
  "guessPhase": { "enabled": true, "opensBeforeDays": 7, "closesBeforeDays": 1 },
  "onsite": {
    "steps": [
      { "key": "intro",   "memberScreen": "wait",  "unlock": "host_click" },
      { "key": "reveal",  "memberScreen": "iam_button", "unlock": "host_click" },
      { "key": "vote",    "memberScreen": "vote",  "unlock": "host_click" },   // 사회자가 '투표'를 누르면 회원 확인 버튼 활성화
      { "key": "result",  "memberScreen": "wait",  "unlock": "host_click" }
    ]
  },
  "scoring": { "enabled": true, "tieBreak": "roulette" }
}
```

- `unlock`: `host_click`(사회자/관리자가 누르면 회원 화면 활성화), `immediate`(단계가 시작되면 바로). 일시를 지정하는 `scheduled`는 필요해질 때 추가한다.
- 사회자 버튼을 누르면 `LiveState`(단계, 회원 화면 켜짐 여부)가 바뀌고, 회원 앱은 2초마다 `/api/events/[id]/live`를 읽어 템플릿 설정대로 화면을 켠다. 이 응답에는 활동 내용을 넣지 않는다.
- 행사에 활동을 넣을 때 템플릿 설정을 복사하므로, 행사별 수정이나 이후 템플릿 수정이 서로 영향을 주지 않는다.
- `preEvent.enabled=false`인 활동(예: 나의 고민은 현장 작성만, 타임캡슐은 현장 작성)은 홈에서 "현장에서 작성"으로 표시된다.
- 회원 앱은 `LiveState`의 현재 단계와 템플릿의 `unlock` 규칙만 보고 화면을 켜고 끈다. 활동별 하드코딩이 없다.
- 새 템플릿은 관리자가 AI와 대화로 만들면 이 JSON 스키마(zod로 검증)로 생성된다. 스키마를 벗어난 결과는 저장되지 않는다.
- 기본 템플릿 3개: 내가 누굴까요? / 나의 고민은? / 타임캡슐 (타임캡슐은 `preEvent.enabled=false`, 작성 단계 `host_click`).

### 4-1. 참여 대상과 출석 체크

- 활동의 참여 대상은 두 가지다: `all`(전체 회원), `selected`(관리자 선택 회원). 기본 템플릿 3종은 `selected`.
- `selected` 이면 관리자가 활동 탭의 **출석 체크**에서 참여할 사람을 고르고 **완료**해야 사회자가 활동을 시작할 수 있다(`Attendance` 탭, `attendance:<활동>` 설정).
- 선택되지 않은 회원은 활동(2진실 1거짓, 맞히기, 투표, 고민, 타임캡슐)에 들어가지 않는다. 소개 활동이라면 AI 인터뷰로 프로필 북용 소개만 작성한다(2진실 1거짓 불필요).
- 활동의 날짜와 진행 시간(`EventActivities.startsAt/endsAt`)은 회원에게 알려 주는 안내용 정보이며 참여 대상과 연결하지 않는다.

### 4-2. 배포(확인) 방식

- 타임캡슐 팀 구성, 행사 조편성, 카풀은 모두 초안으로 만들고 관리자가 **확인**을 눌러야 회원에게 보인다. 구성을 바꾸면 다시 초안이 된다.
- 팀 구성 방식: 관리자 배정(빈 팀 + 드래그), 연령대 섞기, 랜덤 배정. 이미 타임캡슐이 작성되었으면 팀을 바꿀 수 없다.

### 4-3. 프로필 북과 내보내기

- 프로필 북은 공개로 승인된 소개 글만 보여 준다. 실명 공개 시점(`profileRevealAt`) 전에는 별칭만, 미작성 회원은 이름 없이 인원 수만 알려 준다.
- 내보내기(JSON/CSV)는 '모든 권한' 관리자만 가능하고, 인터뷰 원문·타임캡슐 본문·공개 전 고민/소개 초안·초대코드는 제외한다.

## 5. 권한

- 관리자 최대 5명. `Members.권한`에 `all` 또는 `members|events|fees|activities|minutes` 중 복수.
- 회원정보(회사·연락처·생년월일)는 관리자 API에서만 반환. 일반 회원 API는 이름·별칭·공개 승인된 프로필만.
- 모든 민감 읽기·쓰기는 Route Handler 경유, 클라이언트에서 시트 직접 접근 없음.

## 6. 개발 순서

1. 프로젝트 세팅, 디자인 토큰(목업 9안), `SheetStore`(Local/Google), 로그인(회원·관리자 복수)
2. 회원관리(명단·회원구분·원우회 설정), 행사 목록, 행사 개요, 참석 신청, 졸업여행 날짜, 회비 안내·입금 확인
3. 활동 템플릿 스키마와 기본 3종, 행사에 활동 넣기, `LiveState` 활성화 규칙
4. 내가 누굴까요? (AI 인터뷰, 승인, 추측, 현장, 점수·룰렛)
5. 나의 고민은?, 타임캡슐
6. 조편성, 카풀, 비용, 준비물, 일정, 조직도·회칙·회의록
7. AI 템플릿 제작, 내보내기, 부하 테스트, 배포

각 단계가 끝날 때마다 로컬에서 실행해 확인하고 요약을 남긴다.

## 7. 사용자가 준비해야 할 것

- 구글 시트 1개(빈 시트 가능)와 서비스 계정 키(JSON). 시트를 서비스 계정 이메일에 편집자로 공유.
- Anthropic API 키(AI 기능 단계에서).
- Vercel 계정과 GitHub 저장소(배포 단계에서).
