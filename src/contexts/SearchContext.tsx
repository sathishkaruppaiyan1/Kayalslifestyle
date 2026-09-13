import { createContext, useContext, useState, ReactNode } from "react";

/**
 * How the modal was opened. The header's mic/camera icons hand the modal a
 * mode so it can start listening or analyse a photo the moment it mounts,
 * instead of making the shopper tap the same icon twice.
 */
export type SearchLaunch =
  | { mode: "voice" }
  | { mode: "photo"; file: File };

interface SearchContextType {
  query: string;
  setQuery: (query: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  openSearch: () => void;
  openVoiceSearch: () => void;
  openPhotoSearch: (file: File) => void;
  closeSearch: () => void;
  /** One-shot launch request; the modal clears it once handled. */
  launch: SearchLaunch | null;
  clearLaunch: () => void;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

export const SearchProvider = ({ children }: { children: ReactNode }) => {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [launch, setLaunch] = useState<SearchLaunch | null>(null);

  const openSearch = () => setIsOpen(true);
  const openVoiceSearch = () => {
    setLaunch({ mode: "voice" });
    setIsOpen(true);
  };
  const openPhotoSearch = (file: File) => {
    setLaunch({ mode: "photo", file });
    setIsOpen(true);
  };
  const closeSearch = () => {
    setIsOpen(false);
    setQuery("");
    setLaunch(null);
  };
  const clearLaunch = () => setLaunch(null);

  return (
    <SearchContext.Provider
      value={{
        query,
        setQuery,
        isOpen,
        setIsOpen,
        openSearch,
        openVoiceSearch,
        openPhotoSearch,
        closeSearch,
        launch,
        clearLaunch,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
};

export const useSearch = () => {
  const context = useContext(SearchContext);
  if (!context) {
    throw new Error("useSearch must be used within a SearchProvider");
  }
  return context;
};
