import type { ReactNode } from 'react';

/** 画面見出し。第3章の「1画面の目的を1つに絞る」に合わせ、説明文は1〜2文に収める。 */
export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Card({
  title,
  description,
  actions,
  children,
  id,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="card" id={id} aria-labelledby={title && id ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2 id={id ? `${id}-title` : undefined}>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** 状態は色だけで示さず、必ず文言を伴わせる（第3章 アクセシビリティ）。 */
export function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'progress' | 'done' | 'alert';
  children: ReactNode;
}) {
  const suffix = tone === 'neutral' ? '' : ` badge--${tone}`;
  return <span className={`badge${suffix}`}>{children}</span>;
}

/** 空状態。次に取るべき操作を1つだけ提示する。 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      {action}
    </div>
  );
}

/** ラベルで入力を包むことで、id を配らずに関連付けを保証する。 */
export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label}
        {required && (
          <>
            <span className="req" aria-hidden="true">
              *
            </span>
            <span className="visually-hidden">（必須）</span>
          </>
        )}
      </span>
      {children}
      {hint && <span className="muted">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="stat">
      <dt>{label}</dt>
      <dd>
        {value}
        {unit && <small>{unit}</small>}
      </dd>
    </div>
  );
}

/** 生成中のスケルトン表示。 */
export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="stack" role="status" aria-live="polite">
      <span className="visually-hidden">生成中です</span>
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="skeleton"
          style={{ width: `${100 - index * 12}%` }}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

export function Chips({ items }: { items: string[] }) {
  return (
    <ul className="chips" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li className="chip" key={item}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function Swatches({ colors }: { colors: { name: string; hex: string }[] }) {
  return (
    <div className="swatches">
      {colors.map((color) => (
        <div className="swatch" key={`${color.name}-${color.hex}`}>
          <i style={{ background: color.hex }} aria-hidden="true" />
          {color.name} {color.hex}
        </div>
      ))}
    </div>
  );
}
