import PremiumSelect from './PremiumSelect.jsx';
import React, {useMemo, useRef, useState} from 'react';
import {ChevronLeft, ChevronRight, Search, X, Zap} from 'lucide-react';

/** Local UI-only filtering. Energy summary cards and graphs continue using all records. */
export default function EnergyRecordsTable({records = [], formatMonth, formatAmount}) {
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const scrollRef = useRef(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return records.filter((item) => {
      if (!term) return true;
      const month = String(item.month || '');
      const label = month ? formatMonth(`${month}-01`, {month: 'long', year: 'numeric'}) : '';
      const searchable = [month, label, `${item.kwh} kWh`, String(item.kwh), String(item.cost),
        formatAmount(item.cost), 'electricity'].join(' ').toLocaleLowerCase();
      return searchable.includes(term);
    }).sort((a,b) => {
      const order = String(a.month||'').localeCompare(String(b.month||''));
      if (order !== 0) return sort === 'newest' ? -order : order;
      return (Number(b.id)||0) - (Number(a.id)||0);
    });
  }, [records, search, sort, formatMonth, formatAmount]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const visible = filtered.slice(start, start + pageSize);
  const scrollToTop = () => { if (scrollRef.current) scrollRef.current.scrollTop = 0; };
  const updateFilter = (setter, value) => {setter(value); setPage(1); scrollToTop();};
  const goToPage = (next) => {setPage(Math.max(1, Math.min(totalPages, next))); scrollToTop();};

  return <div className="energy-records-table">
    <div className="household-bills-toolbar">
      <label className="household-bills-search">
        <Search size={18} aria-hidden="true" />
        <span className="energy-records-sr-only">Search energy records</span>
        <input type="search" value={search} placeholder="Search month, year, or amount..." aria-label="Search energy records"
          onChange={e => updateFilter(setSearch, e.target.value)} />
        {search && <button type="button" className="bill-search-clear" aria-label="Clear energy search"
          onClick={() => updateFilter(setSearch, '')}><X size={16} /></button>}
      </label>
      <div className="household-bills-options">
        <label>Sort <PremiumSelect aria-label="Sort monthly energy records" value={sort}
          onChange={e => updateFilter(setSort, e.target.value)}>
          <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
        </PremiumSelect></label>
        <label>Rows <PremiumSelect aria-label="Energy records per page" value={pageSize}
          onChange={e => updateFilter(setPageSize, Number(e.target.value))}>
          <option value="10">10</option><option value="20">20</option><option value="50">50</option>
        </PremiumSelect></label>
      </div>
    </div>
    <div className="household-bills-results" role="status" aria-live="polite">
      <span>{filtered.length
        ? `Showing ${start + 1}–${Math.min(start + pageSize, filtered.length)} of ${filtered.length} readings`
        : 'No readings match your search'}</span>
      <span>{records.length} months recorded overall</span>
    </div>
    {filtered.length ? <>
      <div ref={scrollRef} className="table-scroll household-bills-scroll energy-records-scroll"
        role="region" aria-label="Scrollable monthly energy records" tabIndex={0}>
        <table className="data-table household-bills-data-table energy-records-data-table">
          <thead><tr><th scope="col">Month</th><th scope="col">Consumption</th><th scope="col">Recorded cost</th></tr></thead>
          <tbody>{visible.map(item => <tr key={item.id ?? item.month}>
            <td>{formatMonth(`${item.month}-01`, {month:'long', year:'numeric'})}</td>
            <td><strong>{item.kwh} kWh</strong></td>
            <td>{formatAmount(item.cost)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="household-bills-pagination" aria-label="Energy records pagination">
        <span>Page {currentPage} of {totalPages}</span>
        <div className="household-bills-pager-buttons">
          <button type="button" disabled={currentPage === 1} aria-label="Previous energy records page"
            onClick={() => goToPage(currentPage - 1)}><ChevronLeft size={17}/> Previous</button>
          <button type="button" disabled={currentPage === totalPages} aria-label="Next energy records page"
            onClick={() => goToPage(currentPage + 1)}>Next <ChevronRight size={17}/></button>
        </div>
      </div>
    </> : <div className="household-bills-no-results">
      <Zap size={25} /><strong>No matching energy records</strong>
      <p>Try another month, year, or amount.</p>
      <button type="button" className="bill-clear-filters" onClick={() => updateFilter(setSearch, '')}>Clear search</button>
    </div>}
  </div>;
}
