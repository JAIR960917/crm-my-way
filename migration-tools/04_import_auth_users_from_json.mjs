// Importa usuários no Supabase da VPS a partir do JSON exportado
// Uso: node 04_import_auth_users_from_json.mjs
//
// Preserva: id, email, phone, encrypted_password (hash bcrypt),
//           email_confirmed_at, metadados, role, aud.
// Estratégia: INSERT direto em auth.users via SQL com pg.
//   Se o usuário já existe (mesmo id ou email), faz UPDATE preservando o hash.
//
// Pré-requisitos:
//   npm i pg
//   Variáveis de ambiente:
//     TARGET_DB_URL  -> postgres://postgres:SENHA@127.0.0.1:5432/postgres
//     EXPORT_FILE    -> caminho do JSON (default: ./auth-users-export.json)

import fs from "node:fs";
import pg from "pg";

const TARGET_DB_URL = process.env.TARGET_DB_URL;
const EXPORT_FILE = process.env.EXPORT_FILE || "./auth-users-export.json";

if (!TARGET_DB_URL) {
  console.error("❌ Defina TARGET_DB_URL (ex: postgres://postgres:SENHA@127.0.0.1:5432/postgres)");
  process.exit(1);
}
if (!fs.existsSync(EXPORT_FILE)) {
  console.error(`❌ Arquivo não encontrado: ${EXPORT_FILE}`);
  process.exit(1);
}

const payload = JSON.parse(fs.readFileSync(EXPORT_FILE, "utf8"));
const users = payload.users || [];
console.log(`📦 ${users.length} usuários no JSON`);

const { Client } = pg;
const client = new Client({ connectionString: TARGET_DB_URL });
await client.connect();

let inserted = 0;
let updated = 0;
let skipped = 0;
const errors = [];

// Garante uma instance_id default (Supabase usa zeros)
const DEFAULT_INSTANCE = "00000000-0000-0000-0000-000000000000";

for (const u of users) {
  try {
    const instanceId = u.instance_id || DEFAULT_INSTANCE;
    const role = u.role || "authenticated";
    const aud = u.aud || "authenticated";

    // UPSERT por id
    const sql = `
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, phone,
        encrypted_password,
        email_confirmed_at, phone_confirmed_at,
        confirmation_token, recovery_token,
        email_change_token_new, email_change,
        raw_app_meta_data, raw_user_meta_data,
        is_super_admin, created_at, updated_at, last_sign_in_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7,
        $8, $9,
        $10, $11,
        $12, $13,
        $14::jsonb, $15::jsonb,
        $16, $17, $18, $19
      )
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        phone = EXCLUDED.phone,
        encrypted_password = EXCLUDED.encrypted_password,
        email_confirmed_at = EXCLUDED.email_confirmed_at,
        phone_confirmed_at = EXCLUDED.phone_confirmed_at,
        raw_app_meta_data = EXCLUDED.raw_app_meta_data,
        raw_user_meta_data = EXCLUDED.raw_user_meta_data,
        updated_at = EXCLUDED.updated_at,
        last_sign_in_at = EXCLUDED.last_sign_in_at
      RETURNING (xmax = 0) AS inserted
    `;
    const params = [
      instanceId,
      u.id,
      aud,
      role,
      u.email,
      u.phone || null,
      u.encrypted_password || null,
      u.email_confirmed_at || null,
      u.phone_confirmed_at || null,
      u.confirmation_token || "",
      u.recovery_token || "",
      u.email_change_token_new || "",
      u.email_change || "",
      JSON.stringify(u.raw_app_meta_data || {}),
      JSON.stringify(u.raw_user_meta_data || {}),
      u.is_super_admin || false,
      u.created_at,
      u.updated_at,
      u.last_sign_in_at || null,
    ];

    const r = await client.query(sql, params);
    if (r.rows[0]?.inserted) inserted++;
    else updated++;

    // Cria identidade "email" em auth.identities (necessária para login com email/senha)
    if (u.email) {
      await client.query(
        `
        INSERT INTO auth.identities (
          provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
        ) VALUES (
          $1, $2, $3::jsonb, 'email', $4, $5, $6
        )
        ON CONFLICT (provider, provider_id) DO UPDATE SET
          identity_data = EXCLUDED.identity_data,
          updated_at = EXCLUDED.updated_at
        `,
        [
          u.id, // provider_id = user id para provider 'email'
          u.id,
          JSON.stringify({ sub: u.id, email: u.email, email_verified: !!u.email_confirmed_at }),
          u.last_sign_in_at || null,
          u.created_at,
          u.updated_at,
        ]
      );
    }
  } catch (e) {
    skipped++;
    errors.push({ email: u.email, id: u.id, error: e.message });
    console.error(`⚠️  ${u.email}: ${e.message}`);
  }
}

await client.end();

console.log("\n✅ Resultado:");
console.log(`   Inseridos: ${inserted}`);
console.log(`   Atualizados: ${updated}`);
console.log(`   Falhas: ${skipped}`);
if (errors.length) {
  fs.writeFileSync("./import-errors.json", JSON.stringify(errors, null, 2));
  console.log("   Erros salvos em ./import-errors.json");
}
