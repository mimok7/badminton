import * as React from "react"
import { cn } from "@/lib/utils"

interface SwitchProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, onCheckedChange, checked, ...props }, ref) => {
    const [isChecked, setIsChecked] = React.useState(checked || false);

    React.useEffect(() => {
      if (checked !== undefined) {
        setIsChecked(checked);
      }
    }, [checked]);

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const newChecked = event.target.checked;
      setIsChecked(newChecked);
      onCheckedChange?.(newChecked);
    };

    return (
      <label className={cn("relative inline-flex items-center cursor-pointer", className)}>
        <input
          type="checkbox"
          className="sr-only peer"
          ref={ref}
          checked={isChecked}
          onChange={handleChange}
          {...props}
        />
        <div className="relative w-11 h-6 bg-gray-200 rounded-full peer peer-focus:ring-4 peer-focus:ring-blue-300 peer-checked:bg-blue-600 peer-disabled:opacity-50 peer-disabled:cursor-not-allowed transition-colors">
          <div className={cn(
            "absolute top-0.5 left-0.5 bg-white rounded-full h-5 w-5 transition-transform duration-200 ease-in-out",
            isChecked ? "translate-x-5" : "translate-x-0"
          )}></div>
        </div>
      </label>
    );
  }
);

Switch.displayName = "Switch";

export { Switch };
