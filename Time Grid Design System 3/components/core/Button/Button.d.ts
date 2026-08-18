export type ButtonVariant = 'primary' | 'neutral' | 'danger-quiet' | 'quiet';
export interface ButtonProps {
  /** primary: accent fill, only for the single affirmative action (开始/补齐并继续). neutral: outlined, for a reversible secondary action (切换/首个午夜结束). danger-quiet: error-colored outline, for stopping/ending something. quiet: shortest (30px), borderless — for calm/dismissive actions (打开今日日记/暂不处理/重新读取并重试). */
  variant?: ButtonVariant;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  ariaLabel?: string;
  fullWidth?: boolean;
  style?: React.CSSProperties;
}
export function Button(props: ButtonProps): JSX.Element;
