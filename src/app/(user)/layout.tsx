import Header from '@/components/Header';

export default function UserLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />
      <main className="app-surface min-h-[calc(100vh-4rem)]">{children}</main>
    </>
  );
}
