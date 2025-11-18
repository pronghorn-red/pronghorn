export function PronghornLogo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Pronghorn antelope in running pose */}
      <g>
        {/* Body */}
        <ellipse cx="55" cy="50" rx="25" ry="18" fill="currentColor" opacity="0.9" />
        
        {/* Head and neck */}
        <path
          d="M 75 45 Q 82 42 85 35 Q 87 28 85 25"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        
        {/* Head */}
        <circle cx="85" cy="25" r="8" fill="currentColor" />
        
        {/* Horns */}
        <path
          d="M 83 18 L 82 8"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M 87 18 L 88 8"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        
        {/* Ear */}
        <ellipse cx="88" cy="22" rx="3" ry="5" fill="currentColor" opacity="0.8" />
        
        {/* Front legs (running pose - extended) */}
        <path
          d="M 65 60 L 70 75 L 72 85"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M 58 58 L 50 72 L 48 82"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        
        {/* Back legs (running pose - tucked) */}
        <path
          d="M 45 58 L 42 68 L 45 78"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M 38 56 L 32 66 L 30 75"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        
        {/* Tail */}
        <path
          d="M 32 48 Q 25 50 22 55"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        
        {/* Motion lines for speed */}
        <path
          d="M 15 35 L 25 35"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.4"
        />
        <path
          d="M 12 45 L 20 45"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.3"
        />
        <path
          d="M 10 55 L 18 55"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.2"
        />
      </g>
    </svg>
  );
}
