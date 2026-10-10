import { Question } from '../types/question';
import { sheetsRequest, fetchShared, mergeShared } from './collaboration';

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
  const questions: Question[] = [];
  let offset = 0;
  let result;
  do {
    result = await sheetsRequest({action:'base', offset});
    questions.push(...result.questions);
    offset = result.next;
  } while (result.more);
  const shared = await fetchShared();
  const merged = mergeShared(questions, shared.rows);
  saveSheetsSyncConfig({lastSyncTime:new Date().toISOString()});
  return { questions:merged, totalRows:merged.length };
}

import appsScriptSource from '../../apps-script/Code.gs?raw';
export function getGoogleAppsScriptTemplate(): string { return appsScriptSource; }

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
