"use client"

import { useConnector } from "@solana/connector/react"

export function ConnectButton() {
  const {
    account,
    connectWallet,
    connectors,
    disconnectWallet,
    isConnected,
    isConnecting,
    isError,
    walletError,
  } = useConnector()

  if (isError) {
    return (
      <div className="text-sm text-red-600">
        {walletError?.message ?? "Wallet error"}
      </div>
    )
  }

  if (!isConnected) {
    if (!connectors.length) {
      return (
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          No wallets detected
        </div>
      )
    }

    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {connectors.map((connector) => (
          <button
            key={connector.id}
            type="button"
            onClick={() => connectWallet(connector.id)}
            disabled={isConnecting || !connector.ready}
            className="inline-flex h-9 items-center justify-center rounded-full bg-black px-4 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {isConnecting ? "Connecting…" : `Connect ${connector.name}`}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden max-w-[14rem] truncate font-mono text-xs text-zinc-700 dark:text-zinc-200 sm:inline">
        {account}
      </span>
      <button
        type="button"
        onClick={disconnectWallet}
        className="inline-flex h-9 items-center justify-center rounded-full border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 transition-colors hover:bg-zinc-50 dark:border-white/15 dark:bg-black dark:text-zinc-50 dark:hover:bg-zinc-900"
      >
        Disconnect
      </button>
    </div>
  )
}

