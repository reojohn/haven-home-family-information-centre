import React, {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {CalendarDays, ChevronDown, ChevronLeft, ChevronRight} from 'lucide-react';
import {buildTopbarMonth} from './TopbarCalendar.jsx';
import './PremiumDatePicker.css';

const pad = (n) => String(n).padStart(2, '0');
const validISO = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
const todayISO = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};
const showDate = (iso) => {
  if (!validISO(iso)) return 'Select date';
  const [y, m, d] = iso.split('-').map(Number);
  return `${pad(d)}/${pad(m)}/${y}`;
};
const longDate = (iso) => new Intl.DateTimeFormat('en-PH', {
  weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
}).format(new Date(`${iso}T12:00:00`));
const headingDate = (year, month) => new Intl.DateTimeFormat('en-PH', {
  month: 'long', year: 'numeric',
}).format(new Date(year, month - 1, 1, 12));

// Reuse the site's themed monthly-calendar design, but select a value for a form
// rather than navigating the whole application. The backend still gets YYYY-MM-DD.
export default function PremiumDatePicker({name, value = '', onChange, required = false,
  disabled = false, min, max, id, 'aria-label': ariaLabel = 'Choose date'}) {
  const panelId = useId();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => (validISO(value) ? value : todayISO()).slice(0, 7));
  const [position, setPosition] = useState({top: 0, left: 0, width: 362});
  const [year, month] = visibleMonth.split('-').map(Number);
  const today = todayISO();
  const days = buildTopbarMonth(year, month);

  const reposition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(362, Math.max(0, window.innerWidth - 20));
    // The form calendar has compact fixed-height day cells. Position using its
    // actual size after mounting so it opens fully within the viewport.
    const panelHeight = panelRef.current?.getBoundingClientRect().height || (window.innerHeight < 530 ? 325 : 365);
    const spaceBelow = window.innerHeight - rect.bottom - 10;
    const spaceAbove = rect.top - 10;
    const dropAbove = spaceBelow < panelHeight && spaceAbove > spaceBelow;
    const idealTop = dropAbove ? rect.top - panelHeight - 8 : rect.bottom + 8;
    const top = Math.min(Math.max(10, idealTop), Math.max(10, window.innerHeight - panelHeight - 10));
    const left = Math.min(Math.max(10, rect.left), Math.max(10, window.innerWidth - width - 10));
    setPosition((previous) => previous.top === top && previous.left === left && previous.width === width
      ? previous : {top, left, width});
  };

  // Measure the rendered portal on open; no outer scrolling is necessary.
  useLayoutEffect(() => {if (open) reposition();}, [open]);
  const toggle = () => {
    if (disabled) return;
    if (!open) {
      setVisibleMonth((validISO(value) ? value : todayISO()).slice(0, 7));
      reposition();
    }
    setOpen((wasOpen) => !wasOpen);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !panelRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', reposition);
    // Capture scrolling in any page or modal ancestor.
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const selected = panelRef.current?.querySelector('[data-selected="true"]');
    const current = panelRef.current?.querySelector('[data-today="true"]');
    (selected || current || panelRef.current?.querySelector('.haven-nav-calendar-day:not(:disabled)'))
      ?.focus({preventScroll: true});
  }, [open]);

  const shift = (amount) => {
    const d = new Date(year, month - 1 + amount, 1, 12);
    setVisibleMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const choose = (iso) => {
    // Controlled Field handlers expect the same target.name/value shape as a native input.
    onChange?.({target: {name, value: iso, type: 'date'}, currentTarget: {name, value: iso}});
    setVisibleMonth(iso.slice(0, 7));
    setOpen(false);
    triggerRef.current?.focus({preventScroll: true});
  };
  const isAllowed = (iso) => (!min || iso >= min) && (!max || iso <= max);

  return <>
    <input type="hidden" name={name} value={value || ''} readOnly/>
    <button ref={triggerRef} id={id} type="button" disabled={disabled}
      className={`field-input haven-date-field-trigger${open ? ' is-open' : ''}`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
      aria-label={`${ariaLabel}: ${validISO(value) ? longDate(value) : 'not selected'}. Open calendar`}
      aria-required={required} onClick={toggle}>
      <span className={validISO(value) ? 'haven-date-field-value' : 'haven-date-field-placeholder'}>{showDate(value)}</span>
      <span className="haven-date-field-icons" aria-hidden="true"><CalendarDays size={17}/><ChevronDown size={15}/></span>
    </button>
    {open && createPortal(<section ref={panelRef} id={panelId} role="dialog" aria-modal="false"
      aria-label={`${ariaLabel} calendar`} className="haven-nav-calendar haven-form-date-popover"
      style={{top: position.top, left: position.left, width: position.width}}>
      <div className="haven-nav-calendar-accent" aria-hidden="true"/>
      <div className="haven-nav-calendar-head">
        <button type="button" className="haven-nav-calendar-arrow" onClick={() => shift(-1)}
          aria-label="Previous month"><ChevronLeft size={22}/></button>
        <h2 aria-live="polite">{headingDate(year, month)}</h2>
        <button type="button" className="haven-nav-calendar-arrow" onClick={() => shift(1)}
          aria-label="Next month"><ChevronRight size={22}/></button>
      </div>
      <div className="haven-nav-calendar-weekdays" aria-hidden="true">
        {['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="haven-nav-calendar-grid" role="group" aria-label="Choose a day">
        {days.map(({iso, day, inMonth}) => <button type="button" key={iso}
          className={`haven-nav-calendar-day${inMonth ? '' : ' outside-month'}${value === iso ? ' selected' : ''}${today === iso ? ' is-today' : ''}`}
          aria-label={longDate(iso)} aria-pressed={value === iso}
          aria-current={today === iso ? 'date' : undefined}
          data-selected={value === iso ? 'true' : undefined}
          data-today={today === iso ? 'true' : undefined}
          disabled={!isAllowed(iso)} onClick={() => choose(iso)}>{day}</button>)}
      </div>
      <div className="haven-nav-calendar-footer">
        <span className="haven-form-date-hint">{validISO(value) ? longDate(value) : 'Choose a date for this record'}</span>
        <button className="haven-nav-calendar-today" type="button" disabled={!isAllowed(today)}
          onClick={() => choose(today)}>Today</button>
      </div>
    </section>, document.body)}
  </>;
}
