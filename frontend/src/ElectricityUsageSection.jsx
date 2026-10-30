import PremiumSelect from './PremiumSelect.jsx';
import React, {useMemo, useState} from 'react';
import {BarChart3, ChevronDown, ChevronUp, Info, Plus, Save, X, Zap} from 'lucide-react';
import EnergyRecordsTable from './EnergyRecordsTable.jsx';
import './ElectricityUsageSection.css';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dateLabel = (month, opts = {month:'short', year:'2-digit'}) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month))) return String(month || '—');
  const [year, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en-PH', opts).format(new Date(year, m - 1, 1, 12));
};
const usageText = n => `${new Intl.NumberFormat('en-PH', {maximumFractionDigits:1}).format(Number(n) || 0)} kWh`;


function buildSmoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function UsageTrend({records, selected, onSelect}) {
  if (!records.length) return <div className="electricity-empty-graph"><BarChart3 size={31}/><strong>No electricity readings yet</strong><span>Record a monthly reading to start your consumption history.</span></div>;

  const values = records.map(r => Number(r.kwh) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = Math.max(1, max - min);
  const left = 56, top = 26, width = 800, lineHeight = 110, waveTop = 68, waveHeight = 78, timelineY = 214, monthLabelY = 192;
  const normalize = value => (value - min) / spread;
  const coords = records.map((r, i) => {
    const amount = Number(r.kwh) || 0;
    const ratio = normalize(amount);
    const x = left + (records.length === 1 ? width / 2 : i * width / Math.max(1, records.length - 1));
    const y = top + lineHeight * (0.82 - ratio * 0.64);
    const waveY = waveTop + waveHeight * (0.9 - ratio * 0.78);
    return {x, y, waveY, month: r.month, kwh: amount};
  });
  const linePath = buildSmoothPath(coords.map(({x, y}) => ({x, y})));
  const wavePoints = coords.map(({x, waveY}) => ({x, y: waveY}));
  const wavePath = `${buildSmoothPath(wavePoints)} L ${wavePoints.at(-1).x} ${waveTop + waveHeight + 26} L ${wavePoints[0].x} ${waveTop + waveHeight + 26} Z`;
  const selectedPoint = coords.find(point => point.month === selected) || coords.at(-1);

  return <div className="electricity-chart-wrap electricity-wave-card">
    <svg className="electricity-usage-svg electricity-wave-svg" viewBox="0 0 900 258" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={`Monthly electricity usage trend from ${dateLabel(records[0].month, {month:'long'})} through ${dateLabel(records.at(-1).month, {month:'long'})}. Select a month below for exact readings.`}>
      <defs>
        <linearGradient id="electricityWaveFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--electricity-wave)" stopOpacity="0.9"/>
          <stop offset="55%" stopColor="var(--electricity-wave)" stopOpacity="0.42"/>
          <stop offset="100%" stopColor="var(--electricity-wave)" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="electricityLineGlow" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--electricity-line)" stopOpacity="1"/>
          <stop offset="100%" stopColor="var(--electricity-line)" stopOpacity=".93"/>
        </linearGradient>
        <filter id="electricityWaveBlur" x="-15%" y="-35%" width="130%" height="190%">
          <feGaussianBlur stdDeviation="10"/>
        </filter>
        <filter id="electricityPointGlow" x="-120%" y="-120%" width="340%" height="340%">
          <feGaussianBlur stdDeviation="5" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      <text x="450" y="18" textAnchor="middle" className="electricity-svg-overline">MONTHLY ENERGY</text>
      <line x1={left} x2={left + width} y1={timelineY} y2={timelineY} className="electricity-timeline"/>

      <path d={wavePath} fill="url(#electricityWaveFill)" filter="url(#electricityWaveBlur)" className="electricity-wave-fill"/>
      <path d={wavePath} fill="url(#electricityWaveFill)" className="electricity-wave-fill electricity-wave-fill-solid"/>
      <path d={linePath} fill="none" stroke="url(#electricityLineGlow)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className="electricity-wave-line"/>

      {selectedPoint && <>
        <line x1={selectedPoint.x} x2={selectedPoint.x} y1={40} y2={selectedPoint.y + 10} className="electricity-selection-line"/>
        <text x={selectedPoint.x} y="34" textAnchor="middle" className="electricity-selected-value">{Math.round(selectedPoint.kwh)}</text>
      </>}

      {coords.map(point => {
        const isSelected = selectedPoint?.month === point.month;
        return <g key={point.month}>
          <circle cx={point.x} cy={point.y} r={isSelected ? 9 : 6.5} className={isSelected ? 'electricity-line-point electricity-line-point-selected' : 'electricity-line-point'} filter={isSelected ? 'url(#electricityPointGlow)' : undefined}><title>{`${dateLabel(point.month, {month:'long', year:'numeric'})}: ${usageText(point.kwh)}`}</title></circle>
          <text x={point.x} y={monthLabelY} textAnchor="middle" className={isSelected ? 'electricity-month-label electricity-month-label-selected' : 'electricity-month-label'}>{dateLabel(point.month, {month:'short'})}</text>
          <circle cx={point.x} cy={timelineY} r={isSelected ? 5 : 3.8} className={isSelected ? 'electricity-timeline-dot electricity-timeline-dot-selected' : 'electricity-timeline-dot'} />
        </g>;
      })}
    </svg>
    <div className="electricity-trend-footer">
      <span>Consumption in kWh</span>
      <span>{records.length} {records.length===1?'month':'months'} shown</span>
    </div>
    <div className="electricity-month-picker"><label htmlFor="electricity-inspected-month">Inspect a month</label>
      <PremiumSelect id="electricity-inspected-month" aria-label="Inspect electricity month" value={selected || records.at(-1).month} onChange={e=>onSelect(e.target.value)}>
        {records.map(r=><option key={r.month} value={r.month}>{dateLabel(r.month,{month:'long',year:'numeric'})}</option>)}
      </PremiumSelect>
    </div>
  </div>;
}

/** Display the existing Supabase-backed energy records alongside bills, without adding them to bill totals. */
export default function ElectricityUsageSection({records = [], run, formatAmount, formatMonth, currentMonth}) {
  const [range, setRange] = useState('12');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [form, setForm] = useState({month:currentMonth, kwh:'', cost:''});
  const sorted = useMemo(() => [...(Array.isArray(records)?records:[])]
    .filter(r => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(r.month)))
    .sort((a,b) => a.month.localeCompare(b.month)), [records]);
  const latest = sorted.at(-1), previous = sorted.at(-2);
  const delta = latest && previous ? Number(latest.kwh) - Number(previous.kwh) : null;
  const visible = range === 'all' ? sorted : sorted.slice(-Number(range));
  const inspected = visible.find(r => r.month === selectedMonth) || visible.at(-1);

  const saveReading = async (event) => {
    event.preventDefault();
    if (saving) return;
    const kwh = Number(form.kwh), cost = Number(form.cost);
    if (!form.month || !Number.isFinite(kwh) || !Number.isFinite(cost) || kwh < 0 || cost < 0) return;
    setSaving(true);
    try {
      await run('/energy','POST',{month:form.month,kwh,cost},'Electricity reading saved for the household.');
      setSelectedMonth(form.month);
      setFormOpen(false);
      setForm({month:currentMonth,kwh:'',cost:''});
    } catch { /* Shared run() shows a failure notification. Keep the form open. */ }
    finally { setSaving(false); }
  };

  return <section className="panel electricity-expenses-panel" aria-labelledby="electricity-expenses-title">
    <div className="electricity-section-top">
      <div>
        <span className="electricity-kicker"><Zap size={15}/> ELECTRICITY OVERVIEW</span>
        <h2 id="electricity-expenses-title">Electricity Usage &amp; History</h2>
        <p>Follow monthly electricity consumption alongside your household bills.</p>
      </div>
      <button type="button" className="btn btn-outline electricity-add-btn" onClick={()=>setFormOpen(x=>!x)} aria-expanded={formOpen}>
        {formOpen?<X size={16}/>:<Plus size={16}/>}<span>{formOpen?'Cancel':'Add monthly reading'}</span>
      </button>
    </div>

    {formOpen && <form className="electricity-entry-form" onSubmit={saveReading}>
      <div className="electricity-fields">
        <label>Billing month<input type="month" value={form.month} required onChange={e=>setForm(f=>({...f,month:e.target.value}))}/></label>
        <label>Usage (kWh)<input type="number" value={form.kwh} min="0" max="1000000" step="0.01" placeholder="e.g. 255.6" required onChange={e=>setForm(f=>({...f,kwh:e.target.value}))}/></label>
        <label>Recorded cost (₱)<input type="number" value={form.cost} min="0" max="100000000" step="0.01" placeholder="e.g. 2500" required onChange={e=>setForm(f=>({...f,cost:e.target.value}))}/></label>
      </div>
      <div className="electricity-form-actions"><span>Saving an existing month updates its reading.</span><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16}/>{saving?'Saving…':'Save reading'}</button></div>
    </form>}

    <div className="electricity-metrics">
      <div className="electricity-metric"><span>Latest monthly usage</span><strong>{latest?usageText(latest.kwh):'—'}</strong><small>{latest?dateLabel(latest.month,{month:'long',year:'numeric'}):'No readings recorded'}</small></div>
      <div className="electricity-metric"><span>Recorded electricity cost</span><strong>{latest?formatAmount(latest.cost):'—'}</strong><small>Manually entered for {latest?dateLabel(latest.month):'a billing month'}</small></div>
      <div className="electricity-metric"><span>Change from prior reading</span><strong className={delta==null?'':delta>0?'electricity-rise':'electricity-fall'}>{delta===null?'—':`${delta>0?'+':''}${usageText(delta)}`}</strong><small>{delta==null?'Needs at least 2 readings':delta>0?'Usage increased':delta<0?'Usage decreased':'No change'}</small></div>
    </div>

    <div className="electricity-trend-head">
      <div><strong>Consumption trend</strong><span>Based on monthly records</span></div>
      <label>Time period <PremiumSelect value={range} onChange={e=>setRange(e.target.value)} aria-label="Electricity usage chart time period">
        <option value="6">Last 6 readings</option><option value="12">Last 12 readings</option><option value="all">All recorded months</option>
      </PremiumSelect></label>
    </div>
    <UsageTrend records={visible} selected={inspected?.month} onSelect={setSelectedMonth}/>
    {inspected && <div className="electricity-inspected"><span><strong>{dateLabel(inspected.month,{month:'long',year:'numeric'})}</strong> <span>{usageText(inspected.kwh)}</span></span><span>Recorded cost: <strong>{formatAmount(inspected.cost)}</strong></span></div>}

    <div className="electricity-history-toggle">
      <button type="button" onClick={()=>setHistoryOpen(open=>!open)} aria-expanded={historyOpen} aria-controls="electricity-records-history">
        {historyOpen?<ChevronUp size={17}/>:<ChevronDown size={17}/>} {historyOpen?'Hide monthly records':'View monthly records'} <span>({sorted.length})</span>
      </button>
    </div>
    <div id="electricity-records-history" hidden={!historyOpen}>
      {historyOpen && <EnergyRecordsTable records={sorted} formatMonth={formatMonth} formatAmount={formatAmount}/>}
    </div>
    <p className="electricity-disclaimer"><Info size={16}/> These are manually recorded electricity readings, not live meter measurements. Recorded electricity costs are shown for reference and are <strong>not added to bill totals</strong>.</p>
  </section>;
}
