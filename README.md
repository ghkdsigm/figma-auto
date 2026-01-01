# A2UI Figma Codegen Starter

See backend/README.md

## 프론트

http://localhost:3001/

## 스웨거

http://localhost:3000/docs#/

---

## A2UI Figma → Vue/Nuxt Codegen Platform

디자이너의 Figma 결과물을 회사 디자인 가이드에 맞는 Vue/Nuxt 코드로 자동 변환하는 실무용 코드 생성 플랫폼
(A2UI Intermediate Representation 기반)

## 1. 프로젝트 개요

이 시스템은 다음 문제를 해결한다.

- Figma 디자인을 개발자가 수작업으로 옮기는 반복 작업 제거
- 회사 디자인 시스템(컴포넌트/토큰/규칙)에 일관되게 매핑
- Vue 3 / Nuxt 3 기준 즉시 사용 가능한 코드 산출
- 디자이너 → 개발자 간 전달 손실 최소화

핵심 아이디어는 "Figma → A2UI 중간 포맷 → 회사 규칙 적용 → 코드 생성" 이다.

## 2. 전체 시스템 프로세스 (기술 관점)

### 2.1 파이프라인 개요

```
Figma Design
   ↓
[Figma Importer]
   ↓
A2UI Intermediate JSON (정규화된 UI 구조)
   ↓
[Design System Mapper]
   ↓
[Code Generator]
   ↓
Vue / Nuxt Project Artifacts
```

### 2.2 단계별 설명

#### 1) Figma Import

- Figma REST API 사용
- 특정 File / Page / Frame 단위로 추출
- AutoLayout, Constraints, TextStyle, ColorStyle 정보 수집

#### 2) A2UI Intermediate Representation

- Figma 고유 구조를 제거한 플랫폼 독립 UI 모델
- 레이아웃 / 컴포넌트 / 스타일을 명확히 분리
- 이후 모든 변환의 기준 포맷

#### 3) Design System Mapping

- 회사 디자인 가이드 적용
- 버튼 → BaseButton
- 색상 → design token
- typography → Typography 컴포넌트
- Tailwind 기반 / 사내 UI Kit 기반 등 전략 선택 가능

#### 4) Code Generation

- Vue 3 / Nuxt 3 기준 코드 생성
- 컴포넌트 분리
- props / slots / layout 구조 반영
- 바로 프로젝트에 붙일 수 있는 구조로 출력

#### 5) Artifacts 관리

- 생성된 코드 zip으로 보관
- 프로젝트 단위 히스토리 관리
- 필요 시 재생성 가능

## 3. 업무 프로세스 (실사용 기준)

### 3.1 기본 사용 흐름 (디자이너 → 개발)

#### Step 1. 로그인

- URL: http://localhost:3001
- 최초 부팅 시 관리자 계정 자동 생성
- 이후 일반 사용자 로그인 가능

#### Step 2. 프로젝트 생성

- Create Project 클릭
- 프로젝트는 "하나의 코드 산출 단위"
- 생성 시 출력되는 ProjectId는 내부 식별자

예:
```
ProjectId: cmjr5mt0m0001562fo6cmj5xg
→ 이 프로젝트에 모든 Import / Generate / Artifact가 귀속됨
```

#### Step 3. Import

- Figma Import
  - Figma File ID
  - Page / Frame 선택
  - Figma Personal Access Token 필요
- 또는 Sample Import (테스트용)

결과:
- Figma → A2UI JSON 변환
- 프로젝트에 UI 구조 저장

#### Step 4. Generate

- 선택한 프로젝트 기준 코드 생성
- 적용 옵션
  - Vue 3 / Nuxt 3
  - Tailwind / 사내 컴포넌트
- 서버에서 비동기 Job으로 실행

#### Step 5. Artifacts

- 생성된 코드 목록 확인
- zip 다운로드
- 실제 프론트 프로젝트에 그대로 적용 가능

## 4. 프론트 UI 개념 설명

### Create Project

- 하나의 디자인 → 코드 변환 작업 단위
- 디자이너 작업 묶음 단위로 관리

### Import

- 디자인을 "가져오는 단계"
- 아직 코드 아님
- 구조 + 스타일 정보 수집 단계

### Generate

- 실제 코드 생성
- 회사 규칙이 가장 많이 적용되는 단계

### Artifacts

- 결과물 관리 영역
- 생성된 코드의 스냅샷

## 5. Figma API 사용 안내

### 5.1 Figma Personal Access Token 필요

- Figma 계정 → Settings → Personal Access Tokens
- .env에 설정

```
FIGMA_TOKEN=xxxxxxxxxxxxxxxx
```

### 5.2 왜 Figma API가 필요한가

- 디자인 데이터의 유일한 정식 접근 수단
- AutoLayout / Style / Component 정보를 정확히 얻기 위함

## 6. MCP / 에이전트 사용 여부에 대한 설계 판단

### 현재 구조

- MCP 사용하지 않음
- 모든 파이프라인을 단일 백엔드(NestJS)에서 관리

### 이유

- 변환 파이프라인이 고정적
- 네트워크/툴 디스커버리 오버헤드 불필요
- 정확도와 디버깅이 중요

### 향후 확장 시 MCP 도입 가능 지점

- figma.import 외부화
- design-system.map 팀별 플러그인화
- 타겟 프레임워크 증가 시 (React 등)

현재 단계에서는 MCP는 과설계, 조직/툴이 커질 때 선택지로 유지

## 7. 프로젝트 구조

```
figma-auto/
├─ backend/                 # NestJS Backend
│  ├─ src/
│  │  ├─ auth/              # 인증 / 로그인
│  │  ├─ projects/          # 프로젝트 관리
│  │  ├─ figma/             # Figma Import (Figma API 연동)
│  │  ├─ a2ui/              # A2UI IR 정의 (중간 표현 포맷)
│  │  ├─ ds-mapping/        # 디자인 시스템 매핑 (회사 규칙 적용)
│  │  ├─ codegen/           # 코드 생성 로직 (Vue/Nuxt 출력)
│  │  ├─ jobs/              # 비동기 작업 처리 (Bull Queue)
│  │  ├─ mcp/               # (확장 대비) MCP 인터페이스
│  │  └─ prisma/            # Prisma ORM 모듈
│  ├─ prisma/               # DB 스키마 정의
│  ├─ design-system/        # 회사 디자인 가이드 정의 (토큰/컴포넌트 규칙)
│  ├─ samples/              # 테스트용 샘플 (Figma JSON 등)
│  └─ Dockerfile
│
├─ web/                     # Frontend (Vue/Nuxt)
│  ├─ pages/                # 페이지 라우팅
│  ├─ components/            # Vue 컴포넌트
│  └─ Dockerfile
│
├─ toolserver/              # 보조 변환 도구 서버 (선택적 워커)
│
├─ docker-compose.yml       # 전체 서비스 오케스트레이션
└─ README.md
```

## 8. 이 시스템의 핵심 가치 요약

- Figma → 코드 변환을 "도구"가 아니라 "시스템"으로 관리
- 중간 포맷(A2UI)으로 정확도와 확장성 확보
- 회사 디자인 가이드를 자동으로 강제
- 디자이너 산출물이 많아질수록 효과가 커지는 구조

## 9. 시스템 아키텍처 다이어그램

### 9.1 전체 아키텍처 개요

### 9.2 논리적 아키텍처 (텍스트 다이어그램)

```
┌─────────────┐
│   Designer  │
│   (Figma)   │
└─────┬───────┘
      │ Figma REST API
      ▼
┌────────────────────┐
│   Figma Importer   │
│  (Frames / Styles │
│   Components)     │
└─────┬─────────────┘
      │ Normalization
      ▼
┌────────────────────┐
│   A2UI IR Layer    │
│ (Platform-neutral │
│  UI JSON Schema)  │
└─────┬─────────────┘
      │ Apply Rules
      ▼
┌────────────────────┐
│ Design System Map  │
│ - Tokens           │
│ - Components       │
│ - Layout Rules     │
└─────┬─────────────┘
      │ Target Select
      ▼
┌────────────────────┐
│  Code Generator    │
│  - Vue 3           │
│  - Nuxt 3          │
│  - Tailwind / UI   │
└─────┬─────────────┘
      │ Artifact
      ▼
┌────────────────────┐
│ Generated Project  │
│ (Zip / Repo-ready) │
└────────────────────┘
```

### 9.3 런타임 구성 (컨테이너 기준)

```
[ Browser ]
    │
    ▼
[ Web (3001) ]
    │ REST
    ▼
[ API (3000) ] ──────┐
    │                 │
    │ Prisma          │ Redis (Job Queue)
    ▼                 │
[ PostgreSQL ]        │
                      ▼
               [ Tool Server ]
               (Optional Workers)
```

## 10. 기술적 설계 배경 (왜 이렇게 설계했는가)

### 10.1 왜 "Figma → 바로 코드"가 아닌가

Figma 데이터는:

- 표현 중심 (디자인 툴 최적화)
- 플랫폼 종속적
- AutoLayout / Constraints가 코드 개념과 다름

👉 바로 Vue/Nuxt 코드로 변환하면 정확도가 급격히 떨어짐

그래서 중간 단계(A2UI IR) 를 둔다.

### 10.2 A2UI Intermediate Representation의 역할

A2UI는:

- Figma, Sketch, 다른 툴과 무관한 UI 구조
- 레이아웃 / 컴포넌트 / 스타일을 분리
- "의도" 중심 모델

이로 인해:

- 입력(Figma)이 바뀌어도
- 출력(Vue/Nuxt)이 늘어나도
- 중앙 로직은 안정적으로 유지

### 10.3 Design System Mapping을 분리한 이유

회사 디자인 가이드는 기술보다 정책에 가깝다.

- 버튼은 무조건 BaseButton
- 색은 token만 사용
- spacing은 4px 단위
- typography는 predefined scale

이걸 코드 생성기 안에 박아두면:

- 룰 변경 시 전체 로직 수정
- 팀별/서비스별 분기 지옥 발생

👉 매핑 레이어 분리가 유지보수와 조직 확장에 유리

### 10.4 MCP를 "지금 쓰지 않은" 이유

- 현재 파이프라인은 고정적
- 네트워크 기반 Tool Discovery 필요 없음
- 디버깅/정확도가 최우선

하지만:

- Importer / Mapper / Generator가 독립 배포 단위가 되면
- 팀별 규칙이 생기면

👉 MCP는 확장 전략으로 열어둔 선택지

### 10.5 n8n을 핵심에 두지 않은 이유

- 이 시스템은 "업무 자동화"가 아니라 빌드/변환 엔진
- 정확성, 재현성, 버전 관리가 핵심
- 노코드 워크플로우는 주변부(알림/PR)에만 적합

## 11. 사내 공유용 요약 버전 (임원/기획자용)

### 11.1 이 시스템이 하는 일 (한 줄)

디자이너가 만든 Figma 디자인을 회사 규칙에 맞는 Vue/Nuxt 코드로 자동 변환하는 시스템

### 11.2 기존 방식 vs 도입 후

| 항목 | 기존 | 도입 후 |
|------|------|---------|
| 디자인 전달 | 이미지/링크 | 구조화된 데이터 |
| 개발 반영 | 수작업 | 자동 생성 |
| 디자인 가이드 | 사람 의존 | 시스템 강제 |
| 반복 작업 | 많음 | 최소화 |
| 품질 편차 | 큼 | 일정 |

### 11.3 기대 효과

- 디자인 → 개발 전환 시간 대폭 단축
- 디자인 가이드 일관성 확보
- 신규 인력 온보딩 비용 감소
- UI 품질의 표준화
- 대규모 디자인 변경 대응력 향상

### 11.4 이 시스템이 "툴"이 아닌 이유

- 단순 변환기가 아님
- 회사 디자인 정책을 자동으로 적용
- 결과물이 바로 실서비스 코드

👉 디자인-개발 사이의 공정 자동화 시스템

### 11.5 확장 가능성

- React 등 타 프레임워크 지원
- 팀별 디자인 가이드 분리
- Storybook / 테스트 자동 생성
- CI 연계 코드 검증

### 11.6 요약 결론

- "디자이너의 결과물이 많아질수록 가치가 커지는 구조"
- "사람이 하던 정합성 검증을 시스템이 대신하는 방식"


-------------------------------------------------------------


DBeaver 연결 정보 (PostgreSQL)

Host: localhost

Port: 15432

Database: a2ui_codegen

Username: company

Password: company_pw

Schema: public (기본 그대로)

JDBC URL로 넣고 싶으면

jdbc:postgresql://localhost:15432/a2ui_codegen



#PSQL 들어가기
docker compose exec postgres psql -U company -d a2ui_codegen