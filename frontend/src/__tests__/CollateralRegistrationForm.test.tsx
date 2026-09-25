import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import RegisterCollateralForm, { MAX_IMAGE_SIZE } from '@/components/RegisterCollateralForm';
import CollateralRegistrationForm from '@/components/CollateralRegistrationForm';

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isOnline: true }),
}));

const fetchMock = jest.fn();
global.fetch = fetchMock;

function renderForm(onSuccess?: (id: string) => void) {
  return render(<RegisterCollateralForm walletAddress="wallet-1" onSuccess={onSuccess} />);
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/Animal Type/), { target: { value: 'cattle' } });
  fireEvent.change(screen.getByLabelText(/Breed/), { target: { value: 'Holstein' } });
  fireEvent.change(screen.getByLabelText(/Age \(years\)/), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText(/Weight \(kg\)/), { target: { value: '450' } });
  const file = new File(['image'], 'cow.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText(/Image upload/), { target: { files: [file] } });
  return file;
}

describe('RegisterCollateralForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    URL.createObjectURL = jest.fn(() => 'blob:collateral-preview');
    URL.revokeObjectURL = jest.fn();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'collateral-123' }),
    });
  });

  it('renders the required fields and accessible labels', () => {
    renderForm();

    expect(screen.getByLabelText('Animal Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Breed')).toBeInTheDocument();
    expect(screen.getByLabelText('Age (years)')).toBeInTheDocument();
    expect(screen.getByLabelText('Weight (kg)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Image upload/)).toHaveAttribute('accept', 'image/jpeg,image/png');
  });

  it('accepts an image at the exact size limit and rejects one byte over', () => {
    renderForm();
    const input = screen.getByLabelText(/Image upload/);
    const exact = new File(['image'], 'exact.png', { type: 'image/png' });
    Object.defineProperty(exact, 'size', { value: MAX_IMAGE_SIZE });
    fireEvent.change(input, { target: { files: [exact] } });
    expect(screen.queryByText('Image must be 5 MB or smaller')).not.toBeInTheDocument();
    expect(screen.getByAltText('Image preview')).toBeInTheDocument();

    const oversized = new File(['image'], 'large.png', { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: MAX_IMAGE_SIZE + 1 });
    fireEvent.change(input, { target: { files: [oversized] } });
    expect(screen.getByText('Image must be 5 MB or smaller')).toBeInTheDocument();
    expect(screen.queryByAltText('Image preview')).not.toBeInTheDocument();
  });

  it('rejects unsupported image MIME types', () => {
    renderForm();
    const file = new File(['image'], 'cow.gif', { type: 'image/gif' });

    fireEvent.change(screen.getByLabelText(/Image upload/), { target: { files: [file] } });

    expect(screen.getByText('Image must be a JPEG or PNG file')).toBeInTheDocument();
    expect(screen.queryByAltText('Image preview')).not.toBeInTheDocument();
  });

  it('shows a preview and removes the selected image', () => {
    renderForm();
    const file = new File(['image'], 'cow.png', { type: 'image/png' });

    fireEvent.change(screen.getByLabelText(/Image upload/), { target: { files: [file] } });
    expect(screen.getByAltText('Image preview')).toHaveAttribute('src', 'blob:collateral-preview');

    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));

    expect(screen.queryByAltText('Image preview')).not.toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:collateral-preview');
  });

  it('submits multipart fields and the file to the exact endpoint without Content-Type', async () => {
    const onSuccess = jest.fn();
    renderForm(onSuccess);
    const file = fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: 'Register Collateral' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3001/api/v1/collateral');
    expect(options.method).toBe('POST');
    expect(options.headers).toBeUndefined();
    const body = options.body as FormData;
    expect(body.get('animal_type')).toBe('cattle');
    expect(body.get('breed')).toBe('Holstein');
    expect(body.get('age')).toBe('3');
    expect(body.get('weight')).toBe('450');
    expect(body.get('image')).toBeInstanceOf(File);
    expect((body.get('image') as File).name).toBe(file.name);
    expect((body.get('image') as File).type).toBe(file.type);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('collateral-123'));
    expect(screen.getByTestId('success-collateral-id')).toHaveTextContent('collateral-123');
  });

  it('maps server field errors inline', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({
        error: 'Validation failed',
        details: {
          breed: ['Breed is not available'],
          age: ['Age is invalid'],
          image: ['Image is unreadable'],
        },
      }),
    });
    renderForm();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: 'Register Collateral' }));

    await waitFor(() => {
      expect(screen.getAllByText('Breed is not available').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Age is invalid').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Image is unreadable').length).toBeGreaterThan(0);
    });
    expect(screen.getByLabelText(/Breed/)).toHaveAttribute(
      'aria-describedby',
      'register-breed-error'
    );
    expect(screen.getByLabelText(/Age \(years\)/)).toHaveAttribute(
      'aria-describedby',
      'register-age-error'
    );
    expect(screen.getByLabelText(/Image upload/)).toHaveAttribute(
      'aria-describedby',
      'register-image-error'
    );
  });

  it('shows inline validation before making a request', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/Animal Type/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register Collateral' }));

    expect(screen.getAllByText('Animal type is required').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Image is required').length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not autosave an untouched form', () => {
    jest.useFakeTimers();
    renderForm();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    expect(localStorage.getItem('stellarkraal_collateral_form')).toBeNull();
    jest.useRealTimers();
  });

  it('autosaves text fields without serializing the image', () => {
    jest.useFakeTimers();
    renderForm();
    fillValidForm();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    const saved = localStorage.getItem('stellarkraal_collateral_form');
    expect(saved).toBeTruthy();
    expect(saved).not.toContain('image');
    expect(JSON.parse(saved!).data.animalType).toBe('cattle');
    jest.useRealTimers();
  });

  it('keeps the old component path as a compatibility export', () => {
    render(<CollateralRegistrationForm />);
    expect(screen.getByRole('heading', { name: 'Register Collateral' })).toBeInTheDocument();
  });
});
