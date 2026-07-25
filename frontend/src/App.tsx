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
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fetchAccountLoans, fetchBtcUsdcPrice, fetchConfig, fetchOffers } from "./api";
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
  aprPercent: string;
  durationDays: string;
  expiresDays: string;
  btcUsd: string;
}

const initialForm: LendForm = {
  principal: "1000",
  collateral: "0.05",
  aprPercent: "12",
  durationDays: "30",
  expiresDays: "7",
  btcUsd: "60000",
};

function initialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = window.localStorage.getItem("nomad-theme");
  if (stored === "light" || stored === "dark") return stored;
  return "light";
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
  const [marketBtcUsd, setMarketBtcUsd] = useState<string | null>(null);
  const [marketUpdatedAt, setMarketUpdatedAt] = useState<string | null>(null);

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

  function changeView(nextView: View) {
    setView(nextView);
    if (nextView !== view) void refresh();
  }

  useEffect(() => {
    void refresh();
  }, [account?.address]);

  useEffect(() => {
    void fetchBtcUsdcPrice()
      .then((price) => {
        setMarketUpdatedAt(price.updatedAt);
        const rounded = Number(price.rate).toFixed(PRINCIPAL_DECIMALS);
        if (Number.isFinite(Number(rounded))) {
          setMarketBtcUsd(rounded);
        }
      })
      .catch(() => {
        setMarketBtcUsd(null);
        setMarketUpdatedAt(null);
      });
  }, []);

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
        <button className="brand" onClick={() => changeView("borrow")}>
          <img className="brand-logo" src="/logo-mark.svg" alt="" />
          <span>Nomad Finance</span>
        </button>
        <nav className="nav-pills" aria-label="Primary">
          <button className={view === "borrow" ? "active" : ""} onClick={() => changeView("borrow")}>Borrow</button>
          <button className={view === "lend" ? "active" : ""} onClick={() => changeView("lend")}>Lend</button>
          <button className={view === "detail" ? "active" : ""} onClick={() => changeView("detail")}>Manage</button>
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
              marketBtcUsd={marketBtcUsd}
              onOpenOffer={(offer) => {
                setSelectedOffer(offer);
                setSelectedLoan(null);
                changeView("detail");
              }}
            />
          )}
          {view === "lend" && (
            <LendView
              config={config}
              offers={offers}
              loans={loans}
              marketBtcUsd={marketBtcUsd}
              marketUpdatedAt={marketUpdatedAt}
              accountAddress={account?.address}
              onOpenOffer={(offer) => {
                setSelectedOffer(offer);
                setSelectedLoan(null);
                changeView("detail");
              }}
              onOpenLoan={(loan) => {
                setSelectedLoan(loan);
                changeView("detail");
              }}
              onCreate={(form) =>
                execute(async () => {
                  if (!account) throw new Error("Connect a wallet first");
                  const principalAmount = parseUnits(form.principal, PRINCIPAL_DECIMALS);
                  const durationMs = Number(BigInt(form.durationDays) * 86_400_000n);
                  const fixedInterestAmount = fixedInterestFromApr({
                    principalAmount,
                    aprBps: parsePercentBps(form.aprPercent),
                    durationMs,
                  });
                  const collateralRequired = parseUnits(form.collateral, COLLATERAL_DECIMALS);
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
              marketBtcUsd={marketBtcUsd}
              accountAddress={account?.address}
              onSelectLoan={setSelectedLoan}
              onAccept={(offer) =>
                execute(async () => {
                  if (!account) throw new Error("Connect a wallet first");
                  const balance = await getCoinBalance(suiClient, account.address, config.collateralCoinType);
                  if (balance < BigInt(offer.collateralRequired)) throw new Error("Insufficient collateral balance");
                  const tx = await buildAcceptOfferTx({ client: suiClient, account: account.address, config, offer });
                  return await signAndExecute.mutateAsync({ transaction: tx });
                })
              }
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
  marketBtcUsd: string | null;
  onOpenOffer: (offer: LoanOffer) => void;
}) {
  return (
    <section className="workbench">
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
                <th>Lender</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {props.offers.map((offer) => (
                <tr key={offer.offerId}>
                  <td>{formatUnits(offer.principalAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)}</td>
                  <td>{formatUnits(offer.collateralRequired, COLLATERAL_DECIMALS, COLLATERAL_SYMBOL)}</td>
                  <td>{formatOfferLtv(offer, props.marketBtcUsd)}</td>
                  <td>{formatUnits(offer.fixedInterestAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)}</td>
                  <td>{formatUnits(offer.totalDueAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)}</td>
                  <td>{formatDuration(offer.durationMs)}</td>
                  <td>{shortAddress(offer.lender)}</td>
                  <td>
                    <button className="pill small" onClick={() => props.onOpenOffer(offer)}>
                      Preview <ArrowRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!props.loading && props.offers.length === 0 && (
                <tr>
                  <td colSpan={8} className="table-empty">No open offers indexed</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function LendView(props: {
  config: AppConfig;
  offers: LoanOffer[];
  loans: Loan[];
  marketBtcUsd: string | null;
  marketUpdatedAt: string | null;
  accountAddress?: string;
  onCreate: (form: LendForm) => void;
  onOpenOffer: (offer: LoanOffer) => void;
  onOpenLoan: (loan: Loan) => void;
}) {
  const [form, setForm] = useState<LendForm>(initialForm);
  useEffect(() => {
    if (props.marketBtcUsd) {
      setForm((prev) => ({ ...prev, btcUsd: props.marketBtcUsd! }));
    }
  }, [props.marketBtcUsd]);
  const durationMs = useMemo(() => Number(BigInt(form.durationDays || "0") * 86_400_000n), [form.durationDays]);
  const principalAmount = useMemo(() => {
    try {
      return parseUnits(form.principal, PRINCIPAL_DECIMALS);
    } catch {
      return 0n;
    }
  }, [form.principal]);
  const fixedInterestAmount = useMemo(() => {
    try {
      return fixedInterestFromApr({
        principalAmount,
        aprBps: parsePercentBps(form.aprPercent),
        durationMs,
      });
    } catch {
      return 0n;
    }
  }, [form.aprPercent, durationMs, principalAmount]);
  const riskPreview = useMemo(() => {
    try {
      return {
        score: localRiskScore({
          principalAmount,
          fixedInterestAmount,
          collateralAmount: parseUnits(form.collateral, COLLATERAL_DECIMALS),
          durationMs,
          btcUsdPrice: parseUnits(form.btcUsd, PRINCIPAL_DECIMALS),
        }),
        error: null,
      };
    } catch (error) {
      return {
        score: null,
        error: error instanceof Error ? error.message : "Risk preview unavailable",
      };
    }
  }, [durationMs, fixedInterestAmount, form.btcUsd, form.collateral, principalAmount]);
  const risk = riskPreview.score;
  const fallbackRisk = useMemo<RiskScore>(() => ({
    startingLtvBps: 0,
    collateralBufferBps: 0,
    breakEvenDrawdownBps: 0,
    durationBucket: "short",
    interestBps: 0,
    riskLevel: "critical",
    warning: riskPreview.error ?? "Risk preview unavailable",
  }), [riskPreview.error]);
  const lenderOffers = props.offers.filter((offer) => offer.lender === props.accountAddress);
  const lenderLoans = props.loans.filter((loan) => loan.lender === props.accountAddress);
  const canCreateOffer = useMemo(() => {
    try {
      parseUnits(form.principal, PRINCIPAL_DECIMALS);
      parseUnits(form.collateral, COLLATERAL_DECIMALS);
      parsePercentBps(form.aprPercent);
      if (!/^\d+$/.test(form.durationDays) || BigInt(form.durationDays) <= 0n) return false;
      if (!/^\d+$/.test(form.expiresDays) || BigInt(form.expiresDays) <= 0n) return false;
      return true;
    } catch {
      return false;
    }
  }, [form.aprPercent, form.collateral, form.durationDays, form.expiresDays, form.principal]);

  return (
    <section className="workbench two-column">
      <form
        className="panel form-panel"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canCreateOffer) return;
          props.onCreate(form);
        }}
      >
        <SectionHeader icon={<Banknote size={20} />} title="Lend" />
        <div className="form-grid">
          <TextField
            label={`Principal amount (${PRINCIPAL_SYMBOL})`}
            value={form.principal}
            maxDecimals={PRINCIPAL_DECIMALS}
            onChange={(principal) => setForm((prev) => ({ ...prev, principal }))}
          />
          <TextField
            label={`Collateral amount (${COLLATERAL_SYMBOL})`}
            value={form.collateral}
            maxDecimals={COLLATERAL_DECIMALS}
            onChange={(collateral) => setForm((prev) => ({ ...prev, collateral }))}
          />
          <TextField
            label="Annualized interest (APR %)"
            value={form.aprPercent}
            maxDecimals={2}
            onChange={(aprPercent) => setForm((prev) => ({ ...prev, aprPercent }))}
          />
          <TextField
            label="Duration days"
            value={form.durationDays}
            maxDecimals={0}
            onChange={(durationDays) => setForm((prev) => ({ ...prev, durationDays }))}
          />
          <TextField
            label="Offer expiry days"
            value={form.expiresDays}
            maxDecimals={0}
            onChange={(expiresDays) => setForm((prev) => ({ ...prev, expiresDays }))}
          />
          <TextField
            label="BTC Price"
            value={formatUsdPrice(form.btcUsd)}
            onChange={() => undefined}
            readOnly
            hint={props.marketUpdatedAt ? `LiveCoinWatch ${dateTime(Date.parse(props.marketUpdatedAt))}` : "Fallback until LiveCoinWatch is configured"}
          />
        </div>
        {risk && (
          <RiskPanel
            score={risk}
            aprPercent={form.aprPercent}
            fixedInterestAmount={fixedInterestAmount}
          />
        )}
        {!risk && (
          <RiskPanel
            score={fallbackRisk}
            aprPercent={form.aprPercent}
            fixedInterestAmount={fixedInterestAmount}
            previewError={riskPreview.error ?? "Risk preview unavailable"}
          />
        )}
        <button className="pill primary wide" disabled={!props.accountAddress || !canCreateOffer} type="submit">
          Create offer
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
  marketBtcUsd: string | null;
  accountAddress?: string;
  onSelectLoan: (loan: Loan) => void;
  onAccept: (offer: LoanOffer) => void;
  onCancel: (offer: LoanOffer) => void;
  onRepay: (loan: Loan) => void;
  onClaim: (loan: Loan) => void;
}) {
  const loan = props.offer ? props.loan : props.loan ?? props.loans[0] ?? null;
  const offer = loan ? null : props.offer;
  const [collateralBalance, setCollateralBalance] = useState<bigint | null>(null);
  const client = useSuiClient();

  useEffect(() => {
    if (!props.accountAddress || !props.config.collateralCoinType || !offer) {
      setCollateralBalance(null);
      return;
    }
    void getCoinBalance(client, props.accountAddress, props.config.collateralCoinType)
      .then(setCollateralBalance)
      .catch(() => setCollateralBalance(null));
  }, [client, props.accountAddress, props.config.collateralCoinType, offer?.offerId]);

  const hasCollateralBalance = offer !== null && collateralBalance !== null && collateralBalance >= BigInt(offer.collateralRequired);

  return (
    <section className="workbench two-column">
      <div className="panel main-panel">
        <SectionHeader icon={<ShieldAlert size={20} />} title={offer ? "Offer detail" : "Loan detail"} />
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
                Repay
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
        ) : offer ? (
          <>
            <DetailGrid
              rows={[
                ["Offer", offer.offerId],
                ["Lender", shortAddress(offer.lender)],
                ["Principal", formatUnits(offer.principalAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)],
                ["Collateral", formatUnits(offer.collateralRequired, COLLATERAL_DECIMALS, COLLATERAL_SYMBOL)],
                ["LTV", formatOfferLtv(offer, props.marketBtcUsd)],
                ["Interest", formatUnits(offer.fixedInterestAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)],
                ["Total due", formatUnits(offer.totalDueAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)],
                ["Duration", formatDuration(offer.durationMs)],
                ["Maturity", dateTime(Date.now() + offer.durationMs)],
                ["Collateral balance", collateralBalance === null ? "n/a" : formatUnits(collateralBalance, COLLATERAL_DECIMALS, COLLATERAL_SYMBOL)],
                ["Status", offer.status],
              ]}
            />
            <WarningBlock risk={offer.riskLevel ?? "medium"} />
            <div className="action-row">
              <button
                className="pill primary"
                disabled={!props.accountAddress || !hasCollateralBalance || offer.status !== "open"}
                onClick={() => props.onAccept(offer)}
              >
                Accept
              </button>
              <button
                className="pill"
                disabled={props.accountAddress !== offer.lender || offer.status !== "open"}
                onClick={() => props.onCancel(offer)}
              >
                Cancel offer
              </button>
            </div>
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

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxDecimals?: number;
  readOnly?: boolean;
  hint?: string;
}) {
  function handleChange(value: string) {
    if (props.maxDecimals !== undefined && !decimalInputWithinLimit(value, props.maxDecimals)) return;
    props.onChange(value);
  }

  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        inputMode="decimal"
        value={props.value}
        readOnly={props.readOnly}
        aria-readonly={props.readOnly}
        onChange={(event) => handleChange(event.target.value)}
      />
      {props.hint && <small>{props.hint}</small>}
    </label>
  );
}

function RiskPanel(props: {
  score: RiskScore;
  aprPercent: string;
  fixedInterestAmount: bigint;
  previewError?: string;
}) {
  return (
    <div className="risk-panel">
      <div className="risk-topline">
        <RiskBadge risk={props.score.riskLevel} />
        <span>APR {formatApr(props.aprPercent)}</span>
        <span>Fixed {formatUnits(props.fixedInterestAmount, PRINCIPAL_DECIMALS, PRINCIPAL_SYMBOL)}</span>
        <span>LTV {props.previewError ? "n/a" : formatBps(props.score.startingLtvBps)}</span>
        <span>Buffer {props.previewError ? "n/a" : formatBps(props.score.collateralBufferBps)}</span>
      </div>
      {props.previewError && <p className="risk-error">{props.previewError}</p>}
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

function parsePercentBps(input: string): bigint {
  const parsed = parseUnits(input, 2);
  if (parsed < 0n) throw new Error("APR must be non-negative");
  return parsed;
}

function fixedInterestFromApr(input: {
  principalAmount: bigint;
  aprBps: bigint;
  durationMs: number;
}): bigint {
  if (!Number.isFinite(input.durationMs) || input.durationMs <= 0) {
    throw new Error("Duration must be positive");
  }
  return (input.principalAmount * input.aprBps * BigInt(Math.trunc(input.durationMs))) / (10_000n * 365n * 86_400_000n);
}

function formatApr(input: string): string {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return "n/a";
  return `${parsed.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function formatUsdPrice(input: string): string {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return "$0";
  return `$${parsed.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatOfferLtv(offer: LoanOffer, marketBtcUsd: string | null): string {
  const startingLtvBps = offer.startingLtvBps ?? calculateOfferLtvBps(offer, marketBtcUsd);
  return formatBps(startingLtvBps);
}

function calculateOfferLtvBps(offer: LoanOffer, marketBtcUsd: string | null): number | undefined {
  if (!marketBtcUsd) return undefined;
  try {
    const principalAmount = BigInt(offer.principalAmount);
    const collateralAmount = BigInt(offer.collateralRequired);
    const btcUsdPrice = parseUnits(marketBtcUsd, PRINCIPAL_DECIMALS);
    if (principalAmount <= 0n || collateralAmount <= 0n || btcUsdPrice <= 0n) return undefined;
    const collateralUsd = (collateralAmount * btcUsdPrice) / 10n ** BigInt(COLLATERAL_DECIMALS);
    if (collateralUsd <= 0n) return undefined;
    return Number((principalAmount * 10_000n) / collateralUsd);
  } catch {
    return undefined;
  }
}

function decimalInputWithinLimit(input: string, maxDecimals: number): boolean {
  if (input === "") return true;
  if (maxDecimals === 0) return /^\d*$/.test(input);
  const match = input.match(/^(\d+)?(\.(\d*)?)?$/);
  return match !== null && (match[3]?.length ?? 0) <= maxDecimals;
}
