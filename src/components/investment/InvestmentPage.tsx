import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Coins,
  LineChart,
  Pencil,
  Plus,
  TrendingUp,
} from "lucide-react";

import { unlock } from "../../data/achievements";
import {
  currentHoldingValue,
  holdingNetValue,
} from "../../data/investment/holdings";
import {
  resolveStockPosition,
  stockNetValue,
} from "../../data/investment/stock";
import { newId } from "../../data/sheet";
import type {
  InvestmentHolding,
  Settings,
  Sheet,
  StockPosition,
  UserData,
} from "../../data/types";
import type { Action } from "../../data/reducer";
import { useT } from "../../i18n";
import { formatBalance, formatNumber } from "../../utils/format";
import { ConfirmDialog } from "../ConfirmDialog";
import { CategoryIconGlyph } from "../icons";
import {
  SheetTitleMenu,
  favoriteMenuItem,
  type SheetTitleMenuItem,
} from "../SheetTitleMenu";
import { useModalDispatch } from "../modal-dispatch";
import {
  InvestmentHoldingModal,
  type InvestmentHoldingDraft,
} from "./InvestmentHoldingModal";
import { InvestmentValueChartModal } from "./InvestmentValueChartModal";
import {
  StockPositionModal,
  type StockPositionDraft,
} from "./StockPositionModal";
import { StockTransactionModal } from "./StockTransactionModal";
import { UpdateHoldingValueModal } from "./UpdateHoldingValueModal";
import { UpdateStockPriceModal } from "./UpdateStockPriceModal";

type Props = {
  sheet: Sheet;
  data: UserData;
  settings: Settings;
  dispatch: (action: Action) => void;
};

// The Investment sheet renders the workspace-wide
// `UserData.investmentHoldings` (broad holdings, hand-updated value) and
// `UserData.investmentStocks` (private single stocks, share-tracked) as
// two card tables. Self-contained like `InsightsPage`: it owns its modal
// state and dispatches the catalog actions directly, so AppShell only
// threads `{ sheet, data, settings, dispatch }`.
type ModalState =
  | { kind: "createHolding" }
  | { kind: "editHolding"; holding: InvestmentHolding }
  | { kind: "holdingValue"; holding: InvestmentHolding }
  | { kind: "deleteHolding"; holding: InvestmentHolding }
  | { kind: "createStock" }
  | { kind: "editStock"; position: StockPosition }
  | { kind: "stockTrade"; position: StockPosition }
  | { kind: "stockPrice"; position: StockPosition }
  | { kind: "deleteStock"; position: StockPosition }
  | { kind: "chart" };

export function InvestmentPage({ sheet, data, settings, dispatch }: Props) {
  const t = useT();
  const dispatchModal = useModalDispatch();
  const [modal, setModal] = useState<ModalState | null>(null);

  const holdings = useMemo(
    () =>
      data.investmentHoldings
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.investmentHoldings],
  );
  const stocks = useMemo(
    () =>
      data.investmentStocks
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data.investmentStocks],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [sheet.id]);

  // Footer roll-ups: gross total and net-after-tax total across both
  // tables, mirroring the savings / items page totals.
  const { grossTotal, netTotal } = useMemo(() => {
    let gross = 0;
    let net = 0;
    for (const holding of holdings) {
      const value = currentHoldingValue(holding);
      if (value === undefined) continue;
      gross += value;
      net += holdingNetValue(holding, value, settings.location);
    }
    for (const position of stocks) {
      const resolved = resolveStockPosition(position);
      if (resolved.value === undefined) continue;
      gross += resolved.value;
      net +=
        stockNetValue(position, resolved, settings.location) ?? resolved.value;
    }
    return { grossTotal: gross, netTotal: net };
  }, [holdings, stocks, settings.location]);

  function handleVisualizeValue() {
    setModal({ kind: "chart" });
    unlock("investmentValueChart");
  }

  const titleMenuItems: SheetTitleMenuItem[] = [
    favoriteMenuItem(sheet, t, dispatchModal),
    {
      key: "visualize",
      icon: <LineChart size={16} aria-hidden focusable={false} />,
      label: t("investment.visualizeValue"),
      onClick: handleVisualizeValue,
    },
    {
      key: "edit",
      icon: <Pencil size={16} aria-hidden focusable={false} />,
      label: t("sheet.editSheet"),
      onClick: () =>
        dispatchModal({ kind: "open-edit-sheet", sheetId: sheet.id }),
    },
  ];

  // --- Holding save / delete handlers ---------------------------------
  function handleSaveHolding(draft: InvestmentHoldingDraft) {
    if (modal?.kind === "editHolding") {
      dispatch({
        type: "updateInvestmentHolding",
        holdingId: modal.holding.id,
        patch: {
          name: draft.name,
          wrapper: draft.wrapper,
          kind: draft.kind,
          glyph: draft.glyph ?? undefined,
          color: draft.color || undefined,
          purchaseAmount: draft.purchaseAmount,
          purchaseDate: draft.purchaseDate,
        },
      });
    } else {
      const holding: InvestmentHolding = {
        id: newId(),
        name: draft.name,
        wrapper: draft.wrapper,
        valueHistory: [],
        kind: draft.kind,
        ...(draft.glyph ? { glyph: draft.glyph } : {}),
        ...(draft.color ? { color: draft.color } : {}),
        ...(draft.purchaseAmount !== undefined
          ? { purchaseAmount: draft.purchaseAmount }
          : {}),
        ...(draft.purchaseDate ? { purchaseDate: draft.purchaseDate } : {}),
      };
      dispatch({ type: "addInvestmentHolding", holding });
    }
  }

  // --- Stock save / delete handlers -----------------------------------
  function handleSaveStock(draft: StockPositionDraft) {
    if (modal?.kind === "editStock") {
      dispatch({
        type: "updateStockPosition",
        positionId: modal.position.id,
        patch: {
          name: draft.name,
          ownership: draft.ownership,
          glyph: draft.glyph ?? undefined,
          color: draft.color || undefined,
        },
      });
    } else {
      const position: StockPosition = {
        id: newId(),
        name: draft.name,
        ownership: draft.ownership,
        transactions: [],
        priceHistory: [],
        ...(draft.glyph ? { glyph: draft.glyph } : {}),
        ...(draft.color ? { color: draft.color } : {}),
      };
      dispatch({ type: "addStockPosition", position });
    }
  }

  return (
    <section>
      <header className="mb-2 flex items-center justify-center md:mb-6">
        <h2 className="m-0">
          <SheetTitleMenu sheetName={sheet.name} items={titleMenuItems} />
        </h2>
      </header>

      {/* Holdings -------------------------------------------------------- */}
      <section className="mb-6" data-sheet-content>
        <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
          {t("investment.holdingsTitle")}
        </h3>
        <div className="flex flex-col gap-2">
          {holdings.length === 0 && (
            <p className="m-0 rounded border border-line bg-surface px-3 py-6 text-center text-xs text-muted">
              {t("investment.noHoldings")}
            </p>
          )}
          {holdings.map((holding) => {
            const value = currentHoldingValue(holding);
            const net =
              value === undefined
                ? undefined
                : holdingNetValue(holding, value, settings.location);
            const wrapperLabel =
              holding.wrapper === "isk"
                ? t("investment.wrapperIsk")
                : holding.wrapper === "kf"
                  ? t("investment.wrapperKf")
                  : t("investment.wrapperDepot");
            return (
              <article
                key={holding.id}
                className="flex flex-col gap-2 rounded border border-line bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <CategoryIconGlyph
                      name={holding.glyph ?? "trending-up"}
                      size={18}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-bold text-fg-bright">
                        {holding.name}
                      </div>
                      <div className="text-xs text-muted">
                        {wrapperLabel} · {t(kindLabelKey(holding.kind))}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular-nums font-bold text-fg-bright">
                      {value === undefined
                        ? "—"
                        : formatBalance(value, settings)}
                    </div>
                    {net !== undefined && net !== value && (
                      <div className="text-xs text-muted">
                        {t("investment.netValue")}:{" "}
                        <span className="tabular-nums">
                          {formatBalance(net, settings)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <CardButton
                    icon={
                      <TrendingUp size={14} aria-hidden focusable={false} />
                    }
                    label={t("investment.updateValueAction")}
                    onClick={() => setModal({ kind: "holdingValue", holding })}
                  />
                  <CardButton
                    icon={<Pencil size={14} aria-hidden focusable={false} />}
                    label={t("investment.edit")}
                    onClick={() => setModal({ kind: "editHolding", holding })}
                  />
                </div>
              </article>
            );
          })}
          <AddButton
            label={t("investment.addHolding")}
            onClick={() => setModal({ kind: "createHolding" })}
          />
          {holdings.length > 0 && (
            <TotalRow
              label={t("investment.total")}
              value={formatBalance(
                holdings.reduce(
                  (sum, h) => sum + (currentHoldingValue(h) ?? 0),
                  0,
                ),
                settings,
              )}
            />
          )}
        </div>
      </section>

      {/* Private stocks ------------------------------------------------- */}
      <section className="mb-6" data-sheet-content>
        <h3 className="mb-2 text-xs font-bold tracking-wider uppercase text-fg-bright">
          {t("investment.stocksTitle")}
        </h3>
        <div className="flex flex-col gap-2">
          {stocks.length === 0 && (
            <p className="m-0 rounded border border-line bg-surface px-3 py-6 text-center text-xs text-muted">
              {t("investment.noStocks")}
            </p>
          )}
          {stocks.map((position) => {
            const resolved = resolveStockPosition(position);
            const net = stockNetValue(position, resolved, settings.location);
            const ownershipLabel =
              position.ownership === "company"
                ? t("investment.ownershipCompany")
                : t("investment.ownershipPrivate");
            return (
              <article
                key={position.id}
                className="flex flex-col gap-2 rounded border border-line bg-surface p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <CategoryIconGlyph
                      name={position.glyph ?? "trending-up"}
                      size={18}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-bold text-fg-bright">
                        {position.name}
                      </div>
                      <div className="text-xs text-muted">
                        {ownershipLabel} · {t("investment.shares")}:{" "}
                        {formatNumber(resolved.sharesHeld, settings)} ·{" "}
                        {t("investment.avgCost")}:{" "}
                        {formatBalance(resolved.avgCost, settings)}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular-nums font-bold text-fg-bright">
                      {resolved.value === undefined
                        ? "—"
                        : formatBalance(resolved.value, settings)}
                    </div>
                    {net !== undefined && net !== resolved.value && (
                      <div className="text-xs text-muted">
                        {t("investment.netValue")}:{" "}
                        <span className="tabular-nums">
                          {formatBalance(net, settings)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <CardButton
                    icon={
                      <ArrowLeftRight size={14} aria-hidden focusable={false} />
                    }
                    label={t("investment.addTradeAction")}
                    onClick={() => setModal({ kind: "stockTrade", position })}
                  />
                  <CardButton
                    icon={<Coins size={14} aria-hidden focusable={false} />}
                    label={t("investment.updatePriceAction")}
                    onClick={() => setModal({ kind: "stockPrice", position })}
                  />
                  <CardButton
                    icon={<Pencil size={14} aria-hidden focusable={false} />}
                    label={t("investment.edit")}
                    onClick={() => setModal({ kind: "editStock", position })}
                  />
                </div>
              </article>
            );
          })}
          <AddButton
            label={t("investment.addStock")}
            onClick={() => setModal({ kind: "createStock" })}
          />
          {stocks.length > 0 && (
            <TotalRow
              label={t("investment.netTotal")}
              value={formatBalance(netTotal, settings)}
              secondary={`${t("investment.total")}: ${formatBalance(
                grossTotal,
                settings,
              )}`}
            />
          )}
        </div>
      </section>

      {/* Modals --------------------------------------------------------- */}
      <InvestmentHoldingModal
        open={modal?.kind === "createHolding" || modal?.kind === "editHolding"}
        holding={modal?.kind === "editHolding" ? modal.holding : null}
        settings={settings}
        onClose={() => setModal(null)}
        onSave={handleSaveHolding}
        onDelete={
          modal?.kind === "editHolding"
            ? () => setModal({ kind: "deleteHolding", holding: modal.holding })
            : undefined
        }
      />
      <UpdateHoldingValueModal
        open={modal?.kind === "holdingValue"}
        holding={modal?.kind === "holdingValue" ? modal.holding : null}
        settings={settings}
        onClose={() => setModal(null)}
        onAddValue={(holdingId, point) =>
          dispatch({ type: "addInvestmentHoldingValue", holdingId, point })
        }
        onImportValues={(holdingId, points) =>
          dispatch({
            type: "importInvestmentHoldingValues",
            holdingId,
            points,
          })
        }
        onDeleteValue={(holdingId, pointId) =>
          dispatch({ type: "deleteInvestmentHoldingValue", holdingId, pointId })
        }
      />
      <StockPositionModal
        open={modal?.kind === "createStock" || modal?.kind === "editStock"}
        position={modal?.kind === "editStock" ? modal.position : null}
        onClose={() => setModal(null)}
        onSave={handleSaveStock}
        onDelete={
          modal?.kind === "editStock"
            ? () => setModal({ kind: "deleteStock", position: modal.position })
            : undefined
        }
      />
      <StockTransactionModal
        open={modal?.kind === "stockTrade"}
        position={modal?.kind === "stockTrade" ? modal.position : null}
        settings={settings}
        onClose={() => setModal(null)}
        onAddTransaction={(positionId, transaction) =>
          dispatch({ type: "addStockTransaction", positionId, transaction })
        }
        onDeleteTransaction={(positionId, transactionId) =>
          dispatch({
            type: "deleteStockTransaction",
            positionId,
            transactionId,
          })
        }
      />
      <UpdateStockPriceModal
        open={modal?.kind === "stockPrice"}
        position={modal?.kind === "stockPrice" ? modal.position : null}
        settings={settings}
        onClose={() => setModal(null)}
        onAddPrice={(positionId, point) =>
          dispatch({ type: "addStockPrice", positionId, point })
        }
        onImportPrices={(positionId, points) =>
          dispatch({ type: "importStockPrices", positionId, points })
        }
        onDeletePrice={(positionId, pointId) =>
          dispatch({ type: "deleteStockPrice", positionId, pointId })
        }
      />
      <InvestmentValueChartModal
        open={modal?.kind === "chart"}
        holdings={holdings}
        stocks={stocks}
        settings={settings}
        onClose={() => setModal(null)}
      />
      <ConfirmDialog
        open={modal?.kind === "deleteHolding"}
        title={t("investment.deleteHoldingTitle")}
        description={
          modal?.kind === "deleteHolding"
            ? t("investment.deleteHoldingBody", { name: modal.holding.name })
            : ""
        }
        actions={[
          {
            label: t("common.delete"),
            tone: "danger",
            onSelect: () => {
              if (modal?.kind === "deleteHolding")
                dispatch({
                  type: "deleteInvestmentHolding",
                  holdingId: modal.holding.id,
                });
              setModal(null);
            },
          },
        ]}
        onCancel={() => setModal(null)}
      />
      <ConfirmDialog
        open={modal?.kind === "deleteStock"}
        title={t("investment.deleteStockTitle")}
        description={
          modal?.kind === "deleteStock"
            ? t("investment.deleteStockBody", { name: modal.position.name })
            : ""
        }
        actions={[
          {
            label: t("common.delete"),
            tone: "danger",
            onSelect: () => {
              if (modal?.kind === "deleteStock")
                dispatch({
                  type: "deleteStockPosition",
                  positionId: modal.position.id,
                });
              setModal(null);
            },
          },
        ]}
        onCancel={() => setModal(null)}
      />
    </section>
  );
}

// Map an asset kind to its `investment.kind*` i18n key.
function kindLabelKey(
  kind: InvestmentHolding["kind"],
):
  | "investment.kindStock"
  | "investment.kindFund"
  | "investment.kindBond"
  | "investment.kindCrypto"
  | "investment.kindMetal"
  | "investment.kindOther" {
  switch (kind) {
    case "stock":
      return "investment.kindStock";
    case "fund":
      return "investment.kindFund";
    case "bond":
      return "investment.kindBond";
    case "crypto":
      return "investment.kindCrypto";
    case "metal":
      return "investment.kindMetal";
    default:
      return "investment.kindOther";
  }
}

function CardButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded border border-line bg-surface-2 px-2 py-1 text-xs text-fg hover:border-accent hover:text-fg-bright"
    >
      {icon}
      {label}
    </button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-dashed border-line bg-surface px-3 py-2 text-sm text-accent hover:bg-surface-2"
    >
      <Plus size={16} aria-hidden focusable={false} />
      {label}
    </button>
  );
}

function TotalRow({
  label,
  value,
  secondary,
}: {
  label: string;
  value: string;
  secondary?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded border border-line bg-surface-3 px-3 py-2 font-mono text-xs font-bold text-fg-bright">
      <span className="tracking-wider uppercase text-muted">{label}</span>
      <span className="flex items-center gap-3">
        {secondary && (
          <span className="font-normal text-muted">{secondary}</span>
        )}
        <span className="tabular-nums">{value}</span>
      </span>
    </div>
  );
}
