## Objetivo

No Kanban de Cobranças, quando o mesmo cliente (mesmo CPF) tiver dívidas em mais de uma loja, mostrar **um único card** com o **valor total somado** e a lista de todas as dívidas/lojas/produtos por trás. Mudança apenas visual — o banco continua com 1 registro por dívida.

## Regras acordadas

- **Identificador do cliente:** CPF (campos `data->>documento` ou `data->>cpf`, normalizado para só dígitos). Cobranças sem CPF continuam como cards individuais (sem agrupar).
- **Card unificado:** 1 card por CPF, valor = soma das dívidas, exibe quantidade de lojas e mantém os indicadores existentes (atrasada/hoje/pendente, renegociou).
- **Coluna do card unificado:** vai para o **status mais grave** entre as cobranças do cliente. Severidade definida pelo `position` da coluna no Kanban (mais à direita = mais grave).
- **Escopo:** somente exibição no Kanban. Nada muda em banco, edge functions, automações, WhatsApp, etc.

## O que muda

### 1. Lógica de agrupamento (`CobrancasPage.tsx`)
- Função `groupByCpf(items, statuses)` que recebe a lista bruta de `Cobranca[]` e devolve `CobrancaGroup[]`:
  - `cpfKey` (string normalizada) ou `null` para itens sem CPF
  - `items: Cobranca[]` (todas as cobranças do cliente)
  - `valorTotal`: soma de `valor`
  - `representativeStatus`: status mais grave (maior `position` em `statuses`)
  - `representative: Cobranca`: a cobrança usada como "cara" do card (a do status mais grave; se empatar, a com maior `valor`)
  - `companies: string[]` (nomes únicos das lojas)
- Aplicar agrupamento **depois** do filtro/busca, antes de renderizar.
- `getByStatus(key)`: passa a devolver grupos cujo `representativeStatus === key`.
- Total exibido no header: contar grupos (não cobranças).

### 2. Renderização do card (`renderCard`)
- Recebe `CobrancaGroup` em vez de `Cobranca`.
- Quando `items.length > 1`:
  - Badge "X lojas" ao lado do valor
  - Lista compacta das lojas (chips) abaixo do nome
  - Valor = `valorTotal`
  - Indicadores (atrasada/hoje/renegociou) consideram **qualquer** item do grupo
- Quando `items.length === 1`: comportamento atual, sem alterações visuais.
- `draggableId`: usar `group.representative.id` (mantém DnD funcional para o caso de 1 item; ver limitações).

### 3. Edição
- Clicar em editar num grupo unificado abre um **seletor** simples: "Esse cliente tem N dívidas — qual deseja editar?" listando cada cobrança (loja + valor + status). Selecionada uma, abre o `CobrancaEditSheet` atual.
- Cards de 1 só item: edição direta como hoje.

### 4. Exclusão
- No grupo unificado, botão de excluir é **escondido** (evita confusão de "apagar tudo"). Para excluir, o usuário abre via editar e exclui pela tela individual ou pode usar o seletor com botão lixeira por linha.

## Limitações (intencionais)

- **Drag-and-drop em grupos com 2+ dívidas:** desativado — arrastar um card unificado moveria várias cobranças com status diferentes. O grupo só pode ser movido se tiver 1 item. Mostraremos um toast explicativo se o usuário tentar arrastar um grupo com várias.
- **Paginação:** o `usePaginatedColumns` continua paginando por status no banco. O agrupamento é feito sobre os itens já carregados. Se um cliente tem dívidas em colunas ainda não carregadas, ele aparecerá em mais de uma coluna até a paginação puxar o resto. Vou documentar mas **não** mudar o hook agora.
- Sem alteração de schema, RLS, edge functions ou automações.

## Detalhes técnicos

```text
Cobranca[]  →  filter/search  →  groupByCpf  →  CobrancaGroup[]
                                                      │
                                                      ├── representativeStatus → coluna
                                                      └── render(group)
```

Normalização do CPF:
```ts
const normalizeCpf = (raw: unknown) =>
  String(raw ?? "").replace(/\D+/g, "") || null;
```

Severidade (status mais grave) usando `position` do array `statuses` (mantém a ordem do Kanban como fonte da verdade — admin pode reordenar e a regra acompanha).

## Fora de escopo

- Mesclar registros no banco
- Criar entidade "cliente"
- Mudanças no fluxo de WhatsApp, automações, edge functions
- Outras telas (Dashboard, WhatsApp, etc.) — pedem agrupamento próprio depois se quiser
