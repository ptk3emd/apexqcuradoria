import { Question, QuestionStatus } from '../types/question';

/**
 * Standard RFC-4180 compliant CSV parser that correctly handles
 * multiline quoted strings, escaped quotes (""), and varied line breaks.
 */
export function parseCSV(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some(cell => cell.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  // Push final field/row if any remains
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(cell => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Transforms CSV rows into typed Question objects
 */
export function convertRowsToQuestions(rows: string[][]): Question[] {
  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim().toLowerCase());
  
  const getIndex = (name: string) => headers.indexOf(name.toLowerCase());

  const idxId = getIndex('id');
  const idxCat = getIndex('categoria');
  const idxTema = getIndex('tema_especifico');
  const idxAno = getIndex('ano');
  const idxOrigem = getIndex('origem');
  const idxEnunciado = getIndex('enunciado');
  const idxA = getIndex('a');
  const idxB = getIndex('b');
  const idxC = getIndex('c');
  const idxD = getIndex('d');
  const idxE = getIndex('e');
  const idxCorreta = getIndex('correta');
  const idxComent = getIndex('comentario');
  const idxJustA = getIndex('justificativa_a');
  const idxJustB = getIndex('justificativa_b');
  const idxJustC = getIndex('justificativa_c');
  const idxJustD = getIndex('justificativa_d');
  const idxJustE = getIndex('justificativa_e');
  const idxEsp = getIndex('especialidade');
  const idxComp = getIndex('competencias');
  const idxAnoInt = getIndex('ano_int');
  const idxDiff = getIndex('difficulty_bucket');
  const idxDesc = getIndex('descritores');
  const idxStatus = getIndex('status');

  const questions: Question[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length === 0 || !row[0]) continue;

    const id = (idxId >= 0 && row[idxId]) ? row[idxId] : String(r);
    const corretaRaw = (idxCorreta >= 0 && row[idxCorreta]) ? row[idxCorreta].trim().toUpperCase() : 'A';
    
    // Status if present in CSV, otherwise pendente
    let status: QuestionStatus = 'pendente';
    if (idxStatus >= 0 && row[idxStatus]) {
      const s = row[idxStatus].toLowerCase().trim() as QuestionStatus;
      if (['pendente', 'aprovadas', 'eliminar_questao', 'revisar_questao', 'questao_corrigida'].includes(s)) {
        status = s;
      }
    }

    questions.push({
      id,
      categoria: (idxCat >= 0 && row[idxCat]) || 'Geral',
      tema_especifico: (idxTema >= 0 && row[idxTema]) || 'Geral',
      ano: (idxAno >= 0 && row[idxAno]) || '2022',
      origem: (idxOrigem >= 0 && row[idxOrigem]) || 'ENARE',
      enunciado: (idxEnunciado >= 0 && row[idxEnunciado]) || '',
      a: (idxA >= 0 && row[idxA]) || '',
      b: (idxB >= 0 && row[idxB]) || '',
      c: (idxC >= 0 && row[idxC]) || '',
      d: (idxD >= 0 && row[idxD]) || '',
      e: (idxE >= 0 && row[idxE]) || '',
      correta: corretaRaw,
      comentario: (idxComent >= 0 && row[idxComent]) || '',
      justificativa_a: (idxJustA >= 0 && row[idxJustA]) || '',
      justificativa_b: (idxJustB >= 0 && row[idxJustB]) || '',
      justificativa_c: (idxJustC >= 0 && row[idxJustC]) || '',
      justificativa_d: (idxJustD >= 0 && row[idxJustD]) || '',
      justificativa_e: (idxJustE >= 0 && row[idxJustE]) || '',
      especialidade: (idxEsp >= 0 && row[idxEsp]) || (idxCat >= 0 && row[idxCat]) || 'Medicina',
      competencias: (idxComp >= 0 && row[idxComp]) || '',
      ano_int: (idxAnoInt >= 0 && row[idxAnoInt]) || '',
      difficulty_bucket: (idxDiff >= 0 && row[idxDiff]) || '',
      descritores: (idxDesc >= 0 && row[idxDesc]) || '',
      status,
      modificado: false,
    });
  }

  return questions;
}

/**
 * Converts any Google Sheets public link to its direct CSV export URL.
 * Supports:
 * - https://docs.google.com/spreadsheets/d/{ID}/edit#gid={GID}
 * - https://docs.google.com/spreadsheets/d/{ID}/edit?usp=sharing
 * - https://docs.google.com/spreadsheets/d/e/{PUBLISHED_ID}/pub?output=csv
 */
export function convertGoogleSheetsUrlToCsvExport(rawUrl: string): string {
  const url = rawUrl.trim();
  if (!url) return '';

  // Direct CSV link already
  if (url.includes('format=csv') || url.includes('output=csv') || url.includes('tqx=out:csv') || url.endsWith('.csv')) {
    return url;
  }

  // Google Sheets ID match
  const sheetIdMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (sheetIdMatch && sheetIdMatch[1]) {
    const spreadsheetId = sheetIdMatch[1];
    
    // Check for gid parameter or hash
    let gid = '0';
    const gidMatch = url.match(/[?&#]gid=([0-9]+)/);
    if (gidMatch && gidMatch[1]) {
      gid = gidMatch[1];
    }

    // Using Google Visualization API endpoint (/gviz/tq?tqx=out:csv)
    // which bypasses the 403 'This file is too large to be exported' limit
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&gid=${gid}`;
  }

  // Published to web format: /d/e/2PACX-.../pubhtml -> /pub?output=csv
  const pubMatch = url.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (pubMatch && pubMatch[1]) {
    return `https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pub?output=csv`;
  }

  return url;
}
