import { useEffect, useState } from "react";
import { assetUrl } from "../lib/assets";

/** undefined = loading, null = missing, string = ready */
export function useAssetUrl(id: string | null | undefined): string | null | undefined {
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!id) return setUrl(null);
    let live = true;
    setUrl(undefined);
    void assetUrl(id).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [id]);
  return url;
}
