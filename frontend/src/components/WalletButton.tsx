import React from "react";
import { Wallet, Loader2, LogOut, ExternalLink } from "lucide-react";
import { useWallet } from "@/lib/walletContext";
import { shortenAddress } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const FREIGHTER_INSTALL_URL = "https://www.freighter.app/";

const WalletButton: React.FC = () => {
  const { publicKey, isConnecting, isFreighterAvailable, connect, disconnect, error } =
    useWallet();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close menu on outside click
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleConnect = async () => {
    if (!isFreighterAvailable) {
      toast({
        title: "Freighter not detected",
        description: "Install Freighter to connect your Stellar wallet.",
        variant: "destructive",
      });
      window.open(FREIGHTER_INSTALL_URL, "_blank", "noopener,noreferrer");
      return;
    }
    const addr = await connect();
    if (addr) {
      toast({ title: "Wallet connected", description: shortenAddress(addr, 6) });
    } else if (error) {
      toast({ title: "Connect failed", description: error, variant: "destructive" });
    }
  };

  if (!publicKey) {
    return (
      <Button
        onClick={handleConnect}
        disabled={isConnecting}
        className="bg-primary text-primary-foreground hover:bg-emerald-glow font-semibold text-sm h-10"
      >
        {isConnecting ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : (
          <Wallet className="h-4 w-4 mr-2" />
        )}
        {isFreighterAvailable ? "Connect Wallet" : "Install Freighter"}
      </Button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 hover:bg-primary/15 transition-colors"
      >
        <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
        <span className="font-mono text-xs text-primary font-semibold">
          {shortenAddress(publicKey, 4)}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-56 rounded-lg border border-border bg-card shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-border">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1">
              Connected
            </p>
            <p className="font-mono text-xs text-foreground break-all">{publicKey}</p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard?.writeText(publicKey).catch(() => {});
              toast({ title: "Address copied" });
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Copy Address
          </button>
          <button
            onClick={() => {
              disconnect();
              setOpen(false);
              toast({ title: "Disconnected" });
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-destructive hover:bg-destructive/10 transition-colors border-t border-border"
          >
            <LogOut className="h-3.5 w-3.5" />
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
};

export default WalletButton;
