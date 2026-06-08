import { hash, verify } from "@node-rs/argon2";

// argon2id parameters (OWASP-recommended baseline).
const options = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return hash(plain, options);
}

export async function verifyPassword(
  hashed: string,
  plain: string,
): Promise<boolean> {
  try {
    return await verify(hashed, plain, options);
  } catch {
    return false;
  }
}
