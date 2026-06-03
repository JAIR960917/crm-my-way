// Cópia para dev local: cp public/runtime-config.example.js public/runtime-config.js
// Produção (VPS): deploy.sh gera public/runtime-config.js a partir do .env (não versionado).
// Desenvolvimento: use VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no .env.
window.__CRM_RUNTIME_CONFIG__ = window.__CRM_RUNTIME_CONFIG__ || {};
