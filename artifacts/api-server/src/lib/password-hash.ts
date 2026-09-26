import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;
const DUMMY_SALT = Buffer.alloc(16).toString("base64url");
const DUMMY_HASH = Buffer.alloc(KEY_LENGTH).toString("base64url");
const DUMMY_PASSWORD_HASH =
  `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${DUMMY_SALT}$${DUMMY_HASH}`;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAX_MEMORY },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

export async function hashLocalPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await deriveKey(password, salt);
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyLocalPassword(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  const value = storedHash ?? DUMMY_PASSWORD_HASH;
  const [algorithm, n, r, p, saltValue, hashValue] = value.split("$");
  const salt = Buffer.from(saltValue ?? "", "base64url");
  const expected = Buffer.from(hashValue ?? "", "base64url");
  if (
    algorithm !== "scrypt" ||
    n !== String(SCRYPT_N) ||
    r !== String(SCRYPT_R) ||
    p !== String(SCRYPT_P) ||
    salt.length !== 16 ||
    expected.length !== KEY_LENGTH
  ) {
    return false;
  }

  const actual = await deriveKey(password, salt);
  const matches = timingSafeEqual(actual, expected);
  return Boolean(storedHash) && matches;
}