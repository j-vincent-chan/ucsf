/**
 * Best-effort UCSF Profiles person URL from roster first + last name
 * (`firstname.lastname`, lowercase; compound surnames use hyphens).
 * @see https://profiles.ucsf.edu/
 */
export function ucsfProfilesUrl(firstName: string, lastName: string): string | null {
  const fn = firstName
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, "");
  const ln = lastName
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/\s+/g, "-");
  if (!fn || !ln) return null;
  return `https://profiles.ucsf.edu/${fn}.${ln}`;
}
