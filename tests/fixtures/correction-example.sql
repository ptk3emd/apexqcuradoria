BEGIN;

DO $$
DECLARE
    v_question_id bigint := 123456;
    v_rx_confirmado boolean := false;
    v_linhas integer;
BEGIN
    IF NOT v_rx_confirmado THEN
        RAISE EXCEPTION
          'Atualização bloqueada: confirmar pneumotórax esquerdo na radiografia.';
    END IF;

    UPDATE public.questions
    SET
        especialidade = 'Pediatria',

        categoria =
          'Cirurgia torácica, pneumotórax e doenças traqueais',

        tema_especifico =
          'Cirurgia Torácica: Pneumotórax',

        competencias = 'diagnóstico + conduta',

        descritores =
          'bronquiolite viral aguda, vírus sincicial respiratório, VSR, pneumotórax',

        difficulty_bucket = 'medium',

        comentario = $comentario$
O lactente apresenta quadro clínico compatível com bronquiolite viral aguda.
$comentario$,

        justificativa_a = $ja$
Correta, desde que a radiografia confirme pneumotórax esquerdo.
$ja$,

        justificativa_b = $jb$
Incorreta. Broncodilatador endovenoso não trata pneumotórax.
$jb$,

        justificativa_c = $jc$
Incorreta. Não há evidência de infecção bacteriana.
$jc$,

        justificativa_d = $jd$
Incorreta. A fisioterapia respiratória não é recomendada.
$jd$

    WHERE id = v_question_id
      AND lower(btrim(correta)) = 'a'
      AND a = 'Drenagem torácica esquerda.'
      AND b = 'Broncodilatador endovenoso.'
      AND c = 'Antibiótico para pneumonia.'
      AND d = 'Fisioterapia respiratória.'
      AND e IS NULL
      AND anulada = false;

    GET DIAGNOSTICS v_linhas = ROW_COUNT;

    IF v_linhas <> 1 THEN
        RAISE EXCEPTION
          'Atualização cancelada: esperado 1 registro, encontrados %.',
          v_linhas;
    END IF;
END $$;

COMMIT;
