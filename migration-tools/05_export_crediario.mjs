#!/usr/bin/env node
/**
 * Exporta dados do sistema Crediário legado (api-crediario.joonker.com.br)
 * e gera SQL para inserir no sistema unificado (api-crmunificado.joonker.com.br),
 * remapeando empresa_id→company_id e user_id com base em correspondência por nome/email.
 *
 * USO (na VPS ou localmente com acesso às duas APIs):
 *   export SOURCE_URL="https://api-crediario.joonker.com.br"
 *   export SOURCE_SERVICE_KEY="<service_role do crediário>"
 *   export TARGET_URL="https://api-crmunificado.joonker.com.br"
 *   export TARGET_SERVICE_KEY="<service_role do unificado>"
 *   export FALLBACK_USER_ID="<uuid do admin no sistema unificado>"  # opcional
 *   node 05_export_crediario.mjs
 *
 * Saída: ./crediario_data.sql
 * Aplicar: docker exec supabase-db psql -U postgres -d postgres -f /tmp/crediario_data.sql
 */

import fs from 'node:fs';

const SOURCE_URL = (process.env.SOURCE_URL || '').replace(/\/$/, '');
const SOURCE_KEY = process.env.SOURCE_SERVICE_KEY;
const TARGET_URL = (process.env.TARGET_URL || '').replace(/\/$/, '');
const TARGET_KEY = process.env.TARGET_SERVICE_KEY;
const FALLBACK_USER_ID = process.env.FALLBACK_USER_ID || null;
const PAGE_SIZE = 1000;

if (!SOURCE_URL || !SOURCE_KEY || !TARGET_URL || !TARGET_KEY) {
  console.error('❌ Defina SOURCE_URL, SOURCE_SERVICE_KEY, TARGET_URL e TARGET_SERVICE_KEY.');
  process.exit(1);
}

// ─── Mapeamento de tabelas: source_table → { target, renameCol, userCols } ───
//   renameCol: { 'empresa_id': 'company_id' } — renomeia a coluna E remapeia UUID
//   userCols:  ['user_id', 'criado_por', ...]  — colunas que precisam de remap de user UUID
//   skipCols:  colunas presentes na source mas que NÃO existem na target (ex.: removidas)
const TABLE_MAP = [
  // Sem FKs para empresa/user — exporta direto
  { src: 'settings',                 dst: 'crediario_settings',                renameCol: {}, userCols: [] },
  { src: 'credenciais_globais',      dst: 'crediario_global_credentials',      renameCol: {}, userCols: [] },
  { src: 'contract_template',        dst: 'crediario_contract_template',       renameCol: {}, userCols: [] },
  { src: 'consultas_cache',          dst: 'crediario_consultas_cache',         renameCol: {}, userCols: [] },
  { src: 'cora_webhook_logs',        dst: 'crediario_cora_webhook_logs',       renameCol: {}, userCols: [] },
  { src: 'contratos_assertiva',      dst: 'crediario_contratos_assertiva',     renameCol: {}, userCols: [] },
  // Com FK de empresa (empresa_id → company_id)
  { src: 'empresa_credenciais',      dst: 'crediario_company_credentials',     renameCol: { empresa_id: 'company_id' }, userCols: [] },
  { src: 'relatorios_diarios',       dst: 'crediario_relatorios_diarios',      renameCol: { empresa_id: 'company_id' }, userCols: ['concluido_por'] },
  // Com FK de empresa + user
  // coerceText: colunas NOT NULL text na target que podem chegar NULL da source
  { src: 'consultas',                dst: 'crediario_consultas',               renameCol: { empresa_id: 'company_id' }, userCols: ['user_id'],                  coerceText: ['cpf', 'status', 'cidade'] },
  { src: 'consultas_pg_entrega',     dst: 'crediario_consultas_pg_entrega',    renameCol: { empresa_id: 'company_id' }, userCols: ['user_id'],                  coerceText: ['cpf', 'cidade'] },
  { src: 'consultas_renegociacao',   dst: 'crediario_consultas_renegociacao',  renameCol: { empresa_id: 'company_id' }, userCols: ['user_id'],                  coerceText: ['cpf', 'cidade'] },
  // vendas depende de consultas
  { src: 'vendas',                   dst: 'crediario_vendas',                  renameCol: { empresa_id: 'company_id' }, userCols: ['user_id', 'aprovacao_por'], coerceText: ['cpf', 'nome', 'cidade', 'tipo', 'status'] },
  // contracts depende de consultas + vendas
  { src: 'contracts',                dst: 'crediario_contracts',               renameCol: { empresa_id: 'company_id' }, userCols: ['user_id'],                  coerceText: ['cpf', 'nome', 'endereco', 'telefone', 'content', 'cidade', 'status'] },
  // parcelas depende de vendas + contracts
  { src: 'parcelas',                 dst: 'crediario_parcelas',                renameCol: { empresa_id: 'company_id' }, userCols: ['user_id'],                  coerceText: ['status'] },
  // codigos_autorizacao depende de vendas
  { src: 'codigos_autorizacao',      dst: 'crediario_codigos_autorizacao',     renameCol: {}, userCols: ['criado_por', 'usado_por'],                           coerceText: ['codigo'] },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function normalizeNome(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sqlEscape(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function fetchAll(baseUrl, key, table, orderCol = 'created_at') {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + PAGE_SIZE - 1;
    const url = `${baseUrl}/rest/v1/${table}?select=*&order=${orderCol}.asc.nullslast`;
    const res = await fetch(url, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Range: `${from}-${to}`,
        'Range-Unit': 'items',
        Prefer: 'count=exact',
      },
    });
    if (res.status === 404) {
      console.warn(`  ⚠️  Tabela "${table}" não encontrada na source — pulando.`);
      return null; // tabela não existe na source
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status} em ${table}: ${body}`);
    }
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// ─── Etapa 1: mapear empresas ────────────────────────────────────────────────

async function buildEmpresaMap() {
  console.log('\n📋 Construindo mapa empresa_id → company_id...');

  const srcEmpresas = await fetchAll(SOURCE_URL, SOURCE_KEY, 'empresas', 'id');
  if (!srcEmpresas || srcEmpresas.length === 0) {
    console.warn('  ⚠️  Nenhuma empresa encontrada na source. company_id não será remapeado.');
    return new Map();
  }

  const tgtCompanies = await fetchAll(TARGET_URL, TARGET_KEY, 'companies', 'id');
  if (!tgtCompanies || tgtCompanies.length === 0) {
    console.warn('  ⚠️  Nenhuma company encontrada no target.');
    return new Map();
  }

  // Índices para match
  const byCnpj = new Map();
  const byName = new Map();
  for (const c of tgtCompanies) {
    if (c.cnpj) byCnpj.set(c.cnpj.replace(/\D/g, ''), c.id);
    if (c.name || c.nome) byName.set(normalizeNome(c.name || c.nome), c.id);
  }

  const map = new Map();
  const unmatched = [];
  for (const e of srcEmpresas) {
    const cnpjClean = (e.cnpj || '').replace(/\D/g, '');
    const nameNorm = normalizeNome(e.nome || e.name || '');

    let targetId = (cnpjClean && byCnpj.get(cnpjClean)) || (nameNorm && byName.get(nameNorm));
    if (targetId) {
      map.set(e.id, targetId);
      console.log(`  ✓ "${e.nome || e.name}" → ${targetId}`);
    } else {
      unmatched.push(e.nome || e.name || e.id);
      console.warn(`  ⚠️  Sem correspondência para empresa "${e.nome || e.name}" (${e.id}) — company_id ficará NULL`);
    }
  }

  if (unmatched.length > 0) {
    console.warn(`\n  ⚠️  ${unmatched.length} empresa(s) sem correspondência: ${unmatched.join(', ')}`);
  }
  console.log(`  → ${map.size}/${srcEmpresas.length} empresas mapeadas\n`);
  return map;
}

// ─── Etapa 2: mapear users ───────────────────────────────────────────────────

async function buildUserMap() {
  console.log('👤 Construindo mapa user_id (source → target) por e-mail...');

  const srcProfiles = await fetchAll(SOURCE_URL, SOURCE_KEY, 'profiles', 'user_id');
  const tgtProfiles = await fetchAll(TARGET_URL, TARGET_KEY, 'profiles', 'user_id');

  if (!srcProfiles || srcProfiles.length === 0) {
    console.warn('  ⚠️  profiles não encontrado na source — user_id não será remapeado.');
    return { map: new Map(), fallback: FALLBACK_USER_ID };
  }

  // Índice por email no target
  const tgtByEmail = new Map();
  for (const p of (tgtProfiles || [])) {
    const email = (p.email || '').toLowerCase().trim();
    if (email) tgtByEmail.set(email, p.user_id);
  }

  // Fallback: primeiro admin encontrado no target
  let fallback = FALLBACK_USER_ID;
  if (!fallback && tgtProfiles && tgtProfiles.length > 0) {
    fallback = tgtProfiles[0].user_id;
    console.log(`  ℹ️  FALLBACK_USER_ID não definido, usando ${fallback} (primeiro perfil do target).`);
  }

  const map = new Map();
  const unmatched = [];
  for (const p of srcProfiles) {
    const email = (p.email || '').toLowerCase().trim();
    const targetId = email && tgtByEmail.get(email);
    if (targetId) {
      map.set(p.user_id, targetId);
    } else {
      unmatched.push(email || p.user_id);
    }
  }

  if (unmatched.length > 0) {
    console.warn(`  ⚠️  ${unmatched.length} user(s) sem correspondência (usará fallback ${fallback}): ${unmatched.slice(0, 10).join(', ')}${unmatched.length > 10 ? '...' : ''}`);
  }
  console.log(`  → ${map.size}/${srcProfiles.length} users mapeados\n`);
  return { map, fallback };
}

// ─── Etapa 3: exportar tabela ────────────────────────────────────────────────

function remapRow(row, renameCol, userCols, coerceText, empresaMap, userMap, fallback) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    // Renomeia coluna (ex.: empresa_id → company_id) e remapeia UUID
    const newKey = renameCol[k] || k;

    if (renameCol[k] && v !== null) {
      // É uma coluna de empresa: remapeia UUID
      const mapped = empresaMap.get(v);
      out[newKey] = mapped !== undefined ? mapped : null;
    } else if (userCols.includes(k) && v !== null) {
      // É coluna de user: remapeia ou usa fallback
      const mapped = userMap.get(v);
      out[newKey] = mapped !== undefined ? mapped : fallback;
    } else {
      out[newKey] = v;
    }

    // coerceText: colunas NOT NULL text na target que chegam NULL da source → ''
    if (coerceText.includes(newKey) && out[newKey] === null) {
      out[newKey] = '';
    }
  }
  return out;
}

async function dumpTable(cfg, empresaMap, userMap, fallback, out) {
  const { src, dst, renameCol, userCols, coerceText = [] } = cfg;
  process.stdout.write(`  → ${src.padEnd(30)} → ${dst.padEnd(40)}`);

  // Determina coluna de ordenação (sem created_at em algumas tabelas)
  const orderOverrides = {
    settings: 'id',
    empresa_credenciais: 'id',
    codigos_autorizacao: 'id',
  };
  const orderCol = orderOverrides[src] || 'created_at';

  const rows = await fetchAll(SOURCE_URL, SOURCE_KEY, src, orderCol);
  if (rows === null) {
    console.log('pulado (tabela ausente)');
    return { src, dst, written: 0, total: 0 };
  }

  out.write(`\n-- ============ ${src} → ${dst} ============\n`);
  out.write(`BEGIN;\n`);

  let written = 0;
  for (const row of rows) {
    const mapped = remapRow(row, renameCol, userCols, coerceText, empresaMap, userMap, fallback);
    const cols = Object.keys(mapped);
    if (cols.length === 0) continue;
    const vals = cols.map((c) => sqlEscape(mapped[c]));
    out.write(
      `INSERT INTO public.${dst} (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${vals.join(',')}) ON CONFLICT DO NOTHING;\n`
    );
    written++;
  }

  out.write(`COMMIT;\n`);
  console.log(`${written}/${rows.length} linhas`);
  return { src, dst, written, total: rows.length };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Exportando Crediário`);
  console.log(`   SOURCE: ${SOURCE_URL}`);
  console.log(`   TARGET: ${TARGET_URL}\n`);

  const [empresaMap, { map: userMap, fallback }] = await Promise.all([
    buildEmpresaMap(),
    buildUserMap(),
  ]);

  if (!fallback) {
    console.error('❌ Não foi possível determinar um FALLBACK_USER_ID. Defina a variável de ambiente ou garanta que há profiles no target.');
    process.exit(1);
  }

  const out = fs.createWriteStream('./crediario_data.sql');
  out.write(`-- Dump Crediário gerado em ${new Date().toISOString()}\n`);
  out.write(`-- SOURCE: ${SOURCE_URL}\n`);
  out.write(`-- TARGET: ${TARGET_URL}\n\n`);
  out.write(`SET session_replication_role = 'replica'; -- desabilita triggers e FKs\n`);

  console.log('\n📦 Exportando tabelas:\n');
  const summary = [];
  for (const cfg of TABLE_MAP) {
    try {
      const r = await dumpTable(cfg, empresaMap, userMap, fallback, out);
      summary.push(r);
    } catch (e) {
      console.error(`  ❌ ${cfg.src}: ${e.message}`);
      summary.push({ src: cfg.src, dst: cfg.dst, written: 0, total: 0, error: e.message });
    }
  }

  out.write(`\nSET session_replication_role = 'origin';\n`);
  out.end();

  console.log('\n✅ Concluído. Arquivo: ./crediario_data.sql\n');
  console.log('Para aplicar no VPS:');
  console.log('  scp crediario_data.sql root@api-crmunificado.joonker.com.br:/tmp/');
  console.log('  ssh root@api-crmunificado.joonker.com.br');
  console.log('  docker exec supabase-db psql -U postgres -d postgres -f /tmp/crediario_data.sql\n');
  console.table(summary);
}

main().catch((e) => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
