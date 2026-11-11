const KEY = "publish_base_url";
export function getSavedBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) ?? "";
}
export function setSavedBaseUrl(v: string) {
  const clean = v.trim().replace(/\/+$/, "");
  if (clean) localStorage.setItem(KEY, clean); else localStorage.removeItem(KEY);
}
export function getBaseUrl(): string {
  return getSavedBaseUrl() || (typeof window === "undefined" ? "" : window.location.origin);
}
export function catalogUrl(id: string) {
  return `${getBaseUrl()}/catalog/${id}`;
}
