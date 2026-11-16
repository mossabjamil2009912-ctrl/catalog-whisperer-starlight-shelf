import { createFileRoute } from "@tanstack/react-router";

// Public direct-download links for the app installers; streams from the public "downloads" bucket with an attachment header so browsers start the download immediately.
const FILES: Record<string, { file: string; type: string }> = {
  windows: { file: "ACTES-Catalogs-windows.zip", type: "application/zip" },
  android: { file: "actes-catalogs-lite.apk", type: "application/vnd.android.package-archive" },
};

export const Route = createFileRoute("/api/public/download/$name")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const entry = FILES[String(params.name)];
        if (!entry) return new Response("not found", { status: 404 });
        const base = process.env.SUPABASE_URL;
        const upstream = await fetch(`${base}/storage/v1/object/public/downloads/${entry.file}`);
        if (!upstream.ok || !upstream.body) return new Response("unavailable", { status: 502 });
        const headers = new Headers({
          "Content-Type": entry.type,
          "Content-Disposition": `attachment; filename="${entry.file}"`,
          "Cache-Control": "public, max-age=3600",
        });
        const len = upstream.headers.get("content-length");
        if (len) headers.set("Content-Length", len);
        return new Response(upstream.body, { status: 200, headers });
      },
    },
  },
});
