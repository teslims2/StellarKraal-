import { requestLoan, repayLoan, liquidateLoan, LoanNotFoundError, LoanNotLiquidatableError } from './loanService';
import { loanCreatedTotal, loanRepaidTotal, loanLiquidatedTotal } from '../metrics';
import * as store from '../db/store';
import * as contractTx from './contractTx';

// Mock dependencies
jest.mock('../db/store');
jest.mock('./contractTx');
jest.mock('../webhooks');
jest.mock('../utils/rpcClient');

describe('Loan Service Metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset metric counters
    loanCreatedTotal.reset();
    loanRepaidTotal.reset();
    loanLiquidatedTotal.reset();
  });

  describe('requestLoan metrics', () => {
    it('increments loan_created_total counter with correct labels', async () => {
      const incSpy = jest.spyOn(loanCreatedTotal, 'inc');
      
      (contractTx.buildContractTx as jest.Mock).mockResolvedValue('mock_xdr');
      (store.getCollateral as jest.Mock).mockReturnValue({
        id: 'collateral-1',
        animal_type: 'cattle',
        appraised_value: 100000,
      });

      await requestLoan({
        borrower: 'GABC123',
        collateral_ids: [1],
        amount: 50000,
      });

      expect(incSpy).toHaveBeenCalledWith(
        { collateral_type: 'cattle', status: 'active' }
      );
    });

    it('uses "unknown" collateral_type when collateral not found', async () => {
      const incSpy = jest.spyOn(loanCreatedTotal, 'inc');
      
      (contractTx.buildContractTx as jest.Mock).mockResolvedValue('mock_xdr');
      (store.getCollateral as jest.Mock).mockReturnValue(null);

      await requestLoan({
        borrower: 'GABC123',
        collateral_ids: [999],
        amount: 50000,
      });

      expect(incSpy).toHaveBeenCalledWith(
        { collateral_type: 'unknown', status: 'active' }
      );
    });

    it('increments counter exactly once per loan creation', async () => {
      const incSpy = jest.spyOn(loanCreatedTotal, 'inc');
      
      (contractTx.buildContractTx as jest.Mock).mockResolvedValue('mock_xdr');
      (store.getCollateral as jest.Mock).mockReturnValue({
        animal_type: 'cattle',
      });

      await requestLoan({
        borrower: 'GABC123',
        collateral_ids: [1],
        amount: 50000,
      });

      expect(incSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('repayLoan metrics', () => {
    it('increments loan_repaid_total counter with repayment amount', async () => {
      const incSpy = jest.spyOn(loanRepaidTotal, 'inc');
      
      (contractTx.buildContractTx as jest.Mock).mockResolvedValue('mock_xdr');
      (store.getLoan as jest.Mock).mockReturnValue({
        id: 'loan-1',
        status: 'active',
        collateral_id: 'collateral-1',
      });
      (store.getCollateral as jest.Mock).mockReturnValue({
        id: 'collateral-1',
        animal_type: 'cattle',
      });

      const repayAmount = 25000;
      await repayLoan({
        borrower: 'GABC123',
        loan_id: 1,
        amount: repayAmount,
      });

      expect(incSpy).toHaveBeenCalledWith(
        { collateral_type: 'cattle', status: 'active' },
        repayAmount
      );
    });

    it('uses "unknown" labels when loan or collateral not found', async () => {
      const incSpy = jest.spyOn(loanRepaidTotal, 'inc');
      
      (contractTx.buildContractTx as jest.Mock).mockResolvedValue('mock_xdr');
      (store.getLoan as jest.Mock).mockReturnValue(null);

      await repayLoan({
        borrower: 'GABC123',
        loan_id: 999,
        amount: 10000,
      });

      expect(incSpy).toHaveBeenCalledWith(
        { collateral_type: 'unknown', status: 'unknown' },
        10000
      );
    });

    it('increments counter exactly once per repayment', async () => {
      const incSpy = jest.spyOn(loanRepaidTotal, 'inc');
      
      (contractTx.buildContractTx as jest.Mock).mockResolvedValue('mock_xdr');
      (store.getLoan as jest.Mock).mockReturnValue({
        id: 'loan-1',
        status: 'active',
        collateral_id: 'collateral-1',
      });
      (store.getCollateral as jest.Mock).mockReturnValue({
        animal_type: 'cattle',
      });

      await repayLoan({
        borrower: 'GABC123',
        loan_id: 1,
        amount: 10000,
      });

      expect(incSpy).toHaveBeenCalledTimes(1);
    });

    it('tracks different repayment amounts independently', async () => {
      const incSpy = jest.spyOn(loanRepaidTotal, 'inc');
      
      (contractTx.buildContractTx as jest.Mock).mockResolvedValue('mock_xdr');
      (store.getLoan as jest.Mock).mockReturnValue({
        id: 'loan-1',
        status: 'active',
        collateral_id: 'collateral-1',
      });
      (store.getCollateral as jest.Mock).mockReturnValue({
        animal_type: 'cattle',
      });

      // First repayment
      await repayLoan({
        borrower: 'GABC123',
        loan_id: 1,
        amount: 10000,
      });

      // Second repayment with different amount
      await repayLoan({
        borrower: 'GABC456',
        loan_id: 2,
        amount: 25000,
      });

      expect(incSpy).toHaveBeenNthCalledWith(1,
        { collateral_type: 'cattle', status: 'active' },
        10000
      );
      expect(incSpy).toHaveBeenNthCalledWith(2,
        { collateral_type: 'cattle', status: 'active' },
        25000
      );
    });
  });

  describe('liquidateLoan metrics', () => {
    it('increments loan_liquidated_total counter with correct labels', async () => {
      const incSpy = jest.spyOn(loanLiquidatedTotal, 'inc');
      
      (contractTx.buildContractTx as jest.Mock).mockResolvedValue('mock_xdr');
      (store.getLoan as jest.Mock).mockReturnValue({
        id: 'loan-1',
        amount: 50000,
        status: 'active',
        collateral_id: 'collateral-1',
        borrower: 'GABC123',
      });
      (store.getCollateral as jest.Mock).mockReturnValue({
        id: 'collateral-1',
        animal_type: 'cattle',
        appraised_value: 100000,
      });
      (store.updateLoan as jest.Mock).mockReturnValue({
        id: 'loan-1',
        status: 'liquidated',
      });

      await liquidateLoan({
        liquidator: 'GABC999',
        loan_id: 1,
        repay_amount: 50000,
      });

      expect(incSpy).toHaveBeenCalledWith(
        { collateral_type: 'cattle', status: 'liquidated' }
      );
    });

    it('uses "unknown" collateral_type when collateral not found', async () => {
      const incSpy = jest.spyOn(loanLiquidatedTotal, 'inc');
      
      (contractTx.buildContractTx as jest.Mock).mockResolvedValue('mock_xdr');
      (store.getLoan as jest.Mock).mockReturnValue({
        id: 'loan-1',
        amount: 50000,
        status: 'active',
        collateral_id: 'collateral-999',
        borrower: 'GABC123',
      });
      (store.getCollateral as jest.Mock).mockReturnValue(null);
      (store.updateLoan as jest.Mock).mockReturnValue({
        id: 'loan-1',
        status: 'liquidated',
      });

      await liquidateLoan({
        liquidator: 'GABC999',
        loan_id: 1,
        repay_amount: 50000,
      });

      expect(incSpy).toHaveBeenCalledWith(
        { collateral_type: 'unknown', status: 'liquidated' }
      );
    });

    it('increments counter exactly once per liquidation', async () => {
      const incSpy = jest.spyOn(loanLiquidatedTotal, 'inc');
      
      (contractTx.buildContractTx as jest.Mock).mockResolvedValue('mock_xdr');
      (store.getLoan as jest.Mock).mockReturnValue({
        id: 'loan-1',
        amount: 50000,
        status: 'active',
        collateral_id: 'collateral-1',
        borrower: 'GABC123',
      });
      (store.getCollateral as jest.Mock).mockReturnValue({
        animal_type: 'cattle',
        appraised_value: 100000,
      });
      (store.updateLoan as jest.Mock).mockReturnValue({
        id: 'loan-1',
        status: 'liquidated',
      });

      await liquidateLoan({
        liquidator: 'GABC999',
        loan_id: 1,
        repay_amount: 50000,
      });

      expect(incSpy).toHaveBeenCalledTimes(1);
    });

    it('throws LoanNotFoundError when loan does not exist', async () => {
      const incSpy = jest.spyOn(loanLiquidatedTotal, 'inc');
      
      (store.getLoan as jest.Mock).mockReturnValue(null);

      await expect(
        liquidateLoan({
          liquidator: 'GABC999',
          loan_id: 999,
          repay_amount: 50000,
        })
      ).rejects.toThrow(LoanNotFoundError);

      // Metric should not be incremented on error
      expect(incSpy).not.toHaveBeenCalled();
    });

    it('throws LoanNotLiquidatableError when health factor is above threshold', async () => {
      const incSpy = jest.spyOn(loanLiquidatedTotal, 'inc');
      
      (store.getLoan as jest.Mock).mockReturnValue({
        id: 'loan-1',
        amount: 50000,
        status: 'active',
        collateral_id: 'collateral-1',
        borrower: 'GABC123',
      });
      (store.getCollateral as jest.Mock).mockReturnValue({
        animal_type: 'cattle',
        appraised_value: 1000000, // Very high collateral value
      });

      await expect(
        liquidateLoan({
          liquidator: 'GABC999',
          loan_id: 1,
          repay_amount: 50000,
        })
      ).rejects.toThrow(LoanNotLiquidatableError);

      // Metric should not be incremented on error
      expect(incSpy).not.toHaveBeenCalled();
    });
  });

  describe('Metric label combinations', () => {
    it('handles multiple collateral types correctly', async () => {
      const createdSpy = jest.spyOn(loanCreatedTotal, 'inc');
      
      (contractTx.buildContractTx as jest.Mock).mockResolvedValue('mock_xdr');

      // Create loan with cattle
      (store.getCollateral as jest.Mock).mockReturnValueOnce({
        animal_type: 'cattle',
      });
      await requestLoan({
        borrower: 'GABC123',
        collateral_ids: [1],
        amount: 50000,
      });

      // Create loan with sheep
      (store.getCollateral as jest.Mock).mockReturnValueOnce({
        animal_type: 'sheep',
      });
      await requestLoan({
        borrower: 'GABC456',
        collateral_ids: [2],
        amount: 30000,
      });

      expect(createdSpy).toHaveBeenNthCalledWith(1,
        { collateral_type: 'cattle', status: 'active' }
      );
      expect(createdSpy).toHaveBeenNthCalledWith(2,
        { collateral_type: 'sheep', status: 'active' }
      );
    });
  });
});
