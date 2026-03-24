"use client";

import Link from "next/link";
import type { ReactNode } from "react";

function cx(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function PageIntro({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="page-intro">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="lede">{description}</p>
      </div>
      {actions ? <div className="page-intro-actions">{actions}</div> : null}
    </section>
  );
}

export function PageLink({ href, label }: { href: string; label: string }) {
  return (
    <Link className="ghost-button" href={href}>
      {label}
    </Link>
  );
}

export function Panel({
  title,
  eyebrow,
  action,
  children,
  className,
}: {
  title: string;
  eyebrow?: string;
  action?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("panel", className)}>
      <div className="panel-header">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action ? <span className="panel-action">{action}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function StatGrid({
  items,
}: {
  items: Array<{ label: string; value: string; detail: string }>;
}) {
  return (
    <div className="stat-grid">
      {items.map((item) => (
        <article className="stat-card" key={item.label}>
          <p>{item.label}</p>
          <strong>{item.value}</strong>
          <span>{item.detail}</span>
        </article>
      ))}
    </div>
  );
}

export function KeyValueList({
  items,
  compact = false,
}: {
  items: Array<{ label: string; value: string }>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "key-value-list compact" : "key-value-list"}>
      {items.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function TagRow({ items }: { items: string[] }) {
  return (
    <div className="tag-row">
      {items.map((item) => (
        <span className="tag" key={item}>
          {item}
        </span>
      ))}
    </div>
  );
}

export function StepList({
  items,
}: {
  items: Array<{ title: string; detail: string }>;
}) {
  return (
    <div className="step-list">
      {items.map((item, index) => (
        <article key={item.title}>
          <div className="step-number">{index + 1}</div>
          <div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function InfoGrid({
  items,
}: {
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="info-grid">
      {items.map((item) => (
        <article className="info-card" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </article>
      ))}
    </div>
  );
}

export function Timeline({
  items,
}: {
  items: Array<{ title: string; detail: string }>;
}) {
  return (
    <div className="timeline">
      {items.map((item) => (
        <article key={item.title}>
          <span className="timeline-dot" />
          <div>
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

export function MessageList({
  items,
}: {
  items: Array<{ from: string; time: string; body: string }>;
}) {
  return (
    <div className="message-list">
      {items.map((item) => (
        <article className="message-card" key={`${item.from}-${item.time}`}>
          <div className="message-meta">
            <strong>{item.from}</strong>
            <span>{item.time}</span>
          </div>
          <p>{item.body}</p>
        </article>
      ))}
    </div>
  );
}

export function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="bullet-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function InventoryGrid({
  items,
}: {
  items: Array<{ title: string; subtitle: string; amount: string; meta: string }>;
}) {
  return (
    <div className="inventory-grid">
      {items.map((item) => (
        <article className="inventory-card" key={item.title}>
          <p>{item.subtitle}</p>
          <strong>{item.title}</strong>
          <span>{item.meta}</span>
          <em>{item.amount}</em>
        </article>
      ))}
    </div>
  );
}

export function QuoteTable({
  items,
}: {
  items: Array<{ carrier: string; price: string; eta: string; score: string }>;
}) {
  return (
    <div className="table-card">
      <div className="table-head">
        <span>Carrier</span>
        <span>Price</span>
        <span>ETA</span>
        <span>Signal</span>
      </div>
      {items.map((item) => (
        <div className="table-row" key={item.carrier}>
          <strong>{item.carrier}</strong>
          <span>{item.price}</span>
          <span>{item.eta}</span>
          <span>{item.score}</span>
        </div>
      ))}
    </div>
  );
}

export function BookingList({
  items,
}: {
  items: Array<{ title: string; time: string; detail: string }>;
}) {
  return (
    <div className="booking-list">
      {items.map((item) => (
        <article key={`${item.title}-${item.time}`}>
          <strong>{item.title}</strong>
          <span>{item.time}</span>
          <p>{item.detail}</p>
        </article>
      ))}
    </div>
  );
}
