export function Mascot({ size = 120 }: { size?: number }) {
  return (
    <svg className="mascot" width={size} height={size} viewBox="0 0 80 80" aria-hidden="true">
      <path d="M40 4c-2 6 0 10 4 12-6 0-9-3-10-7 2-3 4-5 6-5z" fill="#46A302" />
      <path d="M40 16c-2-6 2-12 10-12-1 7-4 11-10 12z" fill="#58CC02" />
      <ellipse cx="40" cy="46" rx="32" ry="30" fill="#58CC02" />
      <ellipse cx="40" cy="70" rx="22" ry="8" fill="#46A302" opacity=".35" />
      <ellipse cx="28" cy="40" rx="11" ry="12" fill="#fff" />
      <ellipse cx="52" cy="40" rx="11" ry="12" fill="#fff" />
      <circle cx="30" cy="42" r="5.5" fill="#173B00" />
      <circle cx="50" cy="42" r="5.5" fill="#173B00" />
      <circle cx="32" cy="40" r="1.8" fill="#fff" />
      <circle cx="52" cy="40" r="1.8" fill="#fff" />
      <path d="M33 56q7 7 14 0" stroke="#173B00" strokeWidth="3.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
