<!-- pages/index.vue -->
<template>
  <div
    class="min-h-[calc(100vh-72px)] py-10"
  >
    <!-- Background -->
    <div class="fixed inset-0 -z-10">
      <div class="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-indigo-50"></div>
      <div class="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl"></div>
      <div class="absolute top-40 -right-24 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl"></div>
      <div class="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-rose-200/30 blur-3xl"></div>
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:22px_22px] opacity-40"></div>
    </div>

    <div class="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <header class="mb-10">
        <div class="flex flex-col items-center text-center gap-3">
          <div
            class="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-4 py-2 text-sm text-slate-600 shadow-sm backdrop-blur"
          >
            <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
            Figma → Code Generator
          </div>
          <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-slate-900">
            Figma 디자인을 코드로 변환하세요
          </h1>
          <p class="max-w-2xl text-slate-600">
            선택한 노드의 URL을 입력 또는 전용 JSON 추출 플러그인을 활용해 코드 노드 정보를 추출하고 업로드로 빠르게 임포트하여, 정책 선택 후 Vue/Nuxt 결과물을 생성할 수 있어요.
          </p>
        </div>
      </header>

      <div class="space-y-8">
        <!-- 프로젝트 생성 -->
        <section
          class="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur"
        >
          <div class="absolute inset-0 bg-gradient-to-br from-white/40 to-indigo-50/20"></div>
          <div class="relative p-6 sm:p-8">
            <div class="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 class="text-xl font-semibold text-slate-900">프로젝트 생성</h2>
                <p class="mt-1 text-sm text-slate-600">프로젝트를 만들고 ID를 저장해 이후 작업을 이어가세요.</p>
              </div>
              <div
                class="hidden sm:flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2 text-xs text-slate-600 shadow-sm"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-slate-400"></span>
                Auto-save: 로컬스토리지
              </div>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-2">프로젝트 이름</label>
                <div class="flex gap-3">
                  <div class="relative flex-1">
                    <input
                      v-model="projectName"
                      class="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-200/50"
                      placeholder="프로젝트 이름을 입력하세요"
                    />
                    <div class="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                      <div class="h-2 w-2 rounded-full bg-indigo-400/70"></div>
                    </div>
                  </div>

                  <LoadingButton
                    className="rounded-2xl cursor-pointer bg-slate-900 px-4 py-3 font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60 disabled:hover:bg-slate-900 whitespace-nowrap"
                    :loading="loading['createProject']"
                    :disabled="loading['createProject'] || !projectName.trim()"
                    @click="createProject"
                  >
                    프로젝트 생성하기
                  </LoadingButton>
                </div>
              </div>

              <div
                v-if="project"
                class="mt-2 rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm"
              >
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <div class="text-xs font-medium text-slate-500">프로젝트 ID</div>
                    <div class="mt-1 font-mono text-sm font-semibold text-slate-900 break-all">
                      {{ project.id }}
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                      Ready
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 피그마 가져오기 -->
        <section
          v-if="project"
          class="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur"
        >
          <div class="absolute inset-0 bg-gradient-to-br from-white/40 to-cyan-50/20"></div>
          <div class="relative p-6 sm:p-8">
            <div class="flex flex-col gap-2 mb-6">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <h2 class="text-xl font-semibold text-slate-900">가져오기</h2>
                  <p class="mt-1 text-sm text-slate-600">
                    URL 입력 또는 JSON 업로드로 임포트한 뒤, 최신 맵을 미리보기로 확인하세요.
                  </p>
                </div>
                <div class="hidden sm:flex items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/70 px-3 py-2 text-xs text-slate-600 shadow-sm">
                  <span class="h-1.5 w-1.5 rounded-full bg-cyan-500"></span>
                  Import Tools
                </div>
              </div>
            </div>

            <div class="space-y-6">
              <!-- 1. Figma URL -->
              <div class="rounded-2xl border border-slate-200/70 bg-white/60 p-5 shadow-sm">
                <div class="flex items-center justify-between gap-3 mb-4">
                  <h3 class="text-base font-semibold text-slate-900">1) 피그마 URL 입력 방식</h3>
                  <span class="text-xs text-slate-500">node-id 포함 가능</span>
                </div>

                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-slate-700 mb-2">Figma URL</label>
                    <input
                      v-model="figmaInput"
                      class="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-cyan-300 focus:ring-4 focus:ring-cyan-200/50"
                      placeholder="https://www.figma.com/design/... ?node-id=..."
                    />
                  </div>

                  <div class="grid gap-2 sm:grid-cols-2">
                    <div class="rounded-2xl border border-slate-200/70 bg-white/70 p-3">
                      <div class="text-xs font-medium text-slate-500">fileKey</div>
                      <div class="mt-1 font-mono text-sm font-semibold text-slate-900 break-all">
                        {{ parsedFileKey || "-" }}
                      </div>
                    </div>
                    <div class="rounded-2xl border border-slate-200/70 bg-white/70 p-3">
                      <div class="text-xs font-medium text-slate-500">nodeId</div>
                      <div class="mt-1 font-mono text-sm font-semibold text-slate-900 break-all">
                        {{ parsedNodeId || "-" }}
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-col sm:flex-row gap-3">
                    <LoadingButton
                      className="rounded-2xl cursor-pointer bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 text-white font-medium shadow-sm transition hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:opacity-60 whitespace-nowrap"
                      :loading="loading['importFigma']"
                      :disabled="loading['importFigma']"
                      @click="importFigma"
                    >
                      피그마에서 코드 노드 정보 가져오기
                    </LoadingButton>
                    <LoadingButton
                      className="rounded-2xl cursor-pointer border border-slate-200 bg-white/80 px-4 py-3 font-medium text-slate-800 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60 whitespace-nowrap"
                      :loading="loading['importSample']"
                      :disabled="loading['importSample']"
                      @click="importSample"
                    >
                      샘플 입력
                    </LoadingButton>
                  </div>
                </div>
              </div>

              <!-- 2. JSON 업로드 -->
              <div class="rounded-2xl border border-slate-200/70 bg-white/60 p-5 shadow-sm">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <div>
                    <h3 class="text-base font-semibold text-slate-900">2) JSON 파일 업로드 방식</h3>
                    <p class="mt-1 text-sm text-slate-600">선택사항. Export JSON을 업로드해서 임포트할 수 있어요.</p>
                  </div>
                  <LoadingButton
                    className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60"
                    :loading="loading['refreshLatest']"
                    :disabled="loading['refreshLatest']"
                    @click="refreshLatest"
                  >
                    최신파일 새로고침
                  </LoadingButton>
                </div>

                <div class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium text-slate-700 mb-2">JSON 파일 선택</label>
                    <div class="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-4 hover:bg-white transition">
                      <input
                        ref="jsonFileEl"
                        type="file"
                        accept="application/json,.json"
                        class="block w-full text-sm text-slate-700 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100 cursor-pointer"
                        @change="onPickJson"
                      />
                      <p class="mt-2 text-xs text-slate-500">
                        선택된 파일이 있으면 업로드/생성 버튼이 활성화됩니다.
                      </p>
                    </div>
                  </div>

                  <div class="flex flex-col sm:flex-row flex-wrap gap-3">
                    <LoadingButton
                      className="rounded-2xl cursor-pointer bg-emerald-600 px-4 py-3 text-white font-medium shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 disabled:opacity-60"
                      :loading="loading['uploadJson']"
                      :disabled="loading['uploadJson'] || !pickedJson"
                      @click="uploadJson"
                    >
                      업로드 JSON
                    </LoadingButton>
                    <LoadingButton
                      className="rounded-2xl cursor-pointer bg-slate-900 px-4 py-3 text-white font-medium shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60"
                      :loading="loading['uploadVue']"
                      :disabled="loading['uploadVue'] || !pickedJson"
                      @click="uploadJsonAndGenerate('vue')"
                    >
                      업로드 후 Vue 생성
                    </LoadingButton>
                    <LoadingButton
                      className="rounded-2xl cursor-pointer border border-slate-200 bg-white/80 px-4 py-3 font-medium text-slate-800 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60"
                      :loading="loading['uploadNuxt']"
                      :disabled="loading['uploadNuxt'] || !pickedJson"
                      @click="uploadJsonAndGenerate('nuxt')"
                    >
                      업로드 후 Nuxt 생성
                    </LoadingButton>
                  </div>

                  <div class="rounded-2xl border border-slate-200/70 bg-white/70 p-4">
                    <div class="grid gap-3 sm:grid-cols-2">
                      <div class="text-slate-600">
                        <div class="text-xs font-medium text-slate-500">최신파일</div>
                        <div class="mt-1 font-mono text-sm font-semibold text-slate-900 break-all">
                          {{ latestImportId || "-" }}
                        </div>
                      </div>
                      <div class="text-slate-600">
                        <div class="text-xs font-medium text-slate-500">최신맵 ({{ policy }})</div>
                        <div class="mt-1 font-mono text-sm font-semibold text-slate-900 break-all">
                          {{ latestMapId || "-" }}
                        </div>
                      </div>
                    </div>

                    <div v-if="latestMapId" class="mt-4">
                      <NuxtLink
                        :to="`/preview?projectId=${project.id}&policy=${policy}`"
                        class="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-200"
                      >
                        미리보기 열기 (ZIP 다운로드 없음)
                      </NuxtLink>
                    </div>

                    <div
                      v-if="latestError"
                      class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
                    >
                      {{ latestError }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ZIP 생성 -->
        <section
          v-if="project"
          class="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur"
        >
          <div class="absolute inset-0 bg-gradient-to-br from-white/40 to-rose-50/20"></div>
          <div class="relative p-6 sm:p-8">
            <div class="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 class="text-xl font-semibold text-slate-900">코드 생성</h2>
                <p class="mt-1 text-sm text-slate-600">정책을 선택하고 Vue 또는 Nuxt 결과물을 생성하세요.</p>
              </div>
              <span class="hidden sm:inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white shadow-sm">
                Build
              </span>
            </div>

            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-2">정책</label>
                <select
                  v-model="policy"
                  class="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-900 shadow-sm outline-none transition focus:border-rose-300 focus:ring-4 focus:ring-rose-200/50"
                >
                  <option value="RAW">RAW</option>
                  <option value="TOLERANT">TOLERANT</option>
                  <option value="MIXED">MIXED</option>
                  <option value="STRICT">STRICT</option>
                </select>
              </div>

              <div class="grid gap-3 sm:grid-cols-2">
                <LoadingButton
                  className="w-full cursor-pointer rounded-2xl bg-slate-900 px-4 py-3 text-white font-medium shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60"
                  :loading="loading['generateNuxt']"
                  :disabled="loading['generateNuxt']"
                  @click="generate('nuxt')"
                >
                  Nuxt 생성
                </LoadingButton>
                <LoadingButton
                  className="w-full cursor-pointer rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-900 font-medium shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60"
                  :loading="loading['generateVue']"
                  :disabled="loading['generateVue']"
                  @click="generate('vue')"
                >
                  Vue 생성
                </LoadingButton>
              </div>
            </div>
          </div>
        </section>

        <!-- 결과물 -->
        <section
          v-if="project"
          class="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur"
        >
          <div class="absolute inset-0 bg-gradient-to-br from-white/40 to-slate-50/20"></div>
          <div class="relative p-6 sm:p-8">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
              <div>
                <h2 class="text-xl font-semibold text-slate-900">결과물</h2>
                <p class="mt-1 text-sm text-slate-600">생성된 artifact 목록을 확인하고 미리보기/다운로드 하세요.</p>
              </div>
              <LoadingButton
                className="rounded-2xl cursor-pointer border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60"
                :loading="loading['loadArtifacts']"
                :disabled="loading['loadArtifacts']"
                @click="loadArtifacts"
              >
                새로고침
              </LoadingButton>
            </div>

            <div v-if="artifacts.length === 0" class="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-10 text-center">
              <div class="mx-auto mb-3 h-10 w-10 rounded-2xl bg-slate-900/5"></div>
              <div class="text-slate-700 font-medium">생성된 결과물이 없습니다.</div>
              <div class="mt-1 text-sm text-slate-500">상단에서 임포트 후 생성 버튼을 눌러주세요.</div>
            </div>

            <ul v-else class="space-y-3">
              <li
                v-for="a in artifacts"
                :key="a.id"
                class="group rounded-2xl border border-slate-200/70 bg-white/70 p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
              >
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <div class="h-2 w-2 rounded-full bg-indigo-500"></div>
                      <div class="font-mono text-sm font-semibold text-slate-900 break-all">{{ a.id }}</div>
                    </div>
                    <div class="mt-1 text-sm text-slate-600">
                      목표:
                      <span class="font-medium text-slate-800">{{ a.target }}</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-3">
                    <NuxtLink
                      :to="`/preview?projectId=${project.id}&artifactId=${a.id}`"
                      class="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-200"
                    >
                      미리보기
                    </NuxtLink>
                    <LoadingButton
                      className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:opacity-60"
                      :loading="loading['download:' + a.id]"
                      :disabled="loading['download:' + a.id]"
                      @click="downloadArtifact(a.id)"
                    >
                      다운로드
                    </LoadingButton>
                  </div>
                </div>
              </li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: "auth",
});

const apiBase = useRuntimeConfig().public.apiBase as string;
const { token, authHeaders } = useAuth();

const projectName = ref("figma-a2ui");
const project = ref<any>(null);

const figmaInput = ref("");
const parsedFileKey = ref("");
const parsedNodeId = ref("");

const artifacts = ref<any[]>([]);

const policy = ref<"RAW" | "TOLERANT" | "MIXED" | "STRICT">("RAW");

const jsonFileEl = ref<HTMLInputElement | null>(null);
const pickedJson = ref<File | null>(null);

const latestImportId = ref<string>("");
const latestMapId = ref<string>("");
const latestError = ref<string>("");

const loading = reactive<Record<string, boolean>>({
  createProject: false,
  importFigma: false,
  importSample: false,
  refreshLatest: false,
  uploadJson: false,
  uploadVue: false,
  uploadNuxt: false,
  generateVue: false,
  generateNuxt: false,
  loadArtifacts: false,
});

async function withLoading<T>(key: string, fn: () => Promise<T>) {
  if (loading[key]) return undefined as unknown as T;
  loading[key] = true;
  try {
    return await fn();
  } finally {
    loading[key] = false;
  }
}

function parseFigmaInput(input: string) {
  const v = (input || "").trim();
  if (!v) return { fileKey: "", nodeId: "" };

  if (!v.includes("figma.com")) {
    return { fileKey: v, nodeId: "" };
  }

  try {
    const u = new URL(v);
    const parts = u.pathname.split("/").filter(Boolean);

    const designIdx = parts.indexOf("design");
    const fileIdx = parts.indexOf("file");

    const key = designIdx >= 0 ? parts[designIdx + 1] : fileIdx >= 0 ? parts[fileIdx + 1] : "";

    const rawNode = u.searchParams.get("node-id") || "";
    const nodeId = rawNode ? rawNode.replace("-", ":") : "";

    return { fileKey: key || "", nodeId };
  } catch {
    return { fileKey: "", nodeId: "" };
  }
}

onMounted(() => {
  if (!process.client) return;

  const savedProjectId = localStorage.getItem("a2ui_projectId");
  if (savedProjectId) {
    project.value = { id: savedProjectId };
    loadArtifacts();
    refreshLatest();
  }
});

watch(
  () => project.value?.id,
  (v) => {
    if (!process.client) return;
    if (v) localStorage.setItem("a2ui_projectId", String(v));
  }
);

watch(figmaInput, (v) => {
  const { fileKey, nodeId } = parseFigmaInput(v);
  parsedFileKey.value = fileKey;
  parsedNodeId.value = nodeId;
});

watch(policy, () => {
  if (project.value) {
    refreshLatest();
  }
});

async function createProject() {
  const __key = "createProject";
  return await withLoading(__key, async () => {
    const r: any = await $fetch(`${apiBase}/projects`, {
      method: "POST",
      headers: authHeaders.value,
      body: { name: projectName.value },
    });
    project.value = r.project;
    await loadArtifacts();
    await refreshLatest();
  });
}

async function importFigma() {
  const __key = "importFigma";
  return await withLoading(__key, async () => {
    latestError.value = "";

    const fileKey = parsedFileKey.value.trim();
    const nodeId = parsedNodeId.value.trim();

    if (!fileKey) {
      latestError.value = "fileKey가 비어있어요. Figma URL 또는 fileKey를 입력하세요.";
      return;
    }

    const body: any = { fileKey };
    if (nodeId) body.nodeIds = [nodeId];

    await $fetch(`${apiBase}/projects/${project.value.id}/import/figma`, {
      method: "POST",
      headers: authHeaders.value,
      body,
    });

    await new Promise((r) => setTimeout(r, 600));
    await refreshLatest();
  });
}

async function importSample() {
  const __key = "importSample";
  return await withLoading(__key, async () => {
    latestError.value = "";
    await $fetch(`${apiBase}/projects/${project.value.id}/import/sample`, {
      method: "POST",
      headers: authHeaders.value,
    });
    await new Promise((r) => setTimeout(r, 600));
    await refreshLatest();
  });
}

function onPickJson(e: Event) {
  const input = e.target as HTMLInputElement;
  pickedJson.value = input.files?.[0] || null;
}

async function refreshLatest() {
  const __key = "refreshLatest";
  return await withLoading(__key, async () => {
    latestError.value = "";
    await Promise.all([loadLatestImport(), loadLatestMap()]);
  });
}

async function loadLatestImport() {
  const r: any = await $fetch(`${apiBase}/projects/${project.value.id}/imports/latest`, {
    headers: authHeaders.value,
  });
  latestImportId.value = r?.import?.id || "";
}

async function loadLatestMap() {
  const r: any = await $fetch(`${apiBase}/projects/${project.value.id}/maps/latest?policy=${policy.value}`, {
    headers: authHeaders.value,
  });
  latestMapId.value = r?.map?.id || "";
}

async function uploadJson() {
  const __key = "uploadJson";
  return await withLoading(__key, async () => {
    if (!pickedJson.value) return;

    latestError.value = "";

    const form = new FormData();
    form.append("file", pickedJson.value);

    const res = await fetch(`${apiBase}/projects/${project.value.id}/import/json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.value}`,
      },
      body: form,
    });

    if (!res.ok) {
      latestError.value = await res.text();
      return;
    }

    await new Promise((r) => setTimeout(r, 600));
    await refreshLatest();
  });
}

async function uploadJsonAndGenerate(target: "nuxt" | "vue") {
  const __key = target === "vue" ? "uploadVue" : "uploadNuxt";
  return await withLoading(__key, async () => {
    await uploadJson();
    await generate(target);
  });
}

async function generate(target: "nuxt" | "vue") {
  const __key = target === "vue" ? "generateVue" : "generateNuxt";
  return await withLoading(__key, async () => {
    latestError.value = "";
    await $fetch(`${apiBase}/projects/${project.value.id}/generate`, {
      method: "POST",
      headers: authHeaders.value,
      body: { target, policy: policy.value },
    });
    setTimeout(loadArtifacts, 1500);
  });
}

async function loadArtifacts() {
  const __key = "loadArtifacts";
  return await withLoading(__key, async () => {
    const r: any = await $fetch(`${apiBase}/projects/${project.value.id}/artifacts`, {
      headers: authHeaders.value,
    });
    artifacts.value = r.items || [];
  });
}

function downloadUrl(id: string) {
  return `${apiBase}/projects/${project.value.id}/artifacts/${id}/download`;
}

async function downloadArtifact(id: string) {
  const __key = `download:${id}`;
  return await withLoading(__key, async () => {
    const url = downloadUrl(id);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token.value}` },
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `artifact-${id}.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  });
}
</script>
