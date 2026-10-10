import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Link2, 
  Upload, 
  Download, 
  RefreshCw, 
  X, 
  CheckCircle2, 
  AlertCircle,
  HelpCircle 
} from 'lucide-react';
import { Question } from '../types/question';
import { parseCSV, convertRowsToQuestions, convertGoogleSheetsUrlToCsvExport } from '../lib/csvParser';
import { INITIAL_CSV_STRING } from '../data/rawCsvData';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  questions: Question[];
  onImportQuestions: (imported: Question[]) => void;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  questions,
  onImportQuestions,
  onShowToast,
}) => {
  if (!isOpen) return null;

  const DEFAULT_SHEET_URL = 'https://docs.google.com/spreadsheets/d/1_hpPUVWGMNnjLNXzoXpPTLW7kdKHbtsBjRF4KC86yfs/edit?usp=sharing';
  const [sheetsUrl, setSheetsUrl] = useState(DEFAULT_SHEET_URL);
  const [pastedCsv, setPastedCsv] = useState('');
  const [activeTab, setActiveTab] = useState<'sheets' | 'upload' | 'paste'>('sheets');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Import from Google Sheets public link
  const handleImportGoogleSheets = async () => {
    if (!sheetsUrl.trim()) {
      setErrorMsg('Por favor, insira o link de compartilhamento do Google Sheets.');
      return;
    }

    setIsLoading(true);
    setErrorMsg('');

    try {
      const csvExportUrl = convertGoogleSheetsUrlToCsvExport(sheetsUrl.trim());

      let response: Response;
      try {
        response = await fetch(csvExportUrl);
      } catch (corsErr) {
        // Fallback using public CORS proxy for client-only GitHub pages compatibility
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(csvExportUrl)}`;
        response = await fetch(proxyUrl);
      }

      if (!response.ok) {
        throw new Error(`Falha ao baixar planilha (${response.status} ${response.statusText}). Certifique-se de que a planilha está configurada para 'Qualquer pessoa com o link pode ler'.`);
      }

      const csvText = await response.text();
      const rows = parseCSV(csvText);
      const parsed = convertRowsToQuestions(rows);

      if (parsed.length === 0) {
        throw new Error('Nenhuma questão válida foi identificada no CSV. Verifique os cabeçalhos das colunas.');
      }

      onImportQuestions(parsed);
      onShowToast(
        'Planilha importada com sucesso!',
        `${parsed.length} questões carregadas a partir do Google Sheets.`,
        'success'
      );
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao carregar do Google Sheets.');
    } finally {
      setIsLoading(false);
    }
  };

  // Upload local CSV file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        const parsed = convertRowsToQuestions(rows);
        if (parsed.length === 0) {
          setErrorMsg('O arquivo CSV não possui linhas ou colunas válidas.');
          return;
        }
        onImportQuestions(parsed);
        onShowToast(
          'Arquivo CSV importado!',
          `${parsed.length} questões carregadas com sucesso.`,
          'success'
        );
        onClose();
      } catch (err: any) {
        setErrorMsg('Erro ao processar o arquivo CSV: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  // Import pasted CSV text
  const handlePasteImport = () => {
    if (!pastedCsv.trim()) {
      setErrorMsg('Cole o texto do CSV na caixa.');
      return;
    }
    try {
      const rows = parseCSV(pastedCsv.trim());
      const parsed = convertRowsToQuestions(rows);
      if (parsed.length === 0) {
        setErrorMsg('Nenhuma questão válida encontrada no texto.');
        return;
      }
      onImportQuestions(parsed);
      onShowToast(
        'CSV importado!',
        `${parsed.length} questões adicionadas com sucesso.`,
        'success'
      );
      onClose();
    } catch (err: any) {
      setErrorMsg('Erro ao ler CSV: ' + err.message);
    }
  };

  // Reset to default dataset provided by user's sheet (13,945 questions)
  const handleResetToDefault = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('./base_questoes.json');
      if (res.ok) {
        const fullData = await res.json();
        onImportQuestions(fullData);
        onShowToast(
          'Base Original da Planilha Restaurada!',
          `${fullData.length} questões da planilha carregadas com sucesso.`,
          'info'
        );
        onClose();
        return;
      }
    } catch {
      // fallback
    }

    const rows = parseCSV(INITIAL_CSV_STRING);
    const parsed = convertRowsToQuestions(rows);
    onImportQuestions(parsed);
    onShowToast(
      'Base Restaurada',
      `${parsed.length} questões carregadas.`,
      'info'
    );
    onClose();
    setIsLoading(false);
  };

  // Export current state to CSV
  const handleExportCsv = () => {
    const headers = [
      'id', 'categoria', 'tema_especifico', 'ano', 'origem', 'enunciado',
      'a', 'b', 'c', 'd', 'e', 'correta', 'comentario',
      'justificativa_a', 'justificativa_b', 'justificativa_c', 'justificativa_d', 'justificativa_e',
      'especialidade', 'status', 'responsavel_nome', 'revisado_por', 'revisado_em'
    ];

    const escapeCell = (val: any) => {
      const s = String(val ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };

    const csvLines = [headers.join(',')];
    questions.forEach(q => {
      const row = [
        q.id, q.categoria, q.tema_especifico, q.ano, q.origem, q.enunciado,
        q.a, q.b, q.c, q.d, q.e, q.correta, q.comentario,
        q.justificativa_a, q.justificativa_b, q.justificativa_c, q.justificativa_d, q.justificativa_e,
        q.especialidade, q.status, q.responsavel_nome || '', q.revisado_por || '', q.revisado_em || ''
      ].map(escapeCell);
      csvLines.push(row.join(','));
    });

    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `apexmed_curadoria_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onShowToast('CSV exportado!', 'Arquivo baixado com as alterações e status.', 'success');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
      <div className="w-full max-w-2xl rounded-2xl bg-[#1e1d1b] border border-white/[0.12] p-6 space-y-5 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-base text-[#f8fafc]">Importar & Exportar Questões (Google Sheets / CSV)</h3>
              <p className="text-xs text-[#7a7468]">
                Sincronize com link público do Google Sheets ou gerencie arquivos CSV
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#7a7468] hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab selection */}
        <div className="flex border-b border-white/[0.08] gap-4 text-xs font-bold">
          <button
            onClick={() => { setActiveTab('sheets'); setErrorMsg(''); }}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === 'sheets'
                ? 'border-[#A43939] text-[#f8fafc]'
                : 'border-transparent text-[#7a7468] hover:text-white'
            }`}
          >
            <Link2 className="w-3.5 h-3.5" />
            Link Google Sheets
          </button>

          <button
            onClick={() => { setActiveTab('upload'); setErrorMsg(''); }}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === 'upload'
                ? 'border-[#A43939] text-[#f8fafc]'
                : 'border-transparent text-[#7a7468] hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Arquivo .CSV
          </button>

          <button
            onClick={() => { setActiveTab('paste'); setErrorMsg(''); }}
            className={`pb-2.5 border-b-2 flex items-center gap-1.5 transition-all ${
              activeTab === 'paste'
                ? 'border-[#A43939] text-[#f8fafc]'
                : 'border-transparent text-[#7a7468] hover:text-white'
            }`}
          >
            Colar Texto CSV
          </button>
        </div>

        {/* Error notification */}
        {errorMsg && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Content by active tab */}
        {activeTab === 'sheets' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#f8fafc] mb-1.5">
                Link de compartilhamento do Google Sheets:
              </label>
              <input
                type="text"
                value={sheetsUrl}
                onChange={(e) => setSheetsUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0X.../edit?usp=sharing"
                className="w-full bg-[#272522] border border-white/[0.12] rounded-xl px-3.5 py-2.5 text-xs text-[#f8fafc] placeholder-[#7a7468] outline-none focus:border-[#A43939]"
              />
            </div>

            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-1.5 text-xs text-[#bdbdbd]">
              <div className="flex items-center gap-1.5 font-bold text-[#f8fafc]">
                <HelpCircle className="w-3.5 h-3.5 text-[#DF9696]" />
                Como compartilhar sua planilha:
              </div>
              <p>
                1. No Google Sheets, clique em <b>Compartilhar</b> (canto superior direito).
              </p>
              <p>
                2. Em <i>Acesso geral</i>, mude para: <b>Qualquer pessoa com o link</b> (como Leitor).
              </p>
              <p>
                3. Copie o link e cole acima. A plataforma converte automaticamente para o formato direto CSV!
              </p>
            </div>

            <button
              onClick={handleImportGoogleSheets}
              disabled={isLoading || !sheetsUrl.trim()}
              className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#A43939] hover:bg-[#913232] disabled:opacity-40 text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              <span>{isLoading ? 'Baixando e Processando...' : 'Carregar do Google Sheets'}</span>
            </button>
          </div>
        )}

        {activeTab === 'upload' && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-white/[0.15] hover:border-[#A43939] rounded-2xl p-8 text-center transition-colors">
              <Upload className="w-8 h-8 text-[#DF9696] mx-auto mb-2" />
              <p className="text-xs font-bold text-[#f8fafc] mb-1">
                Selecione um arquivo CSV do seu computador
              </p>
              <p className="text-[11px] text-[#7a7468] mb-3">
                Formatos compatíveis com as colunas ENARE (enunciado, a, b, c, d, e, correta, comentario)
              </p>
              <label className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-xs font-bold bg-white/[0.08] hover:bg-white/[0.15] text-white cursor-pointer transition-all">
                <span>Escolher Arquivo</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {activeTab === 'paste' && (
          <div className="space-y-3">
            <label className="block text-xs font-bold text-[#f8fafc]">
              Cole o conteúdo do CSV aqui:
            </label>
            <textarea
              rows={8}
              value={pastedCsv}
              onChange={(e) => setPastedCsv(e.target.value)}
              placeholder="id,categoria,tema_especifico,ano,origem,enunciado,a,b,c,d,e,correta..."
              className="w-full bg-[#272522] border border-white/[0.12] rounded-xl p-3 text-xs font-mono text-[#f8fafc] placeholder-[#7a7468] outline-none focus:border-[#A43939]"
            />
            <button
              onClick={handlePasteImport}
              disabled={!pastedCsv.trim()}
              className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#A43939] hover:bg-[#913232] disabled:opacity-40 text-white shadow-lg transition-all cursor-pointer"
            >
              Processar Texto CSV
            </button>
          </div>
        )}

        {/* Footer with Utilities */}
        <div className="flex flex-wrap items-center justify-between pt-3 border-t border-white/[0.08] gap-2">
          <button
            onClick={handleResetToDefault}
            className="flex items-center gap-1.5 text-xs text-[#7a7468] hover:text-[#DF9696] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Restaurar Base Padrão ENARE (60 questões)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold text-white bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] transition-all"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Baixar CSV Atual ({questions.length})</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-full text-xs font-bold text-[#bdbdbd] hover:text-white"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
