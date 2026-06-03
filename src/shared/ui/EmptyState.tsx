interface EmptyStateProps {
  message: string;
  icon?: string;
}

export function EmptyState({ message, icon = '◇' }: EmptyStateProps) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <div>{message}</div>
    </div>
  );
}
