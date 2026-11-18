import { useEffect, useMemo, useState } from "react";

import {
  API_ENDPOINTS,
  createApiClient,
  type Account,
  type ApiTransport,
  type PortfolioConfiguration,
  type ResourceCollection,
  type SignalDefinition,
} from "./api";

/**
 * Names for the UIDs a page shows, and the options of its pickers and filters. One page of the
 * API's maximum size is read; anything beyond it still shows by UID.
 */
export const LOOKUP_LIMIT = 100;

export interface Lookup<T> {
  items: T[];
  byUid: ReadonlyMap<string, T>;
  loading: boolean;
  error: string | null;
}

function formatLookupError(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed unexpectedly.";
}

function useLookup<T extends { uid: string }>(
  transport: ApiTransport,
  path: string,
  refreshKey: unknown,
): Lookup<T> {
  const api = useMemo(() => createApiClient(transport), [transport]);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.get<ResourceCollection<T>>(path, controller.signal)
      .then((response) => setItems(response.items))
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(formatLookupError(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [api, path, refreshKey]);

  const byUid = useMemo(() => new Map(items.map((item) => [item.uid, item])), [items]);
  return { items, byUid, loading, error };
}

export function useAccountLookup(transport: ApiTransport, refreshKey: unknown = 0): Lookup<Account> {
  return useLookup<Account>(
    transport,
    `${API_ENDPOINTS.accounts}?limit=${LOOKUP_LIMIT}&offset=0&ordering=account_name`,
    refreshKey,
  );
}

/** The signal definitions of every account the caller reaches, or of one account. */
export function useSignalDefinitionLookup(
  transport: ApiTransport,
  refreshKey: unknown = 0,
  accountUid?: string,
): Lookup<SignalDefinition> {
  const accountQuery = accountUid ? `&account_uid=${encodeURIComponent(accountUid)}` : "";
  return useLookup<SignalDefinition>(
    transport,
    `${API_ENDPOINTS.signalDefinitions}?limit=${LOOKUP_LIMIT}&offset=0${accountQuery}`,
    refreshKey,
  );
}

export function usePortfolioLookup(
  transport: ApiTransport,
  refreshKey: unknown = 0,
): Lookup<PortfolioConfiguration> {
  return useLookup<PortfolioConfiguration>(
    transport,
    `${API_ENDPOINTS.portfolioConfigurations}?limit=${LOOKUP_LIMIT}&offset=0&ordering=name`,
    refreshKey,
  );
}

/** A UID the page could not name: its first eight characters. */
export function shortUid(uid: string): string {
  return uid.length > 8 ? `${uid.slice(0, 8)}…` : uid;
}

export function accountLabel(account: Account): string {
  return `${account.account_name} (${account.is_paper ? "paper" : "live"})`;
}

/** The account's name when the page could read it, else its short UID. */
export function accountName(accounts: ReadonlyMap<string, Account>, accountUid: string | null): string {
  if (!accountUid) return "No account";
  const account = accounts.get(accountUid);
  return account ? accountLabel(account) : shortUid(accountUid);
}

export function signalLabel(definition: SignalDefinition): string {
  return definition.name === definition.key ? definition.name : `${definition.name} · ${definition.key}`;
}

export function signalName(
  definitions: ReadonlyMap<string, SignalDefinition>,
  definitionUid: string | null,
): string {
  if (!definitionUid) return "No signal";
  const definition = definitions.get(definitionUid);
  return definition ? signalLabel(definition) : shortUid(definitionUid);
}
