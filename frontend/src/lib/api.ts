const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface Loan {
  id: number;
  borrower: string;
  collateral_id: number;
  amount: number;
  status: string;
}

export interface Collateral {
  id: number;
  owner: string;
  animal_type: string;
  count: number;
  appraised_value: number;
}

export interface HealthFactorResponse {
  health_factor: number;
  loan_id: number;
}

export interface RepaymentPreview {
  loan_id: number;
  repayment_amount: number;
  breakdown: {
    principal: number;
    interest: number;
    fees: number;
    remaining_balance: number;
  };
  projected_health_factor_bps: number | null;
  fully_repaid: boolean;
}

export interface RegisterCollateralRequest {
  owner: string;
  animal_type: string;
  count: number;
  appraised_value: number;
}

export interface RegisterCollateralResponse {
  xdr: string;
}

export interface RequestLoanRequest {
  borrower: string;
  collateral_id: number;
  amount: number;
}

export interface RequestLoanResponse {
  xdr: string;
}

export interface RepayLoanRequest {
  borrower: string;
  loan_id: number;
  amount: number;
}

export interface RepayLoanResponse {
  xdr: string;
}

export interface LoansListResponse {
  data: Loan[];
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchHealthFactor(loanId: string | number): Promise<HealthFactorResponse> {
  const res = await fetch(`${API}/api/health/${loanId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch health factor: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchLoan(loanId: string | number): Promise<Loan> {
  const res = await fetch(`${API}/api/loan/${loanId}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch loan: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchLoans(page = 1, pageSize = 50): Promise<LoansListResponse> {
  const res = await fetch(`${API}/api/loans?page=${page}&pageSize=${pageSize}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch loans: ${res.statusText}`);
  }
  return res.json();
}

export async function fetchRepaymentPreview(
  loanId: number,
  amount: number
): Promise<RepaymentPreview> {
  const res = await fetch(`${API}/api/loan/repayment-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loan_id: loanId, amount }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Failed to fetch repayment preview: ${res.statusText}`);
  }
  return res.json();
}

export async function registerCollateral(
  data: RegisterCollateralRequest
): Promise<RegisterCollateralResponse> {
  const res = await fetch(`${API}/api/collateral/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Failed to register collateral: ${res.statusText}`);
  }
  return res.json();
}

export async function requestLoan(data: RequestLoanRequest): Promise<RequestLoanResponse> {
  const res = await fetch(`${API}/api/loan/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Failed to request loan: ${res.statusText}`);
  }
  return res.json();
}

export async function repayLoan(data: RepayLoanRequest): Promise<RepayLoanResponse> {
  const res = await fetch(`${API}/api/loan/repay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Failed to repay loan: ${res.statusText}`);
  }
  return res.json();
}
