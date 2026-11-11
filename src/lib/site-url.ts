import { getPublishUrl } from "@/lib/settings.functions";
const KEY = "publish_base_url";
export function getSavedBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(KEY) ?? "";
}
export function setSavedBaseUrl(v: string) {
  const clean = v.trim().replace(/\/+$/, "");
  if (clean) localStorage.setItem(KEY, clean); else localStorage.removeItem(KEY);
}
/** Pull the shared link from the server so every device uses the same one. */
export async function syncBaseUrl() {
  try { setSavedBaseUrl(await getPublishUrl()); } catch {}
}
if (typeof window !== "undefined") syncBaseUrl();
export function getBaseUrl(): string {
  return getSavedBaseUrl() || (typeof window === "undefined" ? "" : window.location.origin);
}
export function catalogUrl(id: string) {
  return `${getBaseUrl()}/catalog/${id}`;
}
