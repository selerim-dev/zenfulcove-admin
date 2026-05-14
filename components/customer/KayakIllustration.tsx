type Props = {
  color: string;
  capacity: number;
  className?: string;
};

export default function KayakIllustration({
  color,
  capacity,
  className,
}: Props) {
  const isDouble = capacity >= 2;
  return (
    <svg
      viewBox="0 0 56 28"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path
        d="M2 14 Q14 4, 28 4 Q42 4, 54 14 Q42 24, 28 24 Q14 24, 2 14 Z"
        fill={color}
        stroke="rgba(0,0,0,.18)"
        strokeWidth={1}
      />
      {isDouble ? (
        <>
          <ellipse cx="20" cy="14" rx="4.5" ry="3" fill="rgba(0,0,0,.35)" />
          <ellipse cx="36" cy="14" rx="4.5" ry="3" fill="rgba(0,0,0,.35)" />
        </>
      ) : (
        <ellipse cx="28" cy="14" rx="5" ry="3.2" fill="rgba(0,0,0,.35)" />
      )}
    </svg>
  );
}
