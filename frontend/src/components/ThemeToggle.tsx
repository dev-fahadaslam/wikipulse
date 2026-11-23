import { useTheme } from "../hooks/useTheme";

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3.3" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="M8 0.8v1.8" />
        <path d="M8 13.4v1.8" />
        <path d="M15.2 8h-1.8" />
        <path d="M2.6 8H0.8" />
        <path d="M13.1 2.9l-1.3 1.3" />
        <path d="M4.2 11.8l-1.3 1.3" />
        <path d="M13.1 13.1l-1.3-1.3" />
        <path d="M4.2 4.2L2.9 2.9" />
      </g>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M14 9.8A6.3 6.3 0 1 1 6.2 2a5 5 0 0 0 7.8 7.8z"
        fill="currentColor"
      />
    </svg>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to day mode" : "Switch to night mode"}
      title={isDark ? "Switch to day mode" : "Switch to night mode"}
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
