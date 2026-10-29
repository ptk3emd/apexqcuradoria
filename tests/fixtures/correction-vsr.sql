BEGIN;

DO $apexmed$
DECLARE
    v_id bigint;
    v_total integer;
    v_linhas integer;
BEGIN

    -- IDENTIFICAÇÃO SEGURA DA QUESTÃO

    SELECT COUNT(*), MAX(id)
    INTO v_total, v_id
    FROM public.questions
    WHERE enunciado ILIKE
          '%3 meses de idade cronológica e 45 dias%'
      AND enunciado ILIKE
          '%displasia broncopulmonar%'
      AND b ILIKE
          '%Indicar palivizumabe%'
      AND LOWER(BTRIM(correta)) = 'b'
      AND anulada = false;

    IF v_total <> 1 THEN
        RAISE EXCEPTION
            'APEXMED: encontrados % registros. Esperado exatamente 1. Atualização cancelada.',
            v_total;
    END IF;

    PERFORM 1
    FROM public.questions
    WHERE id = v_id
    FOR UPDATE;

    -- ATUALIZAÇÃO COMPLETA

    UPDATE public.questions
    SET

        -- ORIGEM CONFIRMADA NO CADERNO DA PROVA

        origem = 'SCM-BH',

        ano = '2026',

        -- CORREÇÃO DE TRANSCRIÇÃO DO ENUNCIADO

        enunciado = REPLACE(
            enunciado,
            'pragmatismo de canal arterial',
            'persistência do canal arterial'
        ),

        especialidade = 'Pediatria',

        categoria = 'Vacinação',

        comentario = $comentario$
A lactente apresenta fatores de risco para infecção grave pelo VSR.
$comentario$,

        justificativa_b = $just_b$
CORRETA — MELHOR ALTERNATIVA DISPONÍVEL.
$just_b$,

        -- A QUESTÃO POSSUI APENAS QUATRO ALTERNATIVAS

        justificativa_e = NULL,

        referencias = $refs$
1. SANTA CASA DE MISERICÓRDIA DE BELO HORIZONTE. Processo Seletivo de Residência Médica 2026.
$refs$

    WHERE id = v_id
      AND LOWER(BTRIM(correta)) = 'b'
      AND anulada = false;

    GET DIAGNOSTICS v_linhas = ROW_COUNT;

    IF v_linhas <> 1 THEN
        RAISE EXCEPTION
            'APEXMED: esperado 1 registro atualizado; encontrados %.',
            v_linhas;
    END IF;

    RAISE NOTICE
        'APEXMED: questão ID % corrigida. Origem: SCM-BH, 2026, questão 69.',
        v_id;

END;
$apexmed$;

COMMIT;
