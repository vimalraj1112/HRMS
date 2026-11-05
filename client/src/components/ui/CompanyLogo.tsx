import { useState, type ReactNode } from 'react';
import { companyLogoUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CompanyLogoProps {
  className?: string;
  alt?: string;
  fallback?: ReactNode;
}

export function CompanyLogo({ className, alt = 'Company logo', fallback }: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);

  if (failed) return fallback ? <>{fallback}</> : null;

  return (
    <img
      src={companyLogoUrl}
      alt={alt}
      className={cn('object-contain', className)}
      onError={() => setFailed(true)}
    />
  );
}
