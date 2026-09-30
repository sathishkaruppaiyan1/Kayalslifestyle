import PromoBar from "./PromoBar";
import Header from "./Header";
import Footer from "./Footer";
import MobileNav from "./MobileNav";
import FloatingWhatsAppButton from "./FloatingWhatsAppButton";

interface LayoutProps {
  children: React.ReactNode;
  mainClassName?: string;
}

const Layout = ({ children, mainClassName = "" }: LayoutProps) => {
  return (
    <div className="min-h-screen flex flex-col">
      <PromoBar />
      <Header />
      <main className={`flex-1 lg:pb-0 ${mainClassName}`}>{children}</main>
      <Footer />
      <MobileNav />
      <FloatingWhatsAppButton />
    </div>
  );
};

export default Layout;
