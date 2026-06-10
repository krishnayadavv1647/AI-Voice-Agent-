// icons.jsx — small lucide-style stroke icon set (matches the codebase's lucide-react usage)
const ICON_PATHS = {
  sparkle: "M12 3l1.7 5L18 9.7l-4.3 1.6L12 16l-1.7-4.7L6 9.7l4.3-1.7z",
  message: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  headphones: "M3 14v-2a9 9 0 0 1 18 0v2 M21 16v2a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3z M3 16v2a2 2 0 0 0 2 2h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H3z",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z",
  phoneOff: "M10.7 13.3a16 16 0 0 1-2.6-3.4L9.3 8.6a2 2 0 0 0 .5-2.1c-.3-.9-.6-1.8-.7-2.8A2 2 0 0 0 7.1 2h-3a2 2 0 0 0-2 2.2c.2 2 .7 3.9 1.5 5.6 M22 16.9v3a2 2 0 0 1-2.2 2c-3-.3-5.9-1.3-8.4-2.9 M2 2l20 20",
  calendar: "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  send: "M14.5 9.5 21 3 M21 3l-6.5 18-3.7-8.3L3 9z",
  arrowRight: "M5 12h14 M13 6l6 6-6 6",
  arrowLeft: "M19 12H5 M11 6l-6 6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  chevronLeft: "M15 6l-6 6 6 6",
  landmark: "M3 21h18 M5 21v-9 M9 21v-9 M15 21v-9 M19 21v-9 M3 10l9-6 9 6 M3 10h18",
  book: "M12 7a4 4 0 0 0-4-4H3v15h5a4 4 0 0 1 4 3 M12 7a4 4 0 0 1 4-4h5v15h-5a4 4 0 0 0-4 3 M12 7v14",
  receipt: "M5 2v20l2-1.3L9 22l2-1.3L13 22l2-1.3L17 22l2-1.3V2l-2 1.3L15 2l-2 1.3L11 2 9 3.3 7 2z M8 8h8 M8 12h8 M8 16h5",
  cap: "M12 4 2 9l10 5 10-5z M6 11.5V17c0 1.3 2.7 3 6 3s6-1.7 6-3v-5.5 M21 9v6",
  mapPin: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z",
  zap: "M13 2 4 14h7l-1 8 9-12h-7z",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18 M6 6l12 12",
  mic: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z M19 10v2a7 7 0 0 1-14 0v-2 M12 19v3 M8 22h8",
  micOff: "M9 9v3a3 3 0 0 0 5.1 2.1 M15 9.3V5a3 3 0 0 0-5.9-.7 M19 10v2a7 7 0 0 1-.6 2.8 M5 5l14 14 M12 19v3",
  clock: "M12 7v5l3 2",
  user: "M20 21a8 8 0 1 0-16 0",
  globe: "M2 12h20 M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
  send2: "M14.5 9.5 21 3 M21 3l-6.5 18-3.7-8.3L3 9z",
};
// icons that also need a circle drawn
const ICON_CIRCLES = {
  mapPin: { cx: 12, cy: 10, r: 3 },
  clock: { cx: 12, cy: 12, r: 9 },
  user: { cx: 12, cy: 7, r: 4 },
  globe: { cx: 12, cy: 12, r: 10 },
};

function Icon({ name, size = 22, stroke = 2, className = "", style }) {
  const d = ICON_PATHS[name];
  const circle = ICON_CIRCLES[name];
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {circle && <circle cx={circle.cx} cy={circle.cy} r={circle.r} />}
      {d && d.split(" M").map((seg, i) => <path key={i} d={(i === 0 ? seg : "M" + seg)} />)}
    </svg>
  );
}

Object.assign(window, { Icon });
