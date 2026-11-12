import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { loadPdfBytes } from "@/lib/pdf-cache";

// Renders PDF pages as canvases. Page 1 first; other pages render only when scrolled near.
// Bytes are cached on the device so reopening is instant.
export function PdfPages({ id, url, cover }: { id: string; url: string; cover?: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let doc: { destroy: () => Promise<void> } | null = null;
    const tasks: { cancel: () => void }[] = [];
    const observers: IntersectionObserver[] = [];
    let waiting = false;

    const box = ref.current;
    if (!box) return;
    box.innerHTML = "";
    setLoading(true);
    setError(false);
    (async () => {
      try {
        // Start loading the file right away: bundled catalogs don't need the link at all.
        let data: ArrayBuffer;
        const libs = Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
        try {
          data = await loadPdfBytes(id, url);
        } catch (e) {
          if (!url) { waiting = true; return; } // cloud-stored catalog: wait for its link
          throw e;
        }
        const [pdfjs, workerMod] = await libs;
        if (cancelled) return;
        pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;
        const task = pdfjs.getDocument({
          data: new Uint8Array(data.slice(0)),
          cMapUrl: "/pdfjs/cmaps/",
          cMapPacked: true,
          standardFontDataUrl: "/pdfjs/standard_fonts/",
          wasmUrl: "/pdfjs/wasm/",
          useSystemFonts: false,
          disableFontFace: true,
        });
        doc = task;
        const pdf = await task.promise;
        if (cancelled) return;
        const width = box.clientWidth || 800;
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        const first = await pdf.getPage(1);
        if (cancelled) return;
        const fb = first.getViewport({ scale: 1 });
        const canvases = Array.from({ length: pdf.numPages }, (_, i) => {
          const canvas = document.createElement("canvas");
          canvas.style.aspectRatio = `${fb.width} / ${fb.height}`;
          canvas.className = "mb-2 block w-full rounded-lg bg-white shadow";
          canvas.dataset["i"] = String(i);
          box.appendChild(canvas);
          return canvas;
        });
        const level = new Array<number>(pdf.numPages).fill(0);
        let chain = Promise.resolve();
        const draw = (i: number, target: number) => {
          if (level[i]! >= target) return chain;
          level[i] = target;
          chain = chain.then(async () => {
            if (cancelled) return;
            const page = i === 0 ? first : await pdf.getPage(i + 1);
            const b = page.getViewport({ scale: 1 });
            const viewport = page.getViewport({ scale: target / b.width });
            const off = document.createElement("canvas");
            off.width = viewport.width;
            off.height = viewport.height;
            const t = page.render({ canvas: off, canvasContext: off.getContext("2d")!, viewport });
            tasks.push(t);
            await t.promise;
            if (cancelled) return;
            const c = canvases[i]!;
            c.style.aspectRatio = `${b.width} / ${b.height}`;
            c.width = off.width;
            c.height = off.height;
            c.getContext("2d")!.drawImage(off, 0, 0);
          }).catch(() => {});
          return chain;
        };
        const quick = Math.min(Math.max(width * dpr, 800), 1300);
        const sharp = Math.min(Math.max(width * dpr * 2, 1600), 2200);
        await draw(0, quick);
        if (cancelled) return;
        setLoading(false);
        // Other pages render only when scrolled near; sharper copy after they settle.
        const io = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue;
            const i = Number((e.target as HTMLElement).dataset["i"]);
            draw(i, quick).then(() => draw(i, sharp));
          }
        }, { rootMargin: "1200px 0px" });
        canvases.forEach((c) => io.observe(c));
        observers.push(io);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled && !waiting) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      observers.forEach((o) => o.disconnect());
      tasks.forEach((t) => { try { t.cancel(); } catch {} });
      doc?.destroy().catch(() => {});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, url]);

  return (
    <div className="h-full overflow-y-auto overscroll-contain p-2">
      {loading && (
        <div className="relative">
          {cover ? (
            <img src={cover} alt="" className="w-full rounded-lg bg-white opacity-80 shadow" />
          ) : (
            <div className="h-40" />
          )}
          <Loader2 className="absolute left-1/2 top-20 h-8 w-8 -translate-x-1/2 animate-spin text-primary" />
        </div>
      )}
      {error && <p className="p-6 text-center text-muted-foreground">تعذر عرض الكتالوج — استخدم زر التحميل.</p>}
      <TransformWrapper
        minScale={1}
        maxScale={5}
        panning={{ disabled: !zoomed }}
        doubleClick={{ mode: zoomed ? "reset" : "zoomIn", step: 1 }}
        wheel={{ activationKeys: ["Control"] }}
        onTransform={(_, s) => setZoomed(s.scale > 1.01)}
      >
        <TransformComponent wrapperStyle={{ width: "100%", overflow: "visible" }} contentStyle={{ width: "100%" }}>
          <div ref={ref} className="w-full" />
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
