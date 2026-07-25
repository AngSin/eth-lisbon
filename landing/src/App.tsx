import { ArrowRight, BadgeCheck, Blocks, Gauge, ShieldCheck, Sparkles } from "lucide-react";

const TESTNET_URL = "https://testnet.nomadfinance.io";

const signals = [
  { label: "Collateral", value: "BTC backed" },
  { label: "Network", value: "Testnet" },
  { label: "Terms", value: "Fixed" },
];

const features = [
  {
    icon: ShieldCheck,
    title: "No liquidation risk",
    text: "Borrowers are never forced out of their BTC by market moves during the loan term.",
  },
  {
    icon: Blocks,
    title: "Lender-defined terms",
    text: "Lenders publish pre-defined loan terms before borrowers accept, so the repayment schedule is clear upfront.",
  },
  {
    icon: Gauge,
    title: "Fixed interest",
    text: "Loans use fixed terms and fixed interest, so rates do not change after the borrower accepts.",
  },
];

export default function App() {
  return (
    <main className="landing-shell">
      <nav className="topbar" aria-label="Primary">
        <a className="brand" href="/" aria-label="Nomad Finance home">
          <img src="/logo-mark.svg" alt="" />
          <span>Nomad Finance</span>
        </a>
        <a className="nav-action" href={TESTNET_URL}>
          Launch testnet
          <ArrowRight size={18} aria-hidden="true" />
        </a>
      </nav>

      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">
            <Sparkles size={16} aria-hidden="true" />
            Sui testnet credit market
          </p>
          <h1 id="hero-title">Nomad Finance</h1>
          <p className="lede">
            BTC backed loans with lender-defined fixed terms, no liquidation risk for borrowers, and no changing
            interest rates after acceptance.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href={TESTNET_URL}>
              Open testnet app
              <ArrowRight size={20} aria-hidden="true" />
            </a>
            <span className="status-pill">
              <BadgeCheck size={18} aria-hidden="true" />
              Public testnet
            </span>
          </div>
        </div>

        <div className="market-panel" aria-label="Nomad market preview">
          <div className="panel-header">
            <span>Loan route</span>
            <strong>Sui testnet</strong>
          </div>
          <div className="route-line">
            <span>BTC collateral</span>
            <ArrowRight size={18} aria-hidden="true" />
            <span>USDC principal</span>
          </div>
          <div className="metric-grid">
            {signals.map((signal) => (
              <div className="metric" key={signal.label}>
                <span>{signal.label}</span>
                <strong>{signal.value}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="feature-band" aria-label="Platform highlights">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <article className="feature" key={feature.title}>
              <Icon size={24} aria-hidden="true" />
              <h2>{feature.title}</h2>
              <p>{feature.text}</p>
            </article>
          );
        })}
      </section>
    </main>
  );
}
