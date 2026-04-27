import {
  useQuery,
  useMutation,
  UseQueryResult,
  UseMutationResult,
  QueryClient,
} from "@tanstack/react-query";
import {
  fetchHealthFactor,
  fetchLoan,
  fetchLoans,
  fetchRepaymentPreview,
  registerCollateral,
  requestLoan,
  repayLoan,
  HealthFactorResponse,
  Loan,
  LoansListResponse,
  RepaymentPreview,
  RegisterCollateralRequest,
  RegisterCollateralResponse,
  RequestLoanRequest,
  RequestLoanResponse,
  RepayLoanRequest,
  RepayLoanResponse,
} from "@/lib/api";

export type { RepaymentPreview };

const queryKeys = {
  healthFactor: (loanId: string | number) => ["healthFactor", loanId],
  loan: (loanId: string | number) => ["loan", loanId],
  loans: (page: number, pageSize: number) => ["loans", page, pageSize],
  repaymentPreview: (loanId: number, amount: number) =>
    ["repaymentPreview", loanId, amount] as const,
};

const cacheConfig = {
  healthFactor: {
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  },
  loan: {
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  },
  loans: {
    staleTime: 30 * 1000,
    gcTime: 2 * 60 * 1000,
  },
  repaymentPreview: {
    staleTime: 5 * 1000,
    gcTime: 30 * 1000,
  },
};

export function useHealthFactor(
  loanId: string | number | null
): UseQueryResult<HealthFactorResponse, Error> {
  return useQuery({
    queryKey: queryKeys.healthFactor(loanId ?? ""),
    queryFn: () => fetchHealthFactor(loanId!),
    enabled: !!loanId,
    ...cacheConfig.healthFactor,
  });
}

export function useLoan(
  loanId: string | number | null
): UseQueryResult<Loan, Error> {
  return useQuery({
    queryKey: queryKeys.loan(loanId ?? ""),
    queryFn: () => fetchLoan(loanId!),
    enabled: !!loanId,
    ...cacheConfig.loan,
  });
}

export function useLoans(
  page = 1,
  pageSize = 50
): UseQueryResult<LoansListResponse, Error> {
  return useQuery({
    queryKey: queryKeys.loans(page, pageSize),
    queryFn: () => fetchLoans(page, pageSize),
    ...cacheConfig.loans,
  });
}

export function useRepaymentPreview(
  loanId: number | null,
  amount: number | null
): UseQueryResult<RepaymentPreview, Error> {
  const enabled = !!loanId && !!amount && amount > 0;

  return useQuery({
    queryKey: queryKeys.repaymentPreview(loanId ?? 0, amount ?? 0),
    queryFn: () => fetchRepaymentPreview(loanId!, amount!),
    enabled,
    ...cacheConfig.repaymentPreview,
  });
}

export function useRegisterCollateral(
  queryClient?: QueryClient
): UseMutationResult<RegisterCollateralResponse, Error, RegisterCollateralRequest> {
  return useMutation({
    mutationFn: registerCollateral,
    onSuccess: () => {
      queryClient?.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

export function useRequestLoan(
  queryClient?: QueryClient
): UseMutationResult<RequestLoanResponse, Error, RequestLoanRequest> {
  return useMutation({
    mutationFn: requestLoan,
    onSuccess: () => {
      queryClient?.invalidateQueries({ queryKey: ["loans"] });
    },
  });
}

export function useRepayLoan(
  queryClient?: QueryClient
): UseMutationResult<RepayLoanResponse, Error, RepayLoanRequest> {
  return useMutation({
    mutationFn: repayLoan,
    onSuccess: (_data: RepayLoanResponse, variables: RepayLoanRequest) => {
      queryClient?.invalidateQueries({
        queryKey: queryKeys.healthFactor(variables.loan_id),
      });
      queryClient?.invalidateQueries({ queryKey: ["loans"] });
      queryClient?.invalidateQueries({
        queryKey: queryKeys.loan(variables.loan_id),
      });
    },
  });
}
