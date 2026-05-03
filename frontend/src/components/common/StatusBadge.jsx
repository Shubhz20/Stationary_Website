import { getStatusConfig } from '../../utils/format';

export default function StatusBadge({ status }) {
  const config = getStatusConfig(status);
  return (
    <span
      className="status-badge"
      style={{
        color: config.color,
        backgroundColor: config.bg,
        padding: '4px 12px',
        borderRadius: '9999px',
        fontSize: '0.8rem',
        fontWeight: 600,
        display: 'inline-block',
      }}
    >
      {config.label}
    </span>
  );
}
