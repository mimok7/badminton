"use client";

import AdminShell from '@/components/admin/AdminShell';

export default function TeamManagementLayout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
