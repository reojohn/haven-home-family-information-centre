import PremiumSelect from './PremiumSelect.jsx';
import React, {useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowUpRight,Info} from 'lucide-react';
import {availableBillTypes,monthlyBillSeries,monthBillCategoryBreakdown} from './billAnalytics.js';

const php = value => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value)||0);
const localMonth = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;};

/** Source: authenticated household's bills from /api/bootstrap. No extra request or schema changes. */
export default function MonthlyBillsChart({bills=[],compact=false}) {
  const [period,setPeriod]=useState('6');
  const [year,setYear]=useState(String(new Date().getFullYear()));
  const [type,setType]=useState('all');
  const [status,setStatus]=useState('all');
  const [selectedMonth,setSelectedMonth]=useState('');
  const [hoveredMonth,setHoveredMonth]=useState('');
  const [compareCategories,setCompareCategories]=useState(false);
  const anchor=localMonth();
  const types=useMemo(()=>availableBillTypes(bills),[bills]);
  const safeType=type==='all'||types.includes(type)?type:'all';
  const months=compact||period==='6'?6:12;
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
  const viewWidth=compact?630:Math.max(700,months*68+80);
  const left=58,top=20,bottom=46,plotHeight=compact?147:195;
  const viewHeight=top+plotHeight+bottom;
  const barSpace=(viewWidth-left-20)/rows.length;
  const scale=Math.max(1,...rows.map(r=>r.total))*1.15;
  const baseline=top+plotHeight;
  const y=value=>baseline-value/scale*plotHeight;
  const reset=fn=>e=>{fn(e.target.value);setSelectedMonth('');};

  return <section className={`panel bill-analytics ${compact?'bill-analytics-compact':''}`} aria-labelledby={compact?'dashboard-bills-chart-title':'expenses-bills-chart-title'}>
    <div className="panel-top bill-analytics-heading"><div>
      <h2 id={compact?'dashboard-bills-chart-title':'expenses-bills-chart-title'}>{compact?'Monthly bills overview':'Monthly Bills Analytics'}</h2>
      <p>{compact?'Your household costs over the last six months':'Compare your household bills across months and payment statuses'}</p>
    </div>{compact&&<Link className="text-link" to="/expenses">View analytics <ArrowUpRight size={15}/></Link>}</div>
    {!compact&&<div className="bill-chart-filters">
      <label>Bill type<PremiumSelect aria-label="Filter bill type" value={safeType} onChange={reset(setType)}><option value="all">All bill types</option>{types.map(t=><option value={t} key={t}>{t}</option>)}</PremiumSelect></label>
      <label>Payment status<PremiumSelect aria-label="Filter payment status" value={status} onChange={reset(setStatus)}><option value="all">Paid + unpaid</option><option value="paid">Paid only</option><option value="unpaid">Unpaid only</option></PremiumSelect></label>
      <label>Time period<PremiumSelect aria-label="Filter months" value={period} onChange={e=>{setPeriod(e.target.value);setSelectedMonth('');}}><option value="6">Last 6 months</option><option value="12">Last 12 months</option><option value="year">Calendar year</option></PremiumSelect></label>
      {period==='year'&&<label>Year<PremiumSelect aria-label="Select year" value={year} onChange={e=>{setYear(e.target.value);setSelectedMonth('');}}>{years.map(y=><option key={y} value={y}>{y}</option>)}</PremiumSelect></label>}
    </div>}
    <div className="bill-chart-summary"><div><span>Total recorded in period</span><strong>{php(total)}</strong></div><div className="bill-chart-legend"><span><i className="bill-legend-dot paid"/>Paid {php(paid)}</span><span><i className="bill-legend-dot unpaid"/>Unpaid {php(unpaid)}</span></div></div>
    <div className="bill-chart-scroll" role="region" aria-label="Scrollable monthly bill chart" tabIndex={0}>
      <svg className="bill-chart-svg" style={{minWidth:compact?470:(months===12?780:540)}} viewBox={`0 0 ${viewWidth} ${viewHeight}`} role="group" aria-label={`Monthly bill amounts by due date: ${rows.map(r=>`${r.longLabel} ${php(r.total)}`).join('; ')}`}>
        {Array.from({length:5},(_,j)=>{const amount=scale*j/4,ty=y(amount);return <g key={j}><line className="bill-chart-grid" x1={left} x2={viewWidth-18} y1={ty} y2={ty}/><text className="bill-chart-axis" x={left-9} y={ty+4} textAnchor="end">{amount>=1000?`${(amount/1000).toFixed(1)}k`:Math.round(amount)}</text></g>;})}
        {rows.map((r,i)=>{
          const bw=barSpace*.54,bx=left+i*barSpace+barSpace*.23;
          const ph=r.paid/scale*plotHeight,uh=r.unpaid/scale*plotHeight;
          const chosen=r.month===selected?.month;
          const hovered=r.month===hoveredMonth;
          return <g key={r.month} className={`bill-chart-bar-group ${chosen?'is-selected':''} ${hovered?'is-hovered':''}`} role="button" tabIndex={0} aria-label={`${r.longLabel}: ${r.count} bills; ${php(r.paid)} paid; ${php(r.unpaid)} unpaid`} aria-pressed={chosen} onMouseEnter={()=>setHoveredMonth(r.month)} onMouseLeave={()=>setHoveredMonth('')} onFocus={()=>setHoveredMonth(r.month)} onBlur={()=>setHoveredMonth('')} onClick={()=>setSelectedMonth(r.month)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedMonth(r.month);}}}>
            {(chosen||hovered)&&<rect className="bill-chart-selected-band" x={bx-8} y={top} width={bw+16} height={plotHeight+19} rx="5"/>}
            <rect x={bx-7} y={top} width={bw+14} height={plotHeight+21} fill="transparent"/>
            {ph>0&&<rect className="bill-chart-paid" x={bx} y={baseline-ph} width={bw} height={ph} rx="3"/>}
            {uh>0&&<rect className="bill-chart-unpaid" x={bx} y={baseline-ph-uh} width={bw} height={uh} rx="3"/>}
            {!r.total&&<rect className="bill-chart-zero" x={bx} y={baseline-2} width={bw} height="2" rx="1"/>}
            <text className="bill-chart-month-label" x={bx+bw/2} y={baseline+22} textAnchor="middle">{r.label}</text>
            <title>{r.longLabel}: {php(r.total)} total ({php(r.paid)} paid, {php(r.unpaid)} unpaid)</title>
          </g>;
        })}
        {hovered&&(()=>{
          const index=rows.findIndex(r=>r.month===hovered.month);
          const bx=left+index*barSpace+barSpace*.23;
          const tx=Math.max(left+4,Math.min(viewWidth-204,bx+barSpace*.5-99));
          return <g className="bill-chart-hover-tooltip" pointerEvents="none" transform={`translate(${tx} ${top+7})`}>
            <rect width="198" height="95" rx="9" className="bill-chart-tooltip-box"/>
            <text x="11" y="19" className="bill-chart-tooltip-title">{hovered.longLabel}</text>
            <text x="11" y="39" className="bill-chart-tooltip-line">Total: {php(hovered.total)}</text>
            <text x="11" y="56" className="bill-chart-tooltip-line">Paid: {php(hovered.paid)}</text>
            <text x="11" y="73" className="bill-chart-tooltip-line">Unpaid: {php(hovered.unpaid)}</text>
            <text x="11" y="88" className="bill-chart-tooltip-caption">{hovered.count} {hovered.count===1?'bill':'bills'} · Click for details</text>
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
    <p className="bill-chart-note"><Info size={15}/> Chart uses bill <strong>due dates</strong>. Paid/unpaid reflects current recorded status, not a payment transaction.</p>
  </section>;
}
