import React, {useEffect, useId, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Check, ChevronDown, Clock3, X} from 'lucide-react';
import './PremiumTimePicker.css';

const ROW_HEIGHT = 38;
const HOURS = Array.from({length: 12}, (_, i) => i + 1);
const MINUTES = Array.from({length: 60}, (_, i) => i);
const PERIODS = ['AM', 'PM'];
const pad = (n) => String(n).padStart(2, '0');

// Accept both HH:MM and HH:MM:SS from the API; write HH:MM back to the form.
function fromStoredTime(value) {
  const found = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(String(value || ''));
  if (!found) return {hour: 9, minute: 0, period: 'AM'};
  const hour24 = Number(found[1]);
  if (hour24 > 23) return {hour: 9, minute: 0, period: 'AM'};
  return {hour: hour24 % 12 || 12, minute: Number(found[2]), period: hour24 >= 12 ? 'PM' : 'AM'};
}
function toStoredTime({hour, minute, period}) {
  return `${pad((Number(hour) % 12) + (period === 'PM' ? 12 : 0))}:${pad(Number(minute))}`;
}
function toDisplayTime(parts) {
  return `${pad(parts.hour)}:${pad(parts.minute)} ${parts.period}`;
}

function TimeWheel({label, values, value, onChange, format = String}) {
  const ref = useRef(null);
  const uid = useId().replaceAll(':', '');
  const activeIndex = Math.max(0, values.indexOf(value));

  // Only initialize scroll on mount. The user is free to flick the wheel with
  // native touch momentum and scroll-snap without rerenders fighting the scroll.
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = activeIndex * ROW_HEIGHT;
  }, []);

  const chooseIndex = (index) => {
    const bounded = Math.min(values.length - 1, Math.max(0, index));
    if (ref.current) ref.current.scrollTop = bounded * ROW_HEIGHT;
    onChange(values[bounded]);
  };
  const handleScroll = (event) => {
    const next = Math.min(values.length - 1, Math.max(0, Math.round(event.currentTarget.scrollTop / ROW_HEIGHT)));
    if (values[next] !== value) onChange(values[next]);
  };
  const keyDown = (event) => {
    let next = activeIndex;
    if (event.key === 'ArrowUp') next -= 1;
    else if (event.key === 'ArrowDown') next += 1;
    else if (event.key === 'PageUp') next -= 5;
    else if (event.key === 'PageDown') next += 5;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = values.length - 1;
    else return;
    event.preventDefault();
    chooseIndex(next);
  };

  return <div className="haven-time-column">
    <span className="haven-time-column-label" aria-hidden="true">{label}</span>
    <div className="haven-time-wheel" role="listbox" aria-label={label} tabIndex={0}
      aria-activedescendant={`${uid}-${activeIndex}`}
      ref={ref} onScroll={handleScroll} onKeyDown={keyDown}>
      {values.map((item, index) => <div key={item} role="option"
        id={`${uid}-${index}`} aria-selected={index === activeIndex}
        className={`haven-time-option${index === activeIndex ? ' is-selected' : ''}`}
        onClick={() => chooseIndex(index)}>{format(item)}</div>)}
    </div>
  </div>;
}

/**
 * A three-wheel iPhone-like picker. The controlled parent still receives the
 * normal input event shape, with a 24-hour HH:MM value for the existing API.
 */
export default function PremiumTimePicker({name, value = '', onChange, required = false,
  disabled = false, id, 'aria-label': ariaLabel = 'Choose time'}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => fromStoredTime(value));
  const [resetId, setResetId] = useState(0);
  const [position, setPosition] = useState({top: 0, left: 0, width: 350});
  const popupId = useId();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const reposition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(350, Math.max(0, window.innerWidth - 20));
    // Use the actual compact panel height after the portal mounts, rather than
    // the old 450px max-height. This prevents a scrollbar and keeps the popup
    // fully inside the screen when the field is near the bottom.
    const panelHeight = panelRef.current?.getBoundingClientRect().height || (window.innerHeight < 620 ? 280 : 355);
    const spaceBelow = window.innerHeight - rect.bottom - 10;
    const spaceAbove = rect.top - 10;
    const preferAbove = spaceBelow < panelHeight && spaceAbove > spaceBelow;
    const idealTop = preferAbove ? rect.top - panelHeight - 8 : rect.bottom + 8;
    const top = Math.min(Math.max(10, idealTop), Math.max(10, window.innerHeight - panelHeight - 10));
    const left = Math.min(Math.max(10, rect.left), Math.max(10, window.innerWidth - width - 10));
    setPosition((previous) => previous.top === top && previous.left === left && previous.width === width
      ? previous : {top, left, width});
  };
  // Re-measure after mounting; the browser has now laid out the compact panel.
  useLayoutEffect(() => {if (open) reposition();}, [open]);
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus({preventScroll: true});
  };
  const toggle = () => {
    if (disabled) return;
    if (open) return close();
    setDraft(fromStoredTime(value));
    setResetId((x) => x + 1);
    reposition();
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return undefined;
    const outsideClick = (event) => {
      if (!panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        setOpen(false); // Dismiss without committing the draft.
      }
    };
    const escape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    const onPageMove = (event) => {
      if (!panelRef.current?.contains(event.target)) reposition();
    };
    document.addEventListener('pointerdown', outsideClick);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', onPageMove, true);
    return () => {
      document.removeEventListener('pointerdown', outsideClick);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', onPageMove, true);
    };
  }, [open]);

  const commit = () => {
    const nextValue = toStoredTime(draft);
    onChange?.({target: {name, value: nextValue, type: 'time'}, currentTarget: {name, value: nextValue}});
    close();
  };
  const useCurrentTime = () => {
    const now = new Date();
    const parts = {hour: now.getHours() % 12 || 12, minute: now.getMinutes(), period: now.getHours() >= 12 ? 'PM' : 'AM'};
    setDraft(parts);
    setResetId((x) => x + 1);
  };
  const selectedValue = value ? toDisplayTime(fromStoredTime(value)) : 'Select time';

  return <>
    <input type="hidden" name={name} value={value || ''} readOnly/>
    <button ref={triggerRef} id={id} type="button" disabled={disabled}
      className={`field-input haven-time-field-trigger${open ? ' is-open' : ''}`}
      aria-label={`${ariaLabel}: ${selectedValue}. Open time picker`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined}
      aria-required={required} onClick={toggle}>
      <span className={value ? 'haven-time-field-value' : 'haven-time-field-placeholder'}>{selectedValue}</span>
      <span className="haven-time-field-icons" aria-hidden="true"><Clock3 size={18}/><ChevronDown size={14}/></span>
    </button>
    {open && createPortal(<section className="haven-nav-calendar haven-form-time-popover" ref={panelRef}
      id={popupId} role="dialog" aria-modal="false" aria-label={`${ariaLabel} scroll picker`}
      style={{top: position.top, left: position.left, width: position.width}}>
      <div className="haven-nav-calendar-accent" aria-hidden="true"/>
      <div className="haven-time-heading">
        <div><span className="haven-time-kicker">SET REMINDER TIME</span>
          <h2>Choose a time</h2></div>
        <button type="button" className="haven-time-close" aria-label="Cancel time selection" onClick={close}><X size={18}/></button>
      </div>
      <p className="haven-time-preview" aria-live="polite">{toDisplayTime(draft)}</p>
      <div className="haven-time-wheel-wrap">
        <div className="haven-time-active-band" aria-hidden="true"/>
        <div className="haven-time-wheels" key={resetId}>
          <TimeWheel label="Hour" values={HOURS} value={draft.hour} format={pad}
            onChange={(hour) => setDraft((current) => ({...current, hour}))}/>
          <TimeWheel label="Minute" values={MINUTES} value={draft.minute} format={pad}
            onChange={(minute) => setDraft((current) => ({...current, minute}))}/>
          <TimeWheel label="AM / PM" values={PERIODS} value={draft.period}
            onChange={(period) => setDraft((current) => ({...current, period}))}/>
        </div>
      </div>
      <div className="haven-time-footer">
        <button type="button" className="haven-time-now" onClick={useCurrentTime}>Now</button>
        <button type="button" className="haven-time-apply" onClick={commit}><Check size={16}/> Done</button>
      </div>
    </section>, document.body)}
  </>;
}
