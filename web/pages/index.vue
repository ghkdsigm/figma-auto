<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-semibold">A2UI Codegen</h1>

    <section class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">Login</h2>
      <input v-model="email" class="border rounded-lg px-3 py-2 w-full" placeholder="email" />
      <input v-model="password" type="password" class="border rounded-lg px-3 py-2 w-full" placeholder="password" />
      <div class="flex gap-2">
        <button class="px-4 py-2 rounded-lg bg-blue-600 text-white" @click="login">Login</button>
        <button class="px-4 py-2 rounded-lg bg-slate-200" @click="logout" :disabled="!token">Logout</button>
      </div>
      <div v-if="token" class="text-sm text-slate-600">
        Token set
      </div>
      <div v-if="authError" class="text-sm text-red-600">
        {{ authError }}
      </div>
    </section>

    <section v-if="token" class="border rounded-xl p-4 space-y-2 max-w-xl">
      <div class="flex items-center justify-between">
        <h2 class="font-medium">Projects</h2>
        <button class="px-3 py-2 rounded-lg border" @click="loadProjects">Refresh</button>
      </div>

      <div class="space-y-2">
        <div class="text-sm text-slate-600">
          Selected ProjectId:
          <span v-if="selectedProjectId" class="font-mono">{{ selectedProjectId }}</span>
          <span v-else>-</span>
        </div>

        <select v-model="selectedProjectId" class="border rounded-lg px-3 py-2 w-full" @change="onSelectProject">
          <option value="" disabled>Choose a project</option>
          <option v-for="p in projects" :key="p.id" :value="p.id">
            {{ p.name }} ({{ p.id }})
          </option>
        </select>
      </div>
    </section>

    <section v-if="token" class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">Create Project</h2>
      <input v-model="projectName" class="border rounded-lg px-3 py-2 w-full" placeholder="project name" />
      <button class="px-4 py-2 rounded-lg bg-slate-900 text-white" @click="createProject">Create</button>
      <div v-if="project" class="text-sm">
        ProjectId: <span class="font-mono">{{ project.id }}</span>
      </div>
      <div v-if="projectError" class="text-sm text-red-600">
        {{ projectError }}
      </div>
    </section>

    <section v-if="project" class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">Import</h2>
      <input v-model="fileKey" class="border rounded-lg px-3 py-2 w-full" placeholder="Figma fileKey" />
      <div class="flex gap-2">
        <button class="px-4 py-2 rounded-lg bg-blue-600 text-white" @click="importFigma" :disabled="busy">
          Import Figma
        </button>
        <button class="px-4 py-2 rounded-lg bg-slate-200" @click="importSample" :disabled="busy">
          Use Sample
        </button>
      </div>
      <div v-if="jobState.lastJobId" class="text-sm text-slate-600">
        lastJobId: <span class="font-mono">{{ jobState.lastJobId }}</span>
      </div>
      <div v-if="jobState.status" class="text-sm">
        status: <span class="font-mono">{{ jobState.status }}</span>
      </div>
      <div v-if="jobState.error" class="text-sm text-red-600">
        {{ jobState.error }}
      </div>
      <div v-if="importError" class="text-sm text-red-600">
        {{ importError }}
      </div>
    </section>

    <section v-if="project" class="border rounded-xl p-4 space-y-2 max-w-xl">
      <h2 class="font-medium">Generate</h2>
      <div class="flex gap-2">
        <button class="px-4 py-2 rounded-lg bg-slate-900 text-white" @click="generate('nuxt')" :disabled="busy">
          Generate Nuxt
        </button>
        <button class="px-4 py-2 rounded-lg bg-slate-200" @click="generate('vue')" :disabled="busy">
          Generate Vue
        </button>
      </div>
      <div v-if="generateError" class="text-sm text-red-600">
        {{ generateError }}
      </div>
    </section>

    <section v-if="project" class="border rounded-xl p-4 space-y-2 max-w-xl">
      <div class="flex items-center justify-between">
        <h2 class="font-medium">Artifacts</h2>
        <button class="px-3 py-2 rounded-lg border" @click="loadArtifacts" :disabled="busy">Refresh</button>
      </div>

      <div v-if="artifactsError" class="text-sm text-red-600">
        {{ artifactsError }}
      </div>

      <ul class="space-y-2">
        <li v-for="a in artifacts" :key="a.id" class="border rounded-lg p-3 flex items-center justify-between">
          <div class="text-sm">
            <div class="font-mono">{{ a.id }}</div>
            <div class="text-slate-600">target: {{ a.target }}</div>
            <div class="text-slate-600">createdAt: {{ a.createdAt }}</div>
          </div>
          <button @click="downloadArtifact(a.id)" class="px-4 py-2 rounded-lg bg-blue-600 text-white" :disabled="busy">
            Download
          </button>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
type Target = "nuxt" | "vue";

const apiBase = useRuntimeConfig().public.apiBase as string;

const email = ref("admin@company.local");
const password = ref("admin1234!");
const token = ref("");

const authError = ref("");

const projects = ref<any[]>([]);
const selectedProjectId = ref<string>("");

const projectName = ref("figma-a2ui");
const project = ref<any>(null);
const projectError = ref("");

const fileKey = ref("");
const artifacts = ref<any[]>([]);

const importError = ref("");
const generateError = ref("");
const artifactsError = ref("");

const busy = ref(false);

const jobState = reactive({
  lastJobId: "" as string,
  status: "" as string,
  error: "" as string,
});

const authHeaders = computed(() => (token.value ? { Authorization: `Bearer ${token.value}` } : {}));

function saveToken(t: string) {
  token.value = t;
  localStorage.setItem("a2ui_token", t);
}

function loadToken() {
  const t = localStorage.getItem("a2ui_token") || "";
  if (t) token.value = t;
}

function saveSelectedProjectId(id: string) {
  selectedProjectId.value = id;
  localStorage.setItem("a2ui_selected_project_id", id);
}

function loadSelectedProjectId() {
  const id = localStorage.getItem("a2ui_selected_project_id") || "";
  if (id) selectedProjectId.value = id;
}

function resetErrors() {
  authError.value = "";
  projectError.value = "";
  importError.value = "";
  generateError.value = "";
  artifactsError.value = "";
  jobState.error = "";
}

async function login() {
  resetErrors();
  try {
    const r: any = await $fetch(`${apiBase}/auth/login`, {
      method: "POST",
      body: { email: email.value, password: password.value },
    });
    saveToken(r.accessToken);
    await initAfterAuth();
  } catch (e: any) {
    authError.value = e?.data?.message || e?.message || "Login failed";
  }
}

function logout() {
  token.value = "";
  project.value = null;
  artifacts.value = [];
  projects.value = [];
  selectedProjectId.value = "";
  localStorage.removeItem("a2ui_token");
  localStorage.removeItem("a2ui_selected_project_id");
}

async function initAfterAuth() {
  await loadProjects();
  loadSelectedProjectId();
  if (selectedProjectId.value) {
    await selectProject(selectedProjectId.value);
  }
}

async function loadProjects() {
  resetErrors();
  if (!token.value) return;
  try {
    const r: any = await $fetch(`${apiBase}/projects`, {
      headers: authHeaders.value,
    });
    projects.value = r.items || r.projects || [];
  } catch (e: any) {
    projectError.value = e?.data?.message || e?.message || "Failed to load projects";
  }
}

async function onSelectProject() {
  if (!selectedProjectId.value) return;
  await selectProject(selectedProjectId.value);
}

async function selectProject(projectId: string) {
  saveSelectedProjectId(projectId);

  const p = projects.value.find((x) => x.id === projectId);
  project.value = p || { id: projectId, name: "(unknown)" };

  await loadArtifacts();
}

async function createProject() {
  resetErrors();
  if (!token.value) return;

  busy.value = true;
  try {
    const r: any = await $fetch(`${apiBase}/projects`, {
      method: "POST",
      headers: authHeaders.value,
      body: { name: projectName.value },
    });

    project.value = r.project;
    await loadProjects();

    if (project.value?.id) {
      await selectProject(project.value.id);
    }
  } catch (e: any) {
    projectError.value = e?.data?.message || e?.message || "Create project failed";
  } finally {
    busy.value = false;
  }
}

async function importFigma() {
  resetErrors();
  if (!project.value?.id) return;

  busy.value = true;
  try {
    const r: any = await $fetch(`${apiBase}/projects/${project.value.id}/import/figma`, {
      method: "POST",
      headers: authHeaders.value,
      body: { fileKey: fileKey.value },
    });

    jobState.lastJobId = r?.job?.id || "";
    jobState.status = r?.job?.status || "";
    jobState.error = "";

    if (jobState.lastJobId) {
      await waitJobDone(jobState.lastJobId);
      await loadArtifacts();
    }
  } catch (e: any) {
    importError.value = e?.data?.message || e?.message || "Import figma failed";
  } finally {
    busy.value = false;
  }
}

async function importSample() {
  resetErrors();
  if (!project.value?.id) return;

  busy.value = true;
  try {
    const r: any = await $fetch(`${apiBase}/projects/${project.value.id}/import/sample`, {
      method: "POST",
      headers: authHeaders.value,
    });

    jobState.lastJobId = r?.job?.id || "";
    jobState.status = r?.job?.status || "";
    jobState.error = "";

    if (jobState.lastJobId) {
      await waitJobDone(jobState.lastJobId);
      await loadArtifacts();
    }
  } catch (e: any) {
    importError.value = e?.data?.message || e?.message || "Import sample failed";
  } finally {
    busy.value = false;
  }
}

async function generate(target: Target) {
  resetErrors();
  if (!project.value?.id) return;

  busy.value = true;
  try {
    const r: any = await $fetch(`${apiBase}/projects/${project.value.id}/generate`, {
      method: "POST",
      headers: authHeaders.value,
      body: { policy: "TOLERANT", target },
    });

    jobState.lastJobId = r?.job?.id || "";
    jobState.status = r?.job?.status || "";
    jobState.error = "";

    if (jobState.lastJobId) {
      await waitJobDone(jobState.lastJobId);
      await loadArtifacts();
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await loadArtifacts();
    }
  } catch (e: any) {
    generateError.value = e?.data?.message || e?.message || "Generate failed";
  } finally {
    busy.value = false;
  }
}

async function waitJobDone(jobId: string) {
  const timeoutMs = 120000;
  const intervalMs = 1000;
  const started = Date.now();

  const isTerminal = (s: string) => {
    const v = (s || "").toUpperCase();
    return ["DONE", "COMPLETED", "SUCCESS", "SUCCEEDED", "FAILED", "CANCELED", "CANCELLED", "ERROR"].includes(v);
  };

  while (Date.now() - started < timeoutMs) {
    const r: any = await $fetch(`${apiBase}/projects/${project.value.id}/jobs/${jobId}?t=${Date.now()}`, {
      headers: authHeaders.value,
    });

    const job = r?.job ?? r;
    const s = job?.status || "";
    const err = job?.error || "";

    jobState.status = s;
    jobState.error = err;

    if (isTerminal(s)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  jobState.error = "Job polling timed out";
}


async function loadArtifacts() {
  resetErrors();
  if (!project.value?.id) return;

  try {
    const r: any = await $fetch(`${apiBase}/projects/${project.value.id}/artifacts?t=${Date.now()}`, {
      headers: authHeaders.value,
    });
    artifacts.value = r.items || [];
  } catch (e: any) {
    artifactsError.value = e?.data?.message || e?.message || "Failed to load artifacts";
  }
}

function downloadUrl(id: string) {
  return `${apiBase}/projects/${project.value.id}/artifacts/${id}/download`;
}

async function downloadArtifact(id: string) {
  resetErrors();
  if (!project.value?.id) return;

  busy.value = true;
  try {
    const url = downloadUrl(id);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token.value}` },
    });

    if (!response.ok) {
      const t = await response.text().catch(() => "");
      throw new Error(`Download failed: ${response.status} ${t}`);
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
  } catch (e: any) {
    artifactsError.value = e?.message || "Download failed";
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  loadToken();
  if (token.value) {
    await initAfterAuth();
  }
});
</script>
