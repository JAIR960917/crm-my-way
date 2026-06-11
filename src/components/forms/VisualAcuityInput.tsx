import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  VISUAL_ACUITY_FIELDS,
  clampPercentInput,
  emptyVisualAcuity,
  parseVisualAcuity,
  type VisualAcuityValue,
} from "@/lib/visualAcuity";

type Props = {
  value: unknown;
  onChange: (value: VisualAcuityValue) => void;
  compact?: boolean;
};

export default function VisualAcuityInput({ value, onChange, compact }: Props) {
  const current = parseVisualAcuity(value);

  const setPart = (key: keyof VisualAcuityValue, input: string) => {
    onChange({ ...current, [key]: clampPercentInput(input) });
  };

  return (
    <div className={compact ? "space-y-2" : "space-y-3 rounded-lg border bg-muted/20 p-3"}>
      {VISUAL_ACUITY_FIELDS.map(({ key, label }) => (
        <div key={key} className="flex items-center gap-2 sm:gap-3">
          <Label className={`shrink-0 font-medium ${compact ? "text-xs w-[72px]" : "text-sm w-[80px]"}`}>
            {label}
          </Label>
          <div className="flex items-center gap-1 flex-1 max-w-[140px]">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={current[key] || ""}
              onChange={(e) => setPart(key, e.target.value)}
              className={compact ? "h-8 text-sm text-right" : "h-9 text-right"}
              aria-label={`${label} porcentagem`}
            />
            <span className="text-sm text-muted-foreground shrink-0">%</span>
          </div>
        </div>
      ))}
      {!compact && (
        <p className="text-[11px] text-muted-foreground pt-1">
          Informe de 0 a 100% o quanto o cliente enxergou em cada medida.
        </p>
      )}
    </div>
  );
}

export function ensureVisualAcuityDefault(value: unknown): VisualAcuityValue {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return parseVisualAcuity(value);
  }
  return emptyVisualAcuity();
}
