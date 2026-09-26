import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe, toHaveNoViolations } from 'jest-axe';
import CollateralRegistrationForm from '@/components/CollateralRegistrationForm';
import { ToastProvider, ToastContainer } from '@/components/toast';
import ErrorBoundary from '@/components/ErrorBoundary';

expect.extend(toHaveNoViolations);

jest.mock('focus-trap-react', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return function FocusTrap({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  };
});

jest.mock('@/lib/freighterClient', () => ({
  signTransaction: jest.fn().mockResolvedValue({ signedTxXdr: 'signed_xdr' }),
}));

jest.mock('@/lib/stellarUtils', () => ({
  submitSignedXdr: jest.fn().mockResolvedValue('collateral_123'),
}));

jest.mock('@/components/ConfirmDialog', () => ({
  __esModule: true,
  default: ({
    open,
    onConfirm,
    title,
  }: {
    open: boolean;
    onConfirm: () => void;
    title?: string;
  }) =>
    open ? (
      <div role="dialog" aria-label={title ?? 'Confirm'}>
        <button type="button" onClick={onConfirm}>
          Register
        </button>
      </div>
    ) : null,
}));

jest.mock('framer-motion', () => ({
  motion: {
    button: ({ children, ...props }: React.ComponentPropsWithoutRef<'button'>) =>
      React.createElement('button', props, children),
  },
  useReducedMotion: jest.fn().mockReturnValue(false),
}));

global.fetch = jest.fn();

function renderWithToast(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      {ui}
      <ToastContainer />
    </ToastProvider>
  );
}

function fillBasicInfo(quantity = '5') {
  fireEvent.change(screen.getByLabelText(/Animal Type/), { target: { value: 'cattle' } });
  fireEvent.change(screen.getByLabelText(/Count/), { target: { value: quantity } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

function selectAnimalPhoto() {
  const file = new File(['img'], 'cow.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText(/Animal Photo/), { target: { files: [file] } });
  return file;
}

function fillValuation() {
  fireEvent.change(screen.getByLabelText(/Appraised Value/), {
    target: { value: '1000000' },
  });
  selectAnimalPhoto();
}

function fillAndOpenConfirmation() {
  fillBasicInfo();
  fillValuation();
  fireEvent.click(screen.getByRole('button', { name: 'Register Collateral' }));
}

function confirmRegistration() {
  fireEvent.click(screen.getByRole('button', { name: /^Register$/ }));
}

describe('CollateralRegistrationForm', () => {
  const walletAddress = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
  const onSuccess = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ xdr: 'mock_xdr', api_version: 'v1' }),
    });
  });

  it('shows only basic information on step one', () => {
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);

    expect(
      screen.getByRole('heading', { name: 'Register Livestock Collateral' })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Basic Info' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Animal Type/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Count/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Appraised Value/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Animal Photo/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Register Collateral' })).not.toBeInTheDocument();
  });

  it('shows current and completed step states', () => {
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);

    const steps = screen.getByRole('list', { name: 'Registration steps' });
    expect(steps).toHaveTextContent('Basic InfoCurrent step');
    expect(steps).toHaveTextContent('Valuation & PhotoNot started');

    fillBasicInfo();

    expect(steps).toHaveTextContent('Basic InfoCompleted');
    expect(steps).toHaveTextContent('Valuation & PhotoCurrent step');
  });

  it('validates step one before showing valuation fields', async () => {
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert', { name: /1 error in this form/i })).toBeInTheDocument();
    expect(screen.getAllByText('Quantity must be a positive whole number')).toHaveLength(2);
    expect(screen.queryByLabelText(/Appraised Value/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Count/), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByLabelText(/Appraised Value/)).toBeInTheDocument();
  });

  it('shows valuation and photo fields on step two', () => {
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);

    fillBasicInfo();

    expect(screen.getByRole('heading', { name: 'Valuation & Photo' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Appraised Value/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Animal Photo/)).toHaveAttribute('type', 'file');
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register Collateral' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Animal Type/)).not.toBeInTheDocument();
  });

  it('preserves entered data when navigating back', () => {
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);

    fireEvent.change(screen.getByLabelText(/Animal Type/), { target: { value: 'goat' } });
    fireEvent.change(screen.getByLabelText(/Count/), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText(/Animal Type/)).toHaveValue('goat');
    expect(screen.getByLabelText(/Count/)).toHaveValue(8);
  });

  it('moves focus to the new step heading', async () => {
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);

    fillBasicInfo();

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Valuation & Photo' })).toHaveFocus()
    );
  });

  it('supports keyboard navigation through step one', async () => {
    const user = userEvent.setup();
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);

    await user.tab();
    expect(screen.getByLabelText(/Animal Type/)).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText(/Count/)).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Continue' })).toHaveFocus();
  });

  it('previews a valid photo and rejects unsupported file types', async () => {
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);
    fillBasicInfo();

    selectAnimalPhoto();

    expect(await screen.findByAltText('cattle animal photo preview')).toBeInTheDocument();

    const textFile = new File(['not an image'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(/Animal Photo/), { target: { files: [textFile] } });

    expect(screen.getAllByText('Only JPEG, PNG, WebP, or GIF images are allowed')).toHaveLength(2);
    expect(screen.queryByAltText('cattle animal photo preview')).not.toBeInTheDocument();
  });

  it('removes a selected photo', async () => {
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);
    fillBasicInfo();
    selectAnimalPhoto();
    await screen.findByAltText('cattle animal photo preview');

    fireEvent.click(screen.getByRole('button', { name: 'Remove animal photo' }));

    expect(screen.queryByAltText('cattle animal photo preview')).not.toBeInTheDocument();
  });

  it('only submits after step two is completed', async () => {
    renderWithToast(
      <CollateralRegistrationForm walletAddress={walletAddress} onSuccess={onSuccess} />
    );

    fillAndOpenConfirmation();

    expect(screen.getByRole('dialog', { name: 'Register Collateral' })).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();

    confirmRegistration();

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const request = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(JSON.parse(request.body)).toEqual({
      owner: walletAddress,
      animal_type: 'cattle',
      count: 5,
      appraised_value: 1000000,
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('collateral_123'));
    expect(screen.getByRole('alert')).toHaveTextContent('Collateral registered successfully');
  });

  it('does not open confirmation when step two is invalid', () => {
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);
    fillBasicInfo();

    fireEvent.click(screen.getByRole('button', { name: 'Register Collateral' }));

    expect(screen.getAllByText('Appraised value must be a positive whole number')).toHaveLength(2);
    expect(screen.getAllByText('Animal photo is required')).toHaveLength(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows a loading state while registration is pending', async () => {
    (global.fetch as jest.Mock).mockReturnValue(new Promise(() => {}));
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);

    fillAndOpenConfirmation();
    confirmRegistration();

    expect(await screen.findByText('Processing…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Processing/ })).toBeDisabled();
  });

  it('shows an error toast when registration fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Registration failed' }),
    });
    renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);

    fillAndOpenConfirmation();
    confirmRegistration();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Registration failed/);
    });
  });

  it('resets the form after successful registration', async () => {
    renderWithToast(
      <CollateralRegistrationForm walletAddress={walletAddress} onSuccess={onSuccess} />
    );

    fillAndOpenConfirmation();
    confirmRegistration();

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('collateral_123'));
    expect(screen.getByRole('heading', { name: 'Basic Info' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Count/)).toHaveValue(null);
    expect(screen.getByLabelText(/Animal Type/)).toHaveValue('cattle');
  });

  it('has no detectable accessibility violations on either step', async () => {
    const { container } = renderWithToast(
      <CollateralRegistrationForm walletAddress={walletAddress} />
    );

    expect(await axe(container)).toHaveNoViolations();

    fillBasicInfo();
    fillValuation();

    expect(await axe(container)).toHaveNoViolations();
  });

  describe('auto-save functionality', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('auto-saves entered text data every five seconds', () => {
      renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);

      fireEvent.change(screen.getByLabelText(/Count/), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText(/Animal Type/), { target: { value: 'goat' } });
      act(() => jest.advanceTimersByTime(5000));

      const saved = JSON.parse(localStorage.getItem('stellarkraal_collateral_form') ?? '{}');
      expect(saved.data).toEqual({
        animalType: 'goat',
        quantity: '5',
        appraisedValue: '',
      });
    });

    it('restores saved data for the same wallet', () => {
      localStorage.setItem(
        'stellarkraal_collateral_form',
        JSON.stringify({
          walletAddress,
          step: 1,
          data: { animalType: 'goat', quantity: '10', appraisedValue: '500000' },
          timestamp: new Date().toISOString(),
        })
      );

      renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);
      fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

      expect(screen.getByLabelText(/Animal Type/)).toHaveValue('goat');
      expect(screen.getByLabelText(/Count/)).toHaveValue(10);
    });

    it('clears saved data after successful registration', async () => {
      jest.useRealTimers();
      localStorage.setItem(
        'stellarkraal_collateral_form',
        JSON.stringify({
          walletAddress,
          step: 1,
          data: { animalType: 'goat', quantity: '5', appraisedValue: '500000' },
        })
      );
      renderWithToast(<CollateralRegistrationForm walletAddress={walletAddress} />);

      fillAndOpenConfirmation();
      confirmRegistration();

      await waitFor(() => {
        expect(localStorage.getItem('stellarkraal_collateral_form')).toBeNull();
      });
    });
  });
});

// #494: Error boundary wrapping
describe('CollateralRegistrationForm error boundary (#494)', () => {
  function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
    if (shouldThrow) throw new Error('collateral form explosion');
    return <span>OK</span>;
  }

  it('renders the error boundary fallback when a child throws', () => {
    render(
      <ToastProvider>
        <ErrorBoundary section="Collateral Registration">
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      </ToastProvider>
    );
    expect(screen.getByText(/something went wrong/i)).toBeTruthy();
  });

  it('renders children normally when no error occurs', () => {
    render(
      <ToastProvider>
        <ErrorBoundary section="Collateral Registration">
          <Bomb shouldThrow={false} />
        </ErrorBoundary>
      </ToastProvider>
    );
    expect(screen.getByText('OK')).toBeTruthy();
  });
});
