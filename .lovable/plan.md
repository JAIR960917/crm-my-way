## Plano de implementação

### 1. Nova coluna "Forma de Pagamento do Óculos" em Agendamentos

- Adicionar coluna na tabela `crm_appointments` (campo `forma_pagamento_oculos text`).
- Em `src/pages/AppointmentsPage.tsx`, inserir nova coluna entre "Venda" e "Resumo" com Select (Cartão, Pix, Crediário Cora).
- Salvar via `updateField`.

### 2. Cards de KPI no Relatório de Atendimentos (Dashboard)

Em `src/pages/DashboardPage.tsx` (seção "Relatório de atendimentos"), substituir os 4 cards atuais (Atendidos/Agendaram/Não atenderam/Sem agendar) por 6 cards:

- **Leads Adicionados** — `crm_leads` criados no período por `assigned_to`/`created_by`.
- **Leads Tratados** — leads em que o usuário registrou tratativa OU criou no período (distinct lead_id em `crm_lead_contact_attempts` ∪ leads criados).
- **Leads Não Atenderam** — tentativas com resultado "não atendeu".
- **Leads Atenderam** — tentativas com resultado "atendeu".
- **Leads Agendaram** — atenderam **e** agendaram (resultado "atendeu_agendou" ou similar).
- **Leads Não Agendaram** — atenderam mas não agendaram.

Filtros existentes (empresa, vendedor, período) continuam aplicáveis.

### 3. Coluna "Excluídos" + permissão por colunas em Funções

**Banco:**

- Adicionar coluna virtual `excluidos` (status_key fix) para leads e renovaoções — provavelmente como linhas no `crm_lead_statuses`/`crm_renovacao_statuses` com flag `is_system_excluded boolean`.
- Adicionar campos em `crm_leads`/`crm_renovacoes`: `excluded_at timestamptz`, `excluded_by uuid`, `previous_status text`, `previous_assigned_to uuid`.
- Nova tabela `role_status_permissions(role, module ['leads'|'renovacao'], status_key, visible)` — permite escolher por função quais colunas são visíveis.

**RLS:** atualizar políticas de SELECT em `crm_leads`/`crm_renovacoes` para que apenas admins vejam cards com status = "excluidos".

**UI:**

- `src/components/settings/RolePermissionsManager.tsx`: nova aba/seção "Colunas visíveis" por módulo (Leads/Renovação) com checkbox por coluna.
- Em `LeadsPage`/`ActiveClientsPage`: filtrar `statusKeys` pelas permissões da role; só admin vê coluna "Excluídos".
- Ação "Excluir" nos cards: ao invés de deletar, mover para status `excluidos`, salvar `excluded_by`/`excluded_at`/`previous_status`, e adicionar comentário automático "Card excluído por {nome do usuário}" em `crm_lead_contact_attempts`/equivalente.
- Na coluna Excluídos (admin), permitir reatribuir `assigned_to`; ao reatribuir, restaurar status para `previous_status` (ou recalcular via `resolveLeadStatusFromData`) — o card volta ao fluxo normal e aparece para o novo responsável.

### Detalhes técnicos

- Migrações via `supabase--migration` (3 migrações separadas ou única).
- Realtime continua funcionando — `usePaginatedColumns` já reflete mudanças de status.
- O comentário de exclusão usa a tabela de tentativas de contato existente, com um `tipo`/`result` específico ex: `system_exclusao`.
- A página de Funções já lê de `role_page_permissions`; criaremos `role_status_permissions` análoga e novo componente de gerenciamento.

### Ordem de implementação

1. Migração 1: campo `forma_pagamento_oculos` em appointments.
2. Migração 2: campos de exclusão + tabela `role_status_permissions` + status "excluidos" seed + RLS.
3. UI Agendamentos (nova coluna).
4. Dashboard (6 KPIs).
5. RolePermissionsManager + filtragem de colunas + lógica de exclusão/restauração.

Confirma para eu prosseguir?