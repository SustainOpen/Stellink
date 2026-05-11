import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Zap, Shield, Repeat, Sparkles } from "lucide-react";
import { STELLAR_NETWORK } from "@/lib/configAddress";
import { useWallet } from "@/lib/walletContext";
import { shortenAddress } from "@/lib/types";

const capabilities = [
  {
    icon: Zap,
    label: "Instant settlement",
    body: "Stellar finalises in 5 seconds. Recipients see the payment land before they close the tab.",
  },
  {
    icon: Repeat,
    label: "One link, many payments",
    body: "Recurring links accept unlimited payments — perfect for tip jars, donations, and subscriptions.",
  },
  {
    icon: Shield,
    label: "Native escrow",
    body: "Funds locked as a Stellar claimable balance. Auto-refund if the recipient never claims.",
  },
];

const HeroSection: React.FC = () => {
  const networkLabel = STELLAR_NETWORK === "public" ? "Mainnet" : "Testnet";
  const { publicKey } = useWallet();

  return (
    <section className="relative beam-rays mb-12">
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left column — copy */}
        <div className="lg:col-span-7 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/25 bg-primary/5"
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-medium tracking-wide uppercase text-primary">
              Stellar {networkLabel} · Live
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
            className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.05] text-foreground"
          >
            Send a payment link.{" "}
            <span className="relative inline-block">
              <span className="bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
                Get paid in seconds.
              </span>
              <span className="absolute -bottom-1 left-0 right-0 h-[2px] beam-glow rounded-full opacity-70" />
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed"
          >
            PayBeam turns your Stellar address into a sharable link. Drop it on
            an invoice, a checkout page, or a DM — anyone can open the link,
            tap pay, and the funds settle on-chain. No checkout flow to
            integrate. No custodian. No back-and-forth.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="flex flex-wrap items-center gap-3 pt-2"
          >
            <a
              href="#create"
              className="group inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-semibold hover:bg-emerald-glow transition-all"
            >
              Create your first link
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            {publicKey ? (
              <span className="inline-flex items-center gap-2 rounded-xl border border-primary/25 bg-primary/5 px-4 py-2.5 text-xs font-medium text-primary font-mono">
                <span className="h-1.5 w-1.5 rounded-full bg-primary beam-pulse" />
                {shortenAddress(publicKey, 6)}
              </span>
            ) : (
              <a
                href="https://www.freighter.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl beam-outline px-5 py-2.5 text-sm font-semibold"
              >
                Get Freighter
              </a>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex items-center gap-4 pt-3 text-[11px] text-muted-foreground"
          >
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary beam-pulse" />
              Open source · MIT
            </span>
            <span className="opacity-40">·</span>
            <span>Built with Soroban</span>
            <span className="opacity-40">·</span>
            <span>No backend required</span>
          </motion.div>
        </div>

        {/* Right column — capabilities stack */}
        <div className="lg:col-span-5 space-y-3">
          {capabilities.map(({ icon: Icon, label, body }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.2 + i * 0.08 }}
              className="glass-card p-4 flex items-start gap-3 group hover:border-primary/30 transition-colors"
            >
              <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/15 transition-colors">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <p className="text-sm font-semibold text-foreground">{label}</p>
                <p className="text-[12px] text-muted-foreground leading-relaxed">
                  {body}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
