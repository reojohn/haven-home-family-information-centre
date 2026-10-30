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

function UsageTrend({records, selected, onSelect}) {
  if (!records.length) return <div className="electricity-empty-graph"><BarChart3 size={31}/><strong>No electricity readings yet</strong><span>Record a monthly reading to start your consumption history.</span></div>;

  const values = records.map(r => Number(r.kwh) || 0);
  const peak = Math.max(1, ...values);
  const max = peak * 1.15;
  const left = 40, top = 24, width = 800, height = 186;
  const coords = records.map((r, i) => ({
    x: left + (records.length === 1 ? width / 2 : i * width / (records.length - 1)),
    y: top + height * (1 - clamp((Number(r.kwh)||0) / max, 0, 1)),
    month: r.month, kwh: Number(r.kwh)||0
  }));
  const line = coords.map(({x,y}) => `${x},${y}`).join(' ');
  const area = `${coords[0].x},${top + height} ${line} ${coords.at(-1).x},${top + height}`;
  const labelStep = Math.max(1, Math.ceil(records.length / 6));
  return <div className="electricity-chart-wrap">
    <svg className="electricity-usage-svg" viewBox="0 0 900 256" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label={`Monthly electricity usage trend from ${dateLabel(records[0].month)} through ${dateLabel(records.at(-1).month)}. Select a month below for exact readings.`}>
      <defs><linearGradient id="electricityAreaFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--electricity-accent)" stopOpacity=".3"/><stop offset="100%" stopColor="var(--electricity-accent)" stopOpacity=".015"/></linearGradient></defs>
      {[0, 0.5, 1].map((part,i) => <g key={part}>
        <line x1={left} x2={left+width} y1={top+height*part} y2={top+height*part} stroke="var(--electricity-grid)" strokeDasharray="5 6"/>
        <text x={left-12} y={top+height*part+4} textAnchor="end" fill="var(--muted)" fontSize="12">{Math.round(max * (1-part))}</text>
      </g>)}
      <polygon points={area} fill="url(#electricityAreaFill)"/>
      <polyline points={line} fill="none" stroke="var(--electricity-accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      {coords.map((p,i) => <circle key={p.month} cx={p.x} cy={p.y} r={selected === p.month ? 7 : 4} fill={selected === p.month?'var(--electricity-highlight)':'var(--electricity-accent)'} stroke="var(--surface)" strokeWidth="2" pointerEvents="none"><title>{`${dateLabel(p.month, {month:'long',year:'numeric'})}: ${usageText(p.kwh)}`}</title></circle>)}
      {coords.map((p,i) => (i%labelStep===0 || i===coords.length-1) && <text key={p.month} x={p.x} y="241" textAnchor="middle" fill="var(--muted)" fontSize="12">{dateLabel(p.month)}</text>)}
    </svg>
    <div className="electricity-trend-footer">
      <span>Consumption in kWh</span>
      <span>{records.length} {records.length===1?'month':'months'} shown</span>
    </div>
    <div className="electricity-month-picker"><label htmlFor="electricity-inspected-month">Inspect a month</label>
      <select id="electricity-inspected-month" value={selected || records.at(-1).month} onChange={e=>onSelect(e.target.value)}>
        {records.map(r=><option key={r.month} value={r.month}>{dateLabel(r.month,{month:'long',year:'numeric'})}</option>)}
      </select>
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
      <label>Time period <select value={range} onChange={e=>setRange(e.target.value)} aria-label="Electricity usage chart time period">
        <option value="6">Last 6 readings</option><option value="12">Last 12 readings</option><option value="all">All recorded months</option>
      </select></label>
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
