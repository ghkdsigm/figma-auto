# A2UI Figma → Vue/Nuxt Codegen Platform (figma-auto)

디자이너의 Figma 결과물을 **A2UI(Intermediate Representation)** 로 정규화한 뒤, 사내 디자인 시스템 규칙을 적용하여 **Vue 3 / Nuxt 3 코드(프로젝트 아티팩트)** 를 생성하는 플랫폼입니다.

이 레포는 다음 3개 서비스로 구성됩니다.

- **backend(`api`)**: NestJS API / 인증 / 프로젝트 / Import / Generate / Artifact 관리 (Bull Queue + Prisma)
- **web(`web`)**: Nuxt 기반 UI (프로젝트 생성/Import/Generate/다운로드)
- **toolserver**: Figma 연동 및 보조 변환 작업용 서비스

---

## 디자인가이드
1. “Button/MenuItem/Card/Modal같은 공통 요소는 반드시 Component + Variant로”
2. “화면에는 Instance만 배치”
3. “텍스트는 instance property로 바꿀 수 있게 Text property 사용(가능하면)”
4. “Auto-layout 사용, 임의의 1px 오차/개별 수정 금지”

---

## 빠른 링크

- **웹(UI)**: `http://localhost:3001`
- **Swagger(API)**: `http://localhost:3000/docs#/`

---

## 빠른 시작 (Docker Compose)

### 1) 사전 준비

- Docker Desktop
- (선택) Figma Personal Access Token

### 2) 환경변수 설정

루트에 `.env` 파일을 생성합니다(예시는 최소 구성입니다).

```
# (권장) Figma Import 사용 시
FIGMA_TOKEN=YOUR_FIGMA_PERSONAL_ACCESS_TOKEN

# (선택) 기본값: https://api.figma.com
FIGMA_API_BASE=https://api.figma.com
```

> `api` 서비스는 `docker-compose.yml`에서 루트 `.env`를 사용합니다.  
> `toolserver`도 `FIGMA_TOKEN`을 참조합니다.

### 3) 실행

```
docker compose up -d --build
```

### 4) 접속

- `http://localhost:3001` 접속 후 로그인
- API 상태 확인: `http://localhost:3000/docs#/`

---

## 기본 사용 흐름 (UI 기준)

### 1) 로그인

- URL: `http://localhost:3001`
- 최초 부팅 시 초기 계정 생성 정책은 backend 설정에 따릅니다(프로젝트 환경에 맞게 운영 정책을 정하세요).

### 2) 프로젝트 생성

- **Create Project**: 변환 작업의 단위(Import/Generate/Artifact가 프로젝트에 귀속)
- 생성 시 표시되는 **ProjectId**는 내부 식별자입니다.

### 3) Import (Figma 또는 Sample)

- **Figma Import**:
  - Figma File ID
  - Page / Frame 선택
  - `FIGMA_TOKEN` 필요
- **Sample Import**: 테스트용 샘플 데이터로 Import

결과:

- Figma → A2UI JSON 변환
- 프로젝트에 정규화된 UI 구조 저장

### 4) Generate

- 프로젝트 기준 코드 생성 Job 실행
- 생성 옵션(타겟/스타일링/사내 컴포넌트 매핑 등)은 backend 구현에 따라 확장됩니다.

### 5) Artifacts 다운로드

- 생성된 결과물을 목록에서 확인
- zip 다운로드 후 실제 프론트 프로젝트에 적용

---

## 서비스 구성 / 포트

`docker-compose.yml` 기본 구성:

- **web**: `3001` → `http://localhost:3001`
- **api**: `3000` → `http://localhost:3000`
- **toolserver**: `4010` → `http://localhost:4010`
- **postgres**: `15432`(host) → `5432`(container)
- **redis**: `16379`(host) → `6379`(container)

---

## 프로젝트 구조 (상세)

아래 트리는 “코드 생성 파이프라인(Import → IR → DS 매핑 → Codegen → Artifact)” 기준으로 **실제 폴더/파일을 더 자세히** 펼쳐쓴 것입니다.

```
figma-auto/
├─ docker-compose.yml                 # postgres/redis/api/web/toolserver 로컬 실행
├─ README.md
│
├─ backend/                           # NestJS Backend (API, 파이프라인 오케스트레이션)
│  ├─ Dockerfile
│  ├─ docker-entrypoint.sh
│  ├─ package.json
│  ├─ nest-cli.json
│  ├─ tsconfig.json
│  │
│  ├─ prisma/                         # DB 스키마/마이그레이션(Prisma)
│  │  └─ schema.prisma                # User/Project/Import/Map/Artifact/Job 모델
│  │
│  ├─ design-system/                  # 디자인 시스템 정의(토큰/컴포넌트 룰)
│  │  └─ design-system.json           # spacing/colors/typography + 컴포넌트 목록/옵션
│  │
│  ├─ samples/                        # 샘플 데이터
│  │  └─ figma-file.sample.json
│  │
│  └─ src/
│     ├─ main.ts                      # Nest bootstrap
│     ├─ app.module.ts                # 루트 모듈(각 feature module 조립)
│     │
│     ├─ mcp/                         # toolserver 호출 클라이언트(HTTP RPC)
│     │  ├─ mcp.client.ts             # TOOLSERVER_URL 기반 /tools/:name/invoke 호출
│     │  └─ mcp.module.ts
│     │
│     ├─ auth/                        # 인증/로그인(JWT)
│     │  ├─ auth.controller.ts         # /auth/login 등
│     │  ├─ auth.service.ts            # admin bootstrap + bcrypt + jwt sign
│     │  ├─ auth.module.ts
│     │  ├─ jwt.strategy.ts
│     │  ├─ guards.ts                  # JwtAuthGuard
│     │  └─ dto.ts
│     │
│     ├─ projects/                    # 프로젝트 관리
│     │  ├─ projects.controller.ts     # /projects (list/create)
│     │  ├─ projects.service.ts        # slug 생성/중복 처리
│     │  ├─ projects.module.ts
│     │  └─ dto.ts
│     │
│     ├─ figma/                       # Figma Import (toolserver 통해 Figma API 연동)
│     │  ├─ figma.module.ts
│     │  └─ figma.service.ts           # getFile/getNodes + depth 제한 보완(expand)
│     │
│     ├─ a2ui/                        # A2UI IR 정의/변환(중간표현)
│     │  ├─ spec.ts                    # A2UI 스키마 타입/구조
│     │  ├─ a2ui.module.ts
│     │  └─ a2ui.service.ts            # raw(Figma) → a2uiSpec 변환
│     │
│     ├─ ds-mapping/                  # 디자인 시스템 매핑(규칙 적용)
│     │  ├─ spec.ts                    # DS 스키마 타입/구조
│     │  ├─ ds-mapping.module.ts
│     │  └─ ds-mapping.service.ts      # a2uiSpec → dsSpec(컴포넌트/토큰 치환, policy 반영)
│     │
│     ├─ codegen/                     # 코드 생성(Vue/Nuxt 출력) + zip 아티팩트 생성
│     │  ├─ codegen.module.ts
│     │  └─ codegen.service.ts         # dsSpec → 파일 생성 → zip(outputZip)
│     │
│     ├─ jobs/                        # 비동기 작업 처리(BullMQ)
│     │  ├─ queue.constants.ts         # 큐 이름 등 상수
│     │  ├─ jobs.module.ts
│     │  ├─ jobs.service.ts            # enqueue/process + 파이프라인 조립(import→map→codegen)
│     │  ├─ jobs.worker.ts             # Worker(concurrency) 실제 실행기
│     │  ├─ jobs.controller.ts         # /projects/:projectId/import|generate|artifacts API
│     │  └─ job-status.controller.ts   # /jobs/:jobId 상태 조회
│     │
│     └─ prisma/                      # Prisma DI 모듈
│        ├─ prisma.module.ts
│        └─ prisma.service.ts
│
├─ toolserver/                        # 보조 연동 서비스(Figma API 프록시 + 캐시)
│  ├─ Dockerfile
│  ├─ package.json
│  └─ src/
│     └─ index.js                      # /tools(목록), /tools/:name/invoke(figma.getFile/getNodes/getImages)
│
└─ web/                               # Nuxt Frontend (UI/미리보기/다운로드)
   ├─ Dockerfile
   ├─ package.json
   ├─ nuxt.config.ts                   # runtimeConfig(public.apiBase 등)
   ├─ tailwind.config.js
   ├─ app.vue
   │
   ├─ middleware/
   │  └─ auth.ts                       # 비로그인 시 /login 리다이렉트
   │
   ├─ composables/
   │  └─ useAuth.ts                    # 토큰 쿠키 관리 + authHeaders 생성
   │
   ├─ pages/
   │  ├─ login.vue                     # /auth/login 호출
   │  ├─ index.vue                     # 프로젝트 생성/임포트/생성/미리보기 진입
   │  └─ preview.vue                   # 최신 맵/결과 렌더(미리보기)
   │
   ├─ components/
   │  ├─ a2ui/
   │  │  ├─ DsRenderer.vue             # dsSpec 렌더링(미리보기 핵심)
   │  │  └─ GeneratedFromFigma.vue
   │  └─ common/
   │     ├─ LoadingButton.vue
   │     └─ Spinner.vue
   │
   └─ assets/
      └─ img/
         ├─ image.png
         └─ image2.png
```

---

## 개발/운영 메모

### Figma Token 발급

- Figma 계정 → Settings → Personal Access Tokens
- 발급 후 `.env`의 `FIGMA_TOKEN`에 설정

### 아키텍처 요약

```
Figma Design
  ↓ (Importer)
A2UI Intermediate JSON
  ↓ (Design System Mapping)
Code Generation (Vue/Nuxt)
  ↓
Artifacts (zip)
```

### DB 접속 (PostgreSQL / Docker)

**DBeaver 연결 정보**

- Host: `localhost`
- Port: `15432`
- Database: `a2ui_codegen`
- Username: `company`
- Password: `company_pw`
- Schema: `public`


### 프롬프트 추천문구
```
UI/레이아웃은 절대 바꾸지 말 것(픽셀/간격/정렬 유지)

div/span 구조를 공통 컴포넌트로만 치환할 것

치환이 애매하면 원래 div 유지하고 TODO 남길 것

한 번에 많이 바꾸지 말고 컴포넌트 종류별로 단계적 적용할 것
```

**JDBC URL**

`jdbc:postgresql://localhost:15432/a2ui_codegen`

**psql 접속**

```
docker compose exec postgres psql -U company -d a2ui_codegen
```