-- Gerentes podem excluir inscrições da própria empresa (ex.: testes).

DROP POLICY IF EXISTS "Gerentes delete company campanha_copa" ON public.campanha_copa_submissions;
CREATE POLICY "Gerentes delete company campanha_copa" ON public.campanha_copa_submissions
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'gerente')
    AND (
      assigned_to IS NULL
      OR public.is_same_company(assigned_to)
    )
  );
