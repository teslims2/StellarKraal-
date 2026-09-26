'use client';

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import Spinner from '@/components/Spinner';
import { ErrorSummary, FieldError, Input, Select, toSummaryErrors } from '@/components/ui';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { API, invalidateCollateral } from '@/lib/api';

export interface RegisterCollateralFormProps {
  walletAddress?: string;
  onSuccess?: (collateralId: string) => void;
}

type FormValues = {
  animalType: string;
  breed: string;
  age: string;
  weight: string;
};

type FieldName = keyof FormValues | 'image';
type FormErrors = Partial<Record<FieldName, string>>;

const INITIAL_VALUES: FormValues = {
  animalType: 'cattle',
  breed: '',
  age: '',
  weight: '',
};

const ANIMAL_TYPES = ['cattle', 'goat', 'sheep'];
const AUTO_SAVE_INTERVAL = 5000;
const STORAGE_KEY = 'stellarkraal_collateral_form';
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

const FIELD_IDS: Record<FieldName, string> = {
  animalType: 'register-animal-type',
  breed: 'register-breed',
  age: 'register-age',
  weight: 'register-weight',
  image: 'register-image',
};

function validateText(name: keyof FormValues, value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    if (name === 'animalType') return 'Animal type is required';
    if (name === 'breed') return 'Breed is required';
    if (name === 'age') return 'Age is required';
    return 'Weight is required';
  }

  if (name === 'age') {
    const age = Number(trimmed);
    if (!Number.isFinite(age) || age < 0) return 'Age must be a non-negative number';
  }

  if (name === 'weight') {
    const weight = Number(trimmed);
    if (!Number.isFinite(weight) || weight <= 0) return 'Weight must be a positive number';
  }

  return undefined;
}

function validateImage(file: File | null): string | undefined {
  if (!file) return 'Image is required';
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) return 'Image must be a JPEG or PNG file';
  if (file.size > MAX_IMAGE_SIZE) return 'Image must be 5 MB or smaller';
  return undefined;
}

function withoutFile(values: FormValues): FormValues {
  return {
    animalType: values.animalType,
    breed: values.breed,
    age: values.age,
    weight: values.weight,
  };
}

function fieldNameFromServerKey(key: string): FieldName | null {
  const aliases: Record<string, FieldName> = {
    animal_type: 'animalType',
    animalType: 'animalType',
    breed: 'breed',
    age: 'age',
    age_years: 'age',
    weight: 'weight',
    weight_kg: 'weight',
    image: 'image',
    photo: 'image',
  };
  return aliases[key] ?? null;
}

function firstMessage(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstMessage(item);
      if (message) return message;
    }
  }
  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return undefined;
}

function serverFieldErrors(payload: unknown): FormErrors {
  if (!payload || typeof payload !== 'object') return {};
  const body = payload as Record<string, unknown>;
  const sources: unknown[] = [body.details, body.errors, body.fieldErrors];
  const result: FormErrors = {};

  for (const source of sources) {
    if (!source) continue;
    if (Array.isArray(source)) {
      for (const issue of source) {
        if (!issue || typeof issue !== 'object') continue;
        const item = issue as { field?: unknown; path?: unknown; message?: unknown };
        const key =
          typeof item.field === 'string'
            ? item.field
            : Array.isArray(item.path)
              ? String(item.path[0])
              : '';
        const field = key ? fieldNameFromServerKey(key) : null;
        const message = firstMessage(item.message);
        if (field && message) result[field] = message;
      }
      continue;
    }
    if (typeof source === 'object') {
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        const field = fieldNameFromServerKey(key);
        const message = firstMessage(value);
        if (field && message) result[field] = message;
      }
    }
  }

  return result;
}

function responseMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const body = payload as Record<string, unknown>;
    if (typeof body.error === 'string' && body.error) return body.error;
    if (typeof body.message === 'string' && body.message) return body.message;
  }
  return fallback;
}

export function RegisterCollateralForm({ walletAddress, onSuccess }: RegisterCollateralFormProps) {
  const { isOnline } = useNetworkStatus();
  const [values, setValues] = useState<FormValues>(INITIAL_VALUES);
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { walletAddress?: string | null; data?: FormValues };
      if ((parsed.walletAddress ?? null) === (walletAddress ?? null) && parsed.data) {
        setShowRestorePrompt(true);
      }
    } catch {
      setShowRestorePrompt(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (successId) return;
      if (!values.breed.trim() && !values.age.trim() && !values.weight.trim()) return;
      const data = withoutFile(values);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          walletAddress: walletAddress ?? null,
          data,
          timestamp: new Date().toISOString(),
        })
      );
      setLastSaved(new Date());
    }, AUTO_SAVE_INTERVAL);
    return () => window.clearInterval(interval);
  }, [successId, values, walletAddress]);

  useEffect(() => {
    if (!image || typeof URL.createObjectURL !== 'function') {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => {
      if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
    };
  }, [image]);

  const restoreSavedData = useCallback(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { data?: Partial<FormValues> };
      if (!parsed.data) return;
      setValues({
        animalType: parsed.data.animalType ?? '',
        breed: parsed.data.breed ?? '',
        age: parsed.data.age ?? '',
        weight: parsed.data.weight ?? '',
      });
      setErrors({});
      setShowRestorePrompt(false);
    } catch {
      setShowRestorePrompt(false);
    }
  }, []);

  const dismissRestore = useCallback(() => {
    setShowRestorePrompt(false);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const validateField = useCallback((name: keyof FormValues, value: string) => {
    return validateText(name, value);
  }, []);

  const handleChange = (name: keyof FormValues, value: string) => {
    setValues((previous) => ({ ...previous, [name]: value }));
    setErrors((previous) => ({ ...previous, [name]: validateField(name, value) }));
    setStatusError(null);
  };

  const handleBlur = (name: keyof FormValues) => {
    setErrors((previous) => ({ ...previous, [name]: validateField(name, values[name]) }));
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    const imageError = validateImage(file);
    if (imageError && file) {
      setImage(null);
      setErrors((previous) => ({ ...previous, image: imageError }));
      setStatusError(null);
      event.target.value = '';
      return;
    }

    setImage(file);
    setErrors((previous) => ({ ...previous, image: imageError }));
    setStatusError(null);
  };

  const removeImage = () => {
    setImage(null);
    setErrors((previous) => ({ ...previous, image: undefined }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validateForm = useCallback((): FormErrors => {
    const nextErrors: FormErrors = {};
    (Object.keys(INITIAL_VALUES) as Array<keyof FormValues>).forEach((name) => {
      const error = validateField(name, values[name]);
      if (error) nextErrors[name] = error;
    });
    const imageError = validateImage(image);
    if (imageError) nextErrors.image = imageError;
    return nextErrors;
  }, [image, validateField, values]);

  const resetForm = useCallback(() => {
    setValues(INITIAL_VALUES);
    setImage(null);
    setErrors({});
    setSubmitAttempted(false);
    setStatusError(null);
    setLastSaved(null);
    setSuccessId(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setStatusError(null);

    if (!isOnline) {
      setStatusError("You're offline");
      return;
    }

    const nextErrors = validateForm();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !image) return;

    const body = new FormData();
    body.append('animal_type', values.animalType.trim());
    body.append('breed', values.breed.trim());
    body.append('age', values.age.trim());
    body.append('weight', values.weight.trim());
    body.append('image', image, image.name);

    setLoading(true);
    try {
      const response = await fetch(`${API}/api/v1/collateral`, {
        method: 'POST',
        body,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const fieldErrors = serverFieldErrors(payload);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
        } else {
          setStatusError(responseMessage(payload, 'Unable to register collateral'));
        }
        return;
      }

      const id =
        typeof payload === 'string'
          ? payload
          : payload && typeof payload === 'object' && 'id' in payload
            ? String((payload as { id: unknown }).id)
            : '';
      if (!id) {
        setStatusError('The server did not return a collateral id');
        return;
      }

      localStorage.removeItem(STORAGE_KEY);
      setLastSaved(null);
      void invalidateCollateral();
      setSuccessId(id);
      onSuccess?.(id);
    } catch {
      setStatusError('Connection failed – please retry');
    } finally {
      setLoading(false);
    }
  };

  if (successId) {
    return (
      <div className="space-y-4 rounded-2xl bg-white p-6 shadow" role="status" aria-live="polite">
        <h2 className="text-xl font-semibold text-brown-700">Collateral Registered!</h2>
        <p className="text-sm text-brown-600">
          Collateral registered successfully. Created record ID:{' '}
          <span data-testid="success-collateral-id">{successId}</span>
        </p>
        <button
          type="button"
          onClick={resetForm}
          className="rounded-xl bg-brown px-4 py-2 text-sm font-semibold text-cream hover:bg-brown/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        >
          Submit Another
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl bg-white p-6 shadow">
      {showRestorePrompt && (
        <div className="rounded-xl border border-gold-300 bg-gold-100 p-4">
          <p className="mb-2 text-sm text-brown-700">
            You have unsaved progress. Would you like to restore it?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={restoreSavedData}
              className="rounded-lg bg-gold px-3 py-1.5 text-sm font-semibold text-brown"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={dismissRestore}
              className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brown"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <h2 className="text-xl font-semibold text-brown-700">Register Collateral</h2>

      <form
        data-onboarding-target="collateral"
        onSubmit={handleSubmit}
        className="space-y-4"
        noValidate
      >
        <ErrorSummary
          errors={
            submitAttempted ? toSummaryErrors(errors as Record<string, string>, FIELD_IDS) : []
          }
        />

        <Select
          id={FIELD_IDS.animalType}
          name="animal_type"
          aria-label="Animal Type"
          label="Animal Type"
          required
          value={values.animalType}
          onChange={(event) => handleChange('animalType', event.target.value)}
          onBlur={() => handleBlur('animalType')}
          error={errors.animalType}
          disabled={loading}
        >
          {ANIMAL_TYPES.map((type) => (
            <option key={type} value={type}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </Select>

        <Input
          id={FIELD_IDS.breed}
          name="breed"
          aria-label="Breed"
          label="Breed"
          required
          value={values.breed}
          onChange={(event) => handleChange('breed', event.target.value)}
          onBlur={() => handleBlur('breed')}
          error={errors.breed}
          disabled={loading}
          placeholder="e.g., Holstein, Boer, Merino"
        />

        <Input
          id={FIELD_IDS.age}
          name="age"
          aria-label="Age (years)"
          label="Age (years)"
          required
          type="number"
          min="0"
          step="0.1"
          value={values.age}
          onChange={(event) => handleChange('age', event.target.value)}
          onBlur={() => handleBlur('age')}
          error={errors.age}
          disabled={loading}
          placeholder="Age of the animal"
        />

        <Input
          id={FIELD_IDS.weight}
          name="weight"
          aria-label="Weight (kg)"
          label="Weight (kg)"
          required
          type="number"
          min="0"
          step="0.1"
          value={values.weight}
          onChange={(event) => handleChange('weight', event.target.value)}
          onBlur={() => handleBlur('weight')}
          error={errors.weight}
          disabled={loading}
          placeholder="Average weight per animal"
        />

        <div className="space-y-2">
          <label htmlFor={FIELD_IDS.image} className="block text-sm font-medium text-brown-700">
            Image <span className="text-error">*</span>
          </label>
          <input
            ref={fileInputRef}
            id={FIELD_IDS.image}
            name="image"
            type="file"
            required
            accept="image/jpeg,image/png"
            onChange={handleImageChange}
            onBlur={() => setErrors((previous) => ({ ...previous, image: validateImage(image) }))}
            disabled={loading}
            aria-label="Image upload animal photo"
            aria-invalid={!!errors.image}
            aria-describedby={errors.image ? `${FIELD_IDS.image}-error` : undefined}
            className="block w-full text-sm text-brown-700 file:mr-4 file:rounded-lg file:border-0 file:bg-gold file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brown disabled:opacity-50"
          />
          <FieldError id={`${FIELD_IDS.image}-error`} message={errors.image} />
          {previewUrl && (
            <div className="relative mt-3 w-fit">
              <img
                src={previewUrl}
                alt="Image preview"
                className="max-h-48 rounded-lg border border-brown/10"
              />
              <button
                type="button"
                onClick={removeImage}
                className="absolute right-2 top-2 rounded bg-error px-2 py-1 text-xs font-semibold text-white hover:bg-error/80"
                aria-label="Remove image"
              >
                Remove
              </button>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !isOnline}
          aria-disabled={loading || !isOnline}
          aria-busy={loading}
          title={!isOnline ? "You're offline" : undefined}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brown py-2.5 font-semibold text-cream transition hover:bg-brown/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Spinner /> : null}
          {loading ? 'Registering…' : isOnline ? 'Register Collateral' : "You're offline"}
        </button>
      </form>

      {lastSaved && !loading && (
        <p className="text-center text-xs text-brown-400">
          Auto-saved at {lastSaved.toLocaleTimeString()}
        </p>
      )}
      {statusError && (
        <p role="alert" className="rounded-xl bg-error-light p-3 text-sm text-error-dark">
          {statusError}
        </p>
      )}
    </div>
  );
}

export default RegisterCollateralForm;
