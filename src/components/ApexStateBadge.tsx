import React from 'react';
import type {Question} from '../types/question';
import {apexStateKey,apexReason,APEX_LABELS} from '../lib/apexState';
export function ApexStateBadge({question}:{question:Question}) {
 const key=apexStateKey(question);
 const color=key==='active'?'text-emerald-300 border-emerald-500/30':key==='unknown'?'text-apex-readable border-white/15':'text-amber-300 border-amber-500/30';
 return <span title={['Estado no Apex Medicina',apexReason(question)].filter(Boolean).join(': ')} className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${color}`}>{APEX_LABELS[key]}</span>;
}
