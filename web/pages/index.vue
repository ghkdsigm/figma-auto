<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">A2UI Codegen</h1>

    <section class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">Login</h2>
      <input v-model="email" class="border rounded-lg px-3 py-2 w-full" placeholder="email" />
      <input v-model="password" type="password" class="border rounded-lg px-3 py-2 w-full" placeholder="password" />
      <button class="px-4 py-2 rounded-lg bg-blue-600 text-white" @click="login">Login</button>
      <div v-if="token" class="text-sm text-slate-600">Token set</div>
    </section>

    <section class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">Create Project</h2>
      <input v-model="projectName" class="border rounded-lg px-3 py-2 w-full" placeholder="project name" />
      <button class="px-4 py-2 rounded-lg bg-slate-900 text-white" @click="createProject">Create</button>
      <div v-if="project" class="text-sm">ProjectId: <span class="font-mono">{{ project.id }}</span></div>
    </section>

    <section v-if="project" class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">Import</h2>
      <input v-model="fileKey" class="border rounded-lg px-3 py-2 w-full" placeholder="Figma fileKey" />
      <div class="flex gap-2">
        <button class="px-4 py-2 rounded-lg bg-blue-600 text-white" @click="importFigma">Import Figma</button>
        <button class="px-4 py-2 rounded-lg bg-slate-200" @click="importSample">Use Sample</button>
      </div>
    </section>

    <section v-if="project" class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">Generate</h2>
      <div class="flex gap-2">
        <button class="px-4 py-2 rounded-lg bg-slate-900 text-white" @click="generate('nuxt')">Generate Nuxt</button>
        <button class="px-4 py-2 rounded-lg bg-slate-200" @click="generate('vue')">Generate Vue</button>
      </div>
    </section>

    <section v-if="project" class="border rounded-xl p-4 space-y-2 max-w-xl">
      <div class="flex items-center justify-between">
        <h2 class="font-medium">Artifacts</h2>
        <button class="px-3 py-2 rounded-lg border" @click="loadArtifacts">Refresh</button>
      </div>
      <ul class="space-y-2">
        <li v-for="a in artifacts" :key="a.id" class="border rounded-lg p-3 flex items-center justify-between">
          <div class="text-sm">
            <div class="font-mono">{{ a.id }}</div>
            <div class="text-slate-600">target: {{ a.target }}</div>
          </div>
          <button @click="downloadArtifact(a.id)" class="px-4 py-2 rounded-lg bg-blue-600 text-white">Download</button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
const apiBase = useRuntimeConfig().public.apiBase as string;

const email = ref("admin@company.local");
const password = ref("admin1234!");
const token = ref("");

const projectName = ref("figma-a2ui");
const project = ref<any>(null);

const fileKey = ref("");
const artifacts = ref<any[]>([]);

const authHeaders = computed(() => token.value ? { Authorization: `Bearer ${token.value}` } : {});

async function login() {
  const r:any = await $fetch(`${apiBase}/auth/login`, { method: "POST", body: { email: email.value, password: password.value } });
  token.value = r.accessToken;
}

async function createProject() {
  const r:any = await $fetch(`${apiBase}/projects`, { method: "POST", headers: authHeaders.value, body: { name: projectName.value } });
  project.value = r.project;
  await loadArtifacts();
}

async function importFigma() {
  await $fetch(`${apiBase}/projects/${project.value.id}/import/figma`, { method: "POST", headers: authHeaders.value, body: { fileKey: fileKey.value } });
}

async function importSample() {
  await $fetch(`${apiBase}/projects/${project.value.id}/import/sample`, { method: "POST", headers: authHeaders.value });
}

async function generate(target: "nuxt"|"vue") {
  await $fetch(`${apiBase}/projects/${project.value.id}/generate`, { method: "POST", headers: authHeaders.value, body: { target } });
  setTimeout(loadArtifacts, 1500);
}

async function loadArtifacts() {
  const r:any = await $fetch(`${apiBase}/projects/${project.value.id}/artifacts`, { headers: authHeaders.value });
  artifacts.value = r.items || [];
}

function downloadUrl(id: string) {
  return `${apiBase}/projects/${project.value.id}/artifacts/${id}/download`;
}

async function downloadArtifact(id: string) {
  const url = downloadUrl(id);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token.value}` }
  });
  
  if (!response.ok) {
    throw new Error(`Download failed: ${response.statusText}`);
  }
  
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = `artifact-${id}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}
</script>
