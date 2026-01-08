<!-- pages/login.vue -->
<template>
    <div class="min-h-screen flex items-center justify-center px-4 py-10">
      <!-- Background -->
      <div class="fixed inset-0 -z-10">
        <div class="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-indigo-50"></div>
        <div class="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-200/40 blur-3xl"></div>
        <div class="absolute top-40 -right-24 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl"></div>
        <div class="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-rose-200/30 blur-3xl"></div>
        <div class="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.06)_1px,transparent_1px)] [background-size:22px_22px] opacity-40"></div>
      </div>
  
      <div class="w-full max-w-md">
        <div
          class="relative overflow-hidden rounded-3xl border border-slate-200/70 bg-white/70 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.55)] backdrop-blur"
        >
          <div class="absolute inset-0 bg-gradient-to-br from-white/40 to-indigo-50/20"></div>
  
          <div class="relative p-8 sm:p-9 space-y-6">
            <!-- Header -->
            <div class="text-center space-y-3">
              <div class="mx-auto inline-flex items-center justify-center">
                <div class="inline-flex items-center gap-3">
                  <span class="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                    A2
                  </span>
                  <div class="text-left leading-tight">
                    <h1 class="text-xl font-semibold tracking-tight text-slate-900">A2UI Codegen</h1>
                    <p class="text-sm text-slate-600">로그인하여 시작하세요</p>
                  </div>
                </div>
              </div>
  
              <div class="mx-auto h-px w-24 bg-gradient-to-r from-transparent via-slate-200 to-transparent"></div>
            </div>
  
            <!-- Error -->
            <div
              v-if="error"
              class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
            >
              {{ error }}
            </div>
  
            <!-- Form -->
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-2">이메일</label>
                <input
                  v-model="email"
                  type="email"
                  class="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-200/50"
                  placeholder="email@example.com"
                  @keyup.enter="handleLogin"
                />
              </div>
  
              <div>
                <label class="block text-sm font-medium text-slate-700 mb-2">비밀번호</label>
                <input
                  v-model="password"
                  type="password"
                  class="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-indigo-300 focus:ring-4 focus:ring-indigo-200/50"
                  placeholder="••••••••"
                  @keyup.enter="handleLogin"
                />
              </div>
            </div>
  
            <!-- CTA -->
            <LoadingButton
              className="w-full rounded-2xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-3 font-medium text-white shadow-sm transition hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus:ring-4 focus:ring-indigo-200 disabled:opacity-60"
              :loading="loading"
              :disabled="loading || !email || !password"
              @click="handleLogin"
            >
              로그인
            </LoadingButton>
  
            <!-- Footer hint -->
            <div class="pt-1 text-center text-xs text-slate-500">
              인증 후 프로젝트 생성/임포트/생성을 진행할 수 있어요.
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>
  
  <script setup lang="ts">
  definePageMeta({
    layout: false,
  });
  
  const apiBase = useRuntimeConfig().public.apiBase as string;
  const { setToken, isAuthenticated } = useAuth();
  
  // 이미 로그인된 경우 메인 페이지로 리다이렉트
  if (isAuthenticated.value) {
    navigateTo("/");
  }
  
  const email = ref("admin@company.local");
  const password = ref("admin1234!");
  const loading = ref(false);
  const error = ref("");
  
  async function handleLogin() {
    if (!email.value || !password.value) return;
  
    loading.value = true;
    error.value = "";
  
    try {
      const r: any = await $fetch(`${apiBase}/auth/login`, {
        method: "POST",
        body: { email: email.value, password: password.value },
      });
      setToken(r.accessToken);
      navigateTo("/");
    } catch (err: any) {
      error.value = err.data?.message || "로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.";
    } finally {
      loading.value = false;
    }
  }
  </script>
  