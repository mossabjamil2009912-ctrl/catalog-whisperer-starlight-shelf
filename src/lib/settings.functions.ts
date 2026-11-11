import { createServerFn } from "@tanstack/react-start";

export const getPublishUrl = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("app_settings").select("value").eq("key", "publish_base_url").maybeSingle();
  return data?.value ?? "";
});

export const setPublishUrl = createServerFn({ method: "POST" })
  .inputValidator((d: { url: string }) => {
    const url = String(d?.url ?? "").trim().replace(/\/+$/, "");
    if (url && !/^https?:\/\/[^\s/]+[^\s]*$/.test(url)) throw new Error("invalid url");
    if (url.length > 300) throw new Error("too long");
    return { url };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_settings").upsert({ key: "publish_base_url", value: data.url, updated_at: new Date().toISOString() });
    if (error) throw new Error("save failed");
    return data.url;
  });
