/**
 * Formulario de alta y edición de una propiedad (`Property`), un solo
 * componente para ambos modos: si recibe `property` es edición, si no, alta.
 *
 * PATCH PARCIAL REAL en edición (AC-7, mismo patrón que `TenantConfigForm`):
 * se lleva un `Set` de nombres de campo tocados por el usuario. Al enviar,
 * el DTO que se manda a `updateProperty` solo incluye esas claves — nunca
 * los campos que no cambiaron, aunque el valor final sea igual al inicial
 * (se considera "tocado" desde el primer `onChange`, no por diff de valor).
 * En alta se manda siempre el DTO completo vía `createProperty` (AC-4).
 *
 * `photoUrls` se trata como un campo más a los fines de "tocado": el
 * `PhotoListEditor` (T12) se embebe controlado por este formulario; cualquier
 * cambio en la lista de fotos marca `photoUrls` como tocado.
 *
 * Mapeo de errores de campo (AC-5, AC-6): el backend devuelve un único
 * mensaje de texto (`ValidationError.message` / `ConflictError.message`) que
 * NO se reescribe, solo se ubica en el campo correspondiente según qué
 * nombre de campo aparece mencionado en el mensaje. Si no se puede ubicar en
 * un campo puntual, se muestra como error general del formulario.
 */

import { useState, type ChangeEvent, type FormEvent } from 'react';
import {
  createProperty,
  updateProperty,
  type CreatePropertyRequest,
  type OperationType,
  type Property,
} from '../../api/endpoints';
import { ConflictError, ValidationError } from '../../api/http-client';
import { ErrorBanner } from '../ErrorBanner';
import { Button, Card, CardBody, CardHeader, Input, Select } from '../ui';
import { PhotoListEditor } from './PhotoListEditor';

export interface PropertyFormProps {
  tenantId: string;
  token: string;
  /** Presente = edición de esta propiedad; ausente = alta de una nueva. */
  property?: Property;
  /** Invocado con la propiedad creada/actualizada tras un guardado exitoso. */
  onSaved?: (property: Property) => void;
  onCancel?: () => void;
}

const OPERATION_OPTIONS: { value: OperationType; label: string }[] = [
  { value: 'SALE', label: 'Venta' },
  { value: 'RENT', label: 'Alquiler' },
  { value: 'TEMP_RENT', label: 'Alquiler temporario' },
];

interface FormState {
  externalRef: string;
  title: string;
  description: string;
  operation: OperationType | '';
  propertyType: string;
  price: string;
  currency: string;
  expenses: string;
  neighborhood: string;
  city: string;
  address: string;
  rooms: string;
  bedrooms: string;
  bathrooms: string;
  areaM2: string;
  garage: boolean;
  petsAllowed: boolean;
  features: string;
  listingUrl: string;
  photoUrls: string[];
}

type FieldName = keyof FormState;

const REQUIRED_FIELDS: FieldName[] = ['title', 'operation', 'propertyType', 'price', 'neighborhood'];

function toFormState(property?: Property): FormState {
  return {
    externalRef: property?.externalRef ?? '',
    title: property?.title ?? '',
    description: property?.description ?? '',
    operation: property?.operation ?? '',
    propertyType: property?.propertyType ?? '',
    price: property?.price ?? '',
    currency: property?.currency ?? '',
    expenses: property?.expenses ?? '',
    neighborhood: property?.neighborhood ?? '',
    city: property?.city ?? '',
    address: property?.address ?? '',
    rooms: property?.rooms != null ? String(property.rooms) : '',
    bedrooms: property?.bedrooms != null ? String(property.bedrooms) : '',
    bathrooms: property?.bathrooms != null ? String(property.bathrooms) : '',
    areaM2: property?.areaM2 != null ? String(property.areaM2) : '',
    garage: property?.garage ?? false,
    petsAllowed: property?.petsAllowed ?? false,
    features: (property?.features ?? []).join(', '),
    listingUrl: property?.listingUrl ?? '',
    photoUrls: (property?.photos ?? []).map((photo) => photo.url),
  };
}

function splitFeatures(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/** Convierte el estado del form (todo string) al shape numérico/opcional del DTO. */
function buildFieldValue(field: FieldName, values: FormState): unknown {
  switch (field) {
    case 'price':
      return values.price === '' ? undefined : Number(values.price);
    case 'expenses':
      return values.expenses === '' ? undefined : Number(values.expenses);
    case 'rooms':
      return values.rooms === '' ? undefined : Number(values.rooms);
    case 'bedrooms':
      return values.bedrooms === '' ? undefined : Number(values.bedrooms);
    case 'bathrooms':
      return values.bathrooms === '' ? undefined : Number(values.bathrooms);
    case 'areaM2':
      return values.areaM2 === '' ? undefined : Number(values.areaM2);
    case 'features':
      return splitFeatures(values.features);
    case 'garage':
      return values.garage;
    case 'petsAllowed':
      return values.petsAllowed;
    case 'photoUrls':
      return values.photoUrls;
    case 'operation':
      return values.operation === '' ? undefined : values.operation;
    default: {
      const raw = values[field];
      const trimmed = typeof raw === 'string' ? raw.trim() : raw;
      return trimmed === '' ? undefined : trimmed;
    }
  }
}

interface FieldErrors {
  price?: string;
  photoUrls?: string;
  externalRef?: string;
}

/**
 * Ubica el mensaje crudo del backend en el campo que corresponde, sin
 * reescribirlo (AC-5, AC-6). Si no matchea ningún campo conocido, se
 * devuelve como error general (undefined en `FieldErrors`, `formError`
 * afuera).
 */
function mapBackendMessageToFieldErrors(message: string): FieldErrors {
  const errors: FieldErrors = {};
  if (message.toLowerCase().includes('price')) {
    errors.price = message;
  }
  if (message.toLowerCase().includes('photourls')) {
    errors.photoUrls = message;
  }
  if (message.toLowerCase().includes('externalref')) {
    errors.externalRef = message;
  }
  return errors;
}

export function PropertyForm({
  tenantId,
  token,
  property,
  onSaved,
  onCancel,
}: PropertyFormProps): JSX.Element {
  const isEditing = property !== undefined;
  const [values, setValues] = useState<FormState>(() => toFormState(property));
  const [touched, setTouched] = useState<Set<FieldName>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [missingRequired, setMissingRequired] = useState<Set<FieldName>>(new Set());

  const markTouched = (field: FieldName): void => {
    setTouched((prev) => {
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  };

  const clearFieldError = (field: keyof FieldErrors): void => {
    setFieldErrors((prev) => {
      if (!(field in prev)) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleTextChange =
    (field: FieldName) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>): void => {
      const { value } = event.target;
      setValues((prev) => ({ ...prev, [field]: value }));
      markTouched(field);
      if (field === 'price') clearFieldError('price');
      if (field === 'externalRef') clearFieldError('externalRef');
    };

  const handleCheckboxChange =
    (field: 'garage' | 'petsAllowed') =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      const { checked } = event.target;
      setValues((prev) => ({ ...prev, [field]: checked }));
      markTouched(field);
    };

  const handlePhotoUrlsChange = (photoUrls: string[]): void => {
    setValues((prev) => ({ ...prev, photoUrls }));
    markTouched('photoUrls');
    clearFieldError('photoUrls');
  };

  function validateRequired(): boolean {
    const missing = new Set<FieldName>();
    for (const field of REQUIRED_FIELDS) {
      const value = values[field];
      if (typeof value === 'string' && value.trim() === '') {
        missing.add(field);
      }
    }
    setMissingRequired(missing);
    return missing.size === 0;
  }

  function applyBackendError(err: unknown): void {
    if (err instanceof ConflictError) {
      const mapped = mapBackendMessageToFieldErrors(err.message);
      if (mapped.externalRef) {
        setFieldErrors((prev) => ({ ...prev, externalRef: mapped.externalRef }));
      } else {
        setFormError(err.message);
      }
      return;
    }

    if (err instanceof ValidationError) {
      const mapped = mapBackendMessageToFieldErrors(err.message);
      if (mapped.price || mapped.photoUrls || mapped.externalRef) {
        setFieldErrors((prev) => ({ ...prev, ...mapped }));
      } else {
        setFormError(err.message);
      }
      return;
    }

    setFormError(err instanceof Error ? err.message : 'No se pudo guardar la propiedad.');
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    setFieldErrors({});

    if (!validateRequired()) {
      return;
    }

    setSubmitting(true);
    try {
      let saved: Property;
      if (isEditing) {
        const dto: Partial<CreatePropertyRequest> = {};
        for (const field of touched) {
          (dto as Record<string, unknown>)[field] = buildFieldValue(field, values);
        }
        saved = await updateProperty(tenantId, property.id, dto, token);
      } else {
        const dto: CreatePropertyRequest = {
          title: values.title.trim(),
          operation: values.operation as OperationType,
          propertyType: values.propertyType.trim(),
          price: Number(values.price),
          neighborhood: values.neighborhood.trim(),
          externalRef: values.externalRef.trim() || undefined,
          description: values.description.trim() || undefined,
          currency: values.currency.trim() || undefined,
          expenses: values.expenses === '' ? undefined : Number(values.expenses),
          city: values.city.trim() || undefined,
          address: values.address.trim() || undefined,
          rooms: values.rooms === '' ? undefined : Number(values.rooms),
          bedrooms: values.bedrooms === '' ? undefined : Number(values.bedrooms),
          bathrooms: values.bathrooms === '' ? undefined : Number(values.bathrooms),
          areaM2: values.areaM2 === '' ? undefined : Number(values.areaM2),
          garage: values.garage,
          petsAllowed: values.petsAllowed,
          features: splitFeatures(values.features),
          listingUrl: values.listingUrl.trim() || undefined,
          photoUrls: values.photoUrls,
        };
        saved = await createProperty(tenantId, dto, token);
      }

      setValues(toFormState(saved));
      setTouched(new Set());
      onSaved?.(saved);
    } catch (err) {
      applyBackendError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card tone="raised">
      <CardHeader>
        <h2 className="u-display text-lg text-text">
          {isEditing ? 'Editar propiedad' : 'Cargar propiedad'}
        </h2>
      </CardHeader>
      <CardBody>
        {formError && <ErrorBanner message={formError} />}

        <form onSubmit={handleSubmit} data-testid="property-form" className="flex flex-col gap-4">
          <div>
            <label htmlFor="property-form-title" className="u-meta mb-1.5 block text-text-muted">
              Título
            </label>
            <Input
              id="property-form-title"
              value={values.title}
              onChange={handleTextChange('title')}
              disabled={submitting}
              invalid={missingRequired.has('title')}
            />
            {missingRequired.has('title') && (
              <p className="mt-1 text-sm text-danger">El título es obligatorio.</p>
            )}
          </div>

          <div>
            <label htmlFor="property-form-operation" className="u-meta mb-1.5 block text-text-muted">
              Operación
            </label>
            <Select
              id="property-form-operation"
              value={values.operation}
              onChange={handleTextChange('operation')}
              disabled={submitting}
              invalid={missingRequired.has('operation')}
            >
              <option value="">Elegí una operación</option>
              {OPERATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
            {missingRequired.has('operation') && (
              <p className="mt-1 text-sm text-danger">La operación es obligatoria.</p>
            )}
          </div>

          <div>
            <label htmlFor="property-form-property-type" className="u-meta mb-1.5 block text-text-muted">
              Tipo de propiedad
            </label>
            <Input
              id="property-form-property-type"
              value={values.propertyType}
              onChange={handleTextChange('propertyType')}
              disabled={submitting}
              invalid={missingRequired.has('propertyType')}
              placeholder="Departamento, casa, PH..."
            />
            {missingRequired.has('propertyType') && (
              <p className="mt-1 text-sm text-danger">El tipo de propiedad es obligatorio.</p>
            )}
          </div>

          <div>
            <label htmlFor="property-form-price" className="u-meta mb-1.5 block text-text-muted">
              Precio
            </label>
            <Input
              id="property-form-price"
              type="number"
              value={values.price}
              onChange={handleTextChange('price')}
              disabled={submitting}
              invalid={missingRequired.has('price') || Boolean(fieldErrors.price)}
            />
            {missingRequired.has('price') && (
              <p className="mt-1 text-sm text-danger">El precio es obligatorio.</p>
            )}
            {fieldErrors.price && (
              <p className="mt-1 text-sm text-danger" data-testid="property-form-price-error">
                {fieldErrors.price}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="property-form-neighborhood" className="u-meta mb-1.5 block text-text-muted">
              Barrio
            </label>
            <Input
              id="property-form-neighborhood"
              value={values.neighborhood}
              onChange={handleTextChange('neighborhood')}
              disabled={submitting}
              invalid={missingRequired.has('neighborhood')}
            />
            {missingRequired.has('neighborhood') && (
              <p className="mt-1 text-sm text-danger">El barrio es obligatorio.</p>
            )}
          </div>

          <div>
            <label htmlFor="property-form-external-ref" className="u-meta mb-1.5 block text-text-muted">
              Referencia externa
            </label>
            <Input
              id="property-form-external-ref"
              value={values.externalRef}
              onChange={handleTextChange('externalRef')}
              disabled={submitting}
              invalid={Boolean(fieldErrors.externalRef)}
            />
            {fieldErrors.externalRef && (
              <p className="mt-1 text-sm text-danger" data-testid="property-form-external-ref-error">
                {fieldErrors.externalRef}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="property-form-description" className="u-meta mb-1.5 block text-text-muted">
              Descripción
            </label>
            <textarea
              id="property-form-description"
              value={values.description}
              onChange={handleTextChange('description')}
              disabled={submitting}
              className="h-24 w-full rounded border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="property-form-currency" className="u-meta mb-1.5 block text-text-muted">
              Moneda
            </label>
            <Input
              id="property-form-currency"
              value={values.currency}
              onChange={handleTextChange('currency')}
              disabled={submitting}
              placeholder="ARS, USD..."
            />
          </div>

          <div>
            <label htmlFor="property-form-expenses" className="u-meta mb-1.5 block text-text-muted">
              Expensas
            </label>
            <Input
              id="property-form-expenses"
              type="number"
              value={values.expenses}
              onChange={handleTextChange('expenses')}
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="property-form-city" className="u-meta mb-1.5 block text-text-muted">
              Ciudad
            </label>
            <Input
              id="property-form-city"
              value={values.city}
              onChange={handleTextChange('city')}
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="property-form-address" className="u-meta mb-1.5 block text-text-muted">
              Dirección
            </label>
            <Input
              id="property-form-address"
              value={values.address}
              onChange={handleTextChange('address')}
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="property-form-rooms" className="u-meta mb-1.5 block text-text-muted">
              Ambientes
            </label>
            <Input
              id="property-form-rooms"
              type="number"
              value={values.rooms}
              onChange={handleTextChange('rooms')}
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="property-form-bedrooms" className="u-meta mb-1.5 block text-text-muted">
              Dormitorios
            </label>
            <Input
              id="property-form-bedrooms"
              type="number"
              value={values.bedrooms}
              onChange={handleTextChange('bedrooms')}
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="property-form-bathrooms" className="u-meta mb-1.5 block text-text-muted">
              Baños
            </label>
            <Input
              id="property-form-bathrooms"
              type="number"
              value={values.bathrooms}
              onChange={handleTextChange('bathrooms')}
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="property-form-area" className="u-meta mb-1.5 block text-text-muted">
              Superficie (m²)
            </label>
            <Input
              id="property-form-area"
              type="number"
              value={values.areaM2}
              onChange={handleTextChange('areaM2')}
              disabled={submitting}
            />
          </div>

          <div>
            <label htmlFor="property-form-garage" className="u-meta flex items-center gap-2 text-text-muted">
              <input
                id="property-form-garage"
                type="checkbox"
                checked={values.garage}
                onChange={handleCheckboxChange('garage')}
                disabled={submitting}
              />
              Cochera
            </label>
          </div>

          <div>
            <label htmlFor="property-form-pets-allowed" className="u-meta flex items-center gap-2 text-text-muted">
              <input
                id="property-form-pets-allowed"
                type="checkbox"
                checked={values.petsAllowed}
                onChange={handleCheckboxChange('petsAllowed')}
                disabled={submitting}
              />
              Acepta mascotas
            </label>
          </div>

          <div>
            <label htmlFor="property-form-features" className="u-meta mb-1.5 block text-text-muted">
              Características
            </label>
            <Input
              id="property-form-features"
              value={values.features}
              onChange={handleTextChange('features')}
              disabled={submitting}
              placeholder="Balcón, luminoso, a estrenar..."
            />
            <p className="mt-1 text-xs text-text-muted">Separadas por coma.</p>
          </div>

          <div>
            <label htmlFor="property-form-listing-url" className="u-meta mb-1.5 block text-text-muted">
              Link de publicación
            </label>
            <Input
              id="property-form-listing-url"
              value={values.listingUrl}
              onChange={handleTextChange('listingUrl')}
              disabled={submitting}
            />
          </div>

          <div>
            <span className="u-meta mb-1.5 block text-text-muted">Fotos</span>
            <PhotoListEditor
              tenantId={tenantId}
              token={token}
              photoUrls={values.photoUrls}
              onChange={handlePhotoUrlsChange}
            />
            {fieldErrors.photoUrls && (
              <p className="mt-1 text-sm text-danger" data-testid="property-form-photo-urls-error">
                {fieldErrors.photoUrls}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Button type="submit" disabled={submitting} loading={submitting}>
              {isEditing ? 'Guardar cambios' : 'Cargar propiedad'}
            </Button>
            {onCancel && (
              <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
