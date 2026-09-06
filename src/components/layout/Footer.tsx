import { useState } from "react";
import { Link } from "react-router-dom";
import { CaretDown } from "@phosphor-icons/react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  CONTACT_EMAIL,
  CONTACT_PHONE_DISPLAY,
  MAILTO_URL,
  SOCIAL_LINKS,
  WHATSAPP_URL,
} from "@/lib/siteContact";

// Social Icons with brand colors
const IconInstagram = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="#E4405F">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
  </svg>
);

const IconYoutube = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="#FF0000">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

/**
 * One footer column. Below 768px it collapses into an accordion so the footer
 * is a few tappable headings instead of a long scroll; from 768px up the
 * heading is inert and the content is always shown as a normal column.
 */
const FooterColumn = ({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(defaultOpen);
  const expanded = !isMobile || open;

  const heading = (
    <span className="font-heading text-sm font-semibold uppercase tracking-wider text-promo-foreground">
      {title}
    </span>
  );

  return (
    <div className="border-b border-promo-foreground/10 py-3 md:border-0 md:py-0">
      {isMobile ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between text-left"
        >
          {heading}
          <CaretDown
            size={16}
            className={`text-promo-foreground/60 transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      ) : (
        <div className="mb-6">{heading}</div>
      )}

      <div
        className={`overflow-hidden transition-all duration-300 md:!max-h-none md:!opacity-100 ${
          expanded ? "mt-4 max-h-96 opacity-100 md:mt-0" : "max-h-0 opacity-0"
        }`}
      >
        {children}
      </div>
    </div>
  );
};

const Footer = () => {
  return (
    <footer className="bg-promo text-promo-foreground/80 pb-24 lg:pb-16">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 md:gap-10">
          {/* Information */}
          <FooterColumn title="Information">
            <ul className="space-y-3 text-sm text-promo-foreground/70">
              <li><Link to="/about-us" className="hover:text-primary transition-colors">About Us</Link></li>
              <li><Link to="/terms" className="hover:text-primary transition-colors">Terms & Conditions</Link></li>
              <li><Link to="/shipping" className="hover:text-primary transition-colors">Shipping Policy</Link></li>
              <li><Link to="/privacy" className="hover:text-primary transition-colors">Privacy Policy</Link></li>
              <li><Link to="/refund" className="hover:text-primary transition-colors">Refund & Returns</Link></li>
              <li><Link to="/track" className="hover:text-primary transition-colors">Track Your Order</Link></li>
              <li><Link to="/contact" className="hover:text-primary transition-colors">Contact Us</Link></li>
            </ul>
          </FooterColumn>

          {/* Quick Shop */}
          <FooterColumn title="Quick Shop">
            <ul className="space-y-3 text-sm text-promo-foreground/70">
              <li><Link to="/" className="hover:text-primary transition-colors">Home</Link></li>
              <li><Link to="/account" className="hover:text-primary transition-colors">My Account</Link></li>
              <li><Link to="/collections/all" className="hover:text-primary transition-colors">Shop</Link></li>
              <li><Link to="/orders" className="hover:text-primary transition-colors">Orders</Link></li>
            </ul>
          </FooterColumn>

          {/* Contact Us — open by default; phone and email are the point of the footer. */}
          <FooterColumn title="Contact Us" defaultOpen>
            <div className="space-y-3 text-sm text-promo-foreground/70">
              <p>
                <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors">
                  {CONTACT_PHONE_DISPLAY}
                </a>
              </p>
              <p>
                <a href={MAILTO_URL} className="hover:text-primary transition-colors break-all">
                  {CONTACT_EMAIL}
                </a>
              </p>
            </div>
          </FooterColumn>

          {/* Follow Us — never collapsed; two icons are not worth a tap. */}
          <FooterColumn title="Follow Us" defaultOpen>
            <div className="flex gap-4">
              {SOCIAL_LINKS.map(({ name, href }) => {
                const Icon = name === "Instagram" ? IconInstagram : IconYoutube;
                return (
                  <a
                    key={name}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:opacity-80 transition-opacity"
                    aria-label={name}
                  >
                    <Icon />
                  </a>
                );
              })}
            </div>
          </FooterColumn>
        </div>

        <div className="border-t border-promo-foreground/15 mt-12 pt-8 text-center text-sm text-promo-foreground/50">
          <p>© {new Date().getFullYear()} Kayals Lifestyle. All Rights Reserved. Design by Sathishkaruppaiyan</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
