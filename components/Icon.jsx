// Line icons for the mobile bottom bar (24px grid, drawn with currentColor).
const PATHS = {
  dash: "M3 12l9-8 9 8M5 10v10h5v-6h4v6h5V10",
  entry: "M9 4h6l1 2h3v15H5V6h3l1-2zM9 11h6M9 15h4",
  emp: "M16 20v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1M10 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM20 20v-1a4 4 0 00-3-3.9M15 4.1a3.5 3.5 0 010 6.8",
  close: "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4M9 15l2 2 4-4",
  ven: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z",
  att: "M5 4h14v16H5zM9 3v3M15 3v3M8.5 13l2.5 2.5 4.5-5",
  cust: "M4 8h16l-1.5 11h-13L4 8zM8 8V6a4 4 0 018 0v2M9.5 13.5l1.8 1.8 3.2-3.6",
  fp: "M5 18a2 2 0 104 0 2 2 0 00-4 0zM15 18a2 2 0 104 0 2 2 0 00-4 0zM9 18h6M5 18H3v-5l3-5h6v10M12 10h4l3 4v4h-2",
  cap: "M3 7h18v12H3zM3 11h18M16 15h2",
  users: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3zM9.5 12l2 2 3.5-4",
  flow: "M5 5h5v5H5zM14 14h5v5h-5zM7.5 10v4a2 2 0 002 2H14M14 7.5h2.5a2 2 0 012 2V14",
  more: "M5 12h.01M12 12h.01M19 12h.01",
};

export default function Icon({ name, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
