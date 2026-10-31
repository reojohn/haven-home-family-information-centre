import React, {useEffect, useState} from 'react';
import './HeroDigitalClock.css';

// The face is drawn with local SVGs so it retains real seven-segment shapes
// without requiring a downloaded font or images.
const SEGMENTS = {
  '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc',
  '5': 'afgcd', '6': 'afgecd', '7': 'abc', '8': 'abcdefg', '9': 'abfgcd',
};
const SHAPES = {
  a: '5,1 18,1 15,5 8,5',
  b: '19,3 22,6 22,17 19,20 16.5,17 16.5,7',
  c: '19,21 22,24 22,35 19,38 16.5,34 16.5,24',
  d: '5,39 18,39 15,35 8,35',
  e: '4,21 6.5,24 6.5,34 4,38 1,35 1,24',
  f: '4,3 6.5,7 6.5,17 4,20 1,17 1,6',
  g: '5,20 8,17.8 15,17.8 18,20 15,22.2 8,22.2',
};
const PH_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Manila', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h12',
});
const PH_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone:'Asia/Manila', month:'2-digit', day:'2-digit', weekday:'short',
});

function SevenSegmentDigit({digit}) {
  const lit = SEGMENTS[digit] || '';
  return <svg className="hero-clock-digit" viewBox="0 0 23 40" aria-hidden="true" focusable="false">
    {Object.entries(SHAPES).map(([segment, points]) =>
      <polygon key={segment} points={points} className={`hero-clock-segment${lit.includes(segment) ? ' is-lit' : ''}`}/>)}
  </svg>;
}

function SevenSegmentColon() {
  return <span className="hero-clock-colon" aria-hidden="true"><i/><i/></span>;
}

/** Live Philippine digital clock, with date and seconds in a compact side display. */
export default function HeroDigitalClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const sync = () => setNow(new Date());
    const interval = window.setInterval(sync, 1000);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const time = Object.fromEntries(PH_TIME.formatToParts(now).map(({type,value}) => [type,value]));
  const date = Object.fromEntries(PH_DATE.formatToParts(now).map(({type,value}) => [type,value]));
  const {hour='12', minute='00', second='00', dayPeriod='AM'} = time;
  const displayDate = `${date.month || '01'}/${date.day || '01'}`;
  const day = (date.weekday || '---').toUpperCase();
  const readable = `${hour}:${minute}:${second} ${dayPeriod}`;

  return <time className="hero-digital-clock" dateTime={now.toISOString()}
    aria-label={`Philippine time: ${readable}. ${day}, ${displayDate}.`}
    title={`Philippine time · ${readable}`} aria-live="off">
    <span className="hero-clock-main" aria-hidden="true">
      <span className="hero-clock-meridiem">{dayPeriod}</span>
      <span className="hero-clock-digits">
        {[...hour].map((digit, i) => <SevenSegmentDigit key={`hour-${i}`} digit={digit}/>)}
        <SevenSegmentColon/>
        {[...minute].map((digit, i) => <SevenSegmentDigit key={`minute-${i}`} digit={digit}/>)}
      </span>
      <span className="hero-clock-zone">PHILIPPINE TIME</span>
    </span>
    <span className="hero-clock-divider" aria-hidden="true"/>
    <span className="hero-clock-details" aria-hidden="true">
      <span className="hero-clock-detail"><span className="hero-clock-mini-digits">{[...second].map((digit,i) => <SevenSegmentDigit key={`seconds-${i}`} digit={digit}/>)}</span><small>SEC</small></span>
      <span className="hero-clock-detail"><strong>{day}</strong><small>DAY</small></span>
      <span className="hero-clock-detail"><strong>{displayDate}</strong><small>DATE</small></span>
    </span>
  </time>;
}
