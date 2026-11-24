import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export interface InternationalPhone {
  country: CountryCode;
  countryCallingCode: string;
  nationalNumber: string;
  digits: string;
  e164: string;
}

export function normalizeCountry(value: string): CountryCode | null {
  const country = value.trim().toUpperCase();
  if (!isSupportedCountry(country)) {
    return null;
  }

  return country;
}

export function normalizeInternationalPhone(
  countryValue: string,
  nationalInput: string,
): InternationalPhone | null {
  const country = normalizeCountry(countryValue);
  const nationalDigits = nationalInput.trim().replace(/\D/g, "");
  if (!country || !nationalDigits) {
    return null;
  }

  const parsed = parsePhoneNumberFromString(nationalDigits, country);
  if (!parsed?.isValid() || parsed.country !== country) {
    return null;
  }

  return {
    country,
    countryCallingCode: `+${parsed.countryCallingCode}`,
    nationalNumber: parsed.nationalNumber,
    digits: parsed.number.slice(1),
    e164: parsed.number,
  };
}
