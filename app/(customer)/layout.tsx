import LayoutShell from "@/components/customer/LayoutShell";
import { getConfig } from "@/lib/kv";
import { listPublishedLocalFormsForNav } from "@/lib/local-forms";
import { hasSupabaseAdminEnv } from "@/lib/supabaseEnv";

type PublishedFormNavItem = {
  href: string;
  label: string;
};

type CustomerPortalNavigation = {
  rentals: boolean;
  messages?: boolean;
  availability: boolean;
  packages?: boolean;
  timing?: boolean;
  forms: boolean;
  terms: boolean;
};

const DEFAULT_CUSTOMER_PORTAL_NAVIGATION: CustomerPortalNavigation = {
  rentals: true,
  messages: false,
  availability: true,
  packages: true,
  timing: true,
  forms: true,
  terms: true,
};

async function getPublishedFormNavItems(): Promise<PublishedFormNavItem[]> {
  if (!hasSupabaseAdminEnv()) return [];

  try {
    const forms = await listPublishedLocalFormsForNav();
    return forms.map((form: { slug: string; name: string }) => ({
      href: `/forms/${form.slug}`,
      label: form.name,
    }));
  } catch (err) {
    console.error(err);
    return [];
  }
}

async function getCustomerPortalNavigation(): Promise<CustomerPortalNavigation> {
  try {
    const config = await getConfig();
    return {
      ...DEFAULT_CUSTOMER_PORTAL_NAVIGATION,
      ...(config?.customerPortal?.navigation || {}),
    };
  } catch (err) {
    console.error(err);
    return DEFAULT_CUSTOMER_PORTAL_NAVIGATION;
  }
}

export default async function CustomerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [publishedForms, navigation] = await Promise.all([
    getPublishedFormNavItems(),
    getCustomerPortalNavigation(),
  ]);
  return (
    <LayoutShell publishedForms={publishedForms} navigation={navigation}>
      {children}
    </LayoutShell>
  );
}
