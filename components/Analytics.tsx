import React, { useMemo, useState } from 'react';
import { Download, BarChart3, ShieldAlert, CircleCheck, CalendarDays, Info } from 'lucide-react';
import { Inspection, Site, downloadReport, isActive, risk } from '../types';

type Props = { items: Inspection[]; sites: Site[] };
type Range = 'all' | '7' | '30' | '90';
type Source = 'all' | 'sample' | 'recorded';

const pct = (n: number, d: number) => d === 0 ? '—' : `${Math.round((n / d) * 100)}%`;
const average = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
const dayKey = (date: Date) => { const d = new Date(date); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const labelDay = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const Metric: React.FC<{ label: string; value: string | number; note: string; icon: React.ReactNode }> = ({ label, value, note, icon }) => (
  <div className="card metric bg-base-200 border border-base-300">
    <div className="flex items-center justify-between text-base-content/60"><span className="text-xs">{label}</span><span className="opacity-70">{icon}</span></div>
    <strong className="metric-number">{value}</strong>
    <span className="text-[10px] leading-4 text-base-content/50">{note}</span>
  </div>
);

const Empty: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className="empty text-base-content/50"><Info size={18} className="opacity-60" /><span>{children}</span></div>;

const TrendChart: React.FC<{ items: Inspection[]; days: number }> = ({ items, days }) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const points = Array.from({ length: days }, (_, index) => { const date = new Date(today); date.setDate(today.getDate() - (days - 1 - index)); const key = dayKey(date); const rows = items.filter(i => dayKey(new Date(i.created)) === key); const assessed=rows.filter(i=>i.status!=='Needs review'); return { key, count: rows.length, riskCount:assessed.length, mean: assessed.length ? average(assessed.map(i => i.score)) : 0 }; });
  const plotted = points.filter(p => p.count > 0); const maxCount = Math.max(1, ...points.map(p => p.count));
  const width = 760, height = 240, left = 58, right = 58, top = 30, bottom = 46, plotW = width - left - right, plotH = height - top - bottom;
  const x = (index: number) => left + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
  const yCount = (value: number) => top + plotH - (value / maxCount) * plotH;
  const yRisk = (value: number) => top + plotH - (value / 100) * plotH;
  const riskSegments = points.slice(1).flatMap((p, index) => { const previous = points[index]; return previous.riskCount > 0 && p.riskCount > 0 ? [`${x(index)},${yRisk(previous.mean)} ${x(index + 1)},${yRisk(p.mean)}`] : []; });
  return <div className="space-y-3">
    {plotted.length === 0 ? <Empty>No inspections in the selected recent period.</Empty> : <>
      <div className="flex flex-wrap items-center gap-4 text-[10px] text-base-content/60"><span><i className="inline-block h-2 w-2 rounded-sm bg-primary mr-1" />Inspections (count)</span><span><i className="inline-block h-2 w-2 rounded-full bg-secondary mr-1" />Mean original risk score</span></div>
      <div className="w-full overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="min-w-[540px] w-full" role="img" aria-label={`Daily inspection counts and mean original risk for the last ${days} days`}>
        {[0, .5, 1].map(t => <g key={t}><line x1={left} x2={width - right} y1={top + plotH * t} y2={top + plotH * t} stroke="currentColor" opacity=".12" /><text x={left - 8} y={top + plotH * t + 4} textAnchor="end" fontSize="9" fill="currentColor" opacity=".5">{Math.round(maxCount * (1 - t))}</text><text x={width - right + 8} y={top + plotH * t + 4} textAnchor="start" fontSize="9" fill="currentColor" opacity=".5">{Math.round(100 - t * 100)}</text></g>)}
        <text x={left} y={13} textAnchor="start" fontSize="9" fill="currentColor" opacity=".6">Inspections (count)</text><text x={width - right} y={13} textAnchor="end" fontSize="9" fill="currentColor" opacity=".6">Original risk (0–100)</text>
        {points.map((p, i) => <rect key={`bar-${p.key}`} x={x(i) - Math.max(2, plotW / points.length * .22)} y={yCount(p.count)} width={Math.max(4, plotW / points.length * .44)} height={top + plotH - yCount(p.count)} rx="2" className="fill-primary" opacity=".8" />)}
        {riskSegments.map((segment, i) => <polyline key={`risk-segment-${i}`} points={segment} fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5 3" className="text-secondary" />)}
        {points.map((p, i) => <g key={p.key}><circle cx={x(i)} cy={yRisk(p.mean)} r={p.riskCount ? 3 : 0} className="fill-secondary" />{(i === 0 || i === points.length - 1 || i % Math.max(1, Math.floor(points.length / 4)) === 0) && <text x={x(i)} y={height - 12} textAnchor="middle" fontSize="9" fill="currentColor" opacity=".55">{labelDay(p.key)}</text>}</g>)}
      </svg></div>
    </>}
    <p className="text-[10px] text-base-content/50">Bars show daily inspection counts; dots and dashed segments show mean original risk on days with assessed records. Needs-review records are excluded from risk means, not from counts. Closure does not rewrite risk.</p>
  </div>;
};

export const Analytics: React.FC<Props> = ({ items, sites }) => {
  const [range, setRange] = useState<Range>('all');
  const [source, setSource] = useState<Source>('all');
  const now = Date.now();
  const filtered = useMemo(() => items.filter(item => {
    const sourceMatch = source === 'all' || (source === 'sample' ? item.demo : !item.demo);
    const age = now - new Date(item.created).getTime();
    const rangeMatch = range === 'all' || (age >= -86400000 && age <= Number(range) * 86400000);
    return sourceMatch && rangeMatch;
  }), [items, range, source, now]);
  const needsReview = filtered.filter(i => i.score === 0 && i.status === 'Needs review');
  const scored = filtered.filter(i => i.status !== 'Needs review');
  const violationRecords = filtered.filter(i => i.score > 0 && i.status !== 'Compliant');
  const active = filtered.filter(i => isActive(i)).length;
  const closure = violationRecords.filter(i => i.status === 'Resolved').length;
  const mean = average(scored.map(i => i.score));
  const bands = [{ name: 'Low', min: 1, max: 29, cls: 'badge-success' }, { name: 'Medium', min: 30, max: 59, cls: 'badge-warning' }, { name: 'High', min: 60, max: 79, cls: 'badge-error' }, { name: 'Critical', min: 80, max: 100, cls: 'badge-error' }];
  const siteRows = sites.map(site => { const rows = filtered.filter(i => i.site === site.id); const scoredRows = rows.filter(i => i.status !== 'Needs review'); const open = scoredRows.filter(isActive); return { site, count: rows.length, scoredCount: scoredRows.length, mean: average(scoredRows.map(i => i.score)), maxOpen: open.length ? Math.max(...open.map(i => i.score)) : null }; }).filter(row => row.count);
  const recentDays = range === '7' ? 7 : 14;
  return <div className="section-stack">
    <div className="toolbar card bg-base-200 border border-base-300 p-3">
      <div className="flex items-center gap-2 text-xs font-medium"><CalendarDays size={15} className="opacity-60" /> Analytics scope</div>
      <select className="select select-bordered select-sm" aria-label="Date range" value={range} onChange={e => setRange(e.target.value as Range)}><option value="all">All dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>
      <select className="select select-bordered select-sm" aria-label="Data source" value={source} onChange={e => setSource(e.target.value as Source)}><option value="all">All sources</option><option value="sample">Sample data</option><option value="recorded">Recorded inspections</option></select>
      <button className="btn btn-outline btn-sm ml-auto" onClick={() => downloadReport(filtered, sites)}><Download size={15} />Export filtered CSV</button>
    </div>
    <p className="text-[10px] text-base-content/50">Showing {filtered.length} inspection record{filtered.length === 1 ? '' : 's'} · Sample data is illustrative; recorded inspections may include YOLO detections or other review sources. A zero detection is not proof of compliance.</p>
    <div className="metric-grid"><Metric label="Inspections" value={filtered.length} note="Records in this scope" icon={<BarChart3 size={16} />} /><Metric label="Mean original risk" value={scored.length ? Math.round(mean) : '—'} note={`Score / 100; ${scored.length} scored record${scored.length === 1 ? '' : 's'}; retained after closure`} icon={<ShieldAlert size={16} />} /><Metric label="Unresolved" value={active} note="Open, in progress, awaiting verification, or needs review" icon={<ShieldAlert size={16} />} /><Metric label="Closure rate" value={pct(closure, violationRecords.length)} note={`Resolved / ${violationRecords.length} scored violation record${violationRecords.length === 1 ? '' : 's'}; Compliant and zero-score review records excluded`} icon={<CircleCheck size={16} />} /></div>
    <div className="overview-grid">
      <section className="card panel bg-base-200 border border-base-300"><div className="panel-heading"><div><h3>Original risk bands</h3><p>Scores are not lowered when records close. Zero-score needs-review records do not establish low safety risk.</p></div><span className="badge badge-outline">{scored.length} scored · {needsReview.length} needs review</span></div>{scored.length || needsReview.length ? <div className="space-y-3 px-6 pb-5">{bands.map(b => { const count = scored.filter(i => i.score >= b.min && i.score <= b.max).length; return <div key={b.name} className="flex items-center gap-3 text-xs"><span className={`badge ${b.cls} w-20`}>{b.name}</span><progress className="progress progress-primary flex-1" value={count} max={scored.length || 1} /><strong className="w-8 text-right">{count}</strong></div>; })}{needsReview.length > 0 && <div className="flex items-center gap-3 text-xs"><span className="badge badge-outline w-20">Review</span><div className="flex-1 text-base-content/60">Zero-score needs review (not risk-banded)</div><strong className="w-8 text-right">{needsReview.length}</strong></div>}<p className="text-[10px] text-base-content/50">Risk-band percentages use {scored.length} scored record{scored.length === 1 ? '' : 's'}; needs-review records are reported separately.</p></div> : <Empty>No records match this scope.</Empty>}</section>
      <section className="card panel bg-base-200 border border-base-300"><div className="panel-heading"><div><h3>Detection totals</h3><p>Counts of findings, not unique workers.</p></div></div>{filtered.length ? <div className="grid grid-cols-2 gap-3 px-6 pb-5"><div className="rounded-lg bg-base-300 p-4"><span className="text-[10px] text-base-content/60">Missing helmets</span><strong className="mt-2 block text-2xl">{filtered.reduce((n, i) => n + i.helmets, 0)}</strong><span className="text-[10px] text-base-content/50">detections</span></div><div className="rounded-lg bg-base-300 p-4"><span className="text-[10px] text-base-content/60">Missing vests</span><strong className="mt-2 block text-2xl">{filtered.reduce((n, i) => n + i.vests, 0)}</strong><span className="text-[10px] text-base-content/50">detections</span></div></div> : <Empty>No detection totals to show.</Empty>}</section>
    </div>
    <section className="card panel bg-base-200 border border-base-300"><div className="panel-heading"><div><h3>Risk by construction site</h3><p>Original mean across records and maximum currently open risk.</p></div></div>{siteRows.length ? <div className="overflow-x-auto"><table className="table table-sm"><thead><tr><th>Site</th><th>Records</th><th>Original mean</th><th>Max open risk</th></tr></thead><tbody>{siteRows.map(r => <tr key={r.site.id}><td><strong>{r.site.name}</strong><small className="block text-base-content/50">{r.site.location}</small></td><td>{r.count}</td><td>{r.scoredCount ? <>{Math.round(r.mean)}/100 <span className={`badge badge-sm ${r.mean >= 60 ? 'badge-error' : r.mean >= 30 ? 'badge-warning' : 'badge-success'}`}>{risk(r.mean)}</span></> : <span className="text-base-content/50">No scored records</span>}</td><td>{r.maxOpen === null ? <span className="text-base-content/50">No assessed open risk</span> : <strong>{r.maxOpen}/100</strong>}</td></tr>)}</tbody></table></div> : <Empty>No site records match this scope.</Empty>}</section>
    <section className="card panel bg-base-200 border border-base-300"><div className="panel-heading"><div><h3>Recent inspection trend</h3><p>Daily activity and mean original risk · last {recentDays} days</p></div></div><div className="px-5 pb-4"><TrendChart items={filtered} days={recentDays} /></div></section>
  </div>;
};
