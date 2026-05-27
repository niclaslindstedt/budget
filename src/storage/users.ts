import {
  DEFAULT_USERNAME,
  PASSWORD_HASH_BITS,
  PASSWORD_HASH_ITERATIONS,
  PASSWORD_SALT_BYTES,
  USERS_KEY,
} from "../data/constants";
import { newId } from "../data/sheet";
import type { StoredUser, UsersFile } from "../data/types";
import { safeJsonParse } from "../utils/json";

// Account registry stored at `budget.users.v1`. The file is plain
// JSON: usernames are not secret, and the password hash carries its
// own salt + iteration count so a brute-force still has to pay the
// PBKDF2 cost. Reads tolerate any garbage by handing back an empty
// registry — a corrupt registry never traps the user out of the app.

const EMPTY: UsersFile = { version: 1, users: [], activeUserId: null };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

async function deriveHashBits(
  password: string,
  salt: Uint8Array,
  iterations: number,
  bits: number,
): Promise<Uint8Array> {
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    passwordKey,
    bits,
  );
  return new Uint8Array(derived);
}

// XOR-fold compare so equal-length hashes always take the same time
// to reject. The threat model is local-only, but constant-time
// equality is cheap enough that there is no excuse to skip it.
function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function findUserByUsername(
  users: readonly StoredUser[],
  username: string,
): StoredUser | undefined {
  const target = normalizeUsername(username);
  return users.find((u) => normalizeUsername(u.username) === target);
}

// Locate the no-password "guest" account in the registry, if one
// exists. There is at most one — the create-account flow consumes it
// when a real account is created.
export function findDefaultUser(
  users: readonly StoredUser[],
): StoredUser | undefined {
  return users.find((u) => u.isDefault);
}

// Build a no-password "guest" account record. Password fields are
// left empty: the encrypting adapter is skipped for default users
// (encryption preference is forced to plaintext in `App.tsx`), so
// no derivation ever runs against these blanks.
export function createDefaultUser(): StoredUser {
  return {
    id: newId(),
    username: DEFAULT_USERNAME,
    passwordHash: "",
    passwordSalt: "",
    iterations: 0,
    hash: "SHA-256",
    createdAt: Date.now(),
    isDefault: true,
  };
}

export async function createUser(
  username: string,
  password: string,
): Promise<StoredUser> {
  if (!password) throw new Error("Password is required");
  const trimmed = username.trim();
  if (!trimmed) throw new Error("Username is required");
  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const hash = await deriveHashBits(
    password,
    salt,
    PASSWORD_HASH_ITERATIONS,
    PASSWORD_HASH_BITS,
  );
  return {
    id: newId(),
    username: trimmed,
    passwordHash: toBase64(hash),
    passwordSalt: toBase64(salt),
    iterations: PASSWORD_HASH_ITERATIONS,
    hash: "SHA-256",
    createdAt: Date.now(),
  };
}

export async function verifyPassword(
  user: StoredUser,
  password: string,
): Promise<boolean> {
  if (!password) return false;
  const salt = fromBase64(user.passwordSalt);
  const expected = fromBase64(user.passwordHash);
  const hash = await deriveHashBits(
    password,
    salt,
    user.iterations,
    expected.length * 8,
  );
  return constantTimeEqual(hash, expected);
}

function isStoredUser(value: unknown): value is StoredUser {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.username === "string" &&
    typeof v.passwordHash === "string" &&
    typeof v.passwordSalt === "string" &&
    typeof v.iterations === "number" &&
    v.hash === "SHA-256" &&
    typeof v.createdAt === "number" &&
    (v.isDefault === undefined || typeof v.isDefault === "boolean")
  );
}

export function parseUsersFile(raw: string | null): UsersFile {
  const parsed = safeJsonParse(raw);
  if (typeof parsed !== "object" || parsed === null) return { ...EMPTY };
  const obj = parsed as Record<string, unknown>;
  const usersRaw = Array.isArray(obj.users) ? obj.users : [];
  const users = usersRaw.filter(isStoredUser);
  const activeUserId =
    typeof obj.activeUserId === "string" &&
    users.some((u) => u.id === obj.activeUserId)
      ? obj.activeUserId
      : null;
  return { version: 1, users, activeUserId };
}

export function loadUsersFile(): UsersFile {
  try {
    if (typeof localStorage === "undefined") return { ...EMPTY };
    return parseUsersFile(localStorage.getItem(USERS_KEY));
  } catch {
    return { ...EMPTY };
  }
}

export function saveUsersFile(file: UsersFile): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(USERS_KEY, JSON.stringify(file));
  } catch {
    // quota / disabled — silent fail
  }
}

export function clearUsersFile(): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(USERS_KEY);
  } catch {
    // disabled / blocked storage — silent fail
  }
}
