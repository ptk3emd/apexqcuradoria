BEGIN;

DO $apexmed$
DECLARE
    -- Substituir pelo ID real da questão.
    v_question_id bigint := NULL;
    v_linhas integer;
BEGIN
    IF v_question_id IS NULL THEN
        RAISE EXCEPTION
            'APEXMED: informe o ID real antes de executar.';
    END IF;

    PERFORM 1
    FROM public.questions
    WHERE id = v_question_id
      AND lower(btrim(correta)) = 'c'
      AND enunciado ILIKE '%diagnóstico de asma em crianças pequenas%'
      AND c ILIKE '%sibilância recorrente e dispneia intermitente%'
      AND anulada = false
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'APEXMED: ID, enunciado ou gabarito não correspondem à questão auditada.';
    END IF;

    UPDATE public.questions
    SET
        especialidade = 'Pediatria',

        categoria =
            'Asma, bronquiolite, coqueluche e IVAS pediátricas',

        tema_especifico = 'Asma',

        competencias = 'diagnóstico',

        difficulty_bucket = 'medium',

        descritores =
            'Asma pediátrica; asma em pré-escolares; diagnóstico clínico de asma.',

        comentario = $comentario$
O diagnóstico de asma em crianças pequenas é predominantemente clínico.

Portanto, a alternativa C é a melhor resposta disponível.
$comentario$,

        justificativa_a = $just_a$
INCORRETA. A história clínica sugestiva é fundamental.
$just_a$,

        justificativa_c = $just_c$
CORRETA. Sibilância recorrente e dispneia intermitente são manifestações compatíveis com asma.
$just_c$,

        referencias = $refs$
1. GLOBAL INITIATIVE FOR ASTHMA (GINA). Atualização de 2025.
https://ginasthma.org/wp-content/uploads/2025/11/GINA-2025-Update-25_11_08-WMS.pdf
$refs$

    WHERE id = v_question_id
      AND lower(btrim(correta)) = 'c'
      AND anulada = false;

    GET DIAGNOSTICS v_linhas = ROW_COUNT;

    IF v_linhas <> 1 THEN
        RAISE EXCEPTION
            'APEXMED: esperado 1 registro, obtidos %.',
            v_linhas;
    END IF;

    RAISE NOTICE
        'APEXMED: questão % atualizada com sucesso.',
        v_question_id;
END;
$apexmed$;

COMMIT;
