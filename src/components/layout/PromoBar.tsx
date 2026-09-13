import { Fragment } from "react";
import WhatsAppIcon from "./WhatsAppIcon";

const whatsappContacts = [
  {
    label: "For International & Wholesale Orders",
    phone: "+91 8220027625",
    url: "https://wa.me/918220027625",
  },
] as const;

type PromoItem =
  | { type: "text"; content: string }
  | { type: "whatsapp"; contact: (typeof whatsappContacts)[number] };

const PromoBar = () => {
  const promoItems: PromoItem[] = [
    { type: "text", content: "Free Shipping in India" },
    { type: "text", content: "15 to 20 Days Delivery Time" },
    ...whatsappContacts.map((contact) => ({ type: "whatsapp" as const, contact })),
  ];

  const messages = promoItems.map((item, index) => (
    <Fragment key={item.type === "text" ? item.content : item.contact.url}>
      {index > 0 && (
        <span className="promo-divider" aria-hidden="true">
          |
        </span>
      )}
      {item.type === "text" ? (
        <span className="promo-message">{item.content}</span>
      ) : (
        <a
          href={item.contact.url}
          target="_blank"
          rel="noopener noreferrer"
          className="promo-message inline-flex items-center gap-2 hover:opacity-80"
          aria-label={`WhatsApp for international and wholesale orders at ${item.contact.phone}`}
        >
          <WhatsAppIcon className="shrink-0" />
          <span>
            {item.contact.label} {item.contact.phone}
          </span>
        </a>
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
