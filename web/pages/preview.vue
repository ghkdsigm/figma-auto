<!-- pages/preview.vue -->
<template>
  <div class="min-h-screen">
    <!-- Background -->
    <div class="fixed inset-0 -z-10">
      <div class="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-indigo-50"></div>
      <div class="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl"></div>
      <div class="absolute top-40 -right-24 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl"></div>
      <div class="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-rose-200/30 blur-3xl"></div>
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:22px_22px] opacity-40"></div>
    </div>

    <div class="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
      <!-- Top bar -->
      <div class="mb-6">
        <div
          class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-3xl border border-slate-200/70 bg-white/70 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur p-5"
        >
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-indigo-500"></span>
              <h1 class="text-lg sm:text-xl font-semibold tracking-tight text-slate-900">
                Preview
              </h1>
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span class="inline-flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 shadow-sm">
                <span class="text-slate-500">Project</span>
                <span class="font-mono font-semibold text-slate-900 break-all">{{ projectId || "(none)" }}</span>
              </span>

              <span v-if="artifactId" class="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 ring-1 ring-indigo-200">
                <span class="text-indigo-500">Artifact</span>
                <span class="font-mono font-semibold break-all">{{ artifactId }}</span>
              </span>

              <span v-else class="inline-flex items-center gap-2 rounded-full bg-slate-900/5 px-3 py-1 text-slate-700 ring-1 ring-slate-200">
                <span class="text-slate-500">Policy</span>
                <span class="font-mono font-semibold">{{ policy }}</span>
              </span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <LoadingButton
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60"
              :loading="loading['loadLatest']"
              :disabled="isBusy"
              @click="loadLatest()"
            >
              새로고침
            </LoadingButton>

            <NuxtLink
              to="/"
              class="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
            >
              뒤로가기
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div
        v-if="error"
        class="mb-6 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-sm"
      >
        {{ error }}
      </div>

      <!-- Render card -->
      <section
        class="rounded-3xl border border-slate-200/70 bg-white/70 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.35)] backdrop-blur"
      >
        <div class="p-5 sm:p-6">
          <div class="mb-4 flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-semibold text-slate-900">Rendered Output</div>
              <div class="mt-1 text-xs text-slate-600">
                dsSpec tree를 렌더링한 결과를 보여줍니다.
              </div>
            </div>
            <div class="hidden sm:flex items-center gap-2 rounded-full border border-slate-200/70 bg-white/70 px-3 py-1 text-xs text-slate-600 shadow-sm">
              <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              Renderer
            </div>
          </div>

          <div class="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
            <DsRenderer v-if="root" :node="root" />
            <div v-else class="py-10 text-center">
              <div class="mx-auto mb-3 h-10 w-10 rounded-2xl bg-slate-900/5"></div>
              <div class="text-sm font-medium text-slate-800">
                아직 불러올 데이터가 없습니다.
              </div>
              <div class="mt-1 text-sm text-slate-600">
                먼저 JSON Import 또는 Figma Import 후 Map/Generate 를 실행하세요.
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Debug panels -->
      <div class="mt-6 space-y-4">
        <details class="group rounded-3xl border border-slate-200/70 bg-white/70 shadow-sm backdrop-blur">
          <summary class="cursor-pointer list-none px-5 py-4">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-slate-400"></span>
                <span class="text-sm font-semibold text-slate-900">Debug (dsSpec)</span>
              </div>
              <span class="text-xs text-slate-500 group-open:hidden">펼치기</span>
              <span class="text-xs text-slate-500 hidden group-open:inline">접기</span>
            </div>
          </summary>
          <div class="px-5 pb-5">
            <pre class="rounded-2xl border border-slate-200/70 bg-slate-950 p-4 text-xs text-slate-100 whitespace-pre-wrap overflow-auto shadow-sm">{{ pretty }}</pre>
          </div>
        </details>

        <details
          v-if="sources"
          class="group rounded-3xl border border-slate-200/70 bg-white/70 shadow-sm backdrop-blur"
        >
          <summary class="cursor-pointer list-none px-5 py-4">
            <div class="flex items-center justify-between gap-3">
              <div class="flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-indigo-500"></span>
                <span class="text-sm font-semibold text-slate-900">Debug (generated sources)</span>
              </div>
              <span class="text-xs text-slate-500 group-open:hidden">펼치기</span>
              <span class="text-xs text-slate-500 hidden group-open:inline">접기</span>
            </div>
          </summary>

          <div class="px-5 pb-5">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div class="text-sm text-slate-600">
                생성된 파일을 개별/전체로 복사할 수 있어요.
              </div>
              <LoadingButton
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60"
                :loading="loading['copyAll']"
                :disabled="isBusy"
                @click="copyAllSources"
              >
                전체 복사
              </LoadingButton>
            </div>

            <div class="space-y-4">
              <div
                v-for="[filePath, fileContent] in sourcesEntries"
                :key="filePath"
                class="overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 shadow-sm"
              >
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-b border-slate-200/70 bg-white/70">
                  <div class="min-w-0">
                    <div class="text-xs text-slate-500">file</div>
                    <div class="font-mono text-xs sm:text-sm font-semibold text-slate-900 break-all">
                      {{ filePath }}
                    </div>
                  </div>

                  <LoadingButton
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60"
                    :loading="loading['copy:' + filePath]"
                    :disabled="isBusy"
                    @click="copySourceFile(filePath, fileContent)"
                  >
                    복사
                  </LoadingButton>
                </div>

                <pre class="bg-slate-950 p-4 text-xs text-slate-100 whitespace-pre-wrap overflow-auto">{{ fileContent }}</pre>
              </div>

              <div
                v-if="copyMessage"
                class="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
              >
                {{ copyMessage }}
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive } from "vue";
import { useHead } from "#app";
import { useRoute } from "vue-router";
import DsRenderer from "~/components/a2ui/DsRenderer.vue";

useHead({
  script: [
    {
      src: "https://cdn.tailwindcss.com",
      defer: true,
    },
  ],
});

const route = useRoute();

const projectId = ref<string>(String(route.query.projectId || ""));
const policy = ref<string>(String(route.query.policy || "RAW"));
const artifactId = ref<string>(String(route.query.artifactId || ""));

const error = ref<string>("");
const root = ref<any>(null);
const raw = ref<any>(null);
const sources = ref<any>(null);

const loading = reactive<Record<string, boolean>>({
  loadLatest: false,
  copyAll: false,
});

const isBusy = computed(() => Object.values(loading).some(Boolean));

async function withLoading<T>(key: string, fn: () => Promise<T>) {
  if (isBusy.value && !loading[key]) return undefined as unknown as T;
  loading[key] = true;
  try {
    return await fn();
  } finally {
    loading[key] = false;
  }
}

const copyMessage = ref<string>("");
const sourcesEntries = computed<[string, string][]>(() => {
  const s = sources.value || {};
  return Object.entries(s).map(([k, v]) => [k, String(v)]);
});

async function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

async function copySourceFile(filePath: string, fileContent: string) {
  const key = `copy:${filePath}`;
  await withLoading(key, async () => {
    await copyText(fileContent);
    copyMessage.value = `${filePath} 복사 완료`;
    window.setTimeout(() => {
      if (copyMessage.value === `${filePath} 복사 완료`) copyMessage.value = "";
    }, 1200);
  });
}

async function copyAllSources() {
  await withLoading("copyAll", async () => {
    const joined = sourcesEntries.value
      .map(([p, c]) => `// ===== ${p} =====\n${c}`)
      .join("\n\n");
    await copyText(joined);
    copyMessage.value = "전체 복사 완료";
    window.setTimeout(() => {
      if (copyMessage.value === "전체 복사 완료") copyMessage.value = "";
    }, 1200);
  });
}

const pretty = computed(() => (raw.value ? JSON.stringify(raw.value, null, 2) : ""));
const prettySources = computed(() => (sources.value ? JSON.stringify(sources.value, null, 2) : ""));

function getToken() {
  if (process.client) return localStorage.getItem("a2ui_token") || "";
  return "";
}

async function loadLatest() {
  const __key = "loadLatest";
  return await withLoading(__key, async () => {
    error.value = "";
    root.value = null;
    raw.value = null;
    sources.value = null;

    if (!projectId.value) {
      if (process.client) {
        const saved = localStorage.getItem("a2ui_projectId") || "";
        if (saved) projectId.value = saved;
      }
    }

    if (!projectId.value) {
      error.value = "projectId가 없습니다. 메인 화면에서 프로젝트를 만든 뒤 Preview를 눌러주세요.";
      return;
    }

    const token = getToken();
    if (!token) {
      error.value = "토큰이 없습니다. 메인 화면에서 Login 후 다시 시도하세요.";
      return;
    }

    try {
      if (artifactId.value) {
        const data: any = await $fetch(`/projects/${projectId.value}/artifacts/${artifactId.value}/sources`, {
          baseURL: "http://localhost:3000",
          headers: { Authorization: `Bearer ${token}` },
        });
        raw.value = data?.dsSpec || null;
        root.value = data?.dsSpec?.tree || null;
        sources.value = data?.files || null;
      } else {
        const data: any = await $fetch(`/projects/${projectId.value}/maps/latest?policy=${encodeURIComponent(policy.value)}`, {
          baseURL: "http://localhost:3000",
          headers: { Authorization: `Bearer ${token}` },
        });

        const map = data?.map;
        raw.value = map?.dsSpec || null;
        root.value = map?.dsSpec?.tree || null;
        sources.value = null;
      }
    } catch (e: any) {
      error.value = e?.message || String(e);
    }
  });
}

onMounted(() => {
  loadLatest();
});
</script>

<style scoped>
.bg-white {
  background: white;
}
</style>
