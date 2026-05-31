import { useCallback } from "react";

import type { Action } from "../../../data/reducer";
import { newId } from "../../../data/sheet";
import type {
  Category,
  Company,
  CompanyCategory,
  EntryType,
  Item,
  Subtype,
  Tag,
} from "../../../data/types";

type Params = {
  dispatch: (action: Action) => void;
};

type Result = {
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onUpdateCategory: (
    categoryId: string,
    patch: Partial<Omit<Category, "id">>,
  ) => void;
  onDeleteCategory: (categoryId: string) => void;
  onSetPresetCategoryHidden: (presetId: string, hidden: boolean) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onUpdateType: (typeId: string, patch: Partial<Omit<EntryType, "id">>) => void;
  onDeleteType: (typeId: string) => void;
  onSetPresetTypeHidden: (presetId: string, hidden: boolean) => void;
  onSetPresetTypeKind: (
    presetId: string,
    kind: "income" | "expense" | "any",
  ) => void;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  onUpdateCompany: (
    companyId: string,
    patch: Partial<Omit<Company, "id">>,
  ) => void;
  onDeleteCompany: (companyId: string) => void;
  onCreateCompanyCategory: (
    draft: Omit<CompanyCategory, "id">,
  ) => CompanyCategory;
  onUpdateCompanyCategory: (
    companyCategoryId: string,
    patch: Partial<Omit<CompanyCategory, "id">>,
  ) => void;
  onDeleteCompanyCategory: (companyCategoryId: string) => void;
  onSetPresetCompanyCategoryHidden: (presetId: string, hidden: boolean) => void;
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
  onUpdateTag: (tagId: string, patch: Partial<Omit<Tag, "id">>) => void;
  onDeleteTag: (tagId: string) => void;
  onCreateSubtype: (draft: Omit<Subtype, "id">) => Subtype;
  onCreateItem: (draft: Omit<Item, "id">) => Item;
};

// Thin dispatch wrappers for category / entry-type / company / tag CRUD.
// Every picker, modal, and settings tab that needs to mint a new
// taxonomy entry calls into these so the id-minting and dispatch
// shape stay in one place.
export function useTaxonomyCrud({ dispatch }: Params): Result {
  const onCreateCategory = useCallback(
    (draft: Omit<Category, "id">): Category => {
      const category: Category = { id: newId(), ...draft };
      dispatch({ type: "addCategory", category });
      return category;
    },
    [dispatch],
  );
  const onUpdateCategory = useCallback(
    (categoryId: string, patch: Partial<Omit<Category, "id">>) =>
      dispatch({ type: "updateCategory", categoryId, patch }),
    [dispatch],
  );
  const onDeleteCategory = useCallback(
    (categoryId: string) => dispatch({ type: "deleteCategory", categoryId }),
    [dispatch],
  );
  const onSetPresetCategoryHidden = useCallback(
    (presetId: string, hidden: boolean) =>
      dispatch({ type: "setPresetCategoryHidden", presetId, hidden }),
    [dispatch],
  );
  const onCreateType = useCallback(
    (draft: Omit<EntryType, "id">): EntryType => {
      const entryType: EntryType = { id: newId(), ...draft };
      dispatch({ type: "addType", entryType });
      return entryType;
    },
    [dispatch],
  );
  const onUpdateType = useCallback(
    (typeId: string, patch: Partial<Omit<EntryType, "id">>) =>
      dispatch({ type: "updateType", typeId, patch }),
    [dispatch],
  );
  const onDeleteType = useCallback(
    (typeId: string) => dispatch({ type: "deleteType", typeId }),
    [dispatch],
  );
  const onSetPresetTypeHidden = useCallback(
    (presetId: string, hidden: boolean) =>
      dispatch({ type: "setPresetTypeHidden", presetId, hidden }),
    [dispatch],
  );
  const onSetPresetTypeKind = useCallback(
    (presetId: string, kind: "income" | "expense" | "any") =>
      dispatch({ type: "setPresetTypeKind", presetId, kind }),
    [dispatch],
  );
  const onCreateCompany = useCallback(
    (draft: Omit<Company, "id">): Company => {
      const company: Company = { id: newId(), ...draft };
      dispatch({ type: "addCompany", company });
      return company;
    },
    [dispatch],
  );
  const onUpdateCompany = useCallback(
    (companyId: string, patch: Partial<Omit<Company, "id">>) =>
      dispatch({ type: "updateCompany", companyId, patch }),
    [dispatch],
  );
  const onDeleteCompany = useCallback(
    (companyId: string) => dispatch({ type: "deleteCompany", companyId }),
    [dispatch],
  );
  const onCreateCompanyCategory = useCallback(
    (draft: Omit<CompanyCategory, "id">): CompanyCategory => {
      const companyCategory: CompanyCategory = { id: newId(), ...draft };
      dispatch({ type: "addCompanyCategory", companyCategory });
      return companyCategory;
    },
    [dispatch],
  );
  const onUpdateCompanyCategory = useCallback(
    (companyCategoryId: string, patch: Partial<Omit<CompanyCategory, "id">>) =>
      dispatch({ type: "updateCompanyCategory", companyCategoryId, patch }),
    [dispatch],
  );
  const onDeleteCompanyCategory = useCallback(
    (companyCategoryId: string) =>
      dispatch({ type: "deleteCompanyCategory", companyCategoryId }),
    [dispatch],
  );
  const onSetPresetCompanyCategoryHidden = useCallback(
    (presetId: string, hidden: boolean) =>
      dispatch({ type: "setPresetCompanyCategoryHidden", presetId, hidden }),
    [dispatch],
  );
  const onCreateTag = useCallback(
    (draft: Omit<Tag, "id">): Tag => {
      const tag: Tag = { id: newId(), ...draft };
      dispatch({ type: "addTag", tag });
      return tag;
    },
    [dispatch],
  );
  const onUpdateTag = useCallback(
    (tagId: string, patch: Partial<Omit<Tag, "id">>) =>
      dispatch({ type: "updateTag", tagId, patch }),
    [dispatch],
  );
  const onDeleteTag = useCallback(
    (tagId: string) => dispatch({ type: "deleteTag", tagId }),
    [dispatch],
  );
  const onCreateSubtype = useCallback(
    (draft: Omit<Subtype, "id">): Subtype => {
      const subtype: Subtype = { id: newId(), ...draft };
      dispatch({ type: "addSubtype", subtype });
      return subtype;
    },
    [dispatch],
  );
  const onCreateItem = useCallback(
    (draft: Omit<Item, "id">): Item => {
      const item: Item = { id: newId(), ...draft };
      dispatch({ type: "addItem", item });
      return item;
    },
    [dispatch],
  );

  return {
    onCreateCategory,
    onUpdateCategory,
    onDeleteCategory,
    onSetPresetCategoryHidden,
    onCreateType,
    onUpdateType,
    onDeleteType,
    onSetPresetTypeHidden,
    onSetPresetTypeKind,
    onCreateCompany,
    onUpdateCompany,
    onDeleteCompany,
    onCreateCompanyCategory,
    onUpdateCompanyCategory,
    onDeleteCompanyCategory,
    onSetPresetCompanyCategoryHidden,
    onCreateTag,
    onUpdateTag,
    onDeleteTag,
    onCreateSubtype,
    onCreateItem,
  };
}
