export type FieldErrors = Record<string, string>;

export function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function isEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(input.trim());
}

/** Accepts 0803…, +234803…, 234803… and returns local 11-digit format. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let local = digits;
  if (local.startsWith("+234")) local = local.slice(4);
  else if (local.startsWith("234")) local = local.slice(3);
  else if (local.startsWith("0")) local = local.slice(1);
  if (!/^[789]\d{9}$/.test(local)) return null;
  return `0${local}`;
}

export function isNigerianPhone(input: string): boolean {
  return normalizePhone(input) !== null;
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(password)) return "Password must include at least one letter.";
  if (!/\d/.test(password)) return "Password must include at least one number.";
  return null;
}

export function nameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < 3) return "Enter your full name as it should appear on receipts.";
  if (trimmed.length > 80) return "That name is too long.";
  if (!/^[A-Za-z][A-Za-z'’\-.\s]+$/.test(trimmed)) return "Use letters, spaces, apostrophes and hyphens only.";
  return null;
}

export function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}
