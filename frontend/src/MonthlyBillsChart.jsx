import PremiumSelect from './PremiumSelect.jsx';
import React, {useId,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowUpRight,Info} from 'lucide-react';
import {availableBillTypes,monthlyBillSeries,monthBillCategoryBreakdown} from './billAnalytics.js';
import './MonthlyBillsChart.css';

const php = value => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value)||0);
const localMonth = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};

/** Source: authenticated household's bills from /api/bootstrap. No extra request or schema changes. */
export default function MonthlyBillsChart({bills=[],compact=false}) {
  const [period,setPeriod]=useState('6');
  const [dashboardPeriod,setDashboardPeriod]=useState('monthly');
  const gradientBase=useId().replace(/:/g,'');
  const [year,setYear]=useState(String(new Date().getFullYear()));
  const [type,setType]=useState('all');
  const [status,setStatus]=useState('all');
  const [selectedMonth,setSelectedMonth]=useState('');
  const [hoveredMonth,setHoveredMonth]=useState('');
  const [compareCategories,setCompareCategories]=useState(false);
  const anchor=localMonth();
  const types=useMemo(()=>availableBillTypes(bills),[bills]);
  const safeType=type==='all'||types.includes(type)?type:'all';
  // Compact chart: Monthly = trailing 6 months; Yearly = trailing 12 months.
  // The full Expenses chart retains its existing period and year filters.
  const months=compact?(dashboardPeriod==='yearly'?12:6):(period==='6'?6:12);
  const endMonth=!compact&&period==='year'?`${year}-12`:anchor;
  const years=useMemo(()=>[...new Set([anchor.slice(0,4),...(bills||[]).map(b=>String(b.due_date||'').slice(0,4)).filter(v=>/^\d{4}$/.test(v))])].sort((a,b)=>b.localeCompare(a)),[bills,anchor]);
  const rows=useMemo(()=>monthlyBillSeries(bills,{anchor:endMonth,months,type:compact?'all':safeType,status:compact?'all':status}),[bills,endMonth,months,safeType,status,compact]);
  const selected=rows.find(x=>x.month===selectedMonth)||[...rows].reverse().find(x=>x.count>0)||rows.at(-1);
  const total=rows.reduce((sum,r)=>sum+r.total,0);
  const paid=rows.reduce((sum,r)=>sum+r.paid,0);
  const unpaid=rows.reduce((sum,r)=>sum+r.unpaid,0);
  const hasBills=rows.some(r=>r.count>0);
  const hovered=rows.find(r=>r.month===hoveredMonth);
  const categories=useMemo(()=>monthBillCategoryBreakdown(bills,{month:selected?.month,status}),[bills,selected?.month,status]);
  const categoryMax=Math.max(1,...categories.map(r=>r.total));
  const viewWidth=Math.max(compact?700:780,months*71+90);
  const left=57,top=30,bottom=40,plotHeight=200;
  const viewHeight=top+plotHeight+bottom;
  const barSpace=(viewWidth-left-22)/rows.length;
  // Round the vertical axis to clean monetary ticks rather than arbitrary decimals.
  const peak=Math.max(1,...rows.map(r=>r.total));
  const rawStep=peak/4;
  const order=10**Math.floor(Math.log10(rawStep));
  const tickStep=([1,2,2.5,5,10].find(n=>n*order>=rawStep)||10)*order;
  const scale=tickStep*4;
  const baseline=top+plotHeight;
  const y=value=>baseline-value/scale*plotHeight;
  const formatAxis=value=>value>=1000000?`${+(value/1000000).toFixed(1)}m`:value>=1000?`${+(value/1000).toFixed(1)}k`:`${+value.toFixed(2)}`;
  const reset=fn=>e=>{fn(e.target.value);setSelectedMonth('');};

  return <section className={`panel bill-analytics bill-analytics-cinematic ${compact?'bill-analytics-compact':''}`} aria-labelledby={compact?'dashboard-bills-chart-title':'expenses-bills-chart-title'}>
    <div className="panel-top bill-analytics-heading"><div>
      <h2 id={compact?'dashboard-bills-chart-title':'expenses-bills-chart-title'}>{compact?'Monthly bills overview':'Monthly Bills Analytics'}</h2>
      <p>{compact?`Your household bills across the last ${months} months`:'Compare your household bills across months and payment statuses'}</p>
    </div>{compact&&<div className="bill-chart-heading-actions">
      <div className="bill-chart-period-toggle" role="group" aria-label="Monthly bills chart time range">
        <button type="button" className={dashboardPeriod==='monthly'?'is-active':''} aria-pressed={dashboardPeriod==='monthly'} onClick={()=>{setDashboardPeriod('monthly');setSelectedMonth('');setHoveredMonth('');}}>Monthly</button>
        <button type="button" className={dashboardPeriod==='yearly'?'is-active':''} aria-pressed={dashboardPeriod==='yearly'} onClick={()=>{setDashboardPeriod('yearly');setSelectedMonth('');setHoveredMonth('');}}>Yearly</button>
      </div>
      <Link className="text-link bill-chart-analytics-link" to="/expenses">View analytics <ArrowUpRight size={15}/></Link>
    </div>}</div>
    {!compact&&<div className="bill-chart-filters">
      <label>Bill type<PremiumSelect aria-label="Filter bill type" value={safeType} onChange={reset(setType)}><option value="all">All bill types</option>{types.map(t=><option value={t} key={t}>{t}</option>)}</PremiumSelect></label>
      <label>Payment status<PremiumSelect aria-label="Filter payment status" value={status} onChange={reset(setStatus)}><option value="all">Paid + unpaid</option><option value="paid">Paid only</option><option value="unpaid">Unpaid only</option></PremiumSelect></label>
      <label>Time period<PremiumSelect aria-label="Filter months" value={period} onChange={e=>{setPeriod(e.target.value);setSelectedMonth('');}}><option value="6">Last 6 months</option><option value="12">Last 12 months</option><option value="year">Calendar year</option></PremiumSelect></label>
      {period==='year'&&<label>Year<PremiumSelect aria-label="Select year" value={year} onChange={e=>{setYear(e.target.value);setSelectedMonth('');}}>{years.map(y=><option key={y} value={y}>{y}</option>)}</PremiumSelect></label>}
    </div>}
    <div className="bill-chart-summary"><div><span>Total recorded in period</span><strong>{php(total)}</strong></div><div className="bill-chart-legend"><span><i className="bill-legend-dot paid"/>Paid {php(paid)}</span><span><i className="bill-legend-dot unpaid"/>Unpaid {php(unpaid)}</span></div></div>
    <div className="bill-chart-scroll" role="region" aria-label="Scrollable monthly bill chart" tabIndex={0}>
      <svg className="bill-chart-svg" style={{minWidth:compact?(months===12?750:470):(months===12?780:540)}} viewBox={`0 0 ${viewWidth} ${viewHeight}`} role="group" aria-label={`Monthly bill totals by due date: ${rows.map(r=>`${r.longLabel} ${php(r.total)}`).join('; ')}`}>
        <defs>
          <linearGradient id={`${gradientBase}-idle`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" className="bill-chart-idle-top"/><stop offset="55%" className="bill-chart-idle-middle"/><stop offset="100%" className="bill-chart-idle-bottom"/>
          </linearGradient>
          <linearGradient id={`${gradientBase}-active`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#15c58a"/><stop offset="32%" stopColor="#48d7a1"/><stop offset="68%" stopColor="#a4e9cc"/><stop offset="100%" stopColor="#effaf4"/>
          </linearGradient>
        </defs>
        {Array.from({length:5},(_,j)=>{const amount=tickStep*j,ty=y(amount);return <g key={j}><line className="bill-chart-grid" x1={left} x2={viewWidth-18} y1={ty} y2={ty}/><text className="bill-chart-axis" x={left-12} y={ty+4} textAnchor="end">{formatAxis(amount)}</text></g>;})}
        {rows.map((r,i)=>{
          const bw=Math.min(70,barSpace*.59),bx=left+i*barSpace+(barSpace-bw)/2;
          const h=r.total/scale*plotHeight;
          const active=r.month===(hoveredMonth||selected?.month);
          const chosen=r.month===selected?.month;
          return <g key={r.month} className={`bill-chart-bar-group ${chosen?'is-selected':''} ${active?'is-hovered':''}`} role="button" tabIndex={0} aria-label={`${r.longLabel}: ${r.count} bills; total ${php(r.total)}; ${php(r.paid)} paid; ${php(r.unpaid)} unpaid`} aria-pressed={chosen} onMouseEnter={()=>setHoveredMonth(r.month)} onMouseLeave={()=>setHoveredMonth('')} onFocus={()=>setHoveredMonth(r.month)} onBlur={()=>setHoveredMonth('')} onClick={()=>setSelectedMonth(r.month)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedMonth(r.month);}}}>
            <rect className="bill-chart-hit-target" x={left+i*barSpace} y={top-8} width={barSpace} height={plotHeight+36}/>
            {r.total>0&&<rect className="bill-chart-column" x={bx} y={baseline-h} width={bw} height={h} rx={Math.min(9,h/2)} fill={`url(#${gradientBase}-${active?'active':'idle'})`}/>}
            {!r.total&&<rect className="bill-chart-zero" x={bx+4} y={baseline-2} width={bw-8} height="2" rx="1"/>}
            {active&&r.total>0&&<g className="bill-chart-highlight-point"><circle cx={bx+bw/2} cy={baseline-h+3} r="11" className="bill-chart-marker-outer"/><circle cx={bx+bw/2} cy={baseline-h+3} r="6.5" className="bill-chart-marker-inner"/></g>}
            <text className="bill-chart-month-label" x={bx+bw/2} y={baseline+23} textAnchor="middle">{r.label}</text>
            <title>{r.longLabel}: {php(r.total)} total ({php(r.paid)} paid, {php(r.unpaid)} unpaid)</title>
          </g>;
        })}
        {hovered&&(()=>{
          const index=rows.findIndex(r=>r.month===hovered.month);
          const bw=Math.min(70,barSpace*.59);
          const bx=left+index*barSpace+(barSpace-bw)/2;
          const tooltipWidth=187;
          // Place the tooltip beside the highlighted column without clipping either edge.
          const tx=bx+bw+12+tooltipWidth<=viewWidth-9?bx+bw+12:Math.max(left+6,bx-tooltipWidth-12);
          const ty=Math.max(10,Math.min(95,y(hovered.total)-15));
          return <g className="bill-chart-hover-tooltip" pointerEvents="none" transform={`translate(${tx} ${ty})`}>
            <rect width={tooltipWidth} height="97" rx="12" className="bill-chart-tooltip-box"/>
            <text x="12" y="20" className="bill-chart-tooltip-title">{hovered.longLabel}</text>
            <text x="12" y="42" className="bill-chart-tooltip-line">Total<tspan x="176" textAnchor="end">{php(hovered.total)}</tspan></text>
            <text x="12" y="59" className="bill-chart-tooltip-line">Paid<tspan x="176" textAnchor="end">{php(hovered.paid)}</tspan></text>
            <text x="12" y="76" className="bill-chart-tooltip-line">Unpaid<tspan x="176" textAnchor="end">{php(hovered.unpaid)}</tspan></text>
            <text x="12" y="90" className="bill-chart-tooltip-caption">{hovered.count} {hovered.count===1?'bill':'bills'} · Select for details</text>
          </g>;
        })()}
      </svg>
    </div>
    <div className="bill-chart-detail" aria-live="polite"><strong>{selected?.longLabel}</strong><span>{selected?.count||0} {(selected?.count||0)===1?'bill':'bills'} · {php(selected?.total||0)}{compact?'':` · Paid ${php(selected?.paid||0)} · Unpaid ${php(selected?.unpaid||0)}`}</span></div>
    {!compact&&<div className="bill-chart-category-section">
      <div className="bill-chart-category-header"><div><strong>Category comparison</strong><p>All bill types due in {selected?.longLabel||'the selected month'}; respects payment status.</p></div>
        <button type="button" className="bill-chart-compare-button" aria-expanded={compareCategories} onClick={()=>setCompareCategories(v=>!v)}>{compareCategories?'Hide comparison':'Compare categories'}</button>
      </div>
      {compareCategories&&(categories.length?<div className="bill-chart-category-list" aria-label={`Bill category comparison for ${selected?.longLabel}`}>
        {categories.map(c=><div className="bill-chart-category-row" key={c.category}>
          <div className="bill-chart-category-info"><strong>{c.category}</strong><span>{php(c.total)} · {c.count} {c.count===1?'bill':'bills'}</span></div>
          <div className="bill-chart-category-track" role="img" aria-label={`${c.category}: ${php(c.paid)} paid, ${php(c.unpaid)} unpaid`}>
            {c.paid>0&&<span className="bill-chart-category-paid" style={{width:`${c.paid/categoryMax*100}%`}}/>}
            {c.unpaid>0&&<span className="bill-chart-category-unpaid" style={{width:`${c.unpaid/categoryMax*100}%`}}/>}
          </div>
        </div>)}
      </div>:<p className="bill-chart-empty">No bills for this month and payment filter.</p>)}
    </div>}
    {!hasBills&&<p className="bill-chart-empty">No bills due within the selected period and filters.</p>}
    <p className="bill-chart-note"><Info size={15}/> Bars show monthly bill totals by <strong>due date</strong>. Hover or select a month to see paid/unpaid amounts. Status reflects the recorded bill, not a payment transaction.</p>
  </section>;
}
