import { useState, useEffect } from "react";
import type { IcebergData } from "../types";

interface LoaderState {
  data: IcebergData | null;
  loading: boolean;
  error: Error | null;
}

export function useLoader(): LoaderState {
  const [state, setState] = useState<LoaderState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    fetch("/data/icebergs.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<IcebergData>;
      })
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err: unknown) =>
        setState({
          data: null,
          loading: false,
          error: err instanceof Error ? err : new Error(String(err)),
        }),
      );
  }, []);

  return state;
}
