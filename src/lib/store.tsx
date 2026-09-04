"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Block, Client, NewBlock, NewClient } from "./types";
import { SEED_CLIENTS } from "./seed";

const CLIENTS_KEY = "vaflow.clients.v1";
const BLOCKS_KEY = "vaflow.blocks.v1";

type Mode = "local" | "api";

const CONFIGURED_MODE: Mode =
  process.env.NEXT_PUBLIC_DATA_MODE === "api" ? "api" : "local";

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private-mode failures are not worth interrupting the user over.
  }
}

/** Next free accent for a new client, so colours spread out instead of clumping. */
function nextColorKey(clients: Client[]): number {
  const counts = new Array(8).fill(0);
  for (const c of clients) counts[((c.colorKey % 8) + 8) % 8] += 1;
  let best = 0;
  for (let i = 1; i < 8; i += 1) if (counts[i] < counts[best]) best = i;
  return best;
}

type Store = {
  clients: Client[];
  blocks: Block[];
  ready: boolean;
  /** What the app actually ended up using -- "api" falls back to "local". */
  mode: Mode;
  /** Set when api mode was requested but the database was unreachable. */
  notice: string | null;

  addClient: (input: NewClient) => Promise<Client>;
  editClient: (id: string, patch: Partial<NewClient>) => Promise<void>;
  removeClient: (id: string) => Promise<void>;

  addBlock: (input: NewBlock) => Promise<Block>;
  editBlock: (id: string, patch: Partial<NewBlock>) => Promise<void>;
  removeBlock: (id: string) => Promise<void>;

  clientById: (id: string) => Client | undefined;
  resetToSeed: () => void;
};

const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside <DataProvider>.");
  return ctx;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>(CONFIGURED_MODE);
  const [notice, setNotice] = useState<string | null>(null);

  // `mode` is read inside callbacks that are memoised on it; a ref keeps the
  // async write helpers from going stale after a fallback flips the mode.
  const modeRef = useRef<Mode>(CONFIGURED_MODE);
  modeRef.current = mode;

  // ---- boot ---------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (CONFIGURED_MODE === "api") {
        try {
          const [cRes, bRes] = await Promise.all([
            fetch("/api/clients"),
            fetch("/api/blocks"),
          ]);
          if (cRes.ok && bRes.ok) {
            const c = (await cRes.json()) as Client[];
            const b = (await bRes.json()) as Block[];
            if (cancelled) return;
            // An empty table on first deploy: push the seed up once.
            if (c.length === 0) {
              await fetch("/api/clients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ seed: true }),
              });
              const seeded = await (await fetch("/api/clients")).json();
              if (cancelled) return;
              setClients(seeded as Client[]);
            } else {
              setClients(c);
            }
            setBlocks(b);
            setMode("api");
            setReady(true);
            return;
          }
          setNotice(
            "Database unreachable -- running on local browser storage instead."
          );
        } catch {
          setNotice(
            "Database unreachable -- running on local browser storage instead."
          );
        }
      }

      if (cancelled) return;
      setMode("local");
      setClients(readLocal<Client[]>(CLIENTS_KEY, SEED_CLIENTS));
      setBlocks(readLocal<Block[]>(BLOCKS_KEY, []));
      setReady(true);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- persistence --------------------------------------------------------
  useEffect(() => {
    if (ready && mode === "local") writeLocal(CLIENTS_KEY, clients);
  }, [clients, ready, mode]);

  useEffect(() => {
    if (ready && mode === "local") writeLocal(BLOCKS_KEY, blocks);
  }, [blocks, ready, mode]);

  // ---- clients ------------------------------------------------------------
  const addClient = useCallback(
    async (input: NewClient): Promise<Client> => {
      const optimistic: Client = {
        id: uid("cl"),
        name: input.name,
        tier: input.tier,
        services: input.services ?? "",
        strategist: input.strategist ?? null,
        basecampUrl: input.basecampUrl ?? null,
        colorKey: input.colorKey ?? nextColorKey(clients),
        archived: false,
      };
      setClients((prev) => [...prev, optimistic].sort(byName));

      if (modeRef.current === "api") {
        try {
          const res = await fetch("/api/clients", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...optimistic, id: undefined }),
          });
          if (res.ok) {
            const saved = (await res.json()) as Client;
            // Swap the optimistic row for the server's, which owns the real id.
            setClients((prev) =>
              prev.map((c) => (c.id === optimistic.id ? saved : c)).sort(byName)
            );
            return saved;
          }
        } catch {
          /* keep the optimistic row */
        }
      }
      return optimistic;
    },
    [clients]
  );

  const editClient = useCallback(async (id: string, patch: Partial<NewClient>) => {
    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)).sort(byName)
    );
    if (modeRef.current === "api") {
      await fetch(`/api/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => {});
    }
  }, []);

  const removeClient = useCallback(async (id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
    setBlocks((prev) => prev.filter((b) => b.clientId !== id));
    if (modeRef.current === "api") {
      await fetch(`/api/clients/${id}`, { method: "DELETE" }).catch(() => {});
    }
  }, []);

  // ---- blocks -------------------------------------------------------------
  const addBlock = useCallback(async (input: NewBlock): Promise<Block> => {
    const optimistic: Block = { id: uid("bl"), ...input };
    setBlocks((prev) => [...prev, optimistic]);

    if (modeRef.current === "api") {
      try {
        const res = await fetch("/api/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (res.ok) {
          const saved = (await res.json()) as Block;
          setBlocks((prev) =>
            prev.map((b) => (b.id === optimistic.id ? saved : b))
          );
          return saved;
        }
      } catch {
        /* keep the optimistic block */
      }
    }
    return optimistic;
  }, []);

  const editBlock = useCallback(async (id: string, patch: Partial<NewBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    if (modeRef.current === "api") {
      await fetch(`/api/blocks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).catch(() => {});
    }
  }, []);

  const removeBlock = useCallback(async (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (modeRef.current === "api") {
      await fetch(`/api/blocks/${id}`, { method: "DELETE" }).catch(() => {});
    }
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, Client>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const clientById = useCallback((id: string) => byId.get(id), [byId]);

  const resetToSeed = useCallback(() => {
    setClients(SEED_CLIENTS);
    setBlocks([]);
    writeLocal(CLIENTS_KEY, SEED_CLIENTS);
    writeLocal(BLOCKS_KEY, []);
  }, []);

  const value = useMemo<Store>(
    () => ({
      clients, blocks, ready, mode, notice,
      addClient, editClient, removeClient,
      addBlock, editBlock, removeBlock,
      clientById, resetToSeed,
    }),
    [
      clients, blocks, ready, mode, notice,
      addClient, editClient, removeClient,
      addBlock, editBlock, removeBlock,
      clientById, resetToSeed,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function byName(a: Client, b: Client): number {
  return a.name.localeCompare(b.name);
}
