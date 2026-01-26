# A2UI Figma → Vue/Nuxt Codegen Platform (figma-auto)

디자이너의 Figma 결과물을 **A2UI(Intermediate Representation)** 로 정규화한 뒤, 사내 디자인 시스템 규칙을 적용하여 **Vue 3 / Nuxt 3 코드 아티팩트(zip)** 를 생성하는 플랫폼입니다.

이 레포는 다음 3개 서비스로 구성됩니다.

- **backend(`api`)**: NestJS API / 인증 / 프로젝트 / Import / Generate / Artifact 관리 (BullMQ + Prisma + PostgreSQL)
- **web(`web`)**: Nuxt 3 UI (프로젝트 생성/Import/Generate/다운로드/미리보기)
- **toolserver**: Figma 연동 및 보조 변환 서비스(Figma API 프록시)

---

## 디자인 가이드(권장)

1. Button/MenuItem/Card/Modal 같은 공통 요소는 반드시 Component + Variant로 구성
2. 화면에는 Instance만 배치
3. 텍스트는 instance property로 바꿀 수 있게 Text property 사용(가능하면)
4. Auto-layout 사용, 임의의 1px 오차/개별 수정 금지

---

## 빠른 링크 (Docker Compose 기본값 기준)

> Windows 환경에서 Docker가 3000 포트 바인딩에 실패하는 케이스가 있어, 로컬 compose는 기본 호스트 포트를 3100/3101로 사용합니다. (`API_PORT`, `WEB_PORT`로 변경 가능)

- **웹(UI)**: `http://localhost:3101`
- **Swagger(API)**: `http://localhost:3100/docs#/`
- **toolserver**: `http://localhost:4010`

---

## 빠른 시작 (Docker Compose)

### 1) 사전 준비

- Docker Desktop
- (선택) Figma Personal Access Token (Figma Import 사용 시 필요)

### 2) 환경변수 설정(권장)

루트에 `.env` 파일을 생성합니다(예시는 로컬 개발 최소 구성).

```
# (권장) 인증 (미설정 시 dev 기본값으로 동작)
JWT_SECRET=dev-secret
ADMIN_EMAIL=admin@company.local
ADMIN_PASSWORD=admin1234!

# (선택) Figma Import 사용 시
FIGMA_TOKEN=YOUR_FIGMA_PERSONAL_ACCESS_TOKEN
FIGMA_API_BASE=https://api.figma.com

# (선택) Windows에서 포트 충돌/예약 시 변경
API_PORT=3100
WEB_PORT=3101
```

> `api` 서비스는 `docker-compose.yml`에서 루트 `.env`를 읽습니다.  
> `toolserver`도 `FIGMA_TOKEN`/`FIGMA_API_BASE`를 참조합니다.

### 3) 실행

```
docker compose up -d --build
```

### 4) 접속 / 로그인

- UI: `http://localhost:3101`
- Swagger: `http://localhost:3100/docs#/`
- 초기 계정: `.env`의 `ADMIN_EMAIL/ADMIN_PASSWORD` (미설정 시 기본값 `admin@company.local / admin1234!`)

---

## 배포(운영) - 도메인 없이 서버 IP로 시작 (추천: 80 포트 단일 공개)

운영 모드는 `caddy`를 통해 `http://<SERVER_IP>`로 접속하면 **web**을 제공하고, 브라우저의 API 호출은 같은 Origin의 `/api`로 프록시됩니다.

### 1) 운영 환경변수(.env) 준비(필수)

루트에 `.env` 파일을 만들고 최소 아래 값은 반드시 설정하세요(기본값 그대로면 보안상 위험합니다).

```
# 인증(필수)
JWT_SECRET=CHANGE_ME_TO_A_LONG_RANDOM_STRING
ADMIN_EMAIL=admin@company.local
ADMIN_PASSWORD=CHANGE_ME_TO_A_STRONG_PASSWORD

# (권장) 컨테이너 내부 통신 (미설정 시 docker-compose.prod.yml 기본값 사용)
TOOLSERVER_URL=http://toolserver:4010

# (선택) Figma Import 사용 시
FIGMA_TOKEN=YOUR_FIGMA_PERSONAL_ACCESS_TOKEN
FIGMA_API_BASE=https://api.figma.com

# (선택) OpenAI refine 사용 시
# OPENAI_API_KEY=...
# OPENAI_MODEL=gpt-4o-mini
```

> 이 프로젝트는 **회원가입이 없고** 서버 시작 시 `ADMIN_EMAIL/ADMIN_PASSWORD` 계정이 DB에 없으면 자동 생성됩니다.

### 2) 실행(서버에서)

```
docker compose -f docker-compose.prod.yml up -d --build
```

### 3) 접속

- UI: `http://<SERVER_IP>/`
- API(Swagger): `http://<SERVER_IP>/api/docs#/`

---

## 기본 사용 흐름 (UI 기준)

### 1) 로그인

- 로컬(Docker): `http://localhost:3101`
- 운영: `http://<SERVER_IP>/`

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

### 로컬(`docker-compose.yml`) 기본값

- **web(container:3001)**: host `${WEB_PORT:-3101}` → `http://localhost:3101`
- **api(container:3000)**: host `${API_PORT:-3100}` → `http://localhost:3100`
- **toolserver(container:4010)**: host `4010` → `http://localhost:4010`
- **postgres**: host `15432` → container `5432`
- **redis**: host `16379` → container `6379`

### 운영(`docker-compose.prod.yml`) 기본값

- 외부 공개 포트: `80`(Caddy)
- UI: `/`
- API: `/api/*` → `api:3000` 로 프록시

---

## 환경변수 레퍼런스(backend 기준)

- `JWT_SECRET`: JWT 서명 키(미설정 시 `dev-secret`)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: 부팅 시 관리자 계정 자동 생성에 사용(미설정 시 `admin@company.local / admin1234!`)
- `TOOLSERVER_URL`: toolserver base URL(로컬 기본 `http://localhost:4010`, 운영 권장 `http://toolserver:4010`)
- `DATABASE_URL`: Prisma DB 연결 문자열(필수 키; compose에서는 기본값/서비스 연결로 채워짐)
- `REDIS_URL` 또는 `REDIS_HOST`/`REDIS_PORT`: BullMQ Redis 연결(기본 `redis:6379`)
- `UPLOAD_DIR`: 아티팩트/업로드 저장 경로(기본 `/data/artifacts` 또는 `.uploads` 폴백)
- `JOBS_CONCURRENCY`: worker concurrency (기본값 1~2)
- `FIGMA_EXPAND_ROUNDS`, `FIGMA_EXPAND_MAX_NODES`: Figma nodes expand 보정 파라미터
- (선택) `OPENAI_API_KEY`, `OPENAI_MODEL`: refine 사용 시
- (선택) `A2UI_MIXED_GPT=0`: mixed-gpt 로직 비활성화

toolserver:

- `FIGMA_TOKEN`: Figma API 호출 토큰(미설정 시 Figma Import 기능 실패)
- `FIGMA_API_BASE`: Figma API base URL(기본 `https://api.figma.com`)

---

## 트러블슈팅

### Windows에서 API 포트 바인딩 실패(특히 3000)

Windows가 특정 포트 범위를 예약(excluded)해 Docker가 바인딩을 못하는 경우가 있습니다.

- 해결: `.env`에 `API_PORT=3100` 같은 **비예약 포트**로 변경
- 확인: `netsh int ipv4 show excludedportrange protocol=tcp`

---

## 프로젝트 구조 (상세)

아래 트리는 “코드 생성 파이프라인(Import → IR → DS 매핑 → Codegen → Artifact)” 기준으로 **실제 폴더/파일을 더 자세히** 펼쳐쓴 것입니다.

```
figma-auto/
├─ docker-compose.yml                 # postgres/redis/api/web/toolserver 로컬 실행
├─ docker-compose.prod.yml            # 운영 배포용 (Caddy 포함)
├─ README.md
│
├─ deploy/                            # 배포 설정
│  └─ Caddyfile                       # Caddy 리버스 프록시 설정(/api 프록시)
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
│  │  └─ design-system.json
│  │
│  ├─ samples/                        # 샘플 데이터
│  │  └─ figma-file.sample.json
│  │
│  └─ src/
│     ├─ main.ts                      # Nest bootstrap + Swagger(/docs)
│     ├─ app.module.ts
│     ├─ mcp/                         # toolserver 호출 클라이언트(HTTP)
│     ├─ auth/                        # 인증/로그인(JWT)
│     ├─ projects/                    # 프로젝트 관리
│     ├─ figma/                       # Figma Import(toolserver 통해 연동)
│     ├─ a2ui/                        # A2UI IR 정의/변환
│     ├─ ds-mapping/                  # 디자인 시스템 매핑
│     ├─ codegen/                     # 코드 생성 + zip 아티팩트 생성
│     └─ jobs/                        # BullMQ 비동기 작업(import→map→codegen)
│
├─ toolserver/                        # 보조 연동 서비스(Figma API 프록시)
│  ├─ Dockerfile
│  ├─ package.json
│  └─ src/index.js
│
└─ web/                               # Nuxt Frontend (UI)
   ├─ Dockerfile
   ├─ package.json
   ├─ nuxt.config.ts                  # runtimeConfig(public.apiBase)
   ├─ layouts/
   ├─ middleware/
   ├─ composables/
   ├─ pages/
   └─ components/
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

**JDBC URL**

`jdbc:postgresql://localhost:15432/a2ui_codegen`

**psql 접속**

```
docker compose exec postgres psql -U company -d a2ui_codegen
```

### 프롬프트 추천 문구(옵션)

```
UI/레이아웃은 절대 바꾸지 말 것(픽셀/간격/정렬 유지)

manifest.json의 cursorGuidance.preferComponents에 있는 공통 컴포넌트를 임포트해서 최대한 치환해라

div/span 구조를 공통 컴포넌트로만 치환할 것

치환이 애매하면 원래 div 유지하고 TODO 남길 것

한 번에 많이 바꾸지 말고 컴포넌트 종류별로 단계적 적용할 것

치환 시 스타일 처리 규칙
- “치환해도 기존 class/style는 유지(필요하면 wrapper div로 보존)”
- “props로 옮길 수 있는 것만 옮기고, 나머지는 class로 유지”
```

**JDBC URL**

`jdbc:postgresql://localhost:15432/a2ui_codegen`

**psql 접속**

```
docker compose exec postgres psql -U company -d a2ui_codegen
```



```
docker builder prune -af
docker buildx prune -af        
docker compose build --no-cache api
```