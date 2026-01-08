export const useAuth = () => {
  const token = useState<string | null>("auth_token", () => {
    if (process.client) {
      return localStorage.getItem("a2ui_token");
    }
    return null;
  });

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


