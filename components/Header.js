"use client";

function BirdIcon() {
  return (
    <svg
      width="40"
      height="28"
      viewBox="0 0 40 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="mb-2"
    >
      <path
        d="M2 18C4 14 8 8 14 6C16 5.5 18 6 19 8C20 6 22 5.5 24 6C30 8 34 14 36 18"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M8 20C10 16 13 12 17 11"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M30 20C28 16 25 12 21 11"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export default function Header() {
  return (
    <header className="bg-forest w-full px-8 py-5 flex flex-col items-center">
      <BirdIcon />
      <div>
        <span className="font-serif italic text-white text-3xl">Zenful</span>
        <span className="font-serif italic text-white text-3xl tracking-widest">
          COVE
        </span>
      </div>
      <p className="text-white/70 text-xs tracking-[0.3em] uppercase mt-1">
        Texas Glamping Retreat
      </p>
      <p className="text-white/50 text-[10px] tracking-widest uppercase mt-0.5">
        Admin dashboard
      </p>
    </header>
  );
}
