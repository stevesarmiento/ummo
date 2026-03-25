"use client"

import {
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
} from "@solana/kit"
import { assertIsTransactionWithBlockhashLifetime } from "@solana/transactions"
import { useConnectorClient, useKitTransactionSigner } from "@solana/connector"
import { useCallback, useEffect, useMemo, useState } from "react"

import {
  UMMO_MARKET_PROGRAM_ADDRESS,
  getEngineAddress,
  getSetMatcherAuthorityInstruction,
  getTraderAddress,
} from "@ummo/sdk"

import { convexAction } from "@/lib/convex-http"

import {
  getCapabilityGroups,
  getCreateShardReason,
  getTraderActionAvailability,
} from "./market-capabilities"

export interface MarketAdminClientProps {
  market: string
  authority: string
  oracleFeed: string
  matcherAuthority: string
  shard: string | null
  lastCrankSlot: unknown
}

interface DerivedAddresses {
  engine: string | null
  trader: string | null
}

function wsUrlFromHttpUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) return `wss://${httpUrl.slice("https://".length)}`
  if (httpUrl.startsWith("http://")) return `ws://${httpUrl.slice("http://".length)}`
  return httpUrl
}

function toBigInt(value: unknown): bigint | null {
  if (typeof value === "bigint") return value
  if (typeof value === "number") return BigInt(value)
  if (typeof value === "string") {
    try {
      return BigInt(value)
    } catch {
      return null
    }
  }
  return null
}

function getStatusPillClass(
  kind: "working" | "blocked" | "stubbed",
): string {
  if (kind === "working")
    return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
  if (kind === "blocked")
    return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
  return "bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
}

export function MarketAdminClient(props: MarketAdminClientProps) {
  const client = useConnectorClient()
  const { signer, ready } = useKitTransactionSigner()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)
  const [wasIndexed, setWasIndexed] = useState<boolean | null>(null)
  const [nextMatcherAuthorityInput, setNextMatcherAuthorityInput] = useState(
    props.matcherAuthority,
  )
  const [derived, setDerived] = useState<DerivedAddresses>({
    engine: null,
    trader: null,
  })

  const ownerAddress = signer?.address as Address | undefined
  const marketAddress = useMemo(() => address(props.market), [props.market])
  const marketAuthorityAddress = useMemo(
    () => address(props.authority),
    [props.authority],
  )
  const oracleFeedAddress = useMemo(
    () => address(props.oracleFeed),
    [props.oracleFeed],
  )
  const shardAddress = useMemo(
    () => (props.shard ? address(props.shard) : null),
    [props.shard],
  )

  const isMarketAuthority = ownerAddress === marketAuthorityAddress
  const hasShard = Boolean(shardAddress)
  const hasTrader = false
  const capabilityGroups = useMemo(() => getCapabilityGroups(), [])
  const traderActions = useMemo(
    () => getTraderActionAvailability({ hasShard, hasTrader }),
    [hasShard, hasTrader],
  )
  const lastCrankSlot = useMemo(() => toBigInt(props.lastCrankSlot), [props.lastCrankSlot])

  useEffect(() => {
    let isCancelled = false

    async function deriveAddresses() {
      if (!shardAddress) {
        if (!isCancelled) setDerived({ engine: null, trader: null })
        return
      }

      const nextDerived: DerivedAddresses = {
        engine: await getEngineAddress({ shard: shardAddress }),
        trader:
          ownerAddress != null
            ? await getTraderAddress({ shard: shardAddress, owner: ownerAddress })
            : null,
      }

      if (!isCancelled) setDerived(nextDerived)
    }

    void deriveAddresses()

    return () => {
      isCancelled = true
    }
  }, [ownerAddress, shardAddress])

  const sendAndIndex = useCallback(
    async (ixs: readonly Instruction[]) => {
      if (!signer || !client) throw new Error("Wallet not connected")
      const rpcUrl = client.getRpcUrl()
      if (!rpcUrl) throw new Error("No RPC endpoint configured")

      const rpc = createSolanaRpc(rpcUrl)
      const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrlFromHttpUrl(rpcUrl))
      const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()

      const transactionMessage = pipe(
        createTransactionMessage({ version: 0 }),
        (tx) =>
          setTransactionMessageFeePayerSigner(
            signer as unknown as Parameters<
              typeof setTransactionMessageFeePayerSigner
            >[0],
            tx,
          ),
        (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
        (tx) => appendTransactionMessageInstructions(ixs, tx),
      )

      const signedTransaction = await signTransactionMessageWithSigners(transactionMessage)
      assertIsTransactionWithBlockhashLifetime(signedTransaction)
      assertIsTransactionWithinSizeLimit(signedTransaction)

      await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(
        signedTransaction,
        { commitment: "confirmed" },
      )

      const txSig = getSignatureFromTransaction(signedTransaction)
      setSignature(txSig)

      await convexAction("indexer:indexTransaction", { signature: txSig, rpcUrl })
      setWasIndexed(true)
      return txSig
    },
    [client, signer],
  )

  const handleRotateMatcherAuthority = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)
    setWasIndexed(null)

    if (!ownerAddress || !signer) return
    if (!isMarketAuthority) {
      setErrorMessage("Only the market authority can rotate the matcher.")
      return
    }

    let newMatcherAuthority: Address
    try {
      newMatcherAuthority = address(nextMatcherAuthorityInput.trim())
    } catch {
      setErrorMessage("Enter a valid matcher authority address.")
      return
    }

    setIsSubmitting(true)
    try {
      const ix = getSetMatcherAuthorityInstruction({
        authority: ownerAddress,
        oracleFeed: oracleFeedAddress,
        market: marketAddress,
        newMatcherAuthority,
      })

      await sendAndIndex([ix])
    } catch (error) {
      setWasIndexed(false)
      setErrorMessage(
        error instanceof Error ? error.message : "Rotate matcher failed",
      )
    } finally {
      setIsSubmitting(false)
    }
  }, [
    isMarketAuthority,
    marketAddress,
    nextMatcherAuthorityInput,
    oracleFeedAddress,
    ownerAddress,
    sendAndIndex,
    signer,
  ])

  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          Capability matrix
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {([
            ["working", capabilityGroups.working],
            ["blocked", capabilityGroups.blocked],
            ["stubbed", capabilityGroups.stubbed],
          ] as const).map(([group, items]) => (
            <div
              key={group}
              className="rounded-lg border border-black/10 p-3 dark:border-white/10"
            >
              <div className="text-xs font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-200">
                {group}
              </div>
              <div className="mt-3 flex flex-col gap-3">
                {items.map((item) => (
                  <div key={item.key} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${getStatusPillClass(
                          item.state,
                        )}`}
                      >
                        {item.state}
                      </span>
                      <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                        {item.label}
                      </span>
                    </div>
                    {item.reason ? (
                      <div className="text-xs text-zinc-600 dark:text-zinc-300">
                        {item.reason}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Admin controls
            </div>
            <div className="text-xs text-zinc-600 dark:text-zinc-300">
              Only truly usable admin operations are active.
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Add shard
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  {getCreateShardReason()}
                </div>
              </div>
              <button
                type="button"
                disabled
                className="inline-flex h-9 items-center justify-center rounded-md bg-zinc-950 px-4 text-sm font-medium text-white opacity-50 dark:bg-white dark:text-zinc-950"
              >
                Create shard
              </button>
            </div>
          </div>

          <div className="rounded-lg border border-black/10 p-3 dark:border-white/10">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                  Rotate matcher authority
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  This is live on-chain right now.
                </div>
              </div>
              <button
                type="button"
                onClick={handleRotateMatcherAuthority}
                disabled={!ready || isSubmitting || !isMarketAuthority}
                className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 disabled:opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
              >
                Rotate
              </button>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <div className="text-xs text-zinc-600 dark:text-zinc-300">
                Current: <span className="font-mono">{props.matcherAuthority}</span>
              </div>
              <input
                value={nextMatcherAuthorityInput}
                onChange={(e) => setNextMatcherAuthorityInput(e.target.value)}
                inputMode="text"
                className="h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none focus:border-zinc-950 dark:border-white/10 dark:bg-black dark:text-zinc-50 dark:focus:border-white"
              />
              {!isMarketAuthority ? (
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  Visible with reasons: only the market authority can execute this
                  action.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          Trader controls roadmap
        </div>
        <div className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
          Visible for testing, but only truly usable actions should ever become
          clickable.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {traderActions.map((action) => (
            <div
              key={action.key}
              className="rounded-lg border border-black/10 p-3 dark:border-white/10"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                    {action.label}
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">
                    {action.reason}
                  </div>
                </div>
                <button
                  type="button"
                  disabled
                  className="inline-flex h-9 items-center justify-center rounded-md border border-black/10 bg-white px-4 text-sm font-medium text-zinc-950 opacity-50 dark:border-white/10 dark:bg-black dark:text-zinc-50"
                >
                  {action.label}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-xs text-zinc-600 dark:text-zinc-300">
          {hasShard ? (
            <>
              Selected shard exists, but trader and trading flows remain disabled
              until they are validated end-to-end.
            </>
          ) : (
            <>No shard exists yet, so all trader actions remain blocked.</>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          Debug
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-zinc-600 dark:text-zinc-300">
          <div className="flex flex-col">
            <span className="font-medium">Program id</span>
            <span className="font-mono">{UMMO_MARKET_PROGRAM_ADDRESS}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Market</span>
            <span className="font-mono">{props.market}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Selected shard</span>
            <span className="font-mono">{props.shard ?? "None"}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Derived engine PDA</span>
            <span className="font-mono">{derived.engine ?? "Unavailable"}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Derived trader PDA</span>
            <span className="font-mono">{derived.trader ?? "Unavailable"}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Connected wallet</span>
            <span className="font-mono">{ownerAddress ?? "Not connected"}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Last crank slot</span>
            <span className="font-mono">
              {lastCrankSlot ? lastCrankSlot.toString(10) : "Unknown"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Latest signature</span>
            <span className="font-mono">{signature ?? "None this session"}</span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Latest action indexed</span>
            <span className="font-mono">
              {wasIndexed === null ? "Unknown" : wasIndexed ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-medium">Latest error</span>
            <span className="font-mono">{errorMessage ?? "None"}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
