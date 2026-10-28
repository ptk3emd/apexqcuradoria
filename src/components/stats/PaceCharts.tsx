import React, {useEffect, useRef, useState} from 'react';
import {addDays, daysBetween, formatDay} from '../../lib/curationPace';

// Measures the rendered width so SVG text keeps its size at every breakpoint.
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

const niceMax = (value: number) => {
  if (value <= 5) return 5;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
};

interface BurndownProps {
  points: {day: string; pending: number}[];
  today: string;
  eta: string | null;
  deadline: string | null;
}

/**
 * Pending questions over the last days, the projection at the current pace and
 * the line the deadline asks for. One axis: questions still pending.
 */
export function BurndownChart({points, today, eta, deadline}: BurndownProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 240;
  const pad = {top: 16, right: 16, bottom: 28, left: 44};
  const start = points[0]?.day ?? today;
  const current = points.at(-1)?.pending ?? 0;
  // The horizon reaches the later of the forecast and the deadline, capped at a year out.
  const horizon = [eta, deadline].filter((d): d is string => Boolean(d) && d! > today).sort().at(-1) ?? addDays(today, 14);
  const end = daysBetween(today, horizon) > 365 ? addDays(today, 365) : horizon;
  const span = Math.max(1, daysBetween(start, end));
  const yMax = niceMax(Math.max(...points.map(p => p.pending), 1));
  const plotW = Math.max(1, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const x = (day: string) => pad.left + (daysBetween(start, day) / span) * plotW;
  const y = (v: number) => pad.top + plotH - (v / yMax) * plotH;
  const actual = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)},${y(p.pending).toFixed(1)}`).join('');
  const area = `${actual}L${x(today).toFixed(1)},${y(0)}L${x(start).toFixed(1)},${y(0)}Z`;
  const ticks = [0, yMax / 2, yMax];
  const hovered = hover === null ? null : points[hover];

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const day = Math.round(((event.clientX - box.left) / box.width) * span);
    setHover(day >= 0 && day < points.length ? day : null);
  };

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`Questões pendentes: ${current} hoje${eta ? `, previsão de conclusão em ${formatDay(eta, today)}` : ''}${deadline ? `, prazo em ${formatDay(deadline, today)}` : ''}.`}>
          {ticks.map(t => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
              <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-[var(--warm-muted-readable)] text-[11px] tabular-nums">{Math.round(t).toLocaleString('pt-BR')}</text>
            </g>
          ))}
          <path d={area} fill="url(#burn-fill)" />
          <defs>
            <linearGradient id="burn-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--brand-soft)" stopOpacity="0.28" />
              <stop offset="1" stopColor="var(--brand-soft)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={actual} fill="none" stroke="var(--brand-soft)" strokeWidth={2} strokeLinejoin="round" />
          {eta && eta > today && (
            <line x1={x(today)} y1={y(current)} x2={x(eta > end ? end : eta)} y2={y(eta > end ? current * (1 - daysBetween(today, end) / daysBetween(today, eta)) : 0)}
              stroke="var(--brand-soft)" strokeWidth={2} strokeDasharray="2 5" strokeLinecap="round" />
          )}
          {deadline && deadline > today && (
            <>
              <line x1={x(today)} y1={y(current)} x2={x(deadline)} y2={y(0)} stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.8} />
              <line x1={x(deadline)} x2={x(deadline)} y1={pad.top} y2={y(0)} stroke="#fbbf24" strokeWidth={1} opacity={0.5} />
              <text x={x(deadline)} y={pad.top} dx={-4} dy="0.8em" textAnchor="end" className="fill-amber-300 text-[11px] font-bold">Prazo</text>
            </>
          )}
          <line x1={x(today)} x2={x(today)} y1={pad.top} y2={y(0)} stroke="rgba(255,255,255,0.18)" />
          <circle cx={x(today)} cy={y(current)} r={5} fill="var(--brand-soft)" stroke="var(--shell2)" strokeWidth={2} />
          <text x={pad.left} y={height - 8} className="fill-[var(--warm-muted-readable)] text-[11px]">{formatDay(start, today)}</text>
          <text x={x(today)} y={height - 8} textAnchor="middle" className="fill-[var(--w)] text-[11px] font-bold">Hoje</text>
          <text x={width - pad.right} y={height - 8} textAnchor="end" className="fill-[var(--warm-muted-readable)] text-[11px]">{formatDay(end, today)}</text>
          {hovered && (
            <g pointerEvents="none">
              <line x1={x(hovered.day)} x2={x(hovered.day)} y1={pad.top} y2={y(0)} stroke="rgba(255,255,255,0.35)" />
              <circle cx={x(hovered.day)} cy={y(hovered.pending)} r={4} fill="var(--w)" />
            </g>
          )}
          <rect x={pad.left} y={pad.top} width={x(today) - pad.left} height={plotH} fill="transparent"
            onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
      )}
      {hovered && (
        <div className="pointer-events-none absolute top-2 rounded-lg border border-white/[0.12] bg-shell-3 px-3 py-2 text-xs shadow-lg"
          style={{left: Math.min(Math.max(0, x(hovered.day) - 70), Math.max(0, width - 150))}}>
          <p className="font-bold text-apex-text">{formatDay(hovered.day, today)}</p>
          <p className="text-apex-readable"><span className="tabular-nums font-bold text-apex-text">{hovered.pending.toLocaleString('pt-BR')}</span> pendentes</p>
        </div>
      )}
    </div>
  );
}

interface DailyBarsProps {
  series: {day: string; audited: number}[];
  goal: number;
  color: string;
  yMax: number;
  today: string;
  label: string;
}

/** Audits per day for one curator, on the scale every curator shares, with the daily goal. */
export function DailyBars({series, goal, color, yMax, today, label}: DailyBarsProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const height = 96;
  const pad = {top: 8, bottom: 18};
  const plotH = height - pad.top - pad.bottom;
  const slot = width / Math.max(1, series.length);
  const barW = Math.max(2, slot - 2);
  const y = (v: number) => pad.top + plotH - (v / yMax) * plotH;
  const hovered = hover === null ? null : series[hover];

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={`${label}: questões auditadas por dia nos últimos ${series.length} dias${goal ? `, meta de ${goal} por dia` : ''}.`}
          onPointerLeave={() => setHover(null)}>
          <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.1)" />
          {series.map((d, i) => {
            const h = Math.max(0, y(0) - y(d.audited));
            const met = goal > 0 && d.audited >= goal;
            return (
              <g key={d.day} onPointerEnter={() => setHover(i)}>
                <rect x={i * slot} y={pad.top} width={slot} height={plotH} fill="transparent" />
                {d.audited > 0 && (
                  <path
                    d={`M${i * slot + 1},${y(0)}v${-Math.max(0, h - 2)}q0,-2 2,-2h${Math.max(0, barW - 4)}q2,0 2,2v${Math.max(0, h - 2)}z`}
                    fill={color} opacity={hover === null || hover === i ? (met || !goal ? 1 : 0.55) : 0.35}
                  />
                )}
              </g>
            );
          })}
          {goal > 0 && goal <= yMax && (
            <g pointerEvents="none">
              <line x1={0} x2={width} y1={y(goal)} y2={y(goal)} stroke="var(--w)" strokeWidth={1} strokeDasharray="3 4" opacity={0.6} />
              <text x={width} y={y(goal)} dy={-4} textAnchor="end" className="fill-[var(--w)] text-[10px] font-bold">meta {goal}</text>
            </g>
          )}
          <text x={0} y={height - 4} className="fill-[var(--warm-muted-readable)] text-[10px]">{formatDay(series[0].day, today)}</text>
          <text x={width} y={height - 4} textAnchor="end" className="fill-[var(--warm-muted-readable)] text-[10px]">hoje</text>
        </svg>
      )}
      {hovered && (
        <div className="pointer-events-none absolute -top-9 z-10 whitespace-nowrap rounded-lg border border-white/[0.12] bg-shell-3 px-2.5 py-1.5 text-xs shadow-lg"
          style={{left: Math.min(Math.max(0, hover! * slot - 50), Math.max(0, width - 130))}}>
          <span className="font-bold text-apex-text">{formatDay(hovered.day, today)}</span>
          <span className="text-apex-readable"> · <span className="tabular-nums font-bold text-apex-text">{hovered.audited}</span> auditadas</span>
        </div>
      )}
    </div>
  );
}
