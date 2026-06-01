import * as React from 'react';
import { Link } from 'react-router-dom';

interface SidebarLinkProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  isOpen: boolean;
}

export function SidebarLink({ to, icon, label, isOpen }: SidebarLinkProps) {
  return (
    <Link 
      to={to} 
      className="flex items-center gap-4 p-3 rounded-xl hover:bg-black/5 transition-all group"
    >
      <span className="text-black/60 group-hover:text-black">{icon}</span>
      {isOpen && <span className="font-medium">{label}</span>}
    </Link>
  );
}

export default SidebarLink;
