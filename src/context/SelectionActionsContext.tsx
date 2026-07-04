import { createContext, useContext, useMemo } from 'react';

type SelectionActions = {
  searchSelection: (text: string) => void;
  dictionaryLookup: (text: string) => void;
};

const SelectionActionsContext = createContext<SelectionActions | null>(null);

export function SelectionActionsProvider({
  children,
  searchSelection,
  dictionaryLookup,
}: {
  children: React.ReactNode;
  searchSelection: (text: string) => void;
  dictionaryLookup: (text: string) => void;
}) {
  const value = useMemo(
    () => ({ searchSelection, dictionaryLookup }),
    [searchSelection, dictionaryLookup],
  );

  return <SelectionActionsContext.Provider value={value}>{children}</SelectionActionsContext.Provider>;
}

export function useSelectionActions() {
  return useContext(SelectionActionsContext);
}
