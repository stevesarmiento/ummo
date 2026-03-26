/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as cranks from "../cranks.js";
import type * as http from "../http.js";
import type * as indexer from "../indexer.js";
import type * as lib_pyth_receiver from "../lib/pyth_receiver.js";
import type * as lib_quasar_events from "../lib/quasar_events.js";
import type * as lib_trader_position from "../lib/trader_position.js";
import type * as liquidations from "../liquidations.js";
import type * as lpBands from "../lpBands.js";
import type * as lpPools from "../lpPools.js";
import type * as lpPositions from "../lpPositions.js";
import type * as lpRedemptions from "../lpRedemptions.js";
import type * as marketTrading from "../marketTrading.js";
import type * as marketViews from "../marketViews.js";
import type * as markets from "../markets.js";
import type * as matcher from "../matcher.js";
import type * as matcherErrors from "../matcherErrors.js";
import type * as ops from "../ops.js";
import type * as positions from "../positions.js";
import type * as quoteAnalytics from "../quoteAnalytics.js";
import type * as shards from "../shards.js";
import type * as traderViews from "../traderViews.js";
import type * as traders from "../traders.js";
import type * as trades from "../trades.js";
import type * as withdrawals from "../withdrawals.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  cranks: typeof cranks;
  http: typeof http;
  indexer: typeof indexer;
  "lib/pyth_receiver": typeof lib_pyth_receiver;
  "lib/quasar_events": typeof lib_quasar_events;
  "lib/trader_position": typeof lib_trader_position;
  liquidations: typeof liquidations;
  lpBands: typeof lpBands;
  lpPools: typeof lpPools;
  lpPositions: typeof lpPositions;
  lpRedemptions: typeof lpRedemptions;
  marketTrading: typeof marketTrading;
  marketViews: typeof marketViews;
  markets: typeof markets;
  matcher: typeof matcher;
  matcherErrors: typeof matcherErrors;
  ops: typeof ops;
  positions: typeof positions;
  quoteAnalytics: typeof quoteAnalytics;
  shards: typeof shards;
  traderViews: typeof traderViews;
  traders: typeof traders;
  trades: typeof trades;
  withdrawals: typeof withdrawals;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
