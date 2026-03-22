import React, { createContext, useContext, useEffect, useState } from "react";
import { PurchaseService } from "@/src/services/PurchaseService";

interface ProContextType {
  isPro: boolean;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const ProContext = createContext<ProContextType>({
  isPro: false,
  isLoading: true,
  refresh: async () => {},
});

export function ProProvider({ children }: { children: React.ReactNode }) {
  const [isPro, setIsPro] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    const pro = await PurchaseService.isPro();
    setIsPro(pro);
    setIsLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <ProContext.Provider value={{ isPro, isLoading, refresh }}>
      {children}
    </ProContext.Provider>
  );
}

export function usePro() {
  return useContext(ProContext);
}
