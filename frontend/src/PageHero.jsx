import React from 'react';
import {CalendarDays, UsersRound, WalletCards, Settings2, Sparkles, ArrowUpRight} from 'lucide-react';
import './PageHero.css';

const ICONS = {
  calendar: CalendarDays,
  household: UsersRound,
  expenses: WalletCards,
  settings: Settings2,
};

/**
 * Shared, lightweight hero for the four household pages without an existing hero.
 * Only renders information supplied by each page; no additional data fetches.
 */
export default function PageHero({
  variant='calendar', eyebrow, title, description, actions,
  metrics=[], visualValue, visualLabel, visualNote, avatar, footer,
}) {
  const Icon = ICONS[variant] || Sparkles;
  return (
    <section className={`haven-page-hero haven-page-hero--${variant}`} aria-label={`${title} introduction`}>
      <div className="haven-page-hero__content">
        <div className="haven-page-hero__eyebrow"><Icon size={15} strokeWidth={2} aria-hidden="true"/>{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="haven-page-hero__bottom">
          {actions && <div className="haven-page-hero__actions">{actions}</div>}
          {footer && <span className="haven-page-hero__footnote"><Sparkles size={14} aria-hidden="true"/>{footer}</span>}
        </div>
      </div>
      <div className="haven-page-hero__preview" aria-label="At a glance">
        <div className="haven-page-hero__preview-heading"><span className="haven-page-hero__signal"/> AT A GLANCE <ArrowUpRight size={15} aria-hidden="true"/></div>
        <div className="haven-page-hero__preview-body">
          <div className="haven-page-hero__emblem">
            {avatar ? <div className="haven-page-hero__avatar">{avatar}</div> : <Icon size={34} strokeWidth={1.65} aria-hidden="true"/>}
            <strong title={String(visualValue??'')}>{visualValue}</strong>
            <small>{visualLabel}</small>
          </div>
          <div className="haven-page-hero__metrics">
            {metrics.slice(0,2).map((item,i)=><div className="haven-page-hero__metric" key={`${item.label}-${i}`}>
              <span>{item.label}</span>
              <strong title={String(item.value??'')}>{item.value}</strong>
            </div>)}
          </div>
        </div>
        {visualNote && <div className="haven-page-hero__preview-note">{visualNote}</div>}
      </div>
    </section>
  );
}
