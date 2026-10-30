import React, {useMemo,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {ChevronLeft,ChevronRight,ReceiptText,Search,X} from 'lucide-react';

/** Displays already household-scoped bills; changes only client-side search and pagination. */
export default function HouseholdBillsTable({bills=[],status='all',onAdd,formatAmount,formatDate,displayText,today}) {
  const [query,setQuery]=useState('');
  const [pageSize,setPageSize]=useState(10);
  const [page,setPage]=useState(1);
  const [sort,setSort]=useState('newest');
  const scrollRef=useRef(null);

  const rows=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase();
    return bills.filter(b=>{
      if(status!=='all'&&b.status!==status)return false;
      if(!q)return true;
      const fields=[displayText(b.title,b.is_demo,'Bill'),b.category,displayText(b.notes,b.is_demo,''),b.due_date,
        b.status,Number(b.amount).toFixed(2)];
      return fields.some(field=>String(field||'').toLocaleLowerCase().includes(q));
    }).sort((a,b)=>{
      const order=String(a.due_date||'').localeCompare(String(b.due_date||''));
      if(order!==0)return sort==='newest'?-order:order;
      return (Number(b.id)||0)-(Number(a.id)||0);
    });
  },[bills,query,status,sort,displayText]);

  const pageCount=Math.max(1,Math.ceil(rows.length/pageSize));
  const currentPage=Math.min(page,pageCount);
  const start=(currentPage-1)*pageSize;
  const visible=rows.slice(start,start+pageSize);
  const jump=(next)=>{
    setPage(Math.max(1,Math.min(pageCount,next)));
    if(scrollRef.current)scrollRef.current.scrollTop=0;
  };
  const resetPage=()=>{setPage(1);if(scrollRef.current)scrollRef.current.scrollTop=0;};

  return <div className="household-bills-table">
    <div className="household-bills-toolbar">
      <label className="household-bills-search">
        <Search size={18} aria-hidden="true"/>
        <span className="sr-only">Search household bills</span>
        <input type="search" value={query} placeholder="Search bill, category, or date..." aria-label="Search household bills" onChange={e=>{setQuery(e.target.value);resetPage();}}/>
        {query&&<button type="button" className="bill-search-clear" aria-label="Clear search" onClick={()=>{setQuery('');resetPage();}}><X size={16}/></button>}
      </label>
      <div className="household-bills-options">
        <label>Sort <select aria-label="Sort household bills" value={sort} onChange={e=>{setSort(e.target.value);resetPage();}}><option value="newest">Newest due</option><option value="oldest">Oldest due</option></select></label>
        <label>Rows <select aria-label="Rows per page" value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));resetPage();}}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></label>
      </div>
    </div>
    <div className="household-bills-results" role="status" aria-live="polite">
      {rows.length?`Showing ${start+1}–${Math.min(start+pageSize,rows.length)} of ${rows.length} matching bills`:`No bills match your current filters`}
      <span>{bills.length} recorded overall</span>
    </div>
    {rows.length?<>
      <div ref={scrollRef} className="table-scroll household-bills-scroll" role="region" aria-label="Scrollable household bills table" tabIndex={0}>
        <table className="data-table household-bills-data-table">
          <thead><tr><th scope="col">Bill</th><th scope="col">Due date</th><th scope="col">Amount</th><th scope="col">Status</th><th scope="col"><span className="sr-only">View bill</span></th></tr></thead>
          <tbody>{visible.map(b=><tr key={b.id}>
            <td><div className="table-name"><span className="table-icon"><ReceiptText size={17}/></span><div><strong>{displayText(b.title,b.is_demo,'Bill')}</strong><small>{b.category}</small></div></div></td>
            <td>{formatDate(b.due_date)}</td>
            <td><strong>{formatAmount(b.amount)}</strong></td>
            <td><span className={`bill-table-status ${b.status==='paid'?'is-paid':b.due_date<today?'is-overdue':'is-unpaid'}`}>{b.status==='paid'?'Paid':b.due_date<today?'Overdue':'Unpaid'}</span></td>
            <td><Link className="table-open" to={`/expenses/${b.id}`} aria-label={`View details for ${displayText(b.title,b.is_demo,'bill')}`}>Details <ChevronRight size={15}/></Link></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="household-bills-pagination" aria-label="Household bills pagination">
        <span>Page {currentPage} of {pageCount}</span>
        <div className="household-bills-pager-buttons">
          <button type="button" disabled={currentPage===1} onClick={()=>jump(currentPage-1)} aria-label="Previous page"><ChevronLeft size={17}/> Previous</button>
          <button type="button" disabled={currentPage===pageCount} onClick={()=>jump(currentPage+1)} aria-label="Next page">Next <ChevronRight size={17}/></button>
        </div>
      </div>
    </>:<div className="household-bills-no-results">
      <ReceiptText size={25}/><strong>{bills.length?'No matching bills':'No household bills yet'}</strong>
      <p>{bills.length?'Try another search or payment status.':'Add your first bill to begin tracking expenses.'}</p>
      {query&&<button type="button" className="bill-clear-filters" onClick={()=>{setQuery('');resetPage();}}>Clear search</button>}
      {!bills.length&&<button type="button" className="bill-clear-filters" onClick={onAdd}>Add a bill</button>}
    </div>}
  </div>;
}
