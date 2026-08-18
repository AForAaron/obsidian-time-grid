import React from 'react';

const VARIANT_CLASS = {
  primary: 'tg-btn-primary',
  neutral: 'tg-btn-neutral',
  'danger-quiet': 'tg-btn-danger-quiet',
  quiet: 'tg-btn-quiet',
};

export function Button(props) {
  const { variant = 'neutral', icon, children, onClick, disabled = false, type = 'button', ariaLabel, fullWidth = false, style } = props;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={`tg-btn ${VARIANT_CLASS[variant] || VARIANT_CLASS.neutral}`}
      style={{ width: fullWidth ? '100%' : undefined, ...style }}
    >
      {icon && <span className="tg-btn-icon" aria-hidden="true">{icon}</span>}
      {children}
    </button>
  );
}
