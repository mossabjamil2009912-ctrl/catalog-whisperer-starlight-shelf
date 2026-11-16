import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CloudDownload, Loader2 } from "lucide-react";
import { getCatalog } from "@/lib/catalog.functions";
import { downloadAll, isPdfSaved } from "@/lib/pdf-cache";

// One-time download of every catalog to the device so all of them open instantly, even offline.
export function OfflineDownload({ ids }: { ids: string[] }) {
  const fetchCatalog = useServerFn(getCatalog);
  const [saved, setSaved] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let off = false;
    Promise.all(ids.map((id) => isPdfSaved(id).catch(() => false))).then((r) => {
      if (!off) setSaved(r.filter(Boolean).length);
    });
    return () => { off = true; };
  }, [ids]);

  const start = async () => {
    setBusy(true);
    await downloadAll(ids, fetchCatalog, (d) => setSaved(d));
    const r = await Promise.all(ids.map((id) => isPdfSaved(id).catch(() => false)));
    setSaved(r.filter(Boolean).length);
    setBusy(false);
  };

  if (saved === null) return null;
  const all = saved >= ids.length;
  return (
    <button
      onClick={all || busy ? undefined : start}
      className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold shadow-sm"
    >
      {all ? (
        <><CheckCircle2 className="h-4 w-4 text-primary" /> كل الكتالوجات محفوظة — تفتح فوراً بدون نت</>
      ) : busy ? (
        <><Loader2 className="h-4 w-4 animate-spin text-primary" /> جارٍ الحفظ {saved} / {ids.length}</>
      ) : (
        <><CloudDownload className="h-4 w-4 text-primary" /> حفظ كل الكتالوجات على الجهاز ({saved} / {ids.length})</>
      )}
    </button>
  );
}
