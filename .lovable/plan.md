## Visão geral

Adicionar à tela **Configurações** uma seção **Funções e Permissões** onde o admin pode:
- Editar permissões de páginas das 4 funções existentes (admin, gerente, vendedor, financeiro)
- Criar novas funções customizadas (ex: "Supervisor", "Atendente")
- Marcar/desmarcar quais páginas cada função acessa
- Renomear ou excluir funções customizadas

A nova função aparece automaticamente no dropdown "Papel" da tela de Usuários.

## Como funções customizadas funcionam

Toda função customizada **herda de uma função base** (admin/gerente/vendedor/financeiro). Isso preserva todas as regras de segurança (RLS) do banco que dependem do enum atual — a herança define apenas o nível de acesso aos dados; a função customizada apenas filtra ainda mais quais **páginas** ficam visíveis.

Exemplo: "Supervisor" herda de gerente + só acessa /cobrancas e /dashboard.

## Mudanças no banco

1. **`role_definitions`** — catálogo de funções:
   - `key` (texto, ex: "admin", "supervisor_loja")
   - `label` (texto exibido, ex: "Supervisor de Loja")
   - `is_system` (bool — true para as 4 nativas, não podem ser excluídas)
   - `base_role` (admin/gerente/vendedor/financeiro — usado pelo RLS)

2. **`role_page_permissions`** — quais páginas cada função vê:
   - `role_key` + `page_key` + `allowed` (bool)

3. **`user_roles`** ganha coluna opcional `role_key`. Quando preenchida, indica a função customizada. A coluna `role` (enum) recebe o `base_role` para o RLS continuar funcionando.

Seed: insere as 4 funções nativas com todas as páginas liberadas (admin vê tudo; outros mantêm o comportamento atual).

## Mudanças no frontend

- **SettingsPage**: nova seção "Funções e Permissões" com lista de funções, edição inline de permissões (checkboxes por página), botão "+ Nova função" (escolhe nome + função base), e botão excluir para customizadas.
- **AuthContext**: passa a ler `role_key` (cai para `role` se vazio) e carrega o array de páginas permitidas dessa função.
- **RoleGate**: bloqueia acesso a rota se a página não estiver permitida para a função do usuário.
- **AppSidebar**: oculta itens de menu que não estiverem permitidos.
- **UsersPage**: dropdown "Papel" passa a listar TODAS as funções (nativas + customizadas).
- **Edge functions** `create-user` e `manage-user`: validam contra a tabela `role_definitions` em vez da lista fixa, e gravam `role_key` + `role` (base).

## Catálogo de páginas

Definido em código (`src/lib/pagePermissions.ts`) com label amigável e path. Cobre todas as ~22 rotas existentes do sistema.

## Detalhes técnicos

- `role_key` em `user_roles` é `text` nullable; quando NULL o sistema usa o nome do enum como key (admin/gerente/vendedor/financeiro).
- RLS continua usando `has_role(uid, 'admin'::app_role)` — funciona porque o `role` enum sempre é gravado.
- /perfil, /notificacoes e /instalar ficam sempre liberados (não bloqueáveis).
- Admin nativo (`is_system=true` + key='admin') sempre tem acesso a tudo, independente do que estiver na tabela de permissões.

## Deploy

Após aprovação:
```bash
cd /opt/crm && ./deploy.sh
```
(roda migrations + functions + frontend)