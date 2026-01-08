<!-- pages/preview.vue -->
<template>
  <div class="min-h-screen p-6">
    <div class="max-w-5xl mx-auto space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-semibold">Preview</h1>
        <NuxtLink to="/" class="text-sm underline">Back</NuxtLink>
      </div>

      <div class="flex items-center gap-2">
        <div class="text-sm text-slate-700">
          Project: <span class="font-mono">{{ projectId || "(none)" }}</span>
        </div>
        <LoadingButton className="text-sm underline" :loading="loading['loadLatest']" :disabled="isBusy" @click="loadLatest()">Reload</LoadingButton>
      </div>

      <div v-if="error" class="text-sm text-red-600">
        {{ error }}
      </div>

      <div class="border rounded-xl p-4 bg-white">
        <DsRenderer v-if="root" :node="root" />
        <div v-else class="text-sm text-slate-700">
          아직 불러올 데이터가 없습니다. 먼저 JSON Import 또는 Figma Import 후 Map/Generate 를 실행하세요.
        </div>
      </div>

      <details class="text-xs text-slate-600">
        <summary class="cursor-pointer">Debug (dsSpec)</summary>
        <pre class="mt-2 p-3 bg-slate-50 border rounded-lg whitespace-pre-wrap">{{ pretty }}</pre>
      </details>

      <details v-if="sources" class="text-xs text-slate-600">
        <summary class="cursor-pointer">Debug (generated sources)</summary>

        <div class="mt-2 space-y-4">
          <div class="flex justify-end">
            <LoadingButton
              className="px-3 py-2 rounded-lg border bg-white"
              :loading="loading['copyAll']"
              :disabled="isBusy"
              @click="copyAllSources"
            >
              전체 복사
            </LoadingButton>
          </div>

          <div
            v-for="[filePath, fileContent] in sourcesEntries"
            :key="filePath"
            class="border rounded-lg overflow-hidden bg-slate-50"
          >
            <div class="flex items-center justify-between px-3 py-2 border-b bg-white">
              <div class="font-mono text-xs text-slate-700">
                {{ filePath }}
              </div>
              <LoadingButton
                className="px-3 py-1.5 rounded-lg border bg-white"
                :loading="loading['copy:' + filePath]"
                :disabled="isBusy"
                @click="copySourceFile(filePath, fileContent)"
              >
                복사
              </LoadingButton>
            </div>
            <pre class="p-3 whitespace-pre-wrap text-xs text-slate-700">{{ fileContent }}</pre>
          </div>

          <div v-if="copyMessage" class="text-xs text-emerald-700">
            {{ copyMessage }}
          </div>
        </div>
      </details>
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
  const __key = 'loadLatest';
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
            headers: { Authorization: `Bearer ${token}` }
          });
          raw.value = data?.dsSpec || null;
          root.value = data?.dsSpec?.tree || null;
          sources.value = data?.files || null;
        } else {
          const data: any = await $fetch(`/projects/${projectId.value}/maps/latest?policy=${encodeURIComponent(policy.value)}`, {
            baseURL: "http://localhost:3000",
            headers: { Authorization: `Bearer ${token}` }
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