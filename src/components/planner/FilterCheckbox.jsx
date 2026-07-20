// A simple on/off filter switch, used for the Course, Semester, and
// Classification filters (UC-11, UC-12). Each behaves as "apply this
// filter" (off, the narrower default) vs "don't filter" (on, show
// everything the filter would otherwise hide).

/**
 * @param {{
 *   label: string,
 *   checked: boolean,
 *   onChange: (checked: boolean) => void,
 * }} props
 */
export default function FilterCheckbox({ label, checked, onChange }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${checked ? 'bg-slate-900' : 'bg-slate-300'}`}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
        />
        <span
          className={`inline-block size-4 transform rounded-full bg-white shadow transition-transform peer-focus-visible:ring-2 peer-focus-visible:ring-slate-500 peer-focus-visible:ring-offset-1 ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      {label}
    </label>
  );
}
