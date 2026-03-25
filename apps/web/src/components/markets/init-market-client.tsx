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
  type Instruction,
} from "@solana/kit"
import { assertIsTransactionWithBlockhashLifetime } from "@solana/transactions"
import { useConnectorClient, useKitTransactionSigner } from "@solana/connector"
import { useCallback, useMemo, useState } from "react"

import { getInitMarketInstruction, getMarketAddress } from "@ummo/sdk"

import { convexAction } from "@/lib/convex-http"

const PYTH_RECEIVER_PROGRAM_ID = address(
  "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ",
)

const DEFAULT_ORACLE_FEED_SOL_USD = "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
const DEFAULT_DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"

function wsUrlFromHttpUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) return `wss://${httpUrl.slice("https://".length)}`
  if (httpUrl.startsWith("http://")) return `ws://${httpUrl.slice("http://".length)}`
  return httpUrl
}

function parseU64(value: string): bigint | null {
  if (!/^\d+$/.test(value)) return null
  const n = BigInt(value)
  if (n < 0n || n > 18_446_744_073_709_551_615n) return null
  return n
}

export function InitMarketClient() {
  const client = useConnectorClient()
  const { signer } = useKitTransactionSigner()

  const [oracleFeedInput, setOracleFeedInput] = useState(DEFAULT_ORACLE_FEED_SOL_USD)
  const [collateralMintInput, setCollateralMintInput] = useState(DEFAULT_DEVNET_USDC_MINT)
  const [matcherAuthorityInput, setMatcherAuthorityInput] = useState<string>("")
  const [marketIdInput, setMarketIdInput] = useState("0")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [signature, setSignature] = useState<string | null>(null)

  const ownerAddress = useMemo(() => signer?.address ?? null, [signer])

  const oracleFeedAddress = useMemo(() => {
    try {
      return address(oracleFeedInput.trim())
    } catch {
      return null
    }
  }, [oracleFeedInput])

  const collateralMintAddress = useMemo(() => {
    try {
      return address(collateralMintInput.trim())
    } catch {
      return null
    }
  }, [collateralMintInput])

  const matcherAuthorityAddress = useMemo(() => {
    const trimmed = matcherAuthorityInput.trim()
    if (!trimmed) return ownerAddress
    try {
      return address(trimmed)
    } catch {
      return null
    }
  }, [matcherAuthorityInput, ownerAddress])

  const marketId = useMemo(() => parseU64(marketIdInput.trim()), [marketIdInput])
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

      await sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })(signedTransaction, {
        commitment: "confirmed",
      })

      const txSig = getSignatureFromTransaction(signedTransaction)
      setSignature(txSig)

      await convexAction("indexer:indexTransaction", { signature: txSig, rpcUrl })

      return txSig
    },
    [client, signer],
  )

  const handleInitMarket = useCallback(async () => {
    setErrorMessage(null)
    setSignature(null)

    if (!ownerAddress) {
      setErrorMessage("Connect your wallet first.")
      return
    }
    if (!oracleFeedAddress) {
      setErrorMessage("Enter a valid oracle feed address.")
      return
    }
    if (!collateralMintAddress) {
      setErrorMessage("Enter a valid collateral mint address.")
      return
    }
    if (!matcherAuthorityAddress) {
      setErrorMessage("Enter a valid matcher authority address (or leave blank).")
      return
    }
    if (marketId === null) {
      setErrorMessage("Enter a valid market id (u64).")
      return
    }
    if (!client) {
      setErrorMessage("Wallet client unavailable.")
      return
    }

    setIsSubmitting(true)
    try {
      const rpcUrl = client.getRpcUrl()
      if (!rpcUrl) throw new Error("No RPC endpoint configured")

      const rpc = createSolanaRpc(rpcUrl)
      const oracleAccount = await rpc
        .getAccountInfo(oracleFeedAddress, { encoding: "base64" })
        .send()
      if (!oracleAccount.value) throw new Error("Oracle feed account not found on this RPC")
      if (oracleAccount.value.owner !== PYTH_RECEIVER_PROGRAM_ID) {
        throw new Error("Oracle feed is not owned by the Pyth receiver program")
      }

      const market = await getMarketAddress({ oracleFeed: oracleFeedAddress })
      const ixs: Instruction[] = [
        getInitMarketInstruction({
          payer: ownerAddress,
          collateralMint: collateralMintAddress,
          oracleFeed: oracleFeedAddress,
          matcherAuthority: matcherAuthorityAddress,
          market,
          marketId,
        }),
      ]

      await sendAndIndex(ixs)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Init market failed")
    } finally {
      setIsSubmitting(false)
    }
  }, [
    client,
    collateralMintAddress,
    marketId,
    matcherAuthorityAddress,
    oracleFeedAddress,
    ownerAddress,
    sendAndIndex,
  ])

  return (
    <section className="rounded-xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-black">
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
          Initialize market (from connected wallet)
        </div>
        <div className="text-xs text-zinc-600 dark:text-zinc-300">
          This sends `init_market` and indexes the signature into Convex so it
          appears on `/markets`.
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            Oracle feed (PriceUpdateV2)
          </span>
          <input
            value={oracleFeedInput}
            onChange={(e) => setOracleFeedInput(e.target.value)}
            placeholder={DEFAULT_ORACLE_FEED_SOL_USD}
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-mono text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            Collateral mint (USDC)
          </span>
          <input
            value={collateralMintInput}
            onChange={(e) => setCollateralMintInput(e.target.value)}
            placeholder={DEFAULT_DEVNET_USDC_MINT}
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-mono text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            Matcher authority (blank = your wallet)
          </span>
          <input
            value={matcherAuthorityInput}
            onChange={(e) => setMatcherAuthorityInput(e.target.value)}
            placeholder={ownerAddress ?? "Connect wallet"}
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-mono text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
            Market id (u64)
          </span>
          <input
            value={marketIdInput}
            onChange={(e) => setMarketIdInput(e.target.value)}
            placeholder="0"
            className="w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-mono text-zinc-900 outline-none ring-0 placeholder:text-zinc-400 focus:border-black/20 dark:border-white/10 dark:bg-black dark:text-zinc-100 dark:placeholder:text-zinc-600"
          />
        </label>

        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleInitMarket}
          className="rounded-lg bg-zinc-950 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {isSubmitting ? "Submitting…" : "Init market"}
        </button>
      </div>

      {signature ? (
        <div className="mt-4 rounded-lg border border-black/10 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200">
          Signature: <span className="font-mono">{signature}</span>
        </div>
      ) : null}
    </section>
  )
}

