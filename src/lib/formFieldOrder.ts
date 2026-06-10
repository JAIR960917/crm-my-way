/** Ordem em que as perguntas aparecem ao preencher o formulário (mesma lógica do Novo Lead). */
export type FormFieldOrderNode = {
  id: string;
  parent_field_id: string | null;
  position: number;
  label?: string;
};

export type FormFieldOrderInfo = {
  order: number;
  total: number;
};

function childrenOf(fields: FormFieldOrderNode[], parentId: string | null) {
  return fields
    .filter((f) => (f.parent_field_id || null) === parentId)
    .sort((a, b) => a.position - b.position);
}

/** Índice global de sequência (pré-ordem: raiz → filhos), igual ao fluxo de preenchimento. */
export function buildFormFillOrderIndex(
  fields: FormFieldOrderNode[],
): Map<string, FormFieldOrderInfo> {
  const map = new Map<string, FormFieldOrderInfo>();
  let order = 0;

  const visit = (field: FormFieldOrderNode) => {
    order += 1;
    map.set(field.id, { order, total: 0 });
    childrenOf(fields, field.id).forEach(visit);
  };

  childrenOf(fields, null).forEach(visit);

  for (const info of map.values()) {
    info.total = order;
  }
  return map;
}

export function getFormFieldParent(
  fields: FormFieldOrderNode[],
  field: FormFieldOrderNode,
): FormFieldOrderNode | null {
  if (!field.parent_field_id) return null;
  return fields.find((f) => f.id === field.parent_field_id) ?? null;
}
