import React, {useEffect, useRef, useState} from 'react';
import {CalendarDays, ChevronLeft, ChevronRight, ArrowUpRight} from 'lucide-react';
import {Link} from 'react-router-dom';
import './TopbarCalendar.css';

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;
const manilaDate = () => {
  // Keep the navbar's day in sync with the clock's Asia/Manila time zone.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type) => Number(parts.find((part) => part.type === type)?.value);
  return isoDate(pick('year'), pick('month'), pick('day'));
};
const localDate = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 12);
};
const longDate = (iso) => new Intl.DateTimeFormat('en-PH', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
}).format(localDate(iso));
const navDate = (iso) => new Intl.DateTimeFormat('en-PH', {
  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
}).format(localDate(iso));
const monthHeading = (year, month) => new Intl.DateTimeFormat('en-PH', {
  month: 'long', year: 'numeric',
}).format(new Date(year, month - 1, 1, 12));

// Monday-first dates, including softly dimmed days belonging to adjacent months.
export function buildTopbarMonth(year, month) {
  const offset = (new Date(year, month - 1, 1, 12).getDay() + 6) % 7;
  const lastDay = new Date(year, month, 0, 12).getDate();
  const slots = Math.ceil((offset + lastDay) / 7) * 7;
  return Array.from({length: slots}, (_, index) => {
    const date = new Date(year, month - 1, index - offset + 1, 12);
    const otherYear = date.getFullYear();
    const otherMonth = date.getMonth() + 1;
    return {
      iso: isoDate(otherYear, otherMonth, date.getDate()),
      day: date.getDate(),
      inMonth: otherYear === year && otherMonth === month,
    };
  });
}

export default function TopbarCalendar() {
  const [today, setToday] = useState(manilaDate);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(manilaDate);
  const [visibleMonth, setVisibleMonth] = useState(() => manilaDate().slice(0, 7));
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const gridRef = useRef(null);
  const [year, month] = visibleMonth.split('-').map(Number);
  const days = buildTopbarMonth(year, month);

  useEffect(() => {
    const syncToday = () => setToday(manilaDate());
    const interval = window.setInterval(syncToday, 60_000);
    document.addEventListener('visibilitychange', syncToday);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', syncToday);
    };
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Focus the selected day when possible, otherwise the first day of the month.
    const choice = gridRef.current?.querySelector('.haven-nav-calendar-day[aria-pressed="true"]')
      || gridRef.current?.querySelector('.haven-nav-calendar-day:not(.outside-month)');
    choice?.focus({preventScroll: true});
  }, [open]);

  const shift = (delta) => {
    const target = new Date(year, month - 1 + delta, 1, 12);
    setVisibleMonth(`${target.getFullYear()}-${pad(target.getMonth() + 1)}`);
  };
  const choose = (iso) => {
    setSelected(iso);
    setVisibleMonth(iso.slice(0, 7));
  };
  const resetToday = () => {
    const current = manilaDate();
    setToday(current);
    setSelected(current);
    setVisibleMonth(current.slice(0, 7));
  };
  const toggle = () => {
    if (!open) {
      const current = manilaDate();
      setToday(current);
      setSelected(current);
      setVisibleMonth(current.slice(0, 7));
    }
    setOpen((previous) => !previous);
  };

  return <div className="topbar-calendar" ref={rootRef}>
    <button type="button" className="today-date haven-nav-date-trigger" onClick={toggle}
      ref={triggerRef} aria-expanded={open} aria-haspopup="dialog" aria-controls="haven-topbar-calendar"
      title="Open monthly calendar" aria-label={`${navDate(today)}. Open calendar`}>
      <CalendarDays size={16} aria-hidden="true"/>
      <span className="haven-nav-date-label">{navDate(today)}</span>
    </button>
    {open && <section className="haven-nav-calendar" id="haven-topbar-calendar" role="dialog"
      aria-modal="false" aria-label="Monthly calendar">
      <div className="haven-nav-calendar-accent" aria-hidden="true"/>
      <div className="haven-nav-calendar-head">
        <button className="haven-nav-calendar-arrow" type="button" onClick={() => shift(-1)}
          title="Previous month" aria-label="Previous month"><ChevronLeft size={23}/></button>
        <h2 aria-live="polite">{monthHeading(year, month)}</h2>
        <button className="haven-nav-calendar-arrow" type="button" onClick={() => shift(1)}
          title="Next month" aria-label="Next month"><ChevronRight size={23}/></button>
      </div>
      <div className="haven-nav-calendar-weekdays" aria-hidden="true">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((label) => <span key={label}>{label}</span>)}
      </div>
      <div className="haven-nav-calendar-grid" ref={gridRef} role="group" aria-label="Select a date">
        {days.map(({iso, day, inMonth}) => <button key={iso} type="button"
          className={`haven-nav-calendar-day${inMonth ? '' : ' outside-month'}${selected === iso ? ' selected' : ''}${today === iso ? ' is-today' : ''}`}
          aria-label={longDate(iso)} aria-pressed={selected === iso}
          aria-current={today === iso ? 'date' : undefined} onClick={() => choose(iso)}>{day}</button>)}
      </div>
      <div className="haven-nav-calendar-footer">
        <button type="button" className="haven-nav-calendar-today" onClick={resetToday}>Today</button>
        <Link to="/calendar" className="haven-nav-calendar-link" onClick={() => setOpen(false)}>
          Family Calendar <ArrowUpRight size={15} aria-hidden="true"/>
        </Link>
      </div>
    </section>}
  </div>;
}
