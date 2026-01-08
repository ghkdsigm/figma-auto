<!-- pages/index.vue -->
<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">A2UI Codegen</h1>

    <section class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">로그인</h2>
      <input v-model="email" class="border rounded-lg px-3 py-2 w-full" placeholder="email" />
      <input v-model="password" type="password" class="border rounded-lg px-3 py-2 w-full" placeholder="password" />
      <LoadingButton className="px-4 py-2 rounded-lg bg-blue-600 text-white" :loading="loading['login']" :disabled="isBusy" @click="login">로그인</LoadingButton>
      <div v-if="token" class="text-sm text-slate-600">토큰설정완료</div>
    </section>

    <section class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">프로젝트 생성</h2>
      <input v-model="projectName" class="border rounded-lg px-3 py-2 w-full" placeholder="project name" />
      <LoadingButton className="px-4 py-2 rounded-lg bg-slate-900 text-white" :loading="loading['createProject']" :disabled="isBusy" @click="createProject">생성하기</LoadingButton>
      <div v-if="project" class="text-sm">프로젝트ID: <span class="font-mono">{{ project.id }}</span></div>
    </section>

    <section v-if="project" class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">피그마 URL / 파일키 입력</h2>

      <input
        v-model="figmaInput"
        class="border rounded-lg px-3 py-2 w-full"
        placeholder="https://www.figma.com/design/... ?node-id=..."
      />

      <div class="text-xs text-slate-600 space-y-1">
        <div>fileKey: <span class="font-mono">{{ parsedFileKey || "-" }}</span></div>
        <div>nodeId: <span class="font-mono">{{ parsedNodeId || "-" }}</span></div>
      </div>

      <div class="flex gap-2">
        <LoadingButton className="px-4 py-2 rounded-lg bg-blue-600 text-white" :loading="loading['importFigma']" :disabled="isBusy" @click="importFigma">가져오기</LoadingButton>
        <LoadingButton className="px-4 py-2 rounded-lg bg-slate-200" :loading="loading['importSample']" :disabled="isBusy" @click="importSample">샘플 입력</LoadingButton>
      </div>

      <div class="pt-4 border-t space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium">JSON 파일 업로드 (manual)</h3>
          <LoadingButton className="px-3 py-2 rounded-lg border" :loading="loading['refreshLatest']" :disabled="isBusy" @click="refreshLatest">최신파일 새로고침</LoadingButton>
        </div>
        <input
          ref="jsonFileEl"
          type="file"
          accept="application/json,.json"
          class="block w-full text-sm"
          @change="onPickJson"
        />
        <div class="flex flex-wrap gap-2">
          <LoadingButton className="px-4 py-2 rounded-lg bg-emerald-600 text-white" :loading="loading['uploadJson']" :disabled="isBusy || !pickedJson" @click="uploadJson">
            업로드 JSON
          </LoadingButton>
          <LoadingButton className="px-4 py-2 rounded-lg bg-slate-900 text-white" :loading="loading['uploadVue']" :disabled="isBusy || !pickedJson" @click="uploadJsonAndGenerate('vue')">업로드후 Vue 생성</LoadingButton>
          <LoadingButton className="px-4 py-2 rounded-lg bg-slate-200" :loading="loading['uploadNuxt']" :disabled="isBusy || !pickedJson" @click="uploadJsonAndGenerate('nuxt')">업로드후 Nuxt 생성</LoadingButton>
        </div>

        <div class="text-xs text-slate-600 space-y-1">
          <div v-if="latestImportId">최신파일: <span class="font-mono">{{ latestImportId }}</span></div>
          <div v-if="latestMapId">최신맵 ({{ policy }}): <span class="font-mono">{{ latestMapId }}</span></div>
          <div v-if="latestMapId" class="pt-1">
            <NuxtLink :to="`/preview?projectId=${project.id}&policy=${policy}`" class="text-xs underline">
              미리보기 열기 (ZIP 다운로드 없음)
            </NuxtLink>
          </div>
          <div v-if="latestError" class="text-red-600">{{ latestError }}</div>
        </div>
      </div>
    </section>

    <section v-if="project" class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">ZIP 생성</h2>
      <div class="flex items-center gap-3 text-sm">
        <label class="text-slate-600">정책책</label>
        <select v-model="policy" class="border rounded-lg px-2 py-1">
          <option value="RAW">RAW</option>
          <option value="TOLERANT">TOLERANT</option>
          <option value="MIXED">MIXED</option>
          <option value="STRICT">STRICT</option>
        </select>
      </div>
      <div class="flex gap-2">
        <LoadingButton className="px-4 py-2 rounded-lg bg-slate-900 text-white" :loading="loading['generateNuxt']" :disabled="isBusy" @click="generate('nuxt')">Nuxt 생성</LoadingButton>
        <LoadingButton className="px-4 py-2 rounded-lg bg-slate-200" :loading="loading['generateVue']" :disabled="isBusy" @click="generate('vue')">VUE 생성</LoadingButton>
      </div>
    </section>

    <section v-if="project" class="border rounded-xl p-4 space-y-2 max-w-xl">
      <div class="flex items-center justify-between">
        <h2 class="font-medium">결과물</h2>
        <LoadingButton className="px-3 py-2 rounded-lg border" :loading="loading['loadArtifacts']" :disabled="isBusy" @click="loadArtifacts">새로고침</LoadingButton>
      </div>
      <ul class="space-y-2">
        <li v-for="a in artifacts" :key="a.id" class="border rounded-lg p-3 flex items-center justify-between">
          <div class="text-sm">
            <div class="font-mono">{{ a.id }}</div>
            <div class="text-slate-600">목표: {{ a.target }}</div>
          </div>
          <div class="flex items-center gap-2">
            <NuxtLink
              :to="`/preview?projectId=${project.id}&artifactId=${a.id}`"
              class="px-4 py-2 rounded-lg border"
            >미리보기</NuxtLink>
            <LoadingButton :className="'px-4 py-2 rounded-lg bg-blue-600 text-white'" :loading="loading['download:' + a.id]" :disabled="isBusy" @click="downloadArtifact(a.id)">다운로드</LoadingButton>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch, reactive, computed } from "vue";

const apiBase = useRuntimeConfig().public.apiBase as string;

const email = ref("admin@company.local");
const password = ref("admin1234!");
const token = ref("");

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
  login: false,
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


const authHeaders = computed(() => (token.value ? { Authorization: `Bearer ${token.value}` } : {}));

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
  const savedToken = localStorage.getItem("a2ui_token");
  if (savedToken) token.value = savedToken;

  const savedProjectId = localStorage.getItem("a2ui_projectId");
  if (savedProjectId) {
    project.value = { id: savedProjectId };
    loadArtifacts();
    refreshLatest();
  }
});

watch(token, (v) => {
  if (!process.client) return;
  if (v) localStorage.setItem("a2ui_token", v);
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

async function login() {
  const __key = 'login';
  return await withLoading(__key, async () => {
      const r: any = await $fetch(`${apiBase}/auth/login`, {
        method: "POST",
        body: { email: email.value, password: password.value }
      });
      token.value = r.accessToken;
  });
}

async function createProject() {
  const __key = 'createProject';
  return await withLoading(__key, async () => {
      const r: any = await $fetch(`${apiBase}/projects`, {
        method: "POST",
        headers: authHeaders.value,
        body: { name: projectName.value }
      });
      project.value = r.project;
      await loadArtifacts();
      await refreshLatest();
  });
}

async function importFigma() {
  const __key = 'importFigma';
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
        body
      });
    
      await new Promise((r) => setTimeout(r, 600));
      await refreshLatest();
  });
}

async function importSample() {
  const __key = 'importSample';
  return await withLoading(__key, async () => {
      latestError.value = "";
      await $fetch(`${apiBase}/projects/${project.value.id}/import/sample`, {
        method: "POST",
        headers: authHeaders.value
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
  const __key = 'refreshLatest';
  return await withLoading(__key, async () => {
      latestError.value = "";
      await Promise.all([loadLatestImport(), loadLatestMap()]);
  });
}

async function loadLatestImport() {
  const r: any = await $fetch(`${apiBase}/projects/${project.value.id}/imports/latest`, {
    headers: authHeaders.value
  });
  latestImportId.value = r?.import?.id || "";
}

async function loadLatestMap() {
  const r: any = await $fetch(`${apiBase}/projects/${project.value.id}/maps/latest?policy=${policy.value}`, {
    headers: authHeaders.value
  });
  latestMapId.value = r?.map?.id || "";
}

async function uploadJson() {
  const __key = 'uploadJson';
  return await withLoading(__key, async () => {
      if (!pickedJson.value) return;
    
      latestError.value = "";
    
      const form = new FormData();
      form.append("file", pickedJson.value);
    
      const res = await fetch(`${apiBase}/projects/${project.value.id}/import/json`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.value}`
        },
        body: form
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
  const __key = target === 'vue' ? 'uploadVue' : 'uploadNuxt';
  return await withLoading(__key, async () => {
      await uploadJson();
      await generate(target);
  });
}

async function generate(target: "nuxt" | "vue") {
  const __key = target === 'vue' ? 'generateVue' : 'generateNuxt';
  return await withLoading(__key, async () => {
      latestError.value = "";
      await $fetch(`${apiBase}/projects/${project.value.id}/generate`, {
        method: "POST",
        headers: authHeaders.value,
        body: { target, policy: policy.value }
      });
      setTimeout(loadArtifacts, 1500);
  });
}

async function loadArtifacts() {
  const __key = 'loadArtifacts';
  return await withLoading(__key, async () => {
      const r: any = await $fetch(`${apiBase}/projects/${project.value.id}/artifacts`, {
        headers: authHeaders.value
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
        headers: { Authorization: `Bearer ${token.value}` }
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