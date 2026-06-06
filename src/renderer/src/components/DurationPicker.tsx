import { SHORT_DURATION_PRESETS } from "@shared/project";

/**
 * A segmented control for the rough target length of a short. Used in Settings
 * (the global default) and in both find flows (initial empty state and the
 * add-one-more form). Values are the preset buckets in seconds.
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
    <div className="seg">
      {SHORT_DURATION_PRESETS.map((sec) => (
        <button
          type="button"
          key={sec}
          disabled={disabled}
          className={value === sec ? "on" : ""}
          onClick={() => onChange(sec)}
        >
          ~{sec}s
        </button>
      ))}
    </div>
  );
}
