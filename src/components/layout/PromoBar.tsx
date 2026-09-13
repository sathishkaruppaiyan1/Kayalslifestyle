import { Fragment } from "react";
import WhatsAppIcon from "./WhatsAppIcon";
import { useHomepage, type TopbarItem } from "@/hooks/useHomepage";

/**
 * Announcement strip above the header. Messages come from the WordPress
 * "Homepage Builder" plugin (Homepage → Top bar); until the plugin is
 * installed, or if it's unreachable, these built-in messages show instead.
 */
const DEFAULT_ITEMS: TopbarItem[] = [
  { type: "text", text: "Free Shipping in India", phone: "", link: "", url: "" },
  { type: "text", text: "15 to 20 Days Delivery Time", phone: "", link: "", url: "" },
  {
    type: "whatsapp",
    text: "For International & Wholesale Orders",
    phone: "+91 8220027625",
    link: "",
    url: "https://wa.me/918220027625",
  },
];

const PromoBar = () => {
  const { data: homepage } = useHomepage();
  const topbar = homepage?.topbar;

  // Plugin present → it owns the bar entirely, including hiding it.
  if (topbar && !topbar.enabled) return null;
  const items = topbar ? topbar.items : DEFAULT_ITEMS;
  if (items.length === 0) return null;

  const messages = items.map((item, index) => (
    <Fragment key={`${item.type}-${item.text}-${item.phone}`}>
      {index > 0 && (
        <span className="promo-divider" aria-hidden="true">
          |
        </span>
      )}
      {item.type === "whatsapp" ? (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="promo-message inline-flex items-center gap-2 hover:opacity-80"
          aria-label={`WhatsApp ${item.text} at ${item.phone}`}
        >
          <WhatsAppIcon className="shrink-0" />
          <span>
            {item.text} {item.phone}
          </span>
        </a>
      ) : item.url ? (
        <a href={item.url} className="promo-message hover:opacity-80">
          {item.text}
        </a>
      ) : (
        <span className="promo-message">{item.text}</span>
      )}
    </Fragment>
  ));

  return (
    <div
      className="promo-bar overflow-hidden px-4 text-sm"
      aria-label="Store promotions"
    >
      <div className="promo-marquee" aria-live="off">
        <div className="promo-marquee-track">
          <div className="promo-marquee-group" aria-label="Store promotions">
              {messages}
          </div>
          <div className="promo-marquee-group" aria-hidden="true">
              {messages}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PromoBar;
