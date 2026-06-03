"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FloatingSaveBar from "@/components/FloatingSaveBar";
import { createProduct, deleteProduct, updateProduct } from "./actions";
import type { CommerceProduct } from "@/lib/types";

const IMAGE_SLOTS = 3;

function productSnapshot(product?: CommerceProduct) {
  const images = Array.from({ length: IMAGE_SLOTS }, (_, index) => ({
    existing: product?.image_urls?.[index] ?? "",
    file: "",
  }));

  return JSON.stringify({
    title: product?.title ?? "",
    price: product ? (product.price_cents / 100).toFixed(2) : "",
    description: product?.description ?? "",
    display_order: String(product?.display_order ?? 0),
    is_active: product?.is_active ?? true,
    images,
  });
}

function formSnapshot(form: HTMLFormElement) {
  const formData = new FormData(form);
  const images = Array.from({ length: IMAGE_SLOTS }, (_, index) => {
    const file = formData.get(`image_${index}`);
    const existing = String(formData.get(`existing_image_${index}`) ?? "");
    const remove = formData.get(`remove_image_${index}`) === "on";
    return {
      existing: remove ? "" : existing,
      file: file instanceof File && file.size > 0 ? file.name : "",
    };
  });
  return JSON.stringify({
    title: String(formData.get("title") ?? ""),
    price: String(formData.get("price") ?? ""),
    description: String(formData.get("description") ?? ""),
    display_order: String(formData.get("display_order") ?? ""),
    is_active: formData.get("is_active") === "on",
    images,
  });
}

export default function ProductForm({
  product,
  onSuccess,
}: {
  product?: CommerceProduct;
  onSuccess: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(product);
  const formRef = useRef<HTMLFormElement>(null);
  const previewUrlsRef = useRef<(string | null)[]>(
    Array(IMAGE_SLOTS).fill(null)
  );
  const formId = product ? `product-form-${product.id}` : "product-form-create";
  const initialSnapshot = useMemo(() => productSnapshot(product), [product]);
  const [savedSnapshot, setSavedSnapshot] = useState(initialSnapshot);
  const [isDirty, setIsDirty] = useState(!isEdit);
  const [submitting, setSubmitting] = useState(false);
  const [savedRecently, setSavedRecently] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imagePreviews, setImagePreviews] = useState<(string | null)[]>(
    Array(IMAGE_SLOTS).fill(null)
  );
  const [removedImages, setRemovedImages] = useState<boolean[]>(
    Array(IMAGE_SLOTS).fill(false)
  );

  useEffect(() => {
    const previewUrls = previewUrlsRef.current;
    return () => {
      previewUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, []);

  function syncDirtyState(form: HTMLFormElement) {
    setSavedRecently(false);
    setIsDirty(!isEdit || formSnapshot(form) !== savedSnapshot);
  }

  function setImagePreview(index: number, file: File | null) {
    const currentUrl = previewUrlsRef.current[index];
    if (currentUrl) URL.revokeObjectURL(currentUrl);

    const nextUrl = file ? URL.createObjectURL(file) : null;
    previewUrlsRef.current[index] = nextUrl;
    setImagePreviews([...previewUrlsRef.current]);

    if (file) {
      setRemovedImages((current) => {
        const next = [...current];
        next[index] = false;
        return next;
      });
    }
  }

  function setImageRemoved(index: number, removed: boolean) {
    setRemovedImages((current) => {
      const next = [...current];
      next[index] = removed;
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const form = e.currentTarget;
    const formData = new FormData(form);
    for (let index = 0; index < IMAGE_SLOTS; index++) {
      const file = formData.get(`image_${index}`);
      if (!(file instanceof File) || file.size === 0) continue;
      if (!file.type.startsWith("image/")) {
        setError("Product images must be image files.");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Product images must be under 5MB.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (isEdit) {
        await updateProduct(formData);
      } else {
        await createProduct(formData);
      }
      setSavedSnapshot(formSnapshot(form));
      setIsDirty(false);
      setSavedRecently(true);
      router.refresh();
      window.setTimeout(onSuccess, 750);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!product) return;
    if (!window.confirm(`Delete ${product.title}? This can't be undone.`)) {
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await deleteProduct(product.id);
      onSuccess();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      ref={formRef}
      id={formId}
      onSubmit={handleSubmit}
      onChange={(event) => syncDirtyState(event.currentTarget)}
      className="grid gap-4 sm:grid-cols-2"
    >
      {isEdit && product ? <input type="hidden" name="id" value={product.id} /> : null}

      <Field label="Title">
        <input
          name="title"
          type="text"
          required
          defaultValue={product?.title ?? ""}
          placeholder="Birthday Package"
          className="form-input"
        />
      </Field>

      <Field label="Price (USD)">
        <input
          name="price"
          type="number"
          step="0.01"
          min={0}
          required
          defaultValue={product ? (product.price_cents / 100).toFixed(2) : ""}
          placeholder="150.00"
          className="form-input"
        />
      </Field>

      <Field label="Display order">
        <input
          name="display_order"
          type="number"
          step={1}
          defaultValue={product?.display_order ?? 0}
          className="form-input"
        />
      </Field>

      <label className="flex items-center gap-2 pt-6 text-sm">
        <input
          name="is_active"
          type="checkbox"
          defaultChecked={product?.is_active ?? true}
          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
        />
        Active in guest portal
      </label>

      <Field label="Description" full>
        <textarea
          name="description"
          rows={5}
          defaultValue={product?.description ?? ""}
          placeholder="What guests receive, timing, and any details staff should know."
          className="form-input min-h-32 resize-y"
        />
      </Field>

      <div className="space-y-4 sm:col-span-2">
        <p className="text-xs font-medium text-[var(--color-ink-muted)]">
          Images
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: IMAGE_SLOTS }, (_, index) => {
            const imageUrl = product?.image_urls?.[index] ?? "";
            const previewUrl = imagePreviews[index] || "";
            const visibleImage =
              previewUrl || (removedImages[index] ? "" : imageUrl);
            return (
              <div
                key={index}
                className="rounded-xl border border-[var(--color-border)] bg-white p-3"
              >
                <input
                  type="hidden"
                  name={`existing_image_${index}`}
                  value={imageUrl}
                />
                {visibleImage ? (
                  <div className="relative mb-3 overflow-hidden rounded-lg bg-[var(--color-bg)]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={visibleImage}
                      alt={`${product?.title || "Product"} image ${index + 1}`}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    {previewUrl ? (
                      <span className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent-strong)] shadow-sm">
                        Selected
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="mb-3 flex aspect-[4/3] items-center justify-center rounded-lg bg-[var(--color-bg)] text-xs text-[var(--color-ink-muted)]">
                    Empty
                  </div>
                )}
                <input
                  name={`image_${index}`}
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0] ?? null;
                    setImagePreview(index, file);
                  }}
                  className="block w-full cursor-pointer text-xs text-[var(--color-ink)] file:mr-2 file:cursor-pointer file:rounded-full file:border file:border-[var(--color-border)] file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[var(--color-ink)] file:transition hover:file:border-[var(--color-accent)]"
                />
                {imageUrl ? (
                  <label className="mt-2 flex items-center gap-2 text-xs text-[var(--color-ink-muted)]">
                    <input
                      name={`remove_image_${index}`}
                      type="checkbox"
                      checked={removedImages[index]}
                      onChange={(event) =>
                        setImageRemoved(index, event.currentTarget.checked)
                      }
                      className="h-3.5 w-3.5 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                    />
                    Remove current image
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
        <span className="block text-[11px] text-[var(--color-ink-muted)]">
          Up to three images. JPG, PNG, WEBP, or GIF, under 5MB each.
        </span>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2 sm:col-span-2">
        {isEdit ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:opacity-60"
          >
            Delete
          </button>
        ) : (
          <span />
        )}
      </div>

      <FloatingSaveBar
        visible={isDirty || submitting}
        saved={savedRecently}
        saving={submitting}
        formId={formId}
        saveLabel={isEdit ? "Save changes" : "Add product"}
        savingLabel={isEdit ? "Saving..." : "Adding..."}
        message={isEdit ? "Unsaved product changes" : "New product draft"}
      />

      <style>{`
        .form-input {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid var(--color-border);
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .form-input:focus {
          outline: 2px solid var(--color-accent);
          outline-offset: 1px;
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`block space-y-1 ${full ? "sm:col-span-2" : ""}`}>
      <span className="block text-xs font-medium text-[var(--color-ink-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
