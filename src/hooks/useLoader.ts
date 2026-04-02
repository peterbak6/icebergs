import { useState, useEffect } from "react";
import type { IcebergData } from "../types";

interface LoaderState {
  data: IcebergData | null;
  firstDate?: number;
  lastDate?: number;
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
    fetch(`${import.meta.env.BASE_URL}data/icebergs.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<IcebergData>;
      })
      .then((data) => {
        let firstDate = Infinity;
        let lastDate = -Infinity;
        for (const records of Object.values(data)) {
          for (const record of records) {
            const year = parseInt(record.date, 10);
            if (year < firstDate) firstDate = year;
            if (year > lastDate) lastDate = year;
          }
        }
        setState({
          data,
          firstDate: isFinite(firstDate) ? firstDate : undefined,
          lastDate: isFinite(lastDate) ? lastDate : undefined,
          loading: false,
          error: null,
        });
      })
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
