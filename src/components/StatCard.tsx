import { cn } from '../utils/cn.js';

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  onClick?: () => void;
  color?: string;
  bg?: string;
}

export function StatCard({ label, value, sub, onClick, color, bg = "bg-white" }: StatCardProps) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "p-8 rounded-[40px] border border-black/5 shadow-sm transition-all duration-300 h-full flex flex-col justify-center space-y-1",
        bg,
        onClick && "cursor-pointer hover:bg-black/[0.02] hover:shadow-md active:scale-[0.98]"
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">{label}</p>
      <p className={cn("text-3xl font-black font-serif leading-tight", color || "text-black")}>{value}</p>
      {sub && <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 opacity-80">{sub}</p>}
    </div>
  );
}

export default StatCard;
