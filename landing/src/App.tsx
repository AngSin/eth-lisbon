import { ArrowRight, BadgeCheck, Blocks, Gauge, ShieldCheck, Sparkles } from "lucide-react";

const TESTNET_URL = "https://testnet.nomadfinance.io";

const signals = [
  { label: "Collateralized", value: "Sui-native" },
  { label: "Network", value: "Testnet" },
  { label: "Settlement", value: "On-chain" },
];

const features = [
  {
    icon: ShieldCheck,
    title: "Risk rails",
    text: "Loan actions are routed through transparent collateral and registry checks before execution.",
  },
  {
    icon: Blocks,
    title: "Composable core",
    text: "Built around Sui objects so positions, balances, and registry state stay inspectable.",
  },
  {
    icon: Gauge,
    title: "Fast testnet flow",
    text: "Open the testnet app, connect a wallet, and exercise the lending workflow directly.",
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
            Structured crypto-backed loans for teams testing how capital can move across Sui-native collateral,
            principal assets, and transparent repayment flows.
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
            <span>hBTC collateral</span>
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
