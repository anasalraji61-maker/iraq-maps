/**
 * Minimal type stub for react-native-svg.
 * The actual package is installed via the mobile app's native dependency tree.
 */
declare module 'react-native-svg' {
  import type { ComponentType, ReactNode } from 'react';
  interface CommonProps {
    fill?: string;
    stroke?: string;
    strokeWidth?: number | string;
    opacity?: number | string;
    x?: number | string;
    y?: number | string;
    width?: number | string;
    height?: number | string;
    transform?: string;
    children?: ReactNode;
    key?: string | number;
  }
  export const Svg: ComponentType<CommonProps & { viewBox?: string }>;
  export const Rect: ComponentType<CommonProps & { rx?: number | string; ry?: number | string }>;
  export const Circle: ComponentType<CommonProps & { cx?: number | string; cy?: number | string; r?: number | string }>;
  export const Line: ComponentType<CommonProps & { x1?: number | string; y1?: number | string; x2?: number | string; y2?: number | string }>;
  export const Path: ComponentType<CommonProps & { d?: string; strokeLinecap?: string; strokeLinejoin?: string }>;
  export const G: ComponentType<CommonProps>;
  export const Text: ComponentType<CommonProps & { fontSize?: number | string; textAnchor?: string; fontWeight?: string }>;
  export const Defs: ComponentType<{ children?: ReactNode }>;
  export const LinearGradient: ComponentType<{ id?: string; x1?: string; y1?: string; x2?: string; y2?: string; children?: ReactNode }>;
  export const Stop: ComponentType<{ offset?: string | number; stopColor?: string; stopOpacity?: number | string }>;
  export default Svg;
}
