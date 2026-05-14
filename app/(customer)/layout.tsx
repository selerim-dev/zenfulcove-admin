import LayoutShell from "@/components/customer/LayoutShell";

export default function CustomerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <LayoutShell>{children}</LayoutShell>;
}
