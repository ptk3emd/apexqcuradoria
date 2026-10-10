import { Question, QuestionStatus } from '../types/question';
import { parseCSV, convertRowsToQuestions, convertGoogleSheetsUrlToCsvExport } from './csvParser';

export const DEFAULT_OFFICIAL_SHEET_URL = 
  'https://docs.google.com/spreadsheets/d/1_hpPUVWGMNnjLNXzoXpPTLW7kdKHbtsBjRF4KC86yfs/edit?usp=sharing';

export const DEFAULT_SPREADSHEET_ID = '1_hpPUVWGMNnjLNXzoXpPTLW7kdKHbtsBjRF4KC86yfs';

export const DEFAULT_WEBHOOK_URL = 
  'https://script.google.com/macros/s/AKfycbyddOnFKqqtbK-aTc6lsrzfwL2a63q4XgEYhYjSYgxC6qujWQ4mIhZSxAkcIHJYTNK9rw/exec';

export const SCRIPT_PROJECT_ID = '1AgFyQFFGnkLBesXpqvpY9QY5QTAppu3xiObeLbbZFwwBCTqcaKLr8zRe';

const STORAGE_KEY_SHEETS_SYNC = 'apexmed_sheets_sync_config_v1';

export interface GoogleSheetsSyncConfig {
  sheetUrl: string;
  spreadsheetId: string;
  webhookUrl: string; // Optional Google Apps Script web app URL for real-time 2-way sync
  lastSyncTime: string | null;
  autoSyncMinutes: number; // 0 = disabled, 5, 10, 15, 30
  lastSendStatus?: 'idle' | 'pending' | 'success' | 'error';
  lastSendMessage?: string;
}

export function getStoredSheetsSyncConfig(): GoogleSheetsSyncConfig {
  if (typeof window === 'undefined') {
    return {
      sheetUrl: DEFAULT_OFFICIAL_SHEET_URL,
      spreadsheetId: DEFAULT_SPREADSHEET_ID,
      webhookUrl: DEFAULT_WEBHOOK_URL,
      lastSyncTime: null,
      autoSyncMinutes: 0,
      lastSendStatus: 'idle',
      lastSendMessage: '',
    };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_SHEETS_SYNC);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        sheetUrl: parsed.sheetUrl || DEFAULT_OFFICIAL_SHEET_URL,
        spreadsheetId: parsed.spreadsheetId || DEFAULT_SPREADSHEET_ID,
        webhookUrl: parsed.webhookUrl || DEFAULT_WEBHOOK_URL,
        lastSyncTime: parsed.lastSyncTime || null,
        autoSyncMinutes: typeof parsed.autoSyncMinutes === 'number' ? parsed.autoSyncMinutes : 0,
        lastSendStatus: parsed.lastSendStatus || 'idle',
        lastSendMessage: parsed.lastSendMessage || '',
      };
    }
  } catch (e) {
    console.warn('Error reading sheets sync config', e);
  }

  return {
    sheetUrl: DEFAULT_OFFICIAL_SHEET_URL,
    spreadsheetId: DEFAULT_SPREADSHEET_ID,
    webhookUrl: DEFAULT_WEBHOOK_URL,
    lastSyncTime: null,
    autoSyncMinutes: 0,
    lastSendStatus: 'idle',
    lastSendMessage: '',
  };
}

export function saveSheetsSyncConfig(config: Partial<GoogleSheetsSyncConfig>): void {
  if (typeof window === 'undefined') return;
  const current = getStoredSheetsSyncConfig();
  const updated = { ...current, ...config };
  try {
    localStorage.setItem(STORAGE_KEY_SHEETS_SYNC, JSON.stringify(updated));
  } catch (e) {
    console.warn('Error saving sheets sync config', e);
  }
}

/**
 * Fetches the questions directly from the Google Sheets spreadsheet via CSV export
 */
export async function fetchQuestionsFromGoogleSheets(sheetUrl?: string): Promise<{
  questions: Question[];
  totalRows: number;
}> {
  const targetUrl = sheetUrl || getStoredSheetsSyncConfig().sheetUrl || DEFAULT_OFFICIAL_SHEET_URL;
  const csvExportUrl = convertGoogleSheetsUrlToCsvExport(targetUrl);

  let response: Response;
  try {
    response = await fetch(csvExportUrl);
  } catch (corsErr) {
    // Fallback using public CORS proxy for client-side environments
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(csvExportUrl)}`;
    response = await fetch(proxyUrl);
  }

  if (!response.ok) {
    throw new Error(
      `Não foi possível acessar a planilha do Google Sheets (${response.status} ${response.statusText}). Verifique se o link possui permissão pública de leitura.`
    );
  }

  const csvText = await response.text();
  
  // Detect if Google Sheets returned exportSizeLimitExceeded error
  if (csvText.includes('exportSizeLimitExceeded') || csvText.includes('This file is too large to be exported')) {
    throw new Error(
      'A planilha do Google Sheets tem mais de 20MB e ultrapassou o limite de exportação CSV do Google ("This file is too large to be exported"). A base local (13.945 questões) está ativa e suas edições e curadorias continuam sendo enviadas em tempo real via script!'
    );
  }

  const rows = parseCSV(csvText);
  const questions = convertRowsToQuestions(rows);

  if (questions.length === 0) {
    throw new Error('A planilha foi lida, mas nenhuma questão com formato válido foi identificada.');
  }

  // Update last sync time
  saveSheetsSyncConfig({ lastSyncTime: new Date().toISOString() });

  return {
    questions,
    totalRows: questions.length,
  };
}

/**
 * Sends a real-time curation update to Google Sheets via Google Apps Script Webhook (if configured)
 */
export async function syncUpdateToGoogleSheetsWebhook(payload: {
  questionId: string;
  status: QuestionStatus;
  curatorName: string;
  curatorId: string;
  notas?: string;
  responsavelNome?: string;
  timestamp?: string;
}): Promise<{ success: boolean; message: string }> {
  const config = getStoredSheetsSyncConfig();
  if (!config.webhookUrl || !config.webhookUrl.trim()) {
    // If no webhook configured, return neutral status indicating local save
    return {
      success: false,
      message: 'Nenhum Webhook configurado. Configure a URL do Apps Script na central do Google Sheets.',
    };
  }

  // Set pending state
  saveSheetsSyncConfig({
    lastSendStatus: 'pending',
    lastSendMessage: `Enviando questão #${payload.questionId}...`,
  });

  try {
    // Mode no-cors is standard for Google Apps Script web apps called from browser
    await fetch(config.webhookUrl.trim(), {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        action: 'UPDATE_QUESTION',
        timestamp: payload.timestamp || new Date().toISOString(),
      }),
    });

    saveSheetsSyncConfig({
      lastSendStatus: 'success',
      lastSendMessage: `Questão #${payload.questionId} sincronizada com o Google Sheets (${new Date().toLocaleTimeString()}).`,
      lastSyncTime: new Date().toISOString(),
    });

    return {
      success: true,
      message: 'Alteração transmitida para a planilha do Google Sheets via Webhook com sucesso!',
    };
  } catch (err: any) {
    console.warn('Google Sheets Webhook error:', err);
    saveSheetsSyncConfig({
      lastSendStatus: 'error',
      lastSendMessage: `Falha no envio da questão #${payload.questionId}: ${err.message || 'Erro de rede'}`,
    });
    return {
      success: false,
      message: `Erro ao enviar para o webhook do Google Sheets: ${err.message || 'Falha de rede'}`,
    };
  }
}

/**
 * Generates ready-to-copy Google Apps Script code for users to paste into Google Sheets (Extensions > Apps Script)
 */
export function getGoogleAppsScriptTemplate(): string {
  return `/**
 * APEXMED — SINCRONIZADOR GOOGLE SHEETS
 * Cole este código em: Extensões > Apps Script da sua planilha Google.
 * Depois clique em: Implantar > Nova implantação > Tipo: "App da Web"
 * - Executar como: "Eu"
 * - Quem tem acesso: "Qualquer pessoa"
 * Copie o URL do App da Web gerado e cole no ApexMed!
 */

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    
    // Identificar colunas
    var idCol = 0; // Coluna A (id)
    var statusCol = -1;
    var revisorCol = -1;
    var dataRevisaoCol = -1;
    var notasCol = -1;
    var responsavelCol = -1;

    for (var j = 0; j < headers.length; j++) {
      var h = String(headers[j]).toLowerCase();
      if (h === 'status') statusCol = j;
      if (h === 'revisado_por') revisorCol = j;
      if (h === 'revisado_em') dataRevisaoCol = j;
      if (h === 'notas_revisao') notasCol = j;
      if (h === 'responsavel_nome') responsavelCol = j;
    }

    // Criar colunas de auditoria caso ainda não existam na planilha
    var lastCol = headers.length;
    if (statusCol === -1) {
      statusCol = lastCol;
      sheet.getRange(1, statusCol + 1).setValue('status');
      lastCol++;
    }
    if (revisorCol === -1) {
      revisorCol = lastCol;
      sheet.getRange(1, revisorCol + 1).setValue('revisado_por');
      lastCol++;
    }
    if (dataRevisaoCol === -1) {
      dataRevisaoCol = lastCol;
      sheet.getRange(1, dataRevisaoCol + 1).setValue('revisado_em');
      lastCol++;
    }
    if (notasCol === -1) {
      notasCol = lastCol;
      sheet.getRange(1, notasCol + 1).setValue('notas_revisao');
      lastCol++;
    }
    if (responsavelCol === -1) {
      responsavelCol = lastCol;
      sheet.getRange(1, responsavelCol + 1).setValue('responsavel_nome');
    }

    // Localizar a linha da questão pelo ID
    var targetId = String(payload.questionId).trim();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]).trim() === targetId) {
        var rowNum = i + 1;
        if (payload.status) {
          sheet.getRange(rowNum, statusCol + 1).setValue(payload.status);
        }
        if (payload.curatorName) {
          sheet.getRange(rowNum, revisorCol + 1).setValue(payload.curatorName);
        }
        if (payload.timestamp) {
          sheet.getRange(rowNum, dataRevisaoCol + 1).setValue(payload.timestamp);
        }
        if (payload.notas !== undefined) {
          sheet.getRange(rowNum, notasCol + 1).setValue(payload.notas);
        }
        if (payload.responsavelNome) {
          sheet.getRange(rowNum, responsavelCol + 1).setValue(payload.responsavelNome);
        }
        
        return ContentService.createTextOutput(JSON.stringify({
          status: 'success',
          row: rowNum,
          updatedId: targetId
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      status: 'not_found',
      message: 'Questão #' + targetId + ' não encontrada na planilha.'
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: 'error',
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'online',
    app: 'ApexMed Google Sheets Sync Hook',
    time: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}
`;
}

/**
 * Exports current questions with curation statuses to CSV formatted for Google Sheets import
 */
export function exportToGoogleSheetsCsv(questions: Question[]): string {
  const headers = [
    'id',
    'categoria',
    'tema_especifico',
    'ano',
    'origem',
    'enunciado',
    'a',
    'b',
    'c',
    'd',
    'e',
    'correta',
    'comentario',
    'justificativa_a',
    'justificativa_b',
    'justificativa_c',
    'justificativa_d',
    'justificativa_e',
    'especialidade',
    'competencias',
    'status',
    'revisado_por',
    'revisado_em',
    'notas_revisao',
    'responsavel_nome',
  ];

  const escapeCell = (val: string | undefined | null): string => {
    if (val === undefined || val === null) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  };

  const rows: string[] = [];
  rows.push(headers.join(','));

  for (const q of questions) {
    const row = [
      escapeCell(q.id),
      escapeCell(q.categoria),
      escapeCell(q.tema_especifico),
      escapeCell(q.ano),
      escapeCell(q.origem),
      escapeCell(q.enunciado),
      escapeCell(q.a),
      escapeCell(q.b),
      escapeCell(q.c),
      escapeCell(q.d),
      escapeCell(q.e),
      escapeCell(q.correta),
      escapeCell(q.comentario),
      escapeCell(q.justificativa_a),
      escapeCell(q.justificativa_b),
      escapeCell(q.justificativa_c),
      escapeCell(q.justificativa_d),
      escapeCell(q.justificativa_e),
      escapeCell(q.especialidade),
      escapeCell(q.competencias),
      escapeCell(q.status),
      escapeCell(q.revisado_por),
      escapeCell(q.revisado_em),
      escapeCell(q.notas_revisao),
      escapeCell(q.responsavel_nome),
    ];
    rows.push(row.join(','));
  }

  return rows.join('\r\n');
}
