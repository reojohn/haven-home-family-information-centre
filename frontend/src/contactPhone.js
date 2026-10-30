// Household contacts may be local or international. This rejects obvious dummy
// numbers and malformed telephone URIs without altering any existing records.
export const callablePhone = value => {
  const raw = String(value ?? '').trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return false;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 && !/^000/.test(digits) && !/^(\d)\1+$/.test(digits);
};
export const phoneHref = value => `tel:${String(value ?? '').trim().replace(/[^+\d]/g, '')}`;
export const phoneErrorText = 'Enter a real phone number (7–15 digits), such as 0917 123 4567 or +63 917 123 4567. Placeholder numbers cannot be called.';
