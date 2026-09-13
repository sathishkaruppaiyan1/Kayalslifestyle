import WhatsAppIcon from "./WhatsAppIcon";

const WHATSAPP_URL =
  "https://api.whatsapp.com/send/?phone=918220027625&text&type=phone_number&app_absent=0";

const FloatingWhatsAppButton = () => (
  <a
    href={WHATSAPP_URL}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Chat with us on WhatsApp"
    className="fixed bottom-20 right-4 z-[60] flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#25D366] shadow-lg transition-transform duration-300 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2 lg:bottom-5 lg:right-5 lg:h-14 lg:w-14"
  >
    <WhatsAppIcon size={28} color="#ffffff" />
  </a>
);

export default FloatingWhatsAppButton;
