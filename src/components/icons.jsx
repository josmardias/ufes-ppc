// Minimal inline icon set (no external icon library dependency). Every icon
// is purely decorative and paired with a visible text label wherever it is
// used, so they are always `aria-hidden`.

function Icon({ children, className, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconArrowLeft(props) {
  return (
    <Icon {...props}>
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </Icon>
  );
}

export function IconPlus(props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Icon>
  );
}

export function IconUpload(props) {
  return (
    <Icon {...props}>
      <path d="M12 15V4" />
      <path d="M6.5 9.5L12 4l5.5 5.5" />
      <path d="M4 19.5h16" />
    </Icon>
  );
}

export function IconDownload(props) {
  return (
    <Icon {...props}>
      <path d="M12 4v11" />
      <path d="M6.5 10.5L12 16l5.5-5.5" />
      <path d="M4 19.5h16" />
    </Icon>
  );
}

export function IconCopy(props) {
  return (
    <Icon {...props}>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v7.5A1.5 1.5 0 0 0 6 15h2.5" />
    </Icon>
  );
}

export function IconPencil(props) {
  return (
    <Icon {...props}>
      <path d="M4.5 19.5l.9-4 10-10 3.1 3.1-10 10-4 .9z" />
      <path d="M13.5 6.5l3.1 3.1" />
    </Icon>
  );
}

export function IconTrash(props) {
  return (
    <Icon {...props}>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" />
      <path d="M6.5 7l.9 12a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-12" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </Icon>
  );
}

export function IconUsers(props) {
  return (
    <Icon {...props}>
      <circle cx="9.5" cy="8.5" r="3" />
      <path d="M3 20c0-3.6 2.9-5.8 6.5-5.8s6.5 2.2 6.5 5.8" />
      <circle cx="17" cy="9.5" r="2.3" />
      <path d="M16 14.4c2.4.5 4 2.4 4 5.6" />
    </Icon>
  );
}
