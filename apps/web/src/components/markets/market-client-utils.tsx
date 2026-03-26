"use client"

import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithinSizeLimit,
  getCompiledTransactionMessageDecoder,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
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
import { useCallback } from "react"

import {
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  TOKEN_2022_PROGRAM_ADDRESS,
  UMMO_MARKET_PROGRAM_ADDRESS,
} from "@ummo/sdk"

import { convexAction } from "@/lib/convex-http"

const SYSVAR_RENT_ADDRESS = address("SysvarRent111111111111111111111111111111111")
const COMPUTE_BUDGET_PROGRAM_ADDRESS = address(
  "ComputeBudget111111111111111111111111111111",
)
const DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS = 10_000n
const DEFAULT_COMPUTE_UNIT_LIMIT = 1_000_000

export interface HybridQuoteResult {
  nowSlot: string
  oraclePostedSlot: string
  oraclePrice: string
  execPrice: string
  usedFallback: boolean
  fallbackNotional?: string
  depthServedNotional?: string
  analyticsId?: string | null
  depth: Array<{
    spreadBps: number
    maxOracleDeviationBps: number
    maxInventoryBps: number
    notional: string
  }>
}

export function encodeBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

export function wsUrlFromHttpUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) return `wss://${httpUrl.slice("https://".length)}`
  if (httpUrl.startsWith("http://")) return `ws://${httpUrl.slice("http://".length)}`
  return httpUrl
}

export function getCreateAssociatedTokenAccountInstruction(args: {
  payer: Address
  associatedToken: Address
  owner: Address
  mint: Address
  tokenProgram: Address
}): Instruction {
  return {
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
    accounts: [
      { address: args.payer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.associatedToken, role: AccountRole.WRITABLE },
      { address: args.owner, role: AccountRole.READONLY },
      { address: args.mint, role: AccountRole.READONLY },
      { address: address("11111111111111111111111111111111"), role: AccountRole.READONLY },
      { address: args.tokenProgram, role: AccountRole.READONLY },
      { address: SYSVAR_RENT_ADDRESS, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(),
  }
}

function encodeU32LE(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, value, true)
  return bytes
}

function encodeU64LE(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8)
  const view = new DataView(bytes.buffer)
  view.setBigUint64(0, value, true)
  return bytes
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of parts) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}

function getSetComputeUnitLimitInstruction(units: number): Instruction {
  return {
    programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS,
    accounts: [],
    data: concatBytes(new Uint8Array([2]), encodeU32LE(units)),
  }
}

function getSetComputeUnitPriceInstruction(microLamports: bigint): Instruction {
  return {
    programAddress: COMPUTE_BUDGET_PROGRAM_ADDRESS,
    accounts: [],
    data: concatBytes(new Uint8Array([3]), encodeU64LE(microLamports)),
  }
}

function isBlockhashExpiredError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes("blockhash not found") ||
    lower.includes("block height exceeded") ||
    lower.includes("transaction expired")
  )
}

function extractSimulationFailure(simulation: {
  value?: {
    err?: unknown
    logs?: string[] | null
  }
}): string | null {
  const errorValue = simulation.value?.err
  if (!errorValue) return null
  const logs = simulation.value?.logs?.filter(Boolean).join("\n")
  const errorText = safeJson(errorValue) ?? "Transaction simulation failed"
  return logs ? `${errorText}\n${logs}` : errorText
}

export async function getMintTokenProgramAddress(args: {
  rpc: ReturnType<typeof createSolanaRpc>
  mint: Address
}): Promise<Address> {
  const mintAccount = await args.rpc.getAccountInfo(args.mint, { encoding: "base64" }).send()
  const owner = mintAccount.value?.owner
  if (!owner) throw new Error(`Mint account ${args.mint} was not found on the selected RPC.`)

  const tokenProgram = address(owner)
  if (tokenProgram !== TOKEN_PROGRAM_ADDRESS && tokenProgram !== TOKEN_2022_PROGRAM_ADDRESS) {
    throw new Error(`Mint ${args.mint} is owned by unsupported program ${owner}.`)
  }
  return tokenProgram
}

function safeJson(value: unknown): string | null {
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function extractErrorDetails(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown transaction error"

  const errorRecord = error as Error & {
    cause?: unknown
    context?: unknown
    logs?: unknown
  }

  const details: string[] = []
  if (error.message) details.push(error.message)

  const contextJson = safeJson(errorRecord.context)
  if (contextJson && contextJson !== "{}") details.push(`context=${contextJson}`)

  const logsJson = safeJson(errorRecord.logs)
  if (logsJson && logsJson !== "[]") details.push(`logs=${logsJson}`)

  if (errorRecord.cause) {
    if (errorRecord.cause instanceof Error) {
      if (errorRecord.cause.message) details.push(`cause=${errorRecord.cause.message}`)
      const causeJson = safeJson(errorRecord.cause)
      if (causeJson && causeJson !== "{}") details.push(`cause_json=${causeJson}`)
    } else {
      const causeJson = safeJson(errorRecord.cause)
      if (causeJson) details.push(`cause=${causeJson}`)
    }
  }

  return details.join(" | ")
}

function formatCompiledStaticAccountAccess(args: {
  messageBytes: unknown
}): string {
  const compiled = getCompiledTransactionMessageDecoder().decode(args.messageBytes as never)

  const staticAccounts = compiled.staticAccounts as readonly string[]
  const requiredSignatures = Number(compiled.header.numSignerAccounts)
  const readonlySigned = Number(compiled.header.numReadonlySignerAccounts)
  const readonlyUnsigned = Number(compiled.header.numReadonlyNonSignerAccounts)

  const writableSignedCutoff = requiredSignatures - readonlySigned
  const writableUnsignedCutoff = staticAccounts.length - readonlyUnsigned

  return staticAccounts
    .map((account, index) => {
      const isSigner = index < requiredSignatures
      const isWritable = isSigner
        ? index < writableSignedCutoff
        : index < writableUnsignedCutoff
      const flags = [
        isSigner ? "signer" : "nosigner",
        isWritable ? "writable" : "readonly",
      ].join("|")
      return `${index}:${account}:${flags}`
    })
    .join(", ")
}

function formatCompiledInstructionAccessForProgram(args: {
  messageBytes: unknown
  programAddress: string
}): string {
  const compiled = getCompiledTransactionMessageDecoder().decode(args.messageBytes as never) as {
    staticAccounts: readonly string[]
    header: {
      numSignerAccounts: number
      numReadonlySignerAccounts: number
      numReadonlyNonSignerAccounts: number
    }
    instructions: Array<{
      programAddressIndex: number
      accountIndices?: number[]
    }>
  }

  const staticAccounts = compiled.staticAccounts
  const requiredSignatures = Number(compiled.header.numSignerAccounts)
  const readonlySigned = Number(compiled.header.numReadonlySignerAccounts)
  const readonlyUnsigned = Number(compiled.header.numReadonlyNonSignerAccounts)

  const writableSignedCutoff = requiredSignatures - readonlySigned
  const writableUnsignedCutoff = staticAccounts.length - readonlyUnsigned

  function flagsForStaticIndex(index: number): string {
    const isSigner = index < requiredSignatures
    const isWritable = isSigner ? index < writableSignedCutoff : index < writableUnsignedCutoff
    return [
      isSigner ? "signer" : "nosigner",
      isWritable ? "writable" : "readonly",
    ].join("|")
  }

  const matches = compiled.instructions
    .map((instruction, instructionIndex) => ({
      instruction,
      instructionIndex,
      programAddress: staticAccounts[instruction.programAddressIndex] ?? "unknown",
    }))
    .filter((entry) => entry.programAddress === args.programAddress)

  if (matches.length === 0) return "none"

  return matches
    .map(({ instruction, instructionIndex, programAddress }) => {
      const accounts = (instruction.accountIndices ?? []).map((staticIndex, accountIndex) => {
        const address = staticAccounts[staticIndex] ?? "unknown"
        return `${accountIndex}:${address}:${flagsForStaticIndex(staticIndex)}(static#${staticIndex})`
      })
      return `ix#${instructionIndex} program=${programAddress} accounts=[${accounts.join(", ")}]`
    })
    .join("\n")
}

export function useIndexedTransactionSender() {
  const client = useConnectorClient()
  const { signer, ready } = useKitTransactionSigner()

  const sendAndIndex = useCallback(
    async (ixs: readonly Instruction[]) => {
      if (!signer || !client) throw new Error("Wallet not connected")
      const rpcUrl = client.getRpcUrl()
      if (!rpcUrl) throw new Error("No RPC endpoint configured")

      const rpc = createSolanaRpc(rpcUrl)
      const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrlFromHttpUrl(rpcUrl))
      const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions })

      async function buildSignedTransaction() {
        const { value: latestBlockhash } = await rpc.getLatestBlockhash().send()
        const payerSigner =
          signer as unknown as Parameters<typeof setTransactionMessageFeePayerSigner>[0]

        const transactionInstructions = [
          getSetComputeUnitPriceInstruction(DEFAULT_COMPUTE_UNIT_PRICE_MICROLAMPORTS),
          getSetComputeUnitLimitInstruction(DEFAULT_COMPUTE_UNIT_LIMIT),
          ...ixs,
        ]

        const transactionMessage = pipe(
          createTransactionMessage({ version: "legacy" }),
          (tx) => setTransactionMessageFeePayerSigner(payerSigner, tx),
          (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
          (tx) => appendTransactionMessageInstructions(transactionInstructions, tx),
        )

        const signedTransaction = await signTransactionMessageWithSigners(transactionMessage)
        assertIsTransactionWithBlockhashLifetime(signedTransaction)
        assertIsTransactionWithinSizeLimit(signedTransaction)
        return signedTransaction
      }

      async function simulateSignedTransaction(
        signedTransaction: Awaited<ReturnType<typeof buildSignedTransaction>>,
      ) {
        const encodedTransaction = getBase64EncodedWireTransaction(signedTransaction)
        const simulation = await rpc
          .simulateTransaction(encodedTransaction, {
            encoding: "base64",
          })
          .send()
        const simulationFailure = extractSimulationFailure(simulation)
        if (simulationFailure) {
          const compiledAccounts = formatCompiledStaticAccountAccess({
            messageBytes: signedTransaction.messageBytes,
          })
          const compiledUmmoInstructions = formatCompiledInstructionAccessForProgram({
            messageBytes: signedTransaction.messageBytes,
            programAddress: UMMO_MARKET_PROGRAM_ADDRESS,
          })
          throw new Error(
            `Simulation failed: ${simulationFailure}\nCompiled message static accounts: ${compiledAccounts}\nCompiled Ummo instruction(s): ${compiledUmmoInstructions}`,
          )
        }
      }

      let signedTransaction = await buildSignedTransaction()
      await simulateSignedTransaction(signedTransaction)

      try {
        await sendAndConfirm(signedTransaction, {
          commitment: "confirmed",
        })
      } catch (error) {
        const details = extractErrorDetails(error)
        if (!isBlockhashExpiredError(details)) {
          throw new Error(`Transaction failed: ${details}`)
        }

        signedTransaction = await buildSignedTransaction()
        await simulateSignedTransaction(signedTransaction)
        try {
          await sendAndConfirm(signedTransaction, {
            commitment: "confirmed",
          })
        } catch (retryError) {
          throw new Error(`Transaction failed after retry: ${extractErrorDetails(retryError)}`)
        }
      }

      const signature = getSignatureFromTransaction(signedTransaction)
      try {
        await convexAction("indexer:indexTransaction", { signature, rpcUrl })
      } catch (error) {
        console.warn("Convex indexing failed", error)
      }
      return {
        rpcUrl,
        signature,
      }
    },
    [client, signer],
  )

  return {
    client,
    ready,
    signer,
    sendAndIndex,
  }
}
