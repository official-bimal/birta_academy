import { useState } from 'react';
import { BookOpen } from 'lucide-react';

interface MediaFrameProps {
  src?: string;
  alt: string;
  title?: string;
  className?: string;
  aspectClass?: string;
}

export function MediaFrame({
  src,
  alt,
  title,
  className = '',
  aspectClass = 'aspect-[4/3]',
}: MediaFrameProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`${aspectClass} ${className} relative overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center p-6 text-center`}
      >
        <BookOpen className="w-8 h-8 text-slate-400 dark:text-slate-600 mb-2" aria-hidden="true" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 max-w-[20ch] truncate">
          {title || alt}
        </span>
      </div>
    );
  }

  return (
    <div className={`${aspectClass} ${className} relative overflow-hidden bg-slate-200 dark:bg-slate-900`}>
      <img
        src={src}
        alt={alt}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full object-cover"
      />
    </div>
  );
}
