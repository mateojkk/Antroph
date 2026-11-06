import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@mysten/dapp-kit/dist/index.css";
import { createBrowserSuiClient, type SuiNetwork } from "./lib/suiClient";

const network = (import.meta.env.VITE_SUI_NETWORK ?? "mainnet") as SuiNetwork;

// `url` is unused. createBrowserSuiClient talks gRPC-web; the old JSON-RPC
// fullnode URL fails the browser preflight and shows up as a CORS error.
const networks = {
  mainnet: { url: "https://fullnode.mainnet.sui.io:443", network: "mainnet" as const },
  testnet: { url: "https://fullnode.testnet.sui.io:443", network: "testnet" as const },
  devnet: { url: "https://fullnode.devnet.sui.io:443", network: "devnet" as const },
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider
        networks={networks}
        defaultNetwork={network}
        createClient={(name) => createBrowserSuiClient(name)}
      >
        <WalletProvider autoConnect>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
