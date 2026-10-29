import test from 'node:test';
import assert from 'node:assert/strict';
import {computePace, addDays, formatDay} from '../src/lib/curationPace';
import type {Curator, Question} from '../src/types/question';

const curators = [{id: 'ana', nome: 'Ana'}, {id: 'bia', nome: 'Bia'}] as Curator[];
const q = (id: string, status: string, responsavel_id: string | null = null) => ({id, status, responsavel_id}) as Question;

test('pace, goals, deficit, forecast and burndown come from the daily audits', () => {
  const today = '2026-10-28';
  const daily = [
    ...Array.from({length: 7}, (_, i) => ({day: addDays(today, -i), curator: 'ana', audited: 10})),
    {day: today, curator: 'bia', audited: 4},
  ];
  const questions = [q('1', 'pendente', 'bia'), q('2', 'pendente', 'bia'), ...Array.from({length: 138}, (_, i) => q(String(10 + i), 'pendente')), q('9', 'aprovadas')];
  const {curators: pace, team} = computePace({today, daily, totals: {ana: 300}, goals: {daily: {ana: 10, bia: 5}, deadline: '2026-11-07'}}, curators, questions);
  const [ana, bia] = pace;
  assert.equal(ana.status, 'em_dia'); assert.equal(ana.last7, 70); assert.equal(ana.deficit7, 0); assert.equal(ana.total, 300);
  assert.equal(bia.status, 'atrasado'); assert.equal(bia.today, 4); assert.equal(bia.deficit7, 31);
  assert.deepEqual(bia.assignedPending.map(x => x.id), ['1', '2']);
  assert.equal(team.pending, 140); assert.equal(team.goalPerDay, 15);
  assert.equal(team.avg14, 74 / 14);
  assert.equal(team.daysToDeadline, 10); assert.equal(team.requiredPerDay, 14); assert.equal(team.onTrack, false);
  assert.equal(team.eta, addDays(today, Math.ceil(140 / (74 / 14))));
  assert.equal(team.burndown.at(-1)!.pending, 140);
  assert.equal(team.burndown.at(-2)!.pending, 154);
  assert.equal(team.burndown[0].pending, 214);
});

test('no goal, no pace and an empty base have explicit outcomes', () => {
  const {curators: pace, team} = computePace({today: '2026-10-28', daily: [], totals: {}, goals: {daily: {}, deadline: null}}, curators, [q('1', 'pendente')]);
  assert.equal(pace[0].status, 'sem_meta'); assert.equal(team.eta, null); assert.equal(team.onTrack, null);
  assert.equal(computePace({today: '2026-10-28', daily: [], totals: {}, goals: {daily: {}, deadline: null}}, curators, []).team.eta, '2026-10-28');
  assert.equal(formatDay('2026-12-05', '2026-10-28'), '5 dez'); assert.equal(formatDay('2027-01-05', '2026-10-28'), '5 jan 2027');
});

test('with priorities the plan has a P0/P1 phase first and each curator sees their urgent queue', async () => {
  const {buildPriorities, priorityOrder} = await import('../src/lib/priorities');
  const today = '2026-10-28';
  const pr = buildPriorities({P0: ['1'], P1: ['2', '3'], P2: ['4', '5']}, {ana: ['1', '2', '4'], bia: ['3', '5']});
  const qs = [q('1', 'pendente', 'ana'), q('2', 'aprovadas', 'ana'), q('3', 'pendente', 'bia'), q('4', 'pendente'), q('5', 'pendente'), q('6', 'pendente')];
  const daily = Array.from({length: 14}, (_, i) => ({day: addDays(today, -i), curator: 'ana', audited: 1}));
  const {team, curators: pace} = computePace({today, daily, totals: {}, goals: {daily: {}, deadline: '2026-11-27', deadline_priority: '2026-11-07'}}, curators, qs, pr);
  assert.deepEqual([team.phases!.urgent.pending, team.phases!.urgent.total, team.phases!.rest.pending, team.phases!.rest.total], [2, 3, 3, 3]);
  assert.equal(team.phases!.urgent.eta, addDays(today, 2));
  assert.equal(team.phases!.urgent.requiredPerDay, 1);
  assert.equal(team.phases!.rest.requiredPerDay, 1);
  assert.deepEqual(pace.map(c => [c.urgentPending, c.plannedPending]), [[1, 1], [1, 1]]);
  assert.deepEqual(qs.slice().sort(priorityOrder(pr)).map(x => x.id), ['1', '2', '3', '4', '5', '6']);
});
