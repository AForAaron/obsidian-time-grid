export interface IconProps {
  /** Which glyph to render */
  name: 'month' | 'day' | 'hour' | 'pie' | 'chevronLeft' | 'chevronRight';
  /** Pixel size (square), default 16 */
  size?: number;
}
export function Icon(props: IconProps): JSX.Element;
