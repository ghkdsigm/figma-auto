<!-- layouts/default.vue -->
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
  
      <header class="sticky top-0 z-30">
        <div class="border-b border-slate-200/70 bg-white/70 backdrop-blur">
          <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div class="flex h-16 items-center justify-between">
              <div class="flex items-center gap-3">
                <NuxtLink
                  to="/"
                  class="group inline-flex items-center gap-2 rounded-2xl px-2 py-1 transition hover:bg-slate-900/5"
                >
                  <span
                    class="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm transition group-hover:shadow"
                  >
                    A2
                  </span>
                  <div class="leading-tight">
                    <div class="text-sm font-semibold text-slate-900 tracking-tight">A2UI Codegen</div>
                    <div class="text-xs text-slate-500">Figma → Vue / Nuxt</div>
                  </div>
                </NuxtLink>
              </div>
  
              <div class="flex items-center gap-3">
                <div class="hidden sm:flex items-center gap-2 rounded-full bg-white/70 px-3 py-1.5 text-xs text-slate-600 shadow-sm">
                  <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  <span v-if="isAuthenticated">환영합니다!</span>
                  <span v-else>로그인해주세요.</span>
                </div>
  
                <LoadingButton
                  v-if="isAuthenticated"
                  className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-white focus:outline-none focus:ring-4 focus:ring-slate-200 disabled:opacity-60"
                  :loading="logoutLoading"
                  @click="handleLogout"
                >
                  로그아웃
                </LoadingButton>
              </div>
            </div>
          </div>
        </div>
      </header>
  
      <main class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <slot />
      </main>

      <!-- Scroll to top -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 translate-y-2 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 translate-y-2 scale-95"
      >
        <button
          v-if="showScrollTop"
          type="button"
          aria-label="맨 위로"
          class="fixed bottom-6 right-6 z-40 inline-flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-slate-200"
          @click="scrollToTop"
        >
          <svg viewBox="0 0 24 24" fill="none" class="h-5 w-5" aria-hidden="true">
            <path
              d="M12 5l-7 7m7-7l7 7M12 5v14"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </Transition>
    </div>
  </template>
  
  <script setup>
  const { isAuthenticated, logout } = useAuth();
  const logoutLoading = ref(false);

  const showScrollTop = ref(false);

  function updateScrollTopVisibility() {
    showScrollTop.value = window.scrollY > 240;
  }

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onMounted(() => {
    updateScrollTopVisibility();
    window.addEventListener('scroll', updateScrollTopVisibility, { passive: true });
  });

  onBeforeUnmount(() => {
    window.removeEventListener('scroll', updateScrollTopVisibility);
  });
  
  async function handleLogout() {
    logoutLoading.value = true;
    await new Promise((resolve) => setTimeout(resolve, 300));
    logout();
    logoutLoading.value = false;
  }
  </script>
  
