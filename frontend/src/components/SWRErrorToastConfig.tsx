"use client";

import { SWRConfig } from "swr";
import { useToast } from "@/components/toast";
import { classifyApiError } from "@/lib/apiErrorToast";

/**
 * SWRErrorToastConfig — #532
 *
 * Wraps `children` in an SWRConfig whose global `onError` surfaces a toast
 * for every failed `useSWR` request (network / 4xx / 5xx, classified via
 * {@link classifyApiError}), so any hook built on the shared `fetcher`
 * (useLoans, useCollateral, useAtRiskLoans, …) gets user-facing error
 * feedback without each call site wiring its own toast.
 *
 * Must render inside ToastProvider.
 *
 * #1475 — failures now surface through `toast.error` with a human-readable
 * reason and a retry action that revalidates the failed key via SWR's
 * `mutate`, giving consistent, actionable feedback for background fetches.
 */
export default function SWRErrorToastConfig({ children }: { children: React.ReactNode }) {
  const toast = useToast();

  return (
    <SWRConfig
      value={{
        onError: (error, key, config) => {
          const { message } = classifyApiError(error);
          const mutate = config?.mutate;

          toast.error(message, {
            action:
              typeof mutate === "function" && key !== undefined
                ? {
                    label: "Retry",
                    onClick: () => {
                      void mutate(key);
                    },
                  }
                : undefined,
          });
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
</｜｜DSML｜｜ parameter>