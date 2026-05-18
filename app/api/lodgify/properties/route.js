import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { getProperties } from "@/lib/lodgify";

function clean(value) {
  return String(value || "").trim();
}

function normalizeProperty(property = {}) {
  const id = clean(property.id ?? property.property_id ?? property.propertyId);
  const name = clean(
    property.internal_name ||
      property.internalName ||
      property.name ||
      property.title ||
      property.nickname ||
      (id ? `Property ${id}` : "")
  );

  return {
    id,
    name,
    internalName: clean(property.internal_name || property.internalName),
    rawName: clean(property.name || property.title),
  };
}

export async function GET(request) {
  const unauthorized = await requireAdminRequest(request);
  if (unauthorized) return unauthorized;

  try {
    const data = await getProperties();
    const items = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data)
        ? data
        : [];

    const properties = items
      .map(normalizeProperty)
      .filter((property) => property.id || property.name);

    return NextResponse.json({ properties });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Failed to load Lodgify properties.",
        details: err.message,
      },
      { status: 500 }
    );
  }
}
