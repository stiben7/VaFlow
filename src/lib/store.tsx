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
import type { User } from "@supabase/supabase-js";
import type {
  Block,
  Client,
  NewBlock,
  NewClient,
  Profile,
  ServiceTag,
  Priority,
} from "./types";
import { mergeServiceTags } from "./types";
import { getSupabase } from "./supabase/client";
import { isSupabaseConfigured } from "./config";
import { planMerge, type MergePlan } from "./backup";

const CLIENTS_KEY = "vaflow.clients.v1";
const BLOCKS_KEY = "vaflow.blocks.v1";

type Mode = "local" | "cloud";

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// localStorage helpers (local mode only)
// ---------------------------------------------------------------------------
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

/** Anything left in this browser from before the Supabase switch. */
export function readLegacyLocalData(): { clients: Client[]; blocks: Block[] } | null {
  if (typeof window === "undefined") return null;
  const clients = readLocal<Client[]>(CLIENTS_KEY, []).map(normalizeClient);
  const blocks = readLocal<Block[]>(BLOCKS_KEY, []);
  if (clients.length === 0 && blocks.length === 0) return null;
  return { clients, blocks };
}

// ---------------------------------------------------------------------------
// row <-> model mapping
// ---------------------------------------------------------------------------
type ClientRow = {
  id: string; name: string; service_tags: string[] | null; services: string;
  strategist: string | null; basecamp_url: string | null;
  color_key: number; color: string | null; archived: boolean;
};

/** Any non-empty label is allowed (users add their own); trim and dedupe. */
const cleanTags = (v: unknown): ServiceTag[] => {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().slice(0, 40);
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, 24);
};

/**
 * Bring a client object read from localStorage up to the current shape.
 * Data saved before "availed services" has `tier` but no `serviceTags`/`color`;
 * without this the calendar throws on `client.serviceTags.map`.
 */
function normalizeClient(input: unknown): Client {
  const c = (input ?? {}) as Record<string, unknown>;
  return {
    id: String(c.id ?? uid("cl")),
    name: String(c.name ?? ""),
    serviceTags: cleanTags(c.serviceTags),
    services: String(c.services ?? ""),
    strategist: typeof c.strategist === "string" ? c.strategist : null,
    basecampUrl: typeof c.basecampUrl === "string" ? c.basecampUrl : null,
    colorKey: Number.isFinite(c.colorKey) ? Number(c.colorKey) : 0,
    color: typeof c.color === "string" ? c.color : null,
    archived: Boolean(c.archived),
  };
}

type BlockRow = {
  id: string; client_id: string; day: string;
  start_min: number; duration_min: number;
  priority: string; note: string | null;
};

const toClient = (r: ClientRow): Client => ({
  id: r.id,
  name: r.name,
  serviceTags: cleanTags(r.service_tags),
  services: r.services ?? "",
  strategist: r.strategist,
  basecampUrl: r.basecamp_url,
  colorKey: Number(r.color_key),
  color: r.color ?? null,
  archived: Boolean(r.archived),
});

const fromClient = (c: Client) => ({
  id: c.id,
  name: c.name,
  service_tags: c.serviceTags,
  services: c.services,
  strategist: c.strategist,
  basecamp_url: c.basecampUrl,
  color_key: c.colorKey,
  color: c.color,
  archived: c.archived,
});

const toBlock = (r: BlockRow): Block => ({
  id: r.id,
  clientId: r.client_id,
  date: String(r.day).slice(0, 10),
  startMin: Number(r.start_min),
  durationMin: Number(r.duration_min),
  priority: r.priority as Priority,
  note: r.note,
});

const fromBlock = (b: Block) => ({
  id: b.id,
  client_id: b.clientId,
  day: b.date,
  start_min: b.startMin,
  duration_min: b.durationMin,
  priority: b.priority,
  note: b.note,
});

type ProfileRow = {
  timezone: string | null;
  reminders_enabled: boolean;
  digest_hour: number;
  avatar_url: string | null;
};

const toProfile = (r: ProfileRow): Profile => ({
  timezone: r.timezone ?? null,
  remindersEnabled: Boolean(r.reminders_enabled),
  digestHour: Number(r.digest_hour),
  avatarUrl: r.avatar_url ?? null,
});

const PROFILE_COLS = "timezone, reminders_enabled, digest_hour, avatar_url";

/** Next free accent, so colours spread out instead of clumping. */
function nextColorKey(clients: Client[]): number {
  const counts = new Array(8).fill(0);
  for (const c of clients) counts[((c.colorKey % 8) + 8) % 8] += 1;
  let best = 0;
  for (let i = 1; i < 8; i += 1) if (counts[i] < counts[best]) best = i;
  return best;
}

const byName = (a: Client, b: Client) => a.name.localeCompare(b.name);

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------
type Store = {
  clients: Client[];
  blocks: Block[];
  ready: boolean;
  mode: Mode;
  user: User | null;
  /** Per-user settings. Cloud mode only; null until loaded (or in local mode). */
  profile: Profile | null;
  error: string | null;

  addClient: (input: NewClient) => Promise<Client>;
  editClient: (id: string, patch: Partial<NewClient>) => Promise<void>;
  removeClient: (id: string) => Promise<void>;

  addBlock: (input: NewBlock) => Promise<Block>;
  editBlock: (id: string, patch: Partial<NewBlock>) => Promise<void>;
  removeBlock: (id: string) => Promise<void>;

  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  removeAvatar: () => Promise<void>;

  clientById: (id: string) => Client | undefined;
  /** Default service labels plus every custom one in use, defaults first. */
  serviceTags: string[];
  /** Bulk insert used by backup import. */
  importData: (incoming: { clients: Client[]; blocks: Block[] }) => Promise<MergePlan>;
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
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolved during boot: "cloud" once a signed-in user is confirmed,
  // "local" for a guest or a deployment without Supabase.
  const [mode, setMode] = useState<Mode>("local");
  const modeRef = useRef<Mode>("local");
  modeRef.current = mode;

  // ---- boot -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    function loadLocal() {
      setClients(readLocal<Client[]>(CLIENTS_KEY, []).map(normalizeClient));
      setBlocks(readLocal<Block[]>(BLOCKS_KEY, []));
      setMode("local");
      setReady(true);
    }

    async function boot() {
      if (!isSupabaseConfigured) {
        loadLocal();
        return;
      }

      const supabase = getSupabase();
      if (!supabase) return;

      const { data: userData } = await supabase.auth.getUser();
      if (cancelled) return;
      setUser(userData.user);

      // No session -> a guest (middleware let them past on the guest cookie),
      // or a race during sign-out. Either way, run in local mode.
      if (!userData.user) {
        loadLocal();
        return;
      }

      setMode("cloud");

      const [cRes, bRes] = await Promise.all([
        supabase.from("clients").select("*").order("name"),
        supabase.from("blocks").select("*"),
      ]);
      if (cancelled) return;

      if (cRes.error || bRes.error) {
        setError(
          cRes.error?.message ??
            bRes.error?.message ??
            "Could not load your data."
        );
        setReady(true);
        return;
      }

      setClients((cRes.data as ClientRow[]).map(toClient));
      setBlocks((bRes.data as BlockRow[]).map(toBlock));
      setReady(true);

      // Capture the browser's timezone so the reminder job knows when
      // "an hour before 9am" is. Upserting only user_id + timezone leaves the
      // reminders toggle and digest_hour untouched; it also creates the row
      // for users who predate this table. Non-critical -- never blocks `ready`.
      void (async () => {
        try {
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          const { data } = await supabase
            .from("profiles")
            .upsert(
              { user_id: userData.user!.id, timezone: tz },
              { onConflict: "user_id" }
            )
            .select(PROFILE_COLS)
            .single();
          if (!cancelled && data) setProfile(toProfile(data as ProfileRow));
        } catch {
          // A missing profiles table or a transient failure just means no
          // reminder settings this session; the feature stays dormant.
        }
      })();
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- local persistence -------------------------------------------------
  useEffect(() => {
    if (ready && mode === "local") writeLocal(CLIENTS_KEY, clients);
  }, [clients, ready, mode]);

  useEffect(() => {
    if (ready && mode === "local") writeLocal(BLOCKS_KEY, blocks);
  }, [blocks, ready, mode]);

  // ---- clients -----------------------------------------------------------
  const addClient = useCallback(
    async (input: NewClient): Promise<Client> => {
      const record: Client = {
        id: uid("cl"),
        name: input.name,
        serviceTags: input.serviceTags ?? [],
        services: input.services ?? "",
        strategist: input.strategist ?? null,
        basecampUrl: input.basecampUrl ?? null,
        colorKey: input.colorKey ?? nextColorKey(clients),
        color: input.color ?? null,
        archived: false,
      };
      setClients((prev) => [...prev, record].sort(byName));

      if (modeRef.current === "cloud") {
        const supabase = getSupabase();
        // user_id is filled by the column default (auth.uid()), and RLS
        // rejects the row if it would belong to anyone else.
        const { error: err } = await supabase!
          .from("clients")
          .insert(fromClient(record));
        if (err) {
          setError(err.message);
          setClients((prev) => prev.filter((c) => c.id !== record.id));
          throw new Error(err.message);
        }
      }
      return record;
    },
    [clients]
  );

  const editClient = useCallback(async (id: string, patch: Partial<NewClient>) => {
    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)).sort(byName)
    );
    if (modeRef.current === "cloud") {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.serviceTags !== undefined) row.service_tags = patch.serviceTags;
      if (patch.services !== undefined) row.services = patch.services;
      if (patch.strategist !== undefined) row.strategist = patch.strategist;
      if (patch.basecampUrl !== undefined) row.basecamp_url = patch.basecampUrl;
      if (patch.colorKey !== undefined) row.color_key = patch.colorKey;
      if (patch.color !== undefined) row.color = patch.color;
      if (patch.archived !== undefined) row.archived = patch.archived;
      const { error: err } = await getSupabase()!
        .from("clients").update(row).eq("id", id);
      if (err) setError(err.message);
    }
  }, []);

  const removeClient = useCallback(async (id: string) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
    setBlocks((prev) => prev.filter((b) => b.clientId !== id));
    if (modeRef.current === "cloud") {
      // blocks go too, via ON DELETE CASCADE.
      const { error: err } = await getSupabase()!
        .from("clients").delete().eq("id", id);
      if (err) setError(err.message);
    }
  }, []);

  // ---- blocks ------------------------------------------------------------
  const addBlock = useCallback(async (input: NewBlock): Promise<Block> => {
    const record: Block = { id: uid("bl"), ...input };
    setBlocks((prev) => [...prev, record]);

    if (modeRef.current === "cloud") {
      const { error: err } = await getSupabase()!
        .from("blocks").insert(fromBlock(record));
      if (err) {
        setError(err.message);
        setBlocks((prev) => prev.filter((b) => b.id !== record.id));
        throw new Error(err.message);
      }
    }
    return record;
  }, []);

  const editBlock = useCallback(async (id: string, patch: Partial<NewBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    if (modeRef.current === "cloud") {
      const row: Record<string, unknown> = {};
      if (patch.date !== undefined) row.day = patch.date;
      if (patch.startMin !== undefined) row.start_min = patch.startMin;
      if (patch.durationMin !== undefined) row.duration_min = patch.durationMin;
      if (patch.priority !== undefined) row.priority = patch.priority;
      if (patch.note !== undefined) row.note = patch.note;
      const { error: err } = await getSupabase()!
        .from("blocks").update(row).eq("id", id);
      if (err) setError(err.message);
    }
  }, []);

  const removeBlock = useCallback(async (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    if (modeRef.current === "cloud") {
      const { error: err } = await getSupabase()!
        .from("blocks").delete().eq("id", id);
      if (err) setError(err.message);
    }
  }, []);

  // ---- profile ---------------------------------------------------------
  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      setProfile((prev) => (prev ? { ...prev, ...patch } : prev));
      if (modeRef.current !== "cloud") return;
      const uid = user?.id;
      if (!uid) return;
      const row: Record<string, unknown> = {};
      if (patch.timezone !== undefined) row.timezone = patch.timezone;
      if (patch.remindersEnabled !== undefined)
        row.reminders_enabled = patch.remindersEnabled;
      if (patch.digestHour !== undefined) row.digest_hour = patch.digestHour;
      if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
      if (Object.keys(row).length === 0) return;
      const { error: err } = await getSupabase()!
        .from("profiles").update(row).eq("user_id", uid);
      if (err) setError(err.message);
    },
    [user]
  );

  /** Upload a new avatar to storage and point the profile at it. */
  const uploadAvatar = useCallback(
    async (file: File): Promise<void> => {
      const supabase = getSupabase();
      const uid = user?.id;
      if (!supabase || !uid || modeRef.current !== "cloud") return;
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${uid}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) {
        setError(upErr.message);
        throw new Error(upErr.message);
      }
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      await updateProfile({ avatarUrl: url });
    },
    [user, updateProfile]
  );

  const removeAvatar = useCallback(async (): Promise<void> => {
    await updateProfile({ avatarUrl: null });
  }, [updateProfile]);

  // ---- bulk --------------------------------------------------------------
  const importData = useCallback(
    async (incoming: { clients: Client[]; blocks: Block[] }): Promise<MergePlan> => {
      const plan = planMerge(clients, incoming, uid);

      if (modeRef.current === "cloud") {
        const supabase = getSupabase()!;
        if (plan.newClients.length) {
          const { error: err } = await supabase
            .from("clients")
            .insert(plan.newClients.map(fromClient));
          if (err) {
            setError(err.message);
            throw new Error(err.message);
          }
        }
        if (plan.newBlocks.length) {
          const { error: err } = await supabase
            .from("blocks")
            .insert(plan.newBlocks.map(fromBlock));
          if (err) {
            setError(err.message);
            throw new Error(err.message);
          }
        }
      }

      // Only touch local state once the write has actually succeeded, so a
      // failed import does not leave phantom rows on screen.
      if (plan.newClients.length) {
        setClients((prev) => [...prev, ...plan.newClients].sort(byName));
      }
      if (plan.newBlocks.length) {
        setBlocks((prev) => [...prev, ...plan.newBlocks]);
      }
      return plan;
    },
    [clients]
  );

  const byId = useMemo(() => {
    const m = new Map<string, Client>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const clientById = useCallback((id: string) => byId.get(id), [byId]);

  const serviceTags = useMemo(
    () => mergeServiceTags(clients.map((c) => c.serviceTags)),
    [clients]
  );

  const value = useMemo<Store>(
    () => ({
      clients, blocks, ready, mode, user, profile, error,
      addClient, editClient, removeClient,
      addBlock, editBlock, removeBlock,
      updateProfile, uploadAvatar, removeAvatar,
      clientById, serviceTags, importData,
    }),
    [
      clients, blocks, ready, mode, user, profile, error,
      addClient, editClient, removeClient,
      addBlock, editBlock, removeBlock,
      updateProfile, uploadAvatar, removeAvatar,
      clientById, serviceTags, importData,
    ]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
