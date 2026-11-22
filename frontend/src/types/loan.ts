export type LoanStatus = 'active' | 'repaid' | 'liquidated' | 'pending';

export type CollateralType = 'ETH' | 'BTC' | 'USDC' | 'DAI' | 'OTHER';

export interface CollateralItem {
  id: string;
  asset: string;
  type: CollateralType;
  amount: number;
  valueUsd: number;
  liquidationThreshold: number;
}

export type TransactionType =
  | 'disbursement'
  | 'repayment'
  | 'liquidation'
  | 'collateral_deposit'
  | 'collateral_withdrawal';

export interface LoanTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  asset?: string;
  timestamp: string;
  transactionHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  note?: string;
}

export interface Loan {
  id: string;
  borrower: string;
  principal: number;
  outstanding: number;
  interestRate: number;
  collateral: number;
  healthFactor: number;
  status: LoanStatus;
  dueDate: string;
  createdAt: string;
  collateralItems: CollateralItem[];
  transactions: LoanTransaction[];
  currency: string;
  repaidAmount: number;
  liquidationPrice?: number;
  updatedAt?: string;
}

export type RepaymentMode = 'partial' | 'full';

export interface RepaymentPreview {
  mode: RepaymentMode;
  amount: number;
  remainingBalance: number;
  currentHealthFactor: number;
  projectedHealthFactor: number;
  resultingStatus: LoanStatus;
  isValid: boolean;
  validationError?: string;
}

export interface RepaymentTransactionDetails {
  loanId: string;
  borrower: string;
  mode: RepaymentMode;
  amount: number;
  remainingBalance: number;
  projectedHealthFactor: number;
  resultingStatus: LoanStatus;
  estimatedFee?: string;
}

export interface RepaymentResult {
  loanId: string;
  mode: RepaymentMode;
  amountRepaid: number;
  remainingBalance: number;
  newHealthFactor: number;
  status: LoanStatus;
  transactionHash: string;
  confirmedAt: string;
}