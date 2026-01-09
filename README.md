# A2UI Figma → Vue/Nuxt Codegen Platform (figma-auto)

디자이너의 Figma 결과물을 **A2UI(Intermediate Representation)** 로 정규화한 뒤, 사내 디자인 시스템 규칙을 적용하여 **Vue 3 / Nuxt 3 코드(프로젝트 아티팩트)** 를 생성하는 플랫폼입니다.

이 레포는 다음 3개 서비스로 구성됩니다.

- **backend(`api`)**: NestJS API / 인증 / 프로젝트 / Import / Generate / Artifact 관리 (Bull Queue + Prisma)
- **web(`web`)**: Nuxt 기반 UI (프로젝트 생성/Import/Generate/다운로드)
- **toolserver**: Figma 연동 및 보조 변환 작업용 서비스

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

## 프로젝트 구조 (핵심만)

```
figma-auto/
├─ backend/                  # NestJS Backend (API)
│  ├─ src/
│  │  ├─ auth/               # 인증/로그인
│  │  ├─ projects/           # 프로젝트 관리
│  │  ├─ figma/              # Figma Import (API 연동)
│  │  ├─ a2ui/               # A2UI IR 정의/변환
│  │  ├─ ds-mapping/         # 디자인 시스템 매핑 (규칙 적용)
│  │  ├─ codegen/            # 코드 생성 로직 (Vue/Nuxt 출력)
│  │  ├─ jobs/               # 비동기 작업 처리 (Bull Queue)
│  │  └─ prisma/             # Prisma 모듈
│  ├─ prisma/                # DB 스키마/마이그레이션
│  └─ design-system/         # 디자인 시스템 정의(토큰/컴포넌트 규칙)
├─ web/                      # Nuxt Frontend
├─ toolserver/               # 보조 변환/연동 서비스
└─ docker-compose.yml         # postgres/redis/api/web/toolserver
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