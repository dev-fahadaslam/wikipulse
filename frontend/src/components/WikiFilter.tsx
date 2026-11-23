import { ALL_WIKIS, type WikiVolume } from "../types";

interface WikiFilterProps {
  wikis: WikiVolume[];
  value: string;
  onChange: (wiki: string) => void;
}

export function WikiFilter({ wikis, value, onChange }: WikiFilterProps) {
  return (
    <label className="wiki-filter">
      <span>Filter by wiki</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value={ALL_WIKIS}>All wikis</option>
        {wikis.map((w) => (
          <option key={w.wiki} value={w.wiki}>
            {w.wiki} ({w.count_recent})
          </option>
        ))}
      </select>
    </label>
  );
}
