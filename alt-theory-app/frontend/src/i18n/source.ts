/**
 * Catalog keys may end with ` // <token>` so two uses of the same English
 * word can have different translations. English display drops the suffix.
 * Token: lowercase letters, digits, hyphen.
 */
export function englishOf(key: string): string {
  const cut = /^(.*) \/\/ [a-z][a-z0-9-]*$/.exec(key);
  return cut ? cut[1] : key;
}
