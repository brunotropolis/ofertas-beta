import { cn } from "@/lib/utils";

interface Props {
  collapsed?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = {
  sm: { box: "h-7 w-7", text: "text-xs", word: "text-sm" },
  md: { box: "h-8 w-8", text: "text-sm", word: "text-[15px]" },
  lg: { box: "h-12 w-12", text: "text-base", word: "text-2xl" },
};

export function Logo({ collapsed = false, size = "md", className }: Props) {
  const s = SIZES[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {/* Monogram — orange→pink gradient with subtle inner stroke */}
      <div
        className={cn(
          "relative shrink-0 rounded-[10px] grid place-items-center font-display font-semibold text-white tracking-tightest",
          s.box,
          s.text
        )}
        style={{
          background:
            "linear-gradient(135deg, #ff7a30 0%, #ff4e62 100%)",
          boxShadow:
            "inset 0 0 0 1px rgba(255,255,255,0.18), 0 6px 20px -8px rgba(255, 107, 53, 0.6)",
        }}
        aria-hidden
      >
        bg
      </div>

      {!collapsed && (
        <div className="leading-none">
          <p
            className={cn(
              "font-display font-medium text-zinc-100 tracking-tightest",
              s.word
            )}
          >
            buscador<span className="text-orange-500">.</span>geek
          </p>
          {size === "lg" && (
            <p className="text-[11px] text-zinc-500 mt-1 tracking-wide uppercase">
              painel admin
            </p>
          )}
        </div>
      )}
    </div>
  );
}
