import { createFileRoute } from "@tanstack/react-router";

// Public catalog file redirect (catalogs are already public in the app); used by the Android app to download files once.
export const Route = createFileRoute("/api/public/file/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const id = String(params.id).replace(/[^0-9a-f-]/gi, "");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin.from("catalogs").select("file_path").eq("id", id).maybeSingle();
        if (!row) return new Response("not found", { status: 404 });
        if (row.file_path.startsWith("/")) return new Response(null, { status: 302, headers: { Location: row.file_path } });
        const { data } = await supabaseAdmin.storage.from("catalogs").createSignedUrl(row.file_path, 3600);
        if (!data?.signedUrl) return new Response("unavailable", { status: 502 });
        return new Response(null, { status: 302, headers: { Location: data.signedUrl } });
      },
    },
  },
});
