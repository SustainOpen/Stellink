import React from "react";
import { Link, useLocation } from "react-router-dom";
import { LayoutGrid, Sparkles } from "lucide-react";
import WalletButton from "@/components/WalletButton";

const Header: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: "/", label: "Send", icon: Sparkles },
    { path: "/dashboard", label: "Inbox", icon: LayoutGrid },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="container flex h-14 items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="relative h-8 w-8 rounded-lg overflow-hidden ring-1 ring-primary/30 group-hover:ring-primary/60 transition-all">
            <img
              src="/logo.svg"
              alt="PayBeam"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/0 via-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-bold tracking-tight text-foreground leading-none">
              PayBeam
            </span>
            <span className="text-[10px] font-mono text-muted-foreground leading-none uppercase tracking-widest">
              v0.1
            </span>
          </div>
        </Link>

        {/* Nav */}
        <nav className="hidden sm:flex items-center gap-0.5 p-0.5 rounded-lg border border-border/70 bg-secondary/40">
          {navItems.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  isActive
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Link>
            );
          })}
        </nav>

        <WalletButton />
      </div>
    </header>
  );
};

export default Header;
