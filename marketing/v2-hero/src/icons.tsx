// Garage Saathi's own icon set, lifted from v2/ui/icons.js so the demo draws
// the product's glyphs and not a lookalike. 24px grid, stroke only -- the app
// renders these inline because the office runs Windows 7, where emoji come out
// as empty boxes.

const PATHS = {
  bus: 'M5 3h14a2 2 0 0 1 2 2v12H3V5a2 2 0 0 1 2-2z M3 11h18 M7 17v3 M17 17v3 M7 14h.01 M17 14h.01',
  job: 'M15 4.5h3a1 1 0 0 1 1 1V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1h3 M9 3h6v3H9z M8.5 11h7 M8.5 15h7',
  part: 'M10.6 4.9L10.8 2.5L13.2 2.5L13.4 4.9L16 6L17.9 4.4L19.6 6.1L18 8L19.1 10.6L21.5 10.8L21.5 13.2L19.1 13.4L18 16L19.6 17.9L17.9 19.6L16 18L13.4 19.1L13.2 21.5L10.8 21.5L10.6 19.1L8 18L6.1 19.6L4.4 17.9L6 16L4.9 13.4L2.5 13.2L2.5 10.8L4.9 10.6L6 8L4.4 6.1L6.1 4.4L8 6z M14.8 12a2.8 2.8 0 1 0-5.6 0 2.8 2.8 0 0 0 5.6 0z',
  gate: 'M3 8h5v13H3z M8 11h13v3.5H8z M12 11v3.5 M16.5 11v3.5',
  home: 'M3 11l9-7 9 7 M5.5 9.5V21h13V9.5',
  money: 'M3 6h18v12H3z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M6 9v.01 M18 15v.01',
  person: 'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M4 21v-1.5A5.5 5.5 0 0 1 9.5 14h5a5.5 5.5 0 0 1 5.5 5.5V21',
  doc: 'M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6',
  warn: 'M12 3.5L21.5 20h-19z M12 10v4 M12 17h.01',
  ok: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M8 12.5l3 3 5-6',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5.5l3.5 2',
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'block', flex: 'none' }}
      aria-hidden="true"
    >
      {PATHS[name].split(' M').map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  )
}
