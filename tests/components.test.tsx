import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {create, act} from 'react-test-renderer';
import {BatchAssignModal} from '../src/components/BatchAssignModal';
import {GoogleSheetsSyncModal} from '../src/components/GoogleSheetsSyncModal';
import {SqlEditorModal} from '../src/components/SqlEditorModal';
import {QuestionsTable} from '../src/components/QuestionsTable';
import {DEFAULT_CURATORS} from '../src/data/defaultCurators';
import type {Question} from '../src/types/question';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const actor = DEFAULT_CURATORS[0];
const rows = ['1','2','3'].map(id=>({id,status:'pendente',enunciado:'Question '+id,correta:'A'})) as Question[];
const common = {questions:rows,activeCurator:actor,curators:DEFAULT_CURATORS,onClose:()=>{},onShowToast:()=>{},busy:false};

for (const [name, Component, props] of [
  ['batch', BatchAssignModal, {onAssignBatch:async()=>true,onReleaseAllMyAssignments:async()=>true}],
  ['sheets', GoogleSheetsSyncModal, {onQuestionsUpdated:()=>{}}],
  ['sql', SqlEditorModal, {auditLogs:[],allQuestions:rows,onClearLogs:()=>{}}],
] as const) {
  test(`${name} modal can open, close, and reopen without changing hook order`, async () => {
    let renderer: any;
    const C = Component as any;
    await act(async()=> {renderer=create(<C {...common} {...props} isOpen={false}/>);});
    assert.equal(renderer.toJSON(),null);
    for (const open of [true,false,true]) {
      await act(async()=> {renderer.update(<C {...common} {...props} isOpen={open}/>);});
      assert.equal(renderer.toJSON()!==null,open);
    }
    await act(async()=>renderer.unmount());
  });
}

test('table sends the exact selected IDs and clears selection only after success', async () => {
  let renderer:any;
  const calls:unknown[]=[];
  let succeed=false;
  await act(async()=> {renderer=create(<QuestionsTable {...common} presences={{}} comments={{}}
    onSelectQuestion={()=>{}} onUpdateStatus={async()=>true} onAssignQuestion={()=>{}}
    onSelectedQuestions={async(ids,action)=>{calls.push({ids,action});return succeed;}}/>);});
  const checkbox=(id:string)=>renderer.root.findByProps({'aria-label':`Selecionar questão ${id}`});
  await act(async()=>checkbox('1').props.onChange());
  await act(async()=>checkbox('3').props.onChange());
  const action=()=>renderer.root.findAllByType('button').find((b:any)=>b.children.includes('Assumir selecionadas'));
  await act(async()=>action().props.onClick());
  assert.deepEqual(calls[0],{ids:['1','3'],action:'assign'});
  assert.equal(checkbox('1').props.checked,true);
  succeed=true;
  await act(async()=>action().props.onClick());
  assert.equal(checkbox('1').props.checked,false);
  await act(async()=>renderer.unmount());
});

test('open button stops row propagation, causing one open request', async () => {
  let renderer:any;
  let opens=0, stopped=false;
  await act(async()=> {renderer=create(<QuestionsTable {...common} presences={{}} comments={{}}
    onSelectQuestion={()=>{opens++;}} onUpdateStatus={async()=>true} onAssignQuestion={()=>{}}
    onSelectedQuestions={async()=>true}/>);});
  const button=renderer.root.findAllByProps({title:'Abrir em tela cheia'})[0];
  button.props.onClick({stopPropagation:()=>{stopped=true;}});
  assert.equal(stopped,true);
  assert.equal(opens,1);
  await act(async()=>renderer.unmount());
});
