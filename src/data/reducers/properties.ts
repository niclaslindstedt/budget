import { mergeImportedPoints } from "../import/value-import";
import { newId } from "../sheet";
import { applyPatch } from "./patch";
import type { Action } from "../reducer";
import type { Mortgage, Property, UserData } from "../types";

// Rewrite one property by id, leaving the rest of the array untouched.
function updatePropertyById(
  state: UserData,
  propertyId: string,
  fn: (property: Property) => Property,
): UserData {
  return {
    ...state,
    properties: state.properties.map((p) => (p.id === propertyId ? fn(p) : p)),
  };
}

// Rewrite one mortgage by id inside a property's `mortgages` list.
function updateMortgageById(
  property: Property,
  mortgageId: string,
  fn: (mortgage: Mortgage) => Mortgage,
): Property {
  return {
    ...property,
    mortgages: property.mortgages.map((m) => (m.id === mortgageId ? fn(m) : m)),
  };
}

// CRUD for the properties catalog (`UserData.properties`) and the
// mortgages / value points / payments nested under each property. Like
// the salary and item catalogs this is entirely user-curated — no
// presets — so there's no preset-immutability guard here.
//
// `deleteProperty` is a plain filter: a property's repairs / renovations
// nest under it (`Property.repairs`), so dropping the property drops them
// with it — no cross-collection cascade is needed. A repair owns its receipts
// (`PropertyRepair.receipts`); each receipt's bytes in the backend's
// `receipts/` folder are left orphaned on a delete (the reducer mutates data
// only — it has no file-system reach), the same way deleting a budget row
// with a receipt leaves its bytes.
export function reduceProperties(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "addProperty") {
    return { ...state, properties: [...state.properties, action.property] };
  }
  if (action.type === "importProperty") {
    // Append the newly-minted lookups the planner created to re-link the
    // archive's denormalized names, then the property itself — all in one
    // pass so the import is a single undo step. Each list is already deduped
    // against the existing data by the planner; an absent list is empty.
    return {
      ...state,
      companies: action.newCompanies
        ? [...state.companies, ...action.newCompanies]
        : state.companies,
      tags: action.newTags ? [...state.tags, ...action.newTags] : state.tags,
      fileCategories: action.newFileCategories
        ? [...state.fileCategories, ...action.newFileCategories]
        : state.fileCategories,
      subtypes: action.newSubtypes
        ? [...state.subtypes, ...action.newSubtypes]
        : state.subtypes,
      properties: [...state.properties, action.property],
    };
  }
  if (action.type === "updateProperty") {
    return updatePropertyById(state, action.propertyId, (p) =>
      applyPatch(p, action.patch),
    );
  }
  if (action.type === "deleteProperty") {
    return {
      ...state,
      properties: state.properties.filter((p) => p.id !== action.propertyId),
    };
  }
  if (action.type === "addPropertyValue") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      valueHistory: [...p.valueHistory, action.point],
    }));
  }
  if (action.type === "importPropertyValues") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      valueHistory: mergeImportedPoints(
        p.valueHistory,
        action.points,
        newId,
        (pt) => ({ id: pt.id, date: pt.date, value: pt.value }),
      ),
    }));
  }
  if (action.type === "updatePropertyValue") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      valueHistory: p.valueHistory.map((pt) =>
        pt.id === action.pointId ? applyPatch(pt, action.patch) : pt,
      ),
    }));
  }
  if (action.type === "deletePropertyValue") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      valueHistory: p.valueHistory.filter((pt) => pt.id !== action.pointId),
    }));
  }
  if (action.type === "addMortgage") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      mortgages: [...p.mortgages, action.mortgage],
    }));
  }
  if (action.type === "updateMortgage") {
    return updatePropertyById(state, action.propertyId, (p) =>
      updateMortgageById(p, action.mortgageId, (m) =>
        applyPatch(m, action.patch),
      ),
    );
  }
  if (action.type === "deleteMortgage") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      mortgages: p.mortgages.filter((m) => m.id !== action.mortgageId),
    }));
  }
  if (action.type === "addMortgagePayments") {
    if (action.payments.length === 0) return state;
    return updatePropertyById(state, action.propertyId, (p) =>
      updateMortgageById(p, action.mortgageId, (m) => ({
        ...m,
        payments: [...m.payments, ...action.payments],
      })),
    );
  }
  if (action.type === "addMortgagePaymentsForProperty") {
    const byMortgage = action.paymentsByMortgageId;
    const hasAny = Object.values(byMortgage).some((list) => list.length > 0);
    if (!hasAny) return state;
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      mortgages: p.mortgages.map((m) => {
        const added = byMortgage[m.id];
        if (!added || added.length === 0) return m;
        return { ...m, payments: [...m.payments, ...added] };
      }),
    }));
  }
  if (action.type === "updateMortgagePayment") {
    return updatePropertyById(state, action.propertyId, (p) =>
      updateMortgageById(p, action.mortgageId, (m) => ({
        ...m,
        payments: m.payments.map((pay) =>
          pay.id === action.paymentId ? applyPatch(pay, action.patch) : pay,
        ),
      })),
    );
  }
  if (action.type === "deleteMortgagePayment") {
    return updatePropertyById(state, action.propertyId, (p) =>
      updateMortgageById(p, action.mortgageId, (m) => ({
        ...m,
        payments: m.payments.filter((pay) => pay.id !== action.paymentId),
      })),
    );
  }
  if (action.type === "deleteAllMortgagePayments") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      mortgages: p.mortgages.map((m) =>
        m.payments.length === 0 ? m : { ...m, payments: [] },
      ),
    }));
  }
  if (action.type === "setMortgageChargeSplit") {
    if (action.updates.length === 0) return state;
    // Index the new amount/date by payment id so each mortgage patches its
    // own payment in one pass over the property.
    const byPaymentId = new Map(action.updates.map((u) => [u.paymentId, u]));
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      mortgages: p.mortgages.map((m) => ({
        ...m,
        payments: m.payments.map((pay) => {
          const u = byPaymentId.get(pay.id);
          return u ? { ...pay, amount: u.amount, date: u.date } : pay;
        }),
      })),
    }));
  }
  if (action.type === "addRepairs") {
    if (action.repairs.length === 0) return state;
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      repairs: [...p.repairs, ...action.repairs],
    }));
  }
  if (action.type === "updateRepair") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      repairs: p.repairs.map((r) =>
        r.id === action.repairId ? applyPatch(r, action.patch) : r,
      ),
    }));
  }
  if (action.type === "deleteRepair") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      repairs: p.repairs.filter((r) => r.id !== action.repairId),
    }));
  }
  if (action.type === "addRepairReceipt") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      repairs: p.repairs.map((r) =>
        r.id === action.repairId
          ? { ...r, receipts: [...(r.receipts ?? []), action.receipt] }
          : r,
      ),
    }));
  }
  if (action.type === "updateRepairReceipt") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      repairs: p.repairs.map((r) =>
        r.id === action.repairId
          ? {
              ...r,
              receipts: (r.receipts ?? []).map((rc) =>
                rc.id === action.receiptId ? { ...rc, ...action.patch } : rc,
              ),
            }
          : r,
      ),
    }));
  }
  if (action.type === "removeRepairReceipt") {
    // Drop the matching receipt; when it was the last one, `applyPatch` treats
    // the resulting `undefined` as "delete the key" so the repair stays
    // byte-identical to a reloaded one (and re-surfaces the missing-receipt
    // flag).
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      repairs: p.repairs.map((r) => {
        if (r.id !== action.repairId) return r;
        const remaining = (r.receipts ?? []).filter(
          (rc) => rc.id !== action.receiptId,
        );
        return applyPatch(r, {
          receipts: remaining.length > 0 ? remaining : undefined,
        });
      }),
    }));
  }
  if (action.type === "setPropertySaleEstimate") {
    // `applyPatch` treats `undefined` as "delete the key", so clearing the
    // estimate leaves the property byte-identical to a reloaded one.
    return updatePropertyById(state, action.propertyId, (p) =>
      applyPatch(p, { saleEstimate: action.estimate }),
    );
  }
  if (action.type === "addPropertyFile") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      files: [...p.files, action.file],
    }));
  }
  if (action.type === "updatePropertyFile") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      files: p.files.map((f) =>
        f.id === action.fileId ? applyPatch(f, action.patch) : f,
      ),
    }));
  }
  if (action.type === "deletePropertyFile") {
    return updatePropertyById(state, action.propertyId, (p) => ({
      ...p,
      files: p.files.filter((f) => f.id !== action.fileId),
    }));
  }
  if (action.type === "addFileCategory") {
    return {
      ...state,
      fileCategories: [...state.fileCategories, action.category],
    };
  }
  if (action.type === "updateFileCategory") {
    return {
      ...state,
      fileCategories: state.fileCategories.map((c) =>
        c.id === action.categoryId ? { ...c, ...action.patch } : c,
      ),
    };
  }
  if (action.type === "deleteFileCategory") {
    // Deleting a file category clears `categoryId` on every property file that
    // referenced it (the file falls back to the `files/` root bucket); no file
    // is deleted and its stored `path` is left untouched — the bytes stay where
    // they were uploaded. Mirrors `deleteSubtype` clearing `subtypeId`.
    const id = action.categoryId;
    return {
      ...state,
      fileCategories: state.fileCategories.filter((c) => c.id !== id),
      properties: state.properties.map((p) => {
        if (!p.files.some((f) => f.categoryId === id)) return p;
        return {
          ...p,
          files: p.files.map((f) => {
            if (f.categoryId !== id) return f;
            const { categoryId: _drop, ...rest } = f;
            void _drop;
            return rest;
          }),
        };
      }),
    };
  }
  return null;
}
