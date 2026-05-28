import { describe, expect, it } from "vitest";

import {
  initialTransferModalState,
  transferModalReducer,
  type TransferModalState,
} from "../src/components/accounts/account-transfer-modal-reducer";
import { DEFAULT_SETTINGS } from "../src/data/constants/defaults";

function makeState(over: Partial<TransferModalState> = {}): TransferModalState {
  return {
    date: "2026-03-15",
    description: "Lunch",
    amountText: "100",
    fromAccountId: "a-1",
    toAccountId: "a-2",
    typeId: "t-1",
    completed: false,
    isTransfer: true,
    datePickerOpen: false,
    fromOpen: false,
    toOpen: false,
    ...over,
  };
}

describe("initialTransferModalState", () => {
  it("snapshots an edit seed into the initial state", () => {
    const state = initialTransferModalState(
      {
        kind: "edit",
        date: "2026-03-15",
        description: "Rent transfer",
        amount: 1500,
        fromAccountId: "a-checking",
        toAccountId: "a-savings",
        typeId: "t-transfer",
        completed: true,
      },
      DEFAULT_SETTINGS,
    );
    expect(state.date).toBe("2026-03-15");
    expect(state.description).toBe("Rent transfer");
    expect(state.amountText).not.toBe("");
    expect(state.fromAccountId).toBe("a-checking");
    expect(state.toAccountId).toBe("a-savings");
    expect(state.typeId).toBe("t-transfer");
    expect(state.completed).toBe(true);
    expect(state.isTransfer).toBe(true);
    expect(state.datePickerOpen).toBe(false);
    expect(state.fromOpen).toBe(false);
    expect(state.toOpen).toBe(false);
  });

  it("snapshots a create seed with workspace defaults", () => {
    const state = initialTransferModalState(
      {
        kind: "create",
        defaultFromId: "a-checking",
        defaultToId: "a-savings",
        seedDate: "2026-05-01",
      },
      DEFAULT_SETTINGS,
    );
    expect(state.date).toBe("2026-05-01");
    expect(state.description).toBe("");
    expect(state.amountText).toBe("");
    expect(state.fromAccountId).toBe("a-checking");
    expect(state.toAccountId).toBe("a-savings");
    expect(state.typeId).toBe(null);
    expect(state.completed).toBe(false);
    expect(state.isTransfer).toBe(true);
  });

  it("falls back to empty strings when a create seed has no default accounts", () => {
    const state = initialTransferModalState(
      {
        kind: "create",
        defaultFromId: null,
        defaultToId: null,
        seedDate: "2026-05-01",
      },
      DEFAULT_SETTINGS,
    );
    expect(state.fromAccountId).toBe("");
    expect(state.toAccountId).toBe("");
  });

  it("returns an empty default when no seed is supplied", () => {
    const state = initialTransferModalState(null, DEFAULT_SETTINGS);
    expect(state.date).toBe("");
    expect(state.description).toBe("");
    expect(state.amountText).toBe("");
    expect(state.fromAccountId).toBe("");
    expect(state.toAccountId).toBe("");
    expect(state.typeId).toBe(null);
    expect(state.completed).toBe(false);
    expect(state.isTransfer).toBe(true);
  });
});

describe("transferModalReducer", () => {
  it("reset replaces the whole state in one transition", () => {
    const start = makeState({ description: "old" });
    const next = transferModalReducer(start, {
      kind: "reset",
      state: makeState({ description: "fresh", fromOpen: true }),
    });
    expect(next.description).toBe("fresh");
    expect(next.fromOpen).toBe(true);
  });

  it("setDate / setDescription / setAmountText update one field each", () => {
    const start = makeState();
    expect(
      transferModalReducer(start, { kind: "setDate", value: "2026-04-01" })
        .date,
    ).toBe("2026-04-01");
    expect(
      transferModalReducer(start, { kind: "setDescription", value: "Coffee" })
        .description,
    ).toBe("Coffee");
    expect(
      transferModalReducer(start, { kind: "setAmountText", value: "42.50" })
        .amountText,
    ).toBe("42.50");
  });

  it("swapAccounts exchanges from and to ids atomically", () => {
    const start = makeState({ fromAccountId: "a-1", toAccountId: "a-2" });
    const next = transferModalReducer(start, { kind: "swapAccounts" });
    expect(next.fromAccountId).toBe("a-2");
    expect(next.toAccountId).toBe("a-1");
  });

  it("pickFromAccount sets the id and closes the panel in one transition", () => {
    const start = makeState({ fromAccountId: "a-1", fromOpen: true });
    const next = transferModalReducer(start, {
      kind: "pickFromAccount",
      value: "a-9",
    });
    expect(next.fromAccountId).toBe("a-9");
    expect(next.fromOpen).toBe(false);
  });

  it("pickToAccount sets the id and closes the panel in one transition", () => {
    const start = makeState({ toAccountId: "a-1", toOpen: true });
    const next = transferModalReducer(start, {
      kind: "pickToAccount",
      value: "a-9",
    });
    expect(next.toAccountId).toBe("a-9");
    expect(next.toOpen).toBe(false);
  });

  it("setTypeId accepts both a string and null", () => {
    const start = makeState({ typeId: "t-1" });
    expect(
      transferModalReducer(start, { kind: "setTypeId", value: "t-2" }).typeId,
    ).toBe("t-2");
    expect(
      transferModalReducer(start, { kind: "setTypeId", value: null }).typeId,
    ).toBe(null);
  });

  it("setCompleted / setIsTransfer flip the booleans", () => {
    const start = makeState({ completed: false, isTransfer: true });
    expect(
      transferModalReducer(start, { kind: "setCompleted", value: true })
        .completed,
    ).toBe(true);
    expect(
      transferModalReducer(start, { kind: "setIsTransfer", value: false })
        .isTransfer,
    ).toBe(false);
  });

  it("setDatePickerOpen / setFromOpen / setToOpen toggle panel visibility", () => {
    const start = makeState();
    expect(
      transferModalReducer(start, { kind: "setDatePickerOpen", value: true })
        .datePickerOpen,
    ).toBe(true);
    expect(
      transferModalReducer(start, { kind: "setFromOpen", value: true })
        .fromOpen,
    ).toBe(true);
    expect(
      transferModalReducer(start, { kind: "setToOpen", value: true }).toOpen,
    ).toBe(true);
  });

  it("leaves other fields untouched when one field changes", () => {
    const start = makeState();
    const next = transferModalReducer(start, {
      kind: "setDescription",
      value: "New label",
    });
    expect(next.date).toBe(start.date);
    expect(next.amountText).toBe(start.amountText);
    expect(next.fromAccountId).toBe(start.fromAccountId);
    expect(next.toAccountId).toBe(start.toAccountId);
    expect(next.typeId).toBe(start.typeId);
    expect(next.completed).toBe(start.completed);
    expect(next.isTransfer).toBe(start.isTransfer);
  });
});
