export const useAuth = () => {
  // SSR(새로고침/초기 로딩)에서도 인증 상태를 복원할 수 있도록 쿠키를 소스 오브 트루스로 사용합니다.
  // 기존 사용자(로컬스토리지에만 토큰이 있는 경우)도 끊기지 않도록 클라이언트에서 쿠키로 마이그레이션합니다.
  const token = useCookie<string | null>("a2ui_token", {
    default: () => null,
    sameSite: "lax",
  });

  if (process.client && !token.value) {
    const legacy = localStorage.getItem("a2ui_token");
    if (legacy) token.value = legacy;
  }

  const isAuthenticated = computed(() => !!token.value);

  const setToken = (newToken: string | null) => {
    token.value = newToken;
    if (process.client) {
      if (newToken) {
        localStorage.setItem("a2ui_token", newToken);
      } else {
        localStorage.removeItem("a2ui_token");
      }
    }
  };

  const logout = () => {
    setToken(null);
    if (process.client) {
      localStorage.removeItem("a2ui_projectId");
      navigateTo("/login");
    }
  };

  const authHeaders = computed(() => {
    return token.value ? { Authorization: `Bearer ${token.value}` } : {};
  });

  return {
    token,
    isAuthenticated,
    setToken,
    logout,
    authHeaders,
  };
};


