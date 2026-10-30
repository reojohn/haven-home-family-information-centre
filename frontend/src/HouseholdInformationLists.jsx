import PremiumSelect from './PremiumSelect.jsx';
import React, {useMemo,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Search,X,Phone,Trash2,Megaphone,Plus} from 'lucide-react';
import './HouseholdInformationLists.css';

/* Both lists operate on already household-scoped data. No extra API reads or record changes. */
function RecordsFrame({kind,query,onQuery,filteredCount,total,pageSize,onPageSize,page,totalPages,onPage,scrollRef,children}) {
  const isAnnouncements=kind==='announcements';
  const label=isAnnouncements?'announcements':'contacts';
  const first=filteredCount?(page-1)*pageSize+1:0;
  const last=Math.min(page*pageSize,filteredCount);
  return <div className="hic-info-records">
    <label className="hic-info-search">
      <Search size={17} aria-hidden="true"/>
      <span className="sr-only">Search {label}</span>
      <input type="search" value={query} onChange={e=>onQuery(e.target.value)} placeholder={isAnnouncements?'Search announcements or messages...':'Search names, relationships, or numbers...'} aria-label={`Search ${label}`}/>
      {query&&<button type="button" className="hic-info-clear" onClick={()=>onQuery('')} aria-label={`Clear ${label} search`}><X size={15}/></button>}
    </label>
    <div className="hic-info-controls">
      <span aria-live="polite">{filteredCount?`Showing ${first}–${last} of ${filteredCount}`:'No matching records'}{query&&` · ${total} total`}</span>
      <label>Rows
        <PremiumSelect aria-label={`${label} per page`} value={pageSize} onChange={e=>onPageSize(Number(e.target.value))}>
          {[5,10,20].map(n=><option key={n} value={n}>{n}</option>)}
        </PremiumSelect>
      </label>
    </div>
    <div className="hic-info-scroll" ref={scrollRef} tabIndex={0} role="region" aria-label={`Scrollable ${label} list`}>
      {children}
    </div>
    <div className="hic-info-pagination">
      <span>Page {page} of {totalPages}</span>
      <div className="hic-info-pager">
        <button type="button" disabled={page<=1} onClick={()=>onPage(page-1)}><ChevronLeft size={15}/> Previous</button>
        <button type="button" disabled={page>=totalPages} onClick={()=>onPage(page+1)}>Next <ChevronRight size={15}/></button>
      </div>
    </div>
  </div>;
}
function useLocalRecords(rows,query,perPage,matcher){
  const filtered=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase();
    return q?rows.filter(row=>matcher(row).some(value=>String(value??'').toLocaleLowerCase().includes(q))):rows;
  },[rows,query,matcher]);
  return {filtered,pageCount:Math.max(1,Math.ceil(filtered.length/perPage))};
}

export function AnnouncementRecords({records=[],displayText,onAdd,onDelete}) {
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(5);
  const scrollRef=useRef(null);
  const matcher=React.useCallback(a=>[displayText(a.title,a.is_demo,'Announcement'),displayText(a.content,a.is_demo,''),a.posted_at], [displayText]);
  const {filtered,pageCount}=useLocalRecords(records,query,pageSize,matcher);
  const currentPage=Math.min(page,pageCount);
  const visible=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const resetScroll=()=>{if(scrollRef.current)scrollRef.current.scrollTop=0};
  const changeQuery=value=>{setQuery(value);setPage(1);resetScroll()};
  const changePageSize=value=>{setPageSize(value);setPage(1);resetScroll()};
  const changePage=value=>{setPage(value);resetScroll()};
  return <RecordsFrame kind="announcements" query={query} onQuery={changeQuery} filteredCount={filtered.length} total={records.length} pageSize={pageSize} onPageSize={changePageSize} page={currentPage} totalPages={pageCount} onPage={changePage} scrollRef={scrollRef}>
    {visible.length?<div className="announcement-list hic-info-announcements">{visible.map(a=><article className="announcement-card" key={a.id}>
      <div className="announcement-card-top">
        <div className="ann-icon"><Megaphone size={20}/></div>
        <div><span className="micro-label">HOUSEHOLD UPDATE</span><h3>{displayText(a.title,a.is_demo,'Announcement')}</h3><small>{new Intl.DateTimeFormat('en-PH',{dateStyle:'medium'}).format(new Date(a.posted_at))}</small></div>
        <button type="button" className="icon-button hic-info-delete" aria-label={`Remove announcement: ${displayText(a.title,a.is_demo,'Announcement')}`} onClick={()=>onDelete(a.id)}><Trash2 size={17}/></button>
      </div>
      <p>{displayText(a.content,a.is_demo)}</p>
    </article>)}</div>:<div className="hic-info-empty"><Megaphone size={25}/><strong>{query?'No matching announcements':'No announcements yet'}</strong><p>{query?'Try a different search term.':'Share an update with your family.'}</p>{!query&&<button type="button" onClick={onAdd}><Plus size={16}/> Post announcement</button>}{query&&<button type="button" onClick={()=>changeQuery('')}>Clear search</button>}</div>}
  </RecordsFrame>;
}

export function ContactRecords({records=[],displayText,onAdd,onDelete}) {
  const [query,setQuery]=useState('');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(10);
  const scrollRef=useRef(null);
  const matcher=React.useCallback(c=>[displayText(c.name,c.is_demo,'Contact'),displayText(c.relation,c.is_demo,'Family'),c.phone], [displayText]);
  const {filtered,pageCount}=useLocalRecords(records,query,pageSize,matcher);
  const currentPage=Math.min(page,pageCount);
  const visible=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
  const resetScroll=()=>{if(scrollRef.current)scrollRef.current.scrollTop=0};
  const changeQuery=value=>{setQuery(value);setPage(1);resetScroll()};
  const changePageSize=value=>{setPageSize(value);setPage(1);resetScroll()};
  const changePage=value=>{setPage(value);resetScroll()};
  return <RecordsFrame kind="contacts" query={query} onQuery={changeQuery} filteredCount={filtered.length} total={records.length} pageSize={pageSize} onPageSize={changePageSize} page={currentPage} totalPages={pageCount} onPage={changePage} scrollRef={scrollRef}>
    {visible.length?<div className="contact-list hic-info-contacts">{visible.map(c=><div className="contact-row" key={c.id}>
      <div className="contact-avatar">{displayText(c.name,c.is_demo,'C').slice(0,1)}</div>
      <div className="contact-text"><strong>{displayText(c.name,c.is_demo,'Contact')}</strong><span>{displayText(c.relation,c.is_demo,'Family')} · {c.phone}</span></div>
      <a className="icon-button" href={`tel:${String(c.phone||'').replace(/[^+\d]/g,'')}`} aria-label={`Call ${displayText(c.name,c.is_demo,'contact')}`} title="Call contact"><Phone size={17}/></a>
      <button type="button" className="icon-button hic-info-delete" aria-label={`Remove ${displayText(c.name,c.is_demo,'contact')}`} onClick={()=>onDelete(c.id)} title="Remove contact"><Trash2 size={17}/></button>
    </div>)}</div>:<div className="hic-info-empty"><Phone size={25}/><strong>{query?'No matching contacts':'No contacts saved'}</strong><p>{query?'Try searching by name, relationship, or phone number.':'Save important family or emergency numbers.'}</p>{!query&&<button type="button" onClick={onAdd}><Plus size={16}/> Add contact</button>}{query&&<button type="button" onClick={()=>changeQuery('')}>Clear search</button>}</div>}
  </RecordsFrame>;
}
