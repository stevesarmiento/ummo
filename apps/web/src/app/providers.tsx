"use client"

import { getDefaultConfig, getDefaultMobileConfig } from "@solana/connector/headless"
import { AppProvider } from "@solana/connector/react"
import { useMemo } from "react"

export function Providers(props: { children: React.ReactNode }) {
  const connectorConfig = useMemo(() => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL

    return getDefaultConfig({
      appName: "Ummo",
      appUrl,
      autoConnect: true,
      enableMobile: true,
      clusters: rpcUrl
        ? [
            {
              id: "solana:devnet" as const,
              label: "Devnet (Custom RPC)",
              url: rpcUrl,
            },
          ]
        : undefined,
    })
  }, [])

  const mobile = useMemo(
    () =>
      getDefaultMobileConfig({
        appName: "Ummo",
        appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
      }),
    [],
  )

  return (
    <AppProvider connectorConfig={connectorConfig} mobile={mobile}>
      {props.children}
    </AppProvider>
  )
}

