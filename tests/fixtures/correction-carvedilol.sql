BEGIN;

DO $apexmed$
DECLARE
    v_id bigint;
    v_total integer;
    v_linhas integer;
BEGIN
    /*
    APEXMED — AUDITORIA
    Gabarito desta versão adaptada:
    B — Carvedilol.
    */

    -- 1. LOCALIZAÇÃO SEGURA

    SELECT COUNT(*), MAX(id)
    INTO v_total, v_id
    FROM public.questions
    WHERE enunciado ILIKE '%Mulher de 58 anos%'
      AND enunciado ILIKE '%fração de ejeção de 38%'
      AND enunciado ILIKE '%BNP%'
      AND b ILIKE '%Carvedilol%'
      AND d ILIKE '%Espironolactona%'
      AND LOWER(BTRIM(correta)) = 'b';

    IF v_total <> 1 THEN
        RAISE EXCEPTION
            'APEXMED: encontrados % registros. Esperado 1.',
            v_total;
    END IF;

    PERFORM 1
    FROM public.questions
    WHERE id = v_id
    FOR UPDATE;

    UPDATE public.questions
    SET
        origem =
            'ENAMED 2025 - Questão 1 (adaptação autoral)',

        ano = '2025',

        enunciado = $enunciado$
Mulher de 58 anos, com hipertensão. Fração de ejeção de 38%. BNP elevado.
$enunciado$,

        -- GABARITO DA VERSÃO ADAPTADA

        correta = 'b',

        anulada = false,

        justificativa_e = $just_e$
INCORRETA.
$just_e$

    WHERE id = v_id
      AND LOWER(BTRIM(correta)) = 'b'
      AND b ILIKE '%Carvedilol%'
      AND d ILIKE '%Espironolactona%';

    GET DIAGNOSTICS v_linhas = ROW_COUNT;

    IF v_linhas <> 1 THEN
        RAISE EXCEPTION
            'APEXMED: atualização interrompida; linhas afetadas: %',
            v_linhas;
    END IF;

    RAISE NOTICE
        'APEXMED: questão ID % atualizada.',
        v_id;

END;
$apexmed$;

COMMIT;

-- CONFERÊNCIA

SELECT
    id,
    origem,
    correta
FROM public.questions
WHERE origem =
    'ENAMED 2025 - Questão 1 (adaptação autoral)'
  AND b ILIKE '%Carvedilol%';
