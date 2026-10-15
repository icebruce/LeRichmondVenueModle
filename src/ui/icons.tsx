// Simple 20 px stroke icons drawn for this project (DESIGN_GUIDE §2.5: one set, 1.75 px stroke).
import type { SVGProps } from "react";

const paths: Record<string, string> = {
  undo: "M7 7 3 11l4 4M3 11h10a5 5 0 0 1 0 10h-2",
  redo: "M13 7l4 4-4 4M17 11H7a5 5 0 0 0 0 10h2",
  sun: "M10 6.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M4 16l1.4-1.4M14.6 5.4 16 4",
  moon: "M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9Z",
  cube: "M10 2 17 6v8l-7 4-7-4V6l7-4ZM3 6l7 4 7-4M10 10v8",
  plan: "M3 3h14v14H3zM3 10h7v7M10 3v7",
  walk: "M11 3.5a1.5 1.5 0 1 1 0 .01M9 8l-2 4 3 2v4M9 8l3-1 2 3 2 1M10 14l-3 4",
  layout: "M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z",
  venue: "M2 17h16M3 17V8l7-5 7 5v9M8 17v-5h4v5",
  plus: "M10 4v12M4 10h12",
  minus: "M4 10h12",
  rotateLeft: "M4 4v4h4M4.5 8A6.5 6.5 0 1 1 4 12",
  rotateRight: "M16 4v4h-4M15.5 8A6.5 6.5 0 1 0 16 12",
  copy: "M7 7h10v10H7zM13 7V3H3v10h4",
  trash: "M4 6h12M8 6V4h4v2M5.5 6l1 11h7l1-11",
  chevron: "M6 8l4 4 4-4",
  close: "M5 5l10 10M15 5 5 15",
  check: "M4 10.5 8 14.5 16 6",
  download: "M10 3v10M6 9l4 4 4-4M4 17h12",
  upload: "M10 14V4M6 8l4-4 4 4M4 17h12",
  table: "M3 8h14M5 8v8M15 8v8M2 6h16",
  round: "M10 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z",
  floor: "M3 6h14v8H3zM3 10h14M10 6v8",
  music: "M8 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm0 0V4l9-2v11m0 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  camera: "M3 7h3l2-2h4l2 2h3v9H3zM10 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z",
  people:
    "M7 9a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM2 17c0-3 2.5-5 5-5s5 2 5 5M14 9a2.5 2.5 0 1 0 0-5M15 12c2 .5 3 2.3 3 5",
};

export type IconName = keyof typeof paths;

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      <path d={paths[name]} />
    </svg>
  );
}
