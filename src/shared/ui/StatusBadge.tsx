import { statusBadge } from '@/shared/lib/format';

export function StatusBadge({ estado }: { estado: string | null | undefined }) {
  const { className, label } = statusBadge(estado);
  return <span className={`badge ${className}`}>{label}</span>;
}
