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
        <button
          class="text-sm underline"
          @click="loadLatest()"
        >
          Reload
        </button>
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
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

const error = ref<string>("");
const root = ref<any>(null);
const raw = ref<any>(null);

const pretty = computed(() => (raw.value ? JSON.stringify(raw.value, null, 2) : ""));

function getToken() {
  if (process.client) return localStorage.getItem("a2ui_token") || "";
  return "";
}

async function loadLatest() {
  error.value = "";
  root.value = null;
  raw.value = null;

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
    const data: any = await $fetch(`/projects/${projectId.value}/maps/latest?policy=${encodeURIComponent(policy.value)}`, {
      baseURL: "http://localhost:3000",
      headers: { Authorization: `Bearer ${token}` }
    });

    const map = data?.map;
    raw.value = map?.dsSpec || null;
    root.value = map?.dsSpec?.tree || null;
  } catch (e: any) {
    error.value = e?.message || String(e);
  }
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
