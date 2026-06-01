import { cn } from '../utils/cn.js';

interface FinanceCardProps {
  label: string;
  value: number;
  color: string;
  bg?: string;
}

export function FinanceCard({ label, value, color, bg = "bg-white" }: FinanceCardProps) {
  return (
    <div className={cn("p-8 rounded-[40px] border border-black/5 shadow-sm space-y-1 transition-all duration-300", bg)}>
      <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">{label}</p>
      <p className={cn("text-3xl font-black font-serif leading-tight", color)}>
        {value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
      </p>
    </div>
  );
}

export default FinanceCard;
