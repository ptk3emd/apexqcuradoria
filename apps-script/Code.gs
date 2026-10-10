/** ApexMed collaboration v2. All readers and writers use the SAME deployment.
 * Script properties: APEX_ACCESS_KEY (shared login password), APEX_BASE_SHEET (base tab name).
 * The append-only journal is authoritative; never edit/delete its rows manually.
 */
var APEX_SHEET_ID = '1_hpPUVWGMNnjLNXzoXpPTLW7kdKHbtsBjRF4KC86yfs';
var APEX_JOURNAL = '_apex_collaboration_v2';
var APEX_NAMES = {patrick:'Patrick', lucas:'Lucas', thierry:'Thierry'};
var APEX_FIELDS = ['categoria','tema_especifico','ano','origem','enunciado','a','b','c','d','e','correta','comentario','justificativa_a','justificativa_b','justificativa_c','justificativa_d','justificativa_e','especialidade','competencias','ano_int','competencias_normalized','difficulty_bucket','descritores','status','notas_revisao','modificado','shared_comments'];
function doGet() { return apexJson({protocol:2, app:'ApexMed Sheets collaboration'}); }
function apexJson(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var p = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var key = props.getProperty('APEX_ACCESS_KEY');
    if (!key || p.key !== key) throw new Error('Senha inválida ou APEX_ACCESS_KEY não configurada no Apps Script.');
    if (!APEX_NAMES[p.actor] || !/^[\w-]{20,80}$/.test(p.session || '')) throw new Error('Sessão inválida');
    if (p.action === 'authenticate') return apexJson({protocol:2,ok:true});
    lock.waitLock(20000);
    return apexJson(apexHandle(p, props));
  } catch (error) { return apexJson({protocol:2, ok:false, message:String(error.message || error)}); }
  finally { if (lock.hasLock()) lock.releaseLock(); }
}
function apexJournal(ss) {
  var sheet = ss.getSheetByName(APEX_JOURNAL);
  if (!sheet) { sheet = ss.insertSheet(APEX_JOURNAL); sheet.appendRow(['request_id','timestamp','transaction_json']); }
  return sheet;
}
function apexRead(sheet, start, count) {
  return count ? sheet.getRange(start,1,count,3).getValues().map(function(row) { return {request:String(row[0]), changes:JSON.parse(row[2])}; }) : [];
}
function apexBase(ss) {
  var name = PropertiesService.getScriptProperties().getProperty('APEX_BASE_SHEET');
  var sheet = name && ss.getSheetByName(name);
  if (!sheet || name === APEX_JOURNAL) throw new Error('Configure APEX_BASE_SHEET com o nome exato da aba de questões.');
  return sheet;
}
function apexQuestion(sheet, id, headers) {
  headers = headers || sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String);
  var col = headers.indexOf('id');
  if (col < 0) throw new Error('A aba base precisa da coluna id.');
  var match = sheet.getRange(2,col+1,Math.max(1,sheet.getLastRow()-1),1).createTextFinder(id).matchEntireCell(true).findNext();
  if (!match) throw new Error('Questão não encontrada: '+id);
  var values = sheet.getRange(match.getRow(),1,1,headers.length).getValues()[0];
  var q = {};
  headers.forEach(function(h,i) { q[h] = values[i] instanceof Date ? values[i].toISOString() : String(values[i]); });
  q.id = id; q.status = q.status || 'pendente'; q.sync_version = 0;
  if (!q.responsavel_id && q.responsavel_nome) {
    q.responsavel_id = Object.keys(APEX_NAMES).filter(function(k) {return APEX_NAMES[k] === q.responsavel_nome;})[0] || 'legacy';
  }
  return q;
}
function apexHandle(p, props) {
  var ss = SpreadsheetApp.openById(APEX_SHEET_ID);
  var journal = apexJournal(ss);
  var total = journal.getLastRow()-1;
  var leases = JSON.parse(props.getProperty('APEX_LEASES') || '{}');
  var now = Date.now();
  Object.keys(leases).forEach(function(id) { if (leases[id].until <= now) delete leases[id]; });
  if (p.action === 'sync') {
    var cursor = Number(p.cursor || 0);
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > total) throw new Error('Cursor inválido; reinicie a sessão.');
    var count = Math.min(50,total-cursor);
    return {protocol:2,ok:true,entries:apexRead(journal,cursor+2,count),cursor:cursor+count,more:cursor+count<total,leases:leases};
  }
  if (p.action === 'base') {
    var base = apexBase(ss), offset = Math.max(0,Number(p.offset)||0);
    var headers = base.getRange(1,1,1,base.getLastColumn()).getValues()[0].map(String);
    var size = Math.min(50,Math.max(0,base.getLastRow()-1-offset));
    var rows = size ? base.getRange(offset+2,1,size,headers.length).getValues().map(function(row) {
      var q={}; headers.forEach(function(h,i){q[h]=row[i] instanceof Date ? row[i].toISOString() : String(row[i]);});
      q.status=q.status||'pendente'; return q;
    }) : [];
    return {protocol:2,ok:true,questions:rows,next:offset+size,more:offset+size<base.getLastRow()-1};
  }
  var items = p.items;
  if (!Array.isArray(items) || !items.length || items.length > 100) throw new Error('Escolha entre 1 e 100 questões por operação.');
  if (p.action === 'heartbeat' || p.action === 'unlock') {
    items.forEach(function(item) {
      var l=leases[item.id];
      if (p.action === 'unlock') { if(l && l.session===p.session) delete leases[item.id]; }
      else {
        if(!l || l.session!==p.session || l.actor!==p.actor) throw new Error('Reserva expirada. Reabra a questão.');
        l.until=now+90000;
      }
    });
    props.setProperty('APEX_LEASES',JSON.stringify(leases));
    return {protocol:2,ok:true,changes:[]};
  }
  if (!/^[\w-]{20,80}$/.test(p.request || '')) throw new Error('Identificador da operação inválido');
  var entries=apexRead(journal,2,total), confirmed=[];
  var previous=entries.filter(function(entry){return entry.request===p.request;})[0];
  if(previous) return {protocol:2,ok:true,changes:previous.changes};
  // Reconstruct requested patches in one journal pass, not once per item.
  var wanted=Object.create(null), history=Object.create(null);
  items.forEach(function(item) { wanted[String(item.id)]=true; });
  entries.forEach(function(entry) { entry.changes.forEach(function(change) {
    if (!wanted[change.id]) return;
    var state=history[change.id] || {patch:{},version:0};
    Object.assign(state.patch,change.patch); state.version=change.version;
    history[change.id]=state;
  }); });
  var baseSheet=apexBase(ss);
  var headers=baseSheet.getRange(1,1,1,baseSheet.getLastColumn()).getValues()[0].map(String);
  var seen=Object.create(null);
  var changes=items.map(function(item) {
    var id=String(item.id);
    if (seen[id]) throw new Error('Questão duplicada no lote'); seen[id]=true;
    var q=apexQuestion(baseSheet,id,headers);
    if(history[id]) Object.assign(q,history[id].patch,{sync_version:history[id].version});
    var l=leases[id];
    if (q.responsavel_id && q.responsavel_id!==p.actor) throw new Error('Questão '+id+' reservada por '+q.responsavel_nome);
    if (l && l.session!==p.session) throw new Error('Questão '+id+' aberta em outra sessão');
    if (Number(item.version||0)!==q.sync_version) throw new Error('Questão '+id+' atualizada por outra sessão. Reabra antes de salvar.');
    var patch={};
    if(p.action==='claim') {
      patch={responsavel_id:p.actor,responsavel_nome:APEX_NAMES[p.actor]};
      leases[id]={session:p.session,actor:p.actor,name:APEX_NAMES[p.actor],until:now+90000};
    } else if(p.action==='assign') {
      if(item.target && !APEX_NAMES[item.target]) throw new Error('Responsável inválido');
      patch={responsavel_id:item.target||null,responsavel_nome:APEX_NAMES[item.target]||null};
      delete leases[id];
    } else if(p.action==='save') {
      if(!l || l.session!==p.session) throw new Error('Abra a questão para reservar antes de editar.');
      APEX_FIELDS.forEach(function(k){ if(Object.prototype.hasOwnProperty.call(item.patch||{},k)) patch[k]=item.patch[k]; });
      if(patch.status && ['pendente','aprovadas','eliminar_questao','revisar_questao','questao_corrigida'].indexOf(patch.status)<0) throw new Error('Status inválido');
      patch.revisado_por=APEX_NAMES[p.actor]; patch.revisado_em=new Date(now).toISOString();
    } else throw new Error('Ação desconhecida. Atualize o aplicativo.');
    confirmed.push(Object.assign({},q,patch,{sync_version:q.sync_version+1}));
    return {id:id,version:q.sync_version+1,patch:patch};
  });
  var encoded=JSON.stringify(changes);
  if(encoded.length>45000) throw new Error('Operação muito grande. Reduza o lote ou o tamanho do texto.');
  // One append is the commit point: validation of every item precedes all writes.
  journal.appendRow([p.request,new Date(now).toISOString(),encoded]);
  SpreadsheetApp.flush();
  props.setProperty('APEX_LEASES',JSON.stringify(leases));
  return {protocol:2,ok:true,changes:changes,questions:confirmed};
}
