interface BrandLogoProps {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}

/**
 * Official Birta Academy logo. Uses the supplied brand asset unmodified (square, brand-blue field).
 * Replace /brand/birta-logo.jpg with the vector/hi-res export when available; do not recolor or redraw.
 */
export function BrandLogo({ size = 36, withWordmark = false, className = '' }: BrandLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src="/brand/birta-logo-source.jpg"
        alt={withWordmark ? '' : 'Birta Academy'}
        width={size}
        height={size}
        className="rounded-md shrink-0 select-none"
        draggable={false}
      />
      {withWordmark && (
        <span className="font-display text-base font-bold tracking-tight text-slate-950 dark:text-white whitespace-nowrap">
          Birta Academy
        </span>
      )}
    </span>
  );
}
