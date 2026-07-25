import { ConnectButton, useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from "@mysten/dapp-kit";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  Moon,
  RefreshCw,
  ShieldAlert,
  Sun,
  Wallet,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchAccountLoans, fetchConfig, fetchOffers } from "./api";
import {
  COLLATERAL_DECIMALS,
  COLLATERAL_SYMBOL,
  PRINCIPAL_DECIMALS,
  PRINCIPAL_SYMBOL,
} from "./config";
import { dateTime, formatBps, formatDuration, formatUnits, parseUnits, shortAddress } from "./format";
import { localRiskScore } from "./risk";
import {
  buildAcceptOfferTx,
  buildCancelOfferTx,
  buildClaimDefaultTx,
  buildCreateOfferTx,
  buildRepayTx,
  getCoinBalance,
} from "./transactions";
import type { AppConfig, Loan, LoanOffer, RiskLevel, RiskScore } from "./types";

type View = "borrow" | "lend" | "detail";
type Theme = "light" | "dark";

interface Notice {
  tone: "success" | "error";
  text: string;
}

interface LendForm {
  principal: string;
  collateral: string;
  interest: string;
  durationDays: string;
  expiresDays: string;
  btcUsd: string;
}

const initialForm: LendForm = {
  principal: "1000",
  collateral: "0.05",
  interest: "75",
  durationDays: "30",
  expiresDays: "7",
  btcUsd: "60000",
};

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("nomad-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function App() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const signAndExecute = useSignAndExecuteTransaction();
  const [view, setView] = useState<View>("borrow");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [offers, setOffers] = useState<LoanOffer[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [selectedOffer, setSelectedOffer] = useState<LoanOffer | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<Theme>(initialTheme);

  async function refresh() {
    setLoading(true);
    try {
      const nextConfig = await fetchConfig();
      const [nextOffers, nextLoans] = await Promise.all([
        fetchOffers().catch(() => []),
        account ? fetchAccountLoans(account.address).catch(() => []) : Promise.resolve([]),
      ]);
      setConfig(nextConfig);
      setOffers(nextOffers);
      setLoans(nextLoans);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [account?.address]);

  useEffect(() => {
    window.localStorage.setItem("nomad-theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  async function execute(action: () => Promise<{ digest?: string }>) {
    setNotice(null);
    try {
      const result = await action();
      setNotice({ tone: "success", text: `Transaction submitted ${result.digest ? shortAddress(result.digest) : ""}`.trim() });
      await refresh();
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Transaction failed" });
    }
  }

  const shellReady = config !== null;

  return (
    <main className="app-shell" data-theme={theme}>
      <header className="topbar">
        <button className="brand" onClick={() => setView("borrow")}>
          <img className="brand-logo" src="/logo.jpeg" alt="" />
          <span>Nomad Finance</span>
        </button>
        <nav className="nav-pills" aria-label="Primary">
          <button className={view === "borrow" ? "active" : ""} onClick={() => setView("borrow")}>Borrow</button>
          <button className={view === "lend" ? "active" : ""} onClick={() => setView("lend")}>Lend</button>
          <button className={view === "detail" ? "active" : ""} onClick={() => setView("detail")}>Detail</button>
        </nav>
        <div className="topbar-actions">
          <button
            className="icon-button"
            onClick={() => setTheme((current) => (current === "light" ? "dark" : "light"))}
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
            aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button className="icon-button" onClick={() => void refresh()} title="Refresh">
            <RefreshCw size={18} />
          </button>
          <ConnectButton />
        </div>
      </header>

      {notice && (
        <div className={`notice ${notice.tone}`} role="status">
          {notice.tone === "success" ? <CheckCircle2 size={18} /> : <ShieldAlert size={18} />}
          <span>{notice.text}</span>
        </div>
      )}

      <section className="status-strip">
        <Metric label="Network" value={config?.suiNetwork ?? "testnet"} />
        <Metric label="Package" value={shortAddress(config?.suiPackageId ?? "")} />
        <Metric label="Registry" value={config?.suiRegistryObjectId ? shortAddress(config.suiRegistryObjectId) : "Pending"} />
        <Metric label="Wallet" value={account ? shortAddress(account.address) : "Disconnected"} />
      </section>

      {!shellReady ? (
        <section className="empty-state">Loading market state</section>
      ) : (
        <>
          {view === "borrow" && (
            <BorrowView
              offers={offers}
              loading={loading}
              selectedOffer={selectedOffer}
              onSelectOffer={setSelectedOffer}
              onOpenLoan={(loan) => {
                setSelectedLoan(loan);
                setView("detail");
              }}
              accountAddress={account?.address}
              config={config}
              onAccept={(offer) =>
                execute(async () => {
                  if (!account) throw new Error("Connect a wallet first");
                  const balance = await getCoinBalance(suiClient, account.address, config.collateralCoinType);
                  if (balance < BigInt(offer.collateralRequired)) throw new Error("Insufficient collateral balance");
                  const tx = await buildAcceptOfferTx({ client: suiClient, account: account.address, config, offer });
                  return await signAndExecute.mutateAsync({ transaction: tx });
                })
              }
            />
          )}
          {view === "lend" && (
            <LendView
              config={config}
              offers={offers}
              loans={loans}
              accountAddress={account?.address}
              onOpenOffer={(offer) => {
                setSelectedOffer(offer);
                setSelectedLoan(null);
                setView("detail");
              }}
              onOpenLoan={(loan) => {
                setSelectedLoan(loan);
                setView("detail");
              }}
              onCreate={(form) =>
                execute(async () => {
                  if (!account) throw new Error("Connect a wallet first");
                  const principalAmount = parseUnits(form.principal, PRINCIPAL_DECIMALS);
                  const fixedInterestAmount = parseUnits(form.interest, PRINCIPAL_DECIMALS);
                  const collateralRequired = parseUnits(form.collateral, COLLATERAL_DECIMALS);
                  const durationMs = Number(BigInt(form.durationDays) * 86_400_000n);
                  const expiresAtMs = Number(BigInt(Date.now()) + BigInt(form.expiresDays) * 86_400_000n);
                  const tx = await buildCreateOfferTx({
                    client: suiClient,
                    account: account.address,
                    config,
                    principalAmount,
                    fixedInterestAmount,
                    collateralRequired,
                    durationMs,
                    expiresAtMs,
                  });
                  return await signAndExecute.mutateAsync({ transaction: tx });
                })
              }
            />
          )}
          {view === "detail" && (
            <DetailView
              offer={selectedOffer}
              loan={selectedLoan}
              loans={loans}
              config={config}
              accountAddress={account?.address}
              onSelectLoan={setSelectedLoan}
              onCancel={(offer) =>
                execute(async () => {
                  if (!account) throw new Error("Connect a wallet first");
                  return await signAndExecute.mutateAsync({ transaction: buildCancelOfferTx(config, offer) });
                })
              }
              onRepay={(loan) =>
                execute(async () => {
                  if (!account) throw new Error("Connect a wallet first");
                  const tx = await buildRepayTx({ client: suiClient, account: account.address, config, loan });
                  return await signAndExecute.mutateAsync({ transaction: tx });
                })
              }
              onClaim={(loan) =>
                execute(async () => {
                  if (!account) throw new Error("Connect a wallet first");
                  return await signAndExecute.mutateAsync({ transaction: buildClaimDefaultTx(config, loan) });
                })
              }
            />
          )}
        </>
      )}
    </main>
  );
}

function BorrowView(props: {
  offers: LoanOffer[];
  loading: boolean;
  selectedOffer: LoanOffer | null;
  onSelectOffer: (offer: LoanOffer) => void;
  onOpenLoan: (loan: Loan) => void;
  accountAddress?: string;
  config: AppConfig;
  onAccept: (offer: LoanOffer) => void;
}) {
  return (
    <section className="workbench two-column">
      <div className="panel main-panel">
        <SectionHeader icon={<Banknote size={20} />} title="Borrow" count={props.offers.length} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Principal</th>
                <th>Collateral</th>
                <th>LTV</th>
                <th>Interest</th>
                <th>Total due</th>
                <th>Duration</th>
                <th>Maturity</th>
                <th>Lender</th>
                <th>Risk</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {props.offers.map((offer) => (
                <tr key={offer.offerId}>
                  <td>{formatUnits(offer.principalAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)}</td>
                  <td>{formatUnits(offer.collateralRequired, COLLATERAL_DECIMALS, COLLATERAL_SYMBOL)}</td>
                  <td>{formatBps(offer.startingLtvBps)}</td>
                  <td>{formatUnits(offer.fixedInterestAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)}</td>
                  <td>{formatUnits(offer.totalDueAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)}</td>
                  <td>{formatDuration(offer.durationMs)}</td>
                  <td>{dateTime(Date.now() + offer.durationMs)}</td>
                  <td>{shortAddress(offer.lender)}</td>
                  <td><RiskBadge risk={offer.riskLevel ?? "medium"} /></td>
                  <td>
                    <button className="pill small" onClick={() => props.onSelectOffer(offer)}>
                      Preview <ArrowRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!props.loading && props.offers.length === 0 && (
                <tr>
                  <td colSpan={10} className="table-empty">No open offers indexed</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <OfferPreview offer={props.selectedOffer} config={props.config} accountAddress={props.accountAddress} onAccept={props.onAccept} />
    </section>
  );
}

function OfferPreview(props: {
  offer: LoanOffer | null;
  config: AppConfig;
  accountAddress?: string;
  onAccept: (offer: LoanOffer) => void;
}) {
  const [balance, setBalance] = useState<bigint | null>(null);
  const client = useSuiClient();
  useEffect(() => {
    if (!props.accountAddress || !props.config.collateralCoinType || !props.offer) {
      setBalance(null);
      return;
    }
    void getCoinBalance(client, props.accountAddress, props.config.collateralCoinType).then(setBalance).catch(() => setBalance(null));
  }, [client, props.accountAddress, props.config.collateralCoinType, props.offer?.offerId]);

  if (!props.offer) {
    return <aside className="panel side-panel empty-state">Select an offer</aside>;
  }
  const hasBalance = balance !== null && balance >= BigInt(props.offer.collateralRequired);
  return (
    <aside className="panel side-panel">
      <SectionHeader icon={<Wallet size={20} />} title="Accept preview" />
      <DetailGrid
        rows={[
          ["Principal", formatUnits(props.offer.principalAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)],
          ["Collateral", formatUnits(props.offer.collateralRequired, COLLATERAL_DECIMALS, COLLATERAL_SYMBOL)],
          ["Total due", formatUnits(props.offer.totalDueAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)],
          ["Maturity", dateTime(Date.now() + props.offer.durationMs)],
          ["Collateral balance", balance === null ? "n/a" : formatUnits(balance, COLLATERAL_DECIMALS, COLLATERAL_SYMBOL)],
        ]}
      />
      <WarningBlock risk={props.offer.riskLevel ?? "medium"} />
      <button className="pill primary wide" disabled={!props.accountAddress || !hasBalance} onClick={() => props.onAccept(props.offer!)}>
        Sign accept
      </button>
    </aside>
  );
}

function LendView(props: {
  config: AppConfig;
  offers: LoanOffer[];
  loans: Loan[];
  accountAddress?: string;
  onCreate: (form: LendForm) => void;
  onOpenOffer: (offer: LoanOffer) => void;
  onOpenLoan: (loan: Loan) => void;
}) {
  const [form, setForm] = useState<LendForm>(initialForm);
  const risk = useMemo(() => {
    try {
      return localRiskScore({
        principalAmount: parseUnits(form.principal, PRINCIPAL_DECIMALS),
        fixedInterestAmount: parseUnits(form.interest, PRINCIPAL_DECIMALS),
        collateralAmount: parseUnits(form.collateral, COLLATERAL_DECIMALS),
        durationMs: Number(BigInt(form.durationDays || "0") * 86_400_000n),
        btcUsdPrice: parseUnits(form.btcUsd, PRINCIPAL_DECIMALS),
      });
    } catch {
      return null;
    }
  }, [form]);
  const lenderOffers = props.offers.filter((offer) => offer.lender === props.accountAddress);
  const lenderLoans = props.loans.filter((loan) => loan.lender === props.accountAddress);

  return (
    <section className="workbench two-column">
      <form
        className="panel form-panel"
        onSubmit={(event) => {
          event.preventDefault();
          props.onCreate(form);
        }}
      >
        <SectionHeader icon={<Banknote size={20} />} title="Lend" />
        <div className="form-grid">
          <TextField label={`Principal amount (${PRINCIPAL_SYMBOL})`} value={form.principal} onChange={(principal) => setForm((prev) => ({ ...prev, principal }))} />
          <TextField label={`Collateral amount (${COLLATERAL_SYMBOL})`} value={form.collateral} onChange={(collateral) => setForm((prev) => ({ ...prev, collateral }))} />
          <TextField label="Fixed interest" value={form.interest} onChange={(interest) => setForm((prev) => ({ ...prev, interest }))} />
          <TextField label="Duration days" value={form.durationDays} onChange={(durationDays) => setForm((prev) => ({ ...prev, durationDays }))} />
          <TextField label="Offer expiry days" value={form.expiresDays} onChange={(expiresDays) => setForm((prev) => ({ ...prev, expiresDays }))} />
          <TextField label="BTC/USD" value={form.btcUsd} onChange={(btcUsd) => setForm((prev) => ({ ...prev, btcUsd }))} />
        </div>
        {risk && <RiskPanel score={risk} />}
        <button className="pill primary wide" disabled={!props.accountAddress} type="submit">
          Sign create offer
        </button>
      </form>
      <div className="panel side-panel">
        <SectionHeader icon={<Clock3 size={20} />} title="Lender offers" count={lenderOffers.length} />
        <OfferList offers={lenderOffers} onOpen={props.onOpenOffer} />
        <div className="section-spacer" />
        <SectionHeader icon={<Clock3 size={20} />} title="Lender loans" count={lenderLoans.length} />
        <LoanList loans={lenderLoans} onOpen={props.onOpenLoan} />
      </div>
    </section>
  );
}

function DetailView(props: {
  offer: LoanOffer | null;
  loan: Loan | null;
  loans: Loan[];
  config: AppConfig;
  accountAddress?: string;
  onSelectLoan: (loan: Loan) => void;
  onCancel: (offer: LoanOffer) => void;
  onRepay: (loan: Loan) => void;
  onClaim: (loan: Loan) => void;
}) {
  const loan = props.loan ?? props.loans[0] ?? null;
  return (
    <section className="workbench two-column">
      <div className="panel main-panel">
        <SectionHeader icon={<ShieldAlert size={20} />} title="Loan detail" />
        {loan ? (
          <>
            <DetailGrid
              rows={[
                ["Loan", loan.loanId],
                ["Borrower", shortAddress(loan.borrower)],
                ["Lender", shortAddress(loan.lender)],
                ["Principal", formatUnits(loan.principalAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)],
                ["Collateral", formatUnits(loan.collateralAmount, COLLATERAL_DECIMALS, COLLATERAL_SYMBOL)],
                ["Total due", formatUnits(loan.totalDueAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)],
                ["Maturity", dateTime(loan.maturityMs)],
                ["Status", loan.status],
              ]}
            />
            <div className="action-row">
              <button
                className="pill primary"
                disabled={props.accountAddress !== loan.borrower || loan.status !== "active"}
                onClick={() => props.onRepay(loan)}
              >
                Sign repay
              </button>
              <button
                className="pill"
                disabled={props.accountAddress !== loan.lender || loan.status !== "active" || Date.now() <= loan.maturityMs}
                onClick={() => props.onClaim(loan)}
              >
                Claim default
              </button>
            </div>
          </>
        ) : props.offer ? (
          <>
            <DetailGrid
              rows={[
                ["Offer", props.offer.offerId],
                ["Lender", shortAddress(props.offer.lender)],
                ["Principal", formatUnits(props.offer.principalAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)],
                ["Collateral", formatUnits(props.offer.collateralRequired, COLLATERAL_DECIMALS, COLLATERAL_SYMBOL)],
                ["Status", props.offer.status],
              ]}
            />
            <button
              className="pill"
              disabled={props.accountAddress !== props.offer.lender || props.offer.status !== "open"}
              onClick={() => props.onCancel(props.offer!)}
            >
              Cancel offer
            </button>
          </>
        ) : (
          <div className="empty-state">No loan selected</div>
        )}
      </div>
      <div className="panel side-panel">
        <SectionHeader icon={<Clock3 size={20} />} title="Account loans" count={props.loans.length} />
        <LoanList loans={props.loans} onOpen={props.onSelectLoan} />
      </div>
    </section>
  );
}

function LoanList(props: { loans: Loan[]; onOpen: (loan: Loan) => void }) {
  if (props.loans.length === 0) return <div className="empty-state">No loans indexed</div>;
  return (
    <div className="loan-list">
      {props.loans.map((loan) => (
        <button key={loan.loanId} className="loan-row" onClick={() => props.onOpen(loan)}>
          <span>{formatUnits(loan.principalAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)}</span>
          <span>{dateTime(loan.maturityMs)}</span>
          <StatusPill status={loan.status} />
        </button>
      ))}
    </div>
  );
}

function OfferList(props: { offers: LoanOffer[]; onOpen: (offer: LoanOffer) => void }) {
  if (props.offers.length === 0) return <div className="empty-state compact">No open offers indexed</div>;
  return (
    <div className="loan-list">
      {props.offers.map((offer) => (
        <button key={offer.offerId} className="loan-row" onClick={() => props.onOpen(offer)}>
          <span>{formatUnits(offer.principalAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)}</span>
          <span>{formatDuration(offer.durationMs)}</span>
          <StatusPill status={offer.status} />
        </button>
      ))}
    </div>
  );
}

function SectionHeader(props: { icon: React.ReactNode; title: string; count?: number }) {
  return (
    <div className="section-header">
      <div className="section-title">{props.icon}<h1>{props.title}</h1></div>
      {props.count !== undefined && <span className="count">{props.count}</span>}
    </div>
  );
}

function Metric(props: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function TextField(props: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input inputMode="decimal" value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

function RiskPanel(props: { score: RiskScore }) {
  return (
    <div className="risk-panel">
      <div className="risk-topline">
        <RiskBadge risk={props.score.riskLevel} />
        <span>LTV {formatBps(props.score.startingLtvBps)}</span>
        <span>Buffer {formatBps(props.score.collateralBufferBps)}</span>
      </div>
      <WarningBlock risk={props.score.riskLevel} />
    </div>
  );
}

function WarningBlock(props: { risk: RiskLevel }) {
  return (
    <div className={`warning ${props.risk}`}>
      <AlertTriangle size={18} />
      <span>No liquidation will occur; lender market risk runs until maturity/default.</span>
    </div>
  );
}

function RiskBadge(props: { risk: RiskLevel }) {
  return <span className={`risk-badge ${props.risk}`}>{props.risk}</span>;
}

function StatusPill(props: { status: string }) {
  const Icon = props.status === "repaid" ? CheckCircle2 : props.status === "default_claimed" ? XCircle : Clock3;
  return <span className="status-pill"><Icon size={14} />{props.status}</span>;
}

function DetailGrid(props: { rows: Array<[string, string]> }) {
  return (
    <dl className="detail-grid">
      {props.rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default App;
