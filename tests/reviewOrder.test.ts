import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPriorities, priorityOrder} from '../src/lib/priorities';

// The review's "Próxima" follows: the curator's own pending questions first, then the rest; each group by priority.
const order=(questions:{id:string;responsavel_id:string|null;status:string}[],me:string,priorities:ReturnType<typeof buildPriorities>|null)=>{
  const byPriority=priorityOrder(priorities);
  const mine=questions.filter(q=>q.status==='pendente'&&q.responsavel_id===me).sort(byPriority);
  const rest=questions.filter(q=>!(q.status==='pendente'&&q.responsavel_id===me)).sort(byPriority);
  return [...mine,...rest].map(q=>q.id);
};

test('review order walks P0 → P3 before the table order, with the curator\'s own questions first',()=>{
  const priorities=buildPriorities({P0:['40'],P1:['30'],P2:['20'],P3:['10']},{});
  const questions=[
    {id:'1',responsavel_id:null,status:'pendente'},
    {id:'10',responsavel_id:null,status:'pendente'},
    {id:'20',responsavel_id:null,status:'pendente'},
    {id:'30',responsavel_id:null,status:'pendente'},
    {id:'40',responsavel_id:null,status:'pendente'},
    {id:'50',responsavel_id:'lucas',status:'pendente'},
    {id:'60',responsavel_id:'patrick',status:'pendente'},
  ];
  // Patrick: his own (60) first, then the priority list 40 → 30 → 20 → 10, then the rest by id.
  assert.deepEqual(order(questions,'patrick',priorities),['60','40','30','20','10','1','50']);
});

test('without priorities the review keeps the id order inside each group',()=>{
  const questions=[{id:'3',responsavel_id:null,status:'pendente'},{id:'1',responsavel_id:null,status:'pendente'}];
  assert.deepEqual(order(questions,'patrick',null),['1','3']);
});
