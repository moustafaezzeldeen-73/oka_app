import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** Every path here is copied verbatim from the prototype's inline SVGs. */

export const ChevronLeft = ({ size = 18, color = '#1d1d1f', width = 2.2 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M17 4l-8 8 8 8" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const ChevronRight = ({ size = 16, color = '#1d1d1f', width = 2 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M9 4l8 8-8 8" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const Tag = ({ size = 24, color = '#ffffff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6.5 5h6.1a2 2 0 011.42.59l5.4 5.4a2 2 0 010 2.83l-5.6 5.6a2 2 0 01-2.83 0l-5.4-5.4A2 2 0 015 12.6V6.5A1.5 1.5 0 016.5 5z"
      stroke={color}
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <Circle cx={9.4} cy={9.4} r={1.5} fill={color} />
  </Svg>
);

export const Cube = ({ size = 15, color = '#1d1d1f' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
    <Path d="M4 7.5l8 4.5 8-4.5M12 12v9" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
  </Svg>
);

export const Heart = ({ size = 18, color = '#1d1d1f', fill = 'none' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill}>
    <Path
      d="M12 20s-7-4.4-9.5-9C.7 7.4 3 4 6.5 4 8.7 4 10.6 5.2 12 7c1.4-1.8 3.3-3 5.5-3 3.5 0 5.8 3.4 4 7-2.5 4.6-9.5 9-9.5 9z"
      stroke={color}
      strokeWidth={1.6}
    />
  </Svg>
);

export const Cart = ({ size = 25, color = '#1d1d1f' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M3 4h2l2.4 12.2a2 2 0 002 1.8h8.4a2 2 0 002-1.7L21 8H6"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <Circle cx={10} cy={21} r={1.4} fill={color} />
    <Circle cx={17} cy={21} r={1.4} fill={color} />
  </Svg>
);

export const Home = ({ size = 25, color = '#1d1d1f' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M3 11L12 4l9 7" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    <Path
      d="M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

export const Box = ({ size = 25, color = '#1d1d1f' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 7l8-4 8 4v10l-8 4-8-4V7z" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    <Path d="M4 7l8 4 8-4M12 11v10" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
  </Svg>
);

export const Person = ({ size = 25, color = '#1d1d1f' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Circle cx={12} cy={8} r={3.6} stroke={color} strokeWidth={1.8} />
    <Path
      d="M4.5 20c1.4-3.8 4.4-6 7.5-6s6.1 2.2 7.5 6"
      stroke={color}
      strokeWidth={1.8}
      strokeLinecap="round"
    />
  </Svg>
);

export const Check = ({ size = 28, color = '#ffffff', width = 3 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M4 12l6 6L20 6" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const Close = ({ size = 15, color = '#1d1d1f', width = 2 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={width} strokeLinecap="round" />
  </Svg>
);

export const Plus = ({ size = 16, color = '#1d1d1f', width = 2 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={width} strokeLinecap="round" />
  </Svg>
);

export const Crosshair = ({ size = 15, color = '#1d1d1f' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    <Circle cx={12} cy={12} r={5.2} stroke={color} strokeWidth={1.9} />
    <Circle cx={12} cy={12} r={1.6} fill={color} />
  </Svg>
);

export const Pin = ({ size = 30 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 22s7-6.2 7-12A7 7 0 005 10c0 5.8 7 12 7 12z" fill="#1d1d1f" />
    <Circle cx={12} cy={10} r={2.6} fill="#ffffff" />
  </Svg>
);

/** AR overlay scale badge. */
export const ArCross = ({ size = 12, color = '#ffffff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path d="M12 3v18M3 12h18" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
  </Svg>
);

/** Handset, for the courier call button. */
export const Phone = ({ size = 15, color = '#ffffff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M7.5 3.5h-2A2.5 2.5 0 003 6c0 8.28 6.72 15 15 15a2.5 2.5 0 002.5-2.5v-2a1 1 0 00-.76-.97l-3.6-.9a1 1 0 00-1 .32l-1.1 1.32a12.5 12.5 0 01-5.63-5.63l1.32-1.1a1 1 0 00.32-1l-.9-3.6a1 1 0 00-.97-.76z"
      fill={color}
    />
  </Svg>
);

/**
 * WhatsApp's handset-in-a-bubble. Drawn rather than imported so the button
 * stays self-contained — no remote asset, no extra dependency.
 */
export const WhatsApp = ({ size = 15, color = '#ffffff' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M12 2.5a9.5 9.5 0 00-8.2 14.28L2.5 21.5l4.85-1.26A9.5 9.5 0 1012 2.5zm0 1.9a7.6 7.6 0 016.45 11.6l-.23.37.62 2.26-2.33-.6-.36.21A7.6 7.6 0 1112 4.4z"
      fill={color}
    />
    <Path
      d="M9.3 7.6c-.18-.42-.37-.43-.55-.44h-.46a.9.9 0 00-.65.3 2.7 2.7 0 00-.84 2 4.7 4.7 0 001 2.5 10.6 10.6 0 004.05 3.56c2 .79 2.42.63 2.85.59a2.44 2.44 0 001.63-1.15 2 2 0 00.14-1.15c-.06-.1-.22-.16-.46-.28s-1.42-.7-1.64-.78-.38-.12-.55.12-.62.78-.76.94-.28.18-.52.06a6.5 6.5 0 01-1.9-1.18 7.2 7.2 0 01-1.33-1.65c-.14-.24 0-.37.1-.49s.24-.28.36-.42a1.6 1.6 0 00.24-.4.44.44 0 000-.42c-.06-.12-.54-1.32-.75-1.8z"
      fill={color}
    />
  </Svg>
);

/** Mastercard's interlocking discs, drawn as in the checkout payment row. */
export const MastercardMark = () => (
  <Svg width={28} height={20} viewBox="0 0 28 20">
    <Rect x={0} y={0} width={28} height={20} rx={4} fill="#ffffff" />
    <Circle cx={12} cy={10} r={5.5} fill="#eb001b" />
    <Circle cx={16} cy={10} r={5.5} fill="#f79e1b" fillOpacity={0.9} />
  </Svg>
);
