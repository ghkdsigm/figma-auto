export default defineNuxtConfig({ ssr:true, runtimeConfig:{ public:{ apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3000' }}})
