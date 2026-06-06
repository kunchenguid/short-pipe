import { isUncappedDuration, SHORT_DURATION_PRESETS } from "@shared/project";

/**
 * A dropdown for the rough target length of a short. Used in Settings (the
 * global default) and in both find flows (initial empty state and the
 * add-one-more form). Values are the preset buckets in seconds; the uncapped
 * bucket lets the agent decide where to cut.
 */
export function DurationPicker({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (seconds: number) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="duration-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {SHORT_DURATION_PRESETS.map((sec) => (
        <option key={sec} value={sec}>
          {isUncappedDuration(sec) ? "No cap" : `~${sec}s`}
        </option>
      ))}
    </select>
  );
}
