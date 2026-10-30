/** Pure client-side bill analytics using only the household-scoped /api/bootstrap records.
 * Months are based on bill DUE dates, not payment dates; "paid" is current status.
 * Never rounds bill amounts before aggregation. No extra requests or database writes.
 */
const VALID_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAME = new Intl.DateTimeFormat('en-PH', {month:'short',timeZone:'UTC'});

export function billType(bill) {
  const title = String(bill?.title || '').toLowerCase();
  const category = String(bill?.category || 'Other').trim() || 'Other';
  if (/\b(electric(?:ity)?|power)\b/.test(title)) return 'Electricity';
  if (/\b(water|sewer(?:age)?)\b/.test(title)) return 'Water';
  if (/\b(wifi|wi-fi|internet|broadband|fiber|fibre)\b/.test(title)) return 'Internet';
  if (/\b(lpg|gas)\b/.test(title)) return 'Gas';
  return category;
}

export function availableBillTypes(bills) {
  const types = new Set((Array.isArray(bills) ? bills : []).map(billType));
  const common = ['Electricity','Water','Internet','Gas','Groceries','Utilities','Education','Other'];
  return [...types].sort((a,b)=>{
    const ai=common.indexOf(a),bi=common.indexOf(b);
    if(ai>=0||bi>=0) return (ai<0?100:ai)-(bi<0?100:bi);
    return a.localeCompare(b);
  });
}

export function trailingMonths(anchor, count) {
  if (!VALID_MONTH.test(anchor) || ![6,12].includes(count)) return [];
  const [y,m]=anchor.split('-').map(Number);
  return Array.from({length:count}, (_,i)=>{
    const d=new Date(Date.UTC(y,m-count+i,1));
    const month=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
    return {month,label:MONTH_NAME.format(d),
      longLabel:new Intl.DateTimeFormat('en-PH',{month:'long',year:'numeric',timeZone:'UTC'}).format(d),
      paid:0,unpaid:0,count:0};
  });
}

export function monthlyBillSeries(bills,{anchor,months=6,type='all',status='all'}={}) {
  const rows=trailingMonths(anchor,months);
  const byMonth=new Map(rows.map(row=>[row.month,row]));
  for(const bill of (Array.isArray(bills)?bills:[])) {
    if(type!=='all' && billType(bill)!==type) continue;
    if(status!=='all' && bill.status!==status) continue;
    const due=typeof bill.due_date==='string'?bill.due_date:'';
    if(!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(due)) continue;
    const row=byMonth.get(due.slice(0,7));
    const amount=Number(bill.amount);
    if(!row || !Number.isFinite(amount) || amount<0 || !['paid','unpaid'].includes(bill.status)) continue;
    row[bill.status]+=amount;
    row.count+=1;
  }
  return rows.map(row=>({...row,total:row.paid+row.unpaid}));
}

/** Category comparison for one due month, respecting the selected payment status. */
export function monthBillCategoryBreakdown(bills,{month,status='all'}={}) {
  if(!VALID_MONTH.test(month||'')) return [];
  const rows=new Map();
  for(const bill of (Array.isArray(bills)?bills:[])) {
    if(String(bill?.due_date||'').slice(0,7)!==month)continue;
    if(status!=='all'&&bill?.status!==status)continue;
    if(!['paid','unpaid'].includes(bill?.status))continue;
    const amount=Number(bill.amount);
    if(!Number.isFinite(amount)||amount<0)continue;
    const category=billType(bill);
    if(!rows.has(category))rows.set(category,{category,paid:0,unpaid:0,count:0});
    const item=rows.get(category);
    item[bill.status]+=amount;
    item.count++;
  }
  return [...rows.values()].map(item=>({...item,total:item.paid+item.unpaid})).sort((a,b)=>b.total-a.total||a.category.localeCompare(b.category));
}
