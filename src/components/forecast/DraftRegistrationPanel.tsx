import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, FilePlus2, Pencil, Search, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { cn } from '../../lib/utils';
import {
  PRICE_FORMULA_OPTIONS,
  isManagedRegistrationMerge,
  type ManagedRegistrationUpdateResponse,
  type PriceFormula,
  type Registration,
  type RegColumnKey,
} from '../../types/forecast';
import { EXCEL_IMPORT_CREATED_BY } from '../../lib/registrationIncomplete';
import { ALL_REG_COLUMNS } from './regTableColumns';
type RegistrationSourceFilter = 'all' | 'manual' | 'import';

const REQUIRED_FIELDS: Array<{ key: RegColumnKey; label: string }> = [
  { key: 'materialDescription', label: 'Material Description' },
  { key: 'materialCode', label: 'Material Code' },
  { key: 'plantCode', label: 'Plant Code' },
  { key: 'ownerName', label: 'Owner Name' },
];

const NUMERIC_FIELDS = new Set<RegColumnKey>([
  'commission',
  'commissionIndirect',
  'commissionFinancialDiscount',
]);

const REQUIRED_KEYS = new Set<RegColumnKey>(REQUIRED_FIELDS.map(field => field.key));
const KEY_FIELD_LABELS: Partial<Record<RegColumnKey, string>> = {
  registrationTopic: 'Registration Topic',
  soldToCode: 'Sold To Code',
  shipToCode: 'Ship To Code',
  endUserCode: 'End User Code',
  plantCode: 'Plant Code',
  materialCode: 'Material Code',
  onOffSpec: 'On/Off Spec',
};
const KEY_FIELDS = new Set<RegColumnKey>([
  'registrationTopic',
  'soldToCode',
  'shipToCode',
  'endUserCode',
  'plantCode',
  'materialCode',
  'onOffSpec',
]);
const INCOMPLETE_KEY_FIELDS: Array<{ key: RegColumnKey; label: string }> = [
  { key: 'registrationTopic', label: KEY_FIELD_LABELS.registrationTopic! },
  { key: 'soldToCode', label: KEY_FIELD_LABELS.soldToCode! },
  { key: 'shipToCode', label: KEY_FIELD_LABELS.shipToCode! },
  { key: 'endUserCode', label: KEY_FIELD_LABELS.endUserCode! },
  { key: 'plantCode', label: KEY_FIELD_LABELS.plantCode! },
  { key: 'materialCode', label: KEY_FIELD_LABELS.materialCode! },
  { key: 'onOffSpec', label: KEY_FIELD_LABELS.onOffSpec! },
];
const EXCLUDED_OPTIONAL_FIELDS = new Set<RegColumnKey>([
  ...REQUIRED_KEYS,
  'carryInETD',
  'carryOutETD',
  'carryInLoading',
  'carryOutLoading',
  'createdOn',
  'column1',
]);

function emptyRegistration(id = ''): Registration {
  return {
    id,
    isManaged: true,
    sourceStatus: 'registration_only',
    keyForNoCRM: '',
    businessUnit: '',
    ownerName: '',
    registrationTopic: '',
    onOffSpec: '',
    plantCode: '',
    countryName: '',
    materialDescription: '',
    materialCode: '',
    shipTo_name: '',
    soldTo_name: '',
    end_user: '',
    soldToCode: '',
    shipToCode: '',
    group: '',
    materialNameOnCoa: '',
    additionalRequirement: '',
    pic: '',
    commission: '',
    productDescription: '',
    classified: '',
    commissionIndirect: '',
    commissionFinancialDiscount: '',
    newCoaName: '',
    newTier1: '',
    newOem: '',
    packing: '',
    agreedSpecType: '',
    wasteScrap: '',
    forResaleNotApprove: '',
    imdsDate: '',
    model: '',
    createdOn: '',
    approve: '',
    partName: '',
    coaName: '',
    process: '',
    application: '',
    subApp: '',
    zoneName: '',
    plantName: '',
    countryCode: '',
    endUserCode: '',
    endUserExportControl: '',
    endUserName: '',
    productName: '',
    column1: '',
    carryInETD: 0,
    carryOutETD: 0,
    carryInLoading: 0,
    carryOutLoading: 0,
    priceFormula: 'CPL',
    spread: 0,
  };
}

export function DraftRegistrationPanel({
  open,
  onClose,
  onCreate,
}: Readonly<{
  open: boolean;
  onClose: () => void;
  onCreate: (registration: Registration) => Promise<Registration>;
}>) {
  const [form, setForm] = useState<Registration>(() => emptyRegistration());
  const [selectedOptionalFields, setSelectedOptionalFields] = useState<RegColumnKey[]>([]);
  const [fieldSearch, setFieldSearch] = useState('');
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const optionalFieldsRef = useRef<HTMLDivElement>(null);

  const optionalFields = useMemo(
    () => ALL_REG_COLUMNS.filter(field => !EXCLUDED_OPTIONAL_FIELDS.has(field.key)),
    []
  );
  const filteredOptionalFields = useMemo(() => {
    const query = fieldSearch.trim().toLowerCase();
    if (!query) return optionalFields;
    return optionalFields.filter(field =>
      field.label.toLowerCase().includes(query) ||
      field.key.toLowerCase().includes(query)
    );
  }, [fieldSearch, optionalFields]);

  const isValid = REQUIRED_FIELDS.every(field =>
    String(form[field.key as keyof Registration] ?? '').trim()
  );

  useEffect(() => {
    if (!open) {
      setForm(emptyRegistration());
      setSelectedOptionalFields([]);
      setFieldSearch('');
      setShowOptionalFields(false);
      setSubmitted(false);
      setSaving(false);
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!optionalFieldsRef.current?.contains(event.target as Node)) {
        setShowOptionalFields(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showOptionalFields) {
        setShowOptionalFields(false);
        return;
      }
      onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open, showOptionalFields]);

  const setField = (key: RegColumnKey, value: string) => {
    setForm(previous => ({
      ...previous,
      [key]: NUMERIC_FIELDS.has(key) ? Number(value) || 0 : value,
    }));
  };

  const resetForm = () => {
    setForm(emptyRegistration());
    setSelectedOptionalFields([]);
    setFieldSearch('');
    setShowOptionalFields(false);
    setSubmitted(false);
    setError('');
  };

  const clearOptionalField = (key: RegColumnKey) => {
    setSelectedOptionalFields(previous => previous.filter(fieldKey => fieldKey !== key));
    setField(
      key,
      NUMERIC_FIELDS.has(key)
        ? '0'
        : key === 'priceFormula'
          ? 'CPL'
          : ''
    );
  };

  const toggleOptionalField = (key: RegColumnKey) => {
    const isSelected = selectedOptionalFields.includes(key);
    if (isSelected) {
      clearOptionalField(key);
      return;
    }
    setSelectedOptionalFields(previous => [...previous, key]);
  };

  const submit = async () => {
    setSubmitted(true);
    if (!isValid) return;

    const registration = {
      ...form,
      id: form.id,
      isManaged: true,
      sourceStatus: 'registration_only' as const,
      priceFormula: form.priceFormula || 'CPL',
    };
    setSaving(true);
    setError('');
    try {
      await onCreate(registration);
      resetForm();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save registration');
    } finally {
      setSaving(false);
    }
  };

  const renderInput = (
    key: RegColumnKey,
    label: string,
    required = false,
    removable = false
  ) => {
    const value = form[key as keyof Registration];
    const hasError = submitted && required && !String(value ?? '').trim();
    const fieldLabel = (
      <span className="mb-1 flex min-w-0 items-center justify-between gap-2 text-[9px] font-black uppercase text-slate-500">
        <span className="truncate">
          {label}{required && <span className="ml-1 text-red-500">*</span>}
        </span>
        {removable && (
          <button
            type="button"
            onClick={() => clearOptionalField(key)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500"
            aria-label={`Remove ${label}`}
            title={`Remove ${label}`}
          >
            <X size={12} />
          </button>
        )}
      </span>
    );

    if (key === 'priceFormula') {
      return (
        <label key={key} className="block">
          {fieldLabel}
          <select
            value={form.priceFormula || 'CPL'}
            onChange={event => setField(key, event.target.value)}
            className="sf-select h-9 w-full rounded-md border px-3 text-xs outline-none"
          >
            {PRICE_FORMULA_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      );
    }

    if (key === 'onOffSpec') {
      return (
        <label key={key} className="block">
          {fieldLabel}
          <select
            value={form.onOffSpec}
            onChange={event => setField(key, event.target.value)}
            className={cn(
              'sf-select h-9 w-full rounded-md border px-3 text-xs outline-none',
              hasError ? 'border-red-300' : 'border-slate-200'
            )}
          >
            <option value="">Select On / Off</option>
            <option value="On">On</option>
            <option value="Off">Off</option>
          </select>
        </label>
      );
    }

    return (
      <label key={key} className="block">
        {fieldLabel}
        <input
          type={NUMERIC_FIELDS.has(key) ? 'number' : 'text'}
          value={String(value ?? '')}
          onChange={event => setField(key, event.target.value)}
          className={cn(
            'h-9 w-full rounded-md border bg-white px-3 text-xs text-slate-700 outline-none focus:ring-2',
            hasError
              ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
              : 'border-slate-200 focus:border-blue-400 focus:ring-blue-100'
          )}
        />
      </label>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-slate-900/35 backdrop-blur-[1px]"
            onClick={onClose}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="draft-registration-title"
            initial={{ opacity: 0, scale: 0.98, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed left-1/2 top-1/2 z-[80] flex max-h-[90vh] w-[min(960px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600">
                  <FilePlus2 size={17} />
                </div>
                <div>
                  <h3 id="draft-registration-title" className="text-sm font-black uppercase tracking-widest text-slate-800">
                    Add Registration
                  </h3>
                  <p className="mt-0.5 text-[10px] text-slate-400">Saved in Sales Forecast master data. CRM remains read-only.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close Add Registration"
              >
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="overflow-y-auto p-5">
                <div className="mb-4">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-600">Required Information</h4>
                  <p className="mt-1 text-[10px] text-slate-400">Complete the 4 required fields before saving.</p>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {REQUIRED_FIELDS.map(field => renderInput(field.key, field.label, true))}
                </div>

                {selectedOptionalFields.length > 0 && (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <div className="mb-3 flex items-center justify-between">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-600">Optional Details</h4>
                      <span className="rounded bg-blue-50 px-2 py-0.5 text-[9px] font-bold text-blue-700">
                        {selectedOptionalFields.length} selected
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      {selectedOptionalFields.map(key => {
                        const definition = ALL_REG_COLUMNS.find(field => field.key === key);
                        return definition ? renderInput(key, definition.label, false, true) : null;
                      })}
                    </div>
                  </div>
                )}

                <div ref={optionalFieldsRef} className="relative mt-5 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={() => setShowOptionalFields(previous => !previous)}
                    aria-expanded={showOptionalFields}
                    className={cn(
                      'flex w-full items-center justify-between rounded-md border bg-white px-3 py-2.5 text-left text-[10px] font-bold uppercase text-slate-600 transition-colors',
                      showOptionalFields
                        ? 'border-blue-400 ring-2 ring-blue-100'
                        : 'border-slate-200 hover:border-slate-300'
                    )}
                  >
                    <span>Add Other Fields</span>
                    <span className="flex items-center gap-2">
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] text-blue-700">
                        {selectedOptionalFields.length}
                      </span>
                      <ChevronDown
                        size={14}
                        className={cn('transition-transform', showOptionalFields && 'rotate-180')}
                      />
                    </span>
                  </button>

                  {showOptionalFields && (
                    <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
                      <div className="relative border-b border-slate-100 p-2.5">
                        <Search size={14} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="search"
                          value={fieldSearch}
                          onChange={event => setFieldSearch(event.target.value)}
                          placeholder="Search other fields..."
                          className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-[11px] outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-[min(10rem,24vh)] overflow-y-auto p-1.5">
                        {filteredOptionalFields.map(field => {
                          const checked = selectedOptionalFields.includes(field.key);
                          return (
                            <label
                              key={field.key}
                              className="flex cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleOptionalField(field.key)}
                              />
                              <span className="truncate">{field.label}</span>
                            </label>
                          );
                        })}
                        {filteredOptionalFields.length === 0 && (
                          <div className="px-3 py-8 text-center text-[10px] text-slate-400">
                            No matching fields
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3">
              {error && (
                <p className="mr-auto self-center text-[10px] font-semibold text-red-600">{error}</p>
              )}
              <button
                type="button"
                onClick={submit}
                disabled={saving}
                className="flex h-9 min-w-36 items-center justify-center gap-1.5 rounded-md bg-blue-600 px-5 text-[10px] font-bold uppercase text-white shadow-sm hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
              >
                <Check size={13} />
                {saving ? 'Saving...' : 'Save Registration'}
              </button>
            </div>
          </motion.section>
        </>
      )}
    </AnimatePresence>
  );
}

export function ManageRegistrationPanel({
  open,
  registrations,
  onClose,
  onUpdate,
  onDelete,
}: Readonly<{
  open: boolean;
  registrations: Registration[];
  onClose: () => void;
  onUpdate: (registration: Registration) => Promise<ManagedRegistrationUpdateResponse>;
  onDelete: (registrationId: string) => Promise<void>;
}>) {
  const [form, setForm] = useState<Registration | null>(null);
  const [selectedOptionalFields, setSelectedOptionalFields] = useState<RegColumnKey[]>([]);
  const [fieldSearch, setFieldSearch] = useState('');
  const [listSearch, setListSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<RegistrationSourceFilter>('all');
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [mergeNotice, setMergeNotice] = useState('');
  const optionalFieldsRef = useRef<HTMLDivElement>(null);

  const optionalFields = useMemo(
    () => ALL_REG_COLUMNS.filter(field => !EXCLUDED_OPTIONAL_FIELDS.has(field.key)),
    []
  );
  const filteredOptionalFields = useMemo(() => {
    const query = fieldSearch.trim().toLowerCase();
    if (!query) return optionalFields;
    return optionalFields.filter(field =>
      field.label.toLowerCase().includes(query) ||
      field.key.toLowerCase().includes(query)
    );
  }, [fieldSearch, optionalFields]);
  const filteredRegistrations = useMemo(() => {
    const query = listSearch.trim().toLowerCase();
    return registrations.filter(registration => {
      const isImport = registration.createdBy === EXCEL_IMPORT_CREATED_BY;
      if (sourceFilter === 'import' && !isImport) return false;
      if (sourceFilter === 'manual' && isImport) return false;
      if (!query) return true;
      return [
        registration.materialDescription,
        registration.materialCode,
        registration.plantCode,
        registration.ownerName,
        registration.registrationTopic,
        registration.keyForNoCRM,
      ].some(value => String(value ?? '').toLowerCase().includes(query));
    });
  }, [listSearch, registrations, sourceFilter]);

  useEffect(() => {
    if (!open) {
      setForm(null);
      setSelectedOptionalFields([]);
      setFieldSearch('');
      setListSearch('');
      setSourceFilter('all');
      setShowOptionalFields(false);
      setSubmitted(false);
      setSaving(false);
      setError('');
      setMergeNotice('');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!optionalFieldsRef.current?.contains(event.target as Node)) {
        setShowOptionalFields(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showOptionalFields) {
        setShowOptionalFields(false);
        return;
      }
      onClose();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open, showOptionalFields]);

  const setField = (key: RegColumnKey, value: string) => {
    setForm(previous => previous
      ? {
          ...previous,
          [key]: NUMERIC_FIELDS.has(key) ? Number(value) || 0 : value,
        }
      : previous
    );
  };

  const startEditing = (registration: Registration) => {
    setForm({ ...registration });
    const visibleOptional = optionalFields
      .filter(field => {
        const value = registration[field.key as keyof Registration];
        if (field.key === 'priceFormula') return String(value || 'CPL') !== 'CPL';
        return NUMERIC_FIELDS.has(field.key)
          ? Number(value) !== 0
          : String(value ?? '').trim() !== '';
      })
      .map(field => field.key);
    const keyFieldsForIncomplete = registration.isIncomplete
      ? INCOMPLETE_KEY_FIELDS.map(field => field.key)
      : [];
    setSelectedOptionalFields([...new Set([...keyFieldsForIncomplete, ...visibleOptional])]);
    setShowOptionalFields(false);
    setSubmitted(false);
    setError('');
  };

  const clearOptionalField = (key: RegColumnKey) => {
    setSelectedOptionalFields(previous => previous.filter(fieldKey => fieldKey !== key));
    setField(
      key,
      NUMERIC_FIELDS.has(key)
        ? '0'
        : key === 'priceFormula'
          ? 'CPL'
          : ''
    );
  };

  const toggleOptionalField = (key: RegColumnKey) => {
    if (selectedOptionalFields.includes(key)) {
      clearOptionalField(key);
      return;
    }
    setSelectedOptionalFields(previous => [...previous, key]);
  };

  const submit = async () => {
    if (!form) return;
    setSubmitted(true);
    const fieldsToValidate = form.isIncomplete
      ? [...REQUIRED_FIELDS, ...INCOMPLETE_KEY_FIELDS]
      : REQUIRED_FIELDS;
    const isValid = fieldsToValidate.every(field =>
      String(form[field.key as keyof Registration] ?? '').trim()
    );
    if (!isValid) return;

    setSaving(true);
    setError('');
    try {
      const result = await onUpdate({
        ...form,
        isManaged: true,
        sourceStatus: 'registration_only',
        priceFormula: form.priceFormula || 'CPL',
      });
      if (isManagedRegistrationMerge(result)) {
        setForm(null);
        setSelectedOptionalFields([]);
        setError('');
        setMergeNotice(
          `Merged into CRM registration. ${result.forecastsMoved} forecast row(s) moved.`
        );
        return;
      }
      startEditing(result);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to update registration');
    } finally {
      setSaving(false);
    }
  };

  const renderInput = (
    key: RegColumnKey,
    label: string,
    required = false,
    removable = false
  ) => {
    if (!form) return null;
    const value = form[key as keyof Registration];
    const locked = KEY_FIELDS.has(key) && !form.isIncomplete;
    const hasError = submitted && required && !String(value ?? '').trim();
    const fieldLabel = (
      <span className="mb-1 flex min-w-0 items-center justify-between gap-2 text-[9px] font-black uppercase text-slate-500">
        <span className="truncate">
          {label}{required && <span className="ml-1 text-red-500">*</span>}
          {locked && <span className="ml-1 text-[8px] font-bold text-slate-400">(locked)</span>}
        </span>
        {removable && (
          <button
            type="button"
            onClick={() => clearOptionalField(key)}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-red-50 hover:text-red-500"
            aria-label={`Remove ${label}`}
            title={`Remove ${label}`}
          >
            <X size={12} />
          </button>
        )}
      </span>
    );

    if (key === 'priceFormula') {
      return (
        <label key={key} className="block">
          {fieldLabel}
          <select
            value={form.priceFormula || 'CPL'}
            onChange={event => setField(key, event.target.value)}
            className="sf-select h-9 w-full rounded-xl border px-3 text-xs outline-none"
          >
            {PRICE_FORMULA_OPTIONS.map(option => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      );
    }

    if (key === 'onOffSpec') {
      return (
        <label key={key} className="block">
          {fieldLabel}
          <select
            value={form.onOffSpec}
            onChange={event => setField(key, event.target.value)}
            disabled={locked}
            className={cn(
              'sf-select h-9 w-full rounded-xl border px-3 text-xs outline-none',
              hasError ? 'border-red-300' : 'border-slate-200',
              locked && 'cursor-not-allowed bg-slate-100 text-slate-500'
            )}
          >
            <option value="">Select On / Off</option>
            <option value="On">On</option>
            <option value="Off">Off</option>
            <option value="Unspecified">Unspecified</option>
          </select>
        </label>
      );
    }

    return (
      <label key={key} className="block">
        {fieldLabel}
        <input
          type={NUMERIC_FIELDS.has(key) ? 'number' : 'text'}
          value={String(value ?? '')}
          onChange={event => setField(key, event.target.value)}
          disabled={locked}
          className={cn(
            'h-9 w-full rounded-xl border bg-white px-3 text-xs text-slate-700 outline-none focus:ring-2',
            locked && 'cursor-not-allowed bg-slate-100 text-slate-500',
            hasError
              ? 'border-red-300 focus:border-red-400 focus:ring-red-100'
              : 'border-slate-200 focus:border-[#007ABE]/40 focus:ring-[#007ABE]/15'
          )}
        />
      </label>
    );
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <motion.button
            type="button"
            aria-label="Close manage registration dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby="manage-registration-title"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            transition={{ type: 'spring', duration: 0.32, bounce: 0.16 }}
            className="relative flex h-[min(600px,82vh)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-gradient-to-r from-[#007ABE]/[0.06] to-transparent px-5 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#007ABE] text-white shadow-sm">
                  <Pencil size={16} strokeWidth={2.25} />
                </div>
                <div>
                  <h3 id="manage-registration-title" className="text-sm font-bold tracking-tight text-slate-900">
                    Manage Registration
                  </h3>
                  <p className="text-[11px] text-slate-500">Edit or delete registrations saved from this web app</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                aria-label="Close Manage Registration"
              >
                <X size={18} />
              </button>
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
              <aside className="flex min-h-0 flex-col border-b border-slate-100 bg-slate-50/50 md:border-b-0 md:border-r">
                <div className="shrink-0 border-b border-slate-100 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">New registrations</h4>
                    <span className="rounded-full bg-[#007ABE]/10 px-2 py-0.5 text-[10px] font-bold text-[#007ABE]">
                      {registrations.length}
                    </span>
                  </div>
                  <div className="relative mb-2">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={listSearch}
                      onChange={event => setListSearch(event.target.value)}
                      placeholder="Search registrations..."
                      className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none transition-all focus:border-[#007ABE]/40 focus:ring-2 focus:ring-[#007ABE]/15"
                    />
                  </div>
                  <div className="flex gap-1 rounded-lg border border-slate-200 bg-white p-0.5">
                    {([
                      ['all', 'All'],
                      ['manual', 'Manual'],
                      ['import', 'From Import'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSourceFilter(value)}
                        className={cn(
                          'flex-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-colors',
                          sourceFilter === value
                            ? 'bg-[#007ABE] text-white'
                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
                  {mergeNotice && (
                    <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-semibold text-emerald-800">
                      {mergeNotice}
                    </p>
                  )}
                  {filteredRegistrations.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/80 px-4 py-10 text-center">
                      <FilePlus2 size={22} className="mb-2 text-slate-300" />
                      <p className="text-xs font-semibold text-slate-500">No registrations</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                        Saved new registrations will appear here
                      </p>
                    </div>
                  ) : (
                    filteredRegistrations.map(registration => (
                      <button
                        key={registration.id}
                        type="button"
                        onClick={() => startEditing(registration)}
                        className={cn(
                          'block w-full rounded-xl border bg-white p-2.5 text-left transition-all',
                          form?.id === registration.id
                            ? 'border-[#007ABE]/35 bg-[#007ABE]/[0.04] shadow-sm ring-2 ring-[#007ABE]/15'
                            : 'border-slate-200/80 hover:border-slate-300 hover:shadow-sm'
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-slate-800">{registration.materialDescription}</p>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            {registration.isIncomplete && (
                              <span className="rounded-md bg-rose-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-rose-800">
                                Needs review
                              </span>
                            )}
                            {registration.createdBy === EXCEL_IMPORT_CREATED_BY && (
                              <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                                Import
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-slate-500">
                          {registration.materialCode} / {registration.plantCode}
                        </p>
                        <p className="truncate text-[10px] text-slate-400">{registration.ownerName}</p>
                        {registration.keyForNoCRM && (
                          <p className="mt-0.5 truncate font-mono text-[9px] text-slate-400" title={registration.keyForNoCRM}>
                            {registration.keyForNoCRM}
                          </p>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </aside>

              <div className="flex min-h-0 flex-col">
                {!form ? (
                  <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#007ABE]/10 text-[#007ABE]">
                      <Pencil size={22} />
                    </div>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-600">Select a registration</p>
                    <p className="mt-1.5 max-w-xs text-[11px] leading-relaxed text-slate-400">
                      Choose a saved registration on the left to edit optional fields or delete it
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Registration details</h4>
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {form.isIncomplete
                              ? 'Complete key codes to match CRM. Names come from customer master, not Excel.'
                              : 'Key fields are locked to protect forecast references'}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            if (!form || !window.confirm('Delete this registration?')) return;
                            setSaving(true);
                            setError('');
                            try {
                              await onDelete(form.id);
                              setForm(null);
                              setSelectedOptionalFields([]);
                            } catch (deleteError) {
                              setError(deleteError instanceof Error ? deleteError.message : 'Unable to delete registration');
                            } finally {
                              setSaving(false);
                            }
                          }}
                          className="flex h-9 items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-3 text-[10px] font-bold uppercase text-rose-500 transition-colors hover:bg-rose-50 disabled:opacity-60"
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      </div>

                      {form.isIncomplete && (
                        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                            Incomplete import registration
                          </p>
                          <p className="mt-1 text-[11px] leading-relaxed text-amber-800">
                            Fill in all key codes below. If the key matches CRM, forecasts will move to the CRM registration automatically.
                          </p>
                          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {INCOMPLETE_KEY_FIELDS.map(field => renderInput(field.key, field.label, true))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {REQUIRED_FIELDS.map(field => renderInput(field.key, field.label, true))}
                      </div>

                      {selectedOptionalFields.length > 0 && (
                        <div className="mt-4 border-t border-slate-100 pt-4">
                          <div className="mb-2.5 flex items-center justify-between">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Editable optional details</h4>
                            <span className="rounded-full bg-[#007ABE]/10 px-2 py-0.5 text-[10px] font-bold text-[#007ABE]">
                              {selectedOptionalFields.length} selected
                            </span>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {selectedOptionalFields
                              .filter(key => !(form.isIncomplete && KEY_FIELDS.has(key)))
                              .map(key => {
                              const definition = ALL_REG_COLUMNS.find(field => field.key === key);
                              return definition ? renderInput(key, definition.label, false, true) : null;
                            })}
                          </div>
                        </div>
                      )}

                      <div ref={optionalFieldsRef} className="relative mt-4 border-t border-slate-100 pt-4">
                        <button
                          type="button"
                          onClick={() => setShowOptionalFields(previous => !previous)}
                          aria-expanded={showOptionalFields}
                          className={cn(
                            'flex w-full items-center justify-between rounded-xl border bg-white px-3 py-2.5 text-left text-[10px] font-bold uppercase text-slate-600 transition-all',
                            showOptionalFields
                              ? 'border-[#007ABE]/40 ring-2 ring-[#007ABE]/15'
                              : 'border-slate-200 hover:border-slate-300'
                          )}
                        >
                          <span>Edit optional fields</span>
                          <span className="flex items-center gap-2">
                            <span className="rounded-full bg-[#007ABE]/10 px-2 py-0.5 text-[10px] font-bold text-[#007ABE]">
                              {selectedOptionalFields.length}
                            </span>
                            <ChevronDown
                              size={14}
                              className={cn('transition-transform', showOptionalFields && 'rotate-180')}
                            />
                          </span>
                        </button>

                        {showOptionalFields && (
                          <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                            <div className="relative border-b border-slate-100 p-2.5">
                              <Search size={14} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="search"
                                value={fieldSearch}
                                onChange={event => setFieldSearch(event.target.value)}
                                placeholder="Search optional fields..."
                                className="h-9 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-[#007ABE]/40 focus:ring-2 focus:ring-[#007ABE]/15"
                                autoFocus
                              />
                            </div>
                            <div className="max-h-44 overflow-y-auto p-1.5">
                              {filteredOptionalFields.map(field => {
                                const checked = selectedOptionalFields.includes(field.key);
                                return (
                                  <label
                                    key={field.key}
                                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleOptionalField(field.key)}
                                      className="h-4 w-4 rounded-md accent-[#007ABE]"
                                    />
                                    <span className="truncate">{field.label}</span>
                                  </label>
                                );
                              })}
                              {filteredOptionalFields.length === 0 && (
                                <div className="px-3 py-6 text-center text-xs text-slate-400">
                                  No matching fields
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <footer className="flex shrink-0 justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3">
                      {error && (
                        <p className="mr-auto self-center text-xs font-medium text-rose-600">{error}</p>
                      )}
                      <button
                        type="button"
                        onClick={submit}
                        disabled={saving}
                        className="inline-flex h-10 min-w-36 items-center justify-center gap-1.5 rounded-xl bg-[#007ABE] px-5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[#0069a3] disabled:cursor-wait disabled:opacity-60"
                      >
                        <Check size={14} />
                        {saving ? 'Saving…' : 'Update registration'}
                      </button>
                    </footer>
                  </>
                )}
              </div>
            </div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}
