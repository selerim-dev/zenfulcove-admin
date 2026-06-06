"use client";

import { useState } from "react";
import Image from "next/image";
import Modal from "@/components/customer/Modal";
import { formatMoney, type CommerceProduct } from "@/lib/types";
import ProductForm from "./ProductForm";

type ModalState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; product: CommerceProduct };

export default function ProductsManager({
  products,
}: {
  products: CommerceProduct[];
}) {
  const [state, setState] = useState<ModalState>({ mode: "closed" });
  const close = () => setState({ mode: "closed" });

  return (
    <>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <li key={product.id}>
            <button
              type="button"
              onClick={() => setState({ mode: "edit", product })}
              className="block w-full cursor-pointer overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] text-left transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="relative aspect-[1.65/1] w-full overflow-hidden bg-[var(--color-bg)]">
                {product.image_urls[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.image_urls[0]}
                    alt={product.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm text-[var(--color-ink-muted)]">
                    No image
                  </div>
                )}
                {!product.is_active ? (
                  <span className="absolute right-3 top-3 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-800">
                    Hidden
                  </span>
                ) : null}
              </div>
              <div className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-serif text-xl font-medium tracking-tight">
                    {product.title}
                  </h3>
                  <span className="shrink-0 text-sm font-semibold text-[var(--color-accent-strong)]">
                    {formatMoney(product.price_cents)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                  {product.description || "No description yet."}
                </p>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-[var(--color-ink-muted)]">
                  {product.sku}
                </p>
              </div>
            </button>
          </li>
        ))}

        <li>
          <button
            type="button"
            onClick={() => setState({ mode: "create" })}
            className="flex h-full min-h-[18rem] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-[var(--color-border)] bg-transparent p-6 text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border-2 border-current bg-white p-1">
              <Image
                src="/logo-mark.png"
                alt=""
                width={48}
                height={48}
                className="h-full w-full rounded-full object-cover"
              />
            </span>
            <span className="text-sm font-medium">Add Product</span>
          </button>
        </li>
      </ul>

      <Modal
        open={state.mode !== "closed"}
        onClose={close}
        title={
          state.mode === "edit" ? `Edit ${state.product.title}` : "Add product"
        }
      >
        {state.mode === "edit" ? (
          <ProductForm product={state.product} onSuccess={close} />
        ) : state.mode === "create" ? (
          <ProductForm onSuccess={close} />
        ) : null}
      </Modal>
    </>
  );
}
