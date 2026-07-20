// A small segmented-control radio group, used to render the Course, Semester,
// and Shift filter toggles (UC-11, UC-12) as visually distinct switches
// instead of a flat row of radios.

/**
 * @param {{
 *   legend: string,
 *   name: string,
 *   options: Array<{value: string, label: string}>,
 *   value: string,
 *   onChange: (value: string) => void,
 * }} props
 */
export default function FilterToggle({
  legend,
  name,
  options,
  value,
  onChange,
}) {
  return (
    <fieldset className="inline-flex gap-0.5 rounded-md border border-slate-300 bg-slate-50 p-0.5 text-sm">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label key={option.value} className="relative cursor-pointer">
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
          />
          <span
            className={`block rounded px-2 py-1 transition-colors peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-slate-500 peer-focus-visible:ring-offset-1 ${
              value === option.value
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-200'
            }`}
          >
            {option.label}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
