const verificationWindowMs = 5 * 60 * 1000;
let verifiedUntil = 0;

export function markCurrentPasswordVerified() {
  verifiedUntil = Date.now() + verificationWindowMs;
}

export function isCurrentPasswordVerified() {
  return Date.now() < verifiedUntil;
}

export function clearCurrentPasswordVerification() {
  verifiedUntil = 0;
}
