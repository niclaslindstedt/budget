import type { Action } from "../reducer";
import type { Mortgage, Property, UserData } from "../types";

// Apply a patch, treating an explicit `undefined` value as "delete this
// key" rather than "set the key to undefined" — so clearing an optional
// field (drop the purchase amount, clear a date) keeps the live record
// byte-identical to one reloaded from storage, where absent optional
// fields simply aren't present. Mirrors `applyItemPatch` /
// `applySalaryPatch`.
function applyPatch<T extends { id: string }>(
  entity: T,
  patch: Partial<Omit<T, "id">>,
): T {
  const next: T = { ...entity };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key as keyof T];
    } else {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}

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
// `deleteProperty` is a plain filter today. The deferred Repairs follow-up
// will add a cascade here (sweeping transaction-linked repairs that point
// at the property) exactly as `deleteItem` sweeps line-item links.
export function reduceProperties(
  state: UserData,
  action: Action,
): UserData | null {
  if (action.type === "addProperty") {
    return { ...state, properties: [...state.properties, action.property] };
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
  return null;
}
