import { useState } from "react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { CircleNotch, MapPin, Phone, Envelope, ChatCircle, Clock, PaperPlaneTilt, CheckCircle } from "@phosphor-icons/react";

const WORDPRESS_URL = import.meta.env.VITE_WORDPRESS_URL || "";
// Contact Form 7 form ID — update this to match your CF7 form ID in WordPress
const CF7_FORM_ID = import.meta.env.VITE_CF7_FORM_ID || "1";

const Contact = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.email || !formData.message) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);

    try {
      // Submit to Contact Form 7 REST API
      const body = new FormData();
      body.append("your-name", formData.name);
      body.append("your-email", formData.email);
      body.append("your-phone", formData.phone);
      body.append("your-subject", formData.subject);
      body.append("your-message", formData.message);

      const wpUrl = WORDPRESS_URL.replace(/\/+$/, "");
      const response = await fetch(
        `${wpUrl}/wp-json/contact-form-7/v1/contact-forms/${CF7_FORM_ID}/feedback`,
        {
          method: "POST",
          body,
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.status === "mail_sent") {
          setIsSubmitted(true);
          setFormData({ name: "", email: "", phone: "", subject: "", message: "" });
          toast.success("Message sent successfully!");
        } else {
          toast.error(data.message || "Failed to send message. Please try again.");
        }
      } else {
        throw new Error("Request failed");
      }
    } catch {
      toast.error("Failed to send message. Please try WhatsApp or email instead.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactInfo = [
    {
      icon: <MapPin className="h-5 w-5" />,
      title: "Visit Us",
      lines: [
        "KAYALS LIFESTYLE",
        "3076 - B WING, AVADH RUTURAJ",
        "TEXTILE HUB, BRTS ROAD",
        "Surat, Gujarat 395012",
      ],
    },
    {
      icon: <Phone className="h-5 w-5" />,
      title: "WhatsApp",
      lines: ["+91 8939048873"],
      link: "https://wa.me/918939048873",
      linkLabel: "Chat on WhatsApp",
    },
    {
      icon: <Envelope className="h-5 w-5" />,
      title: "Email",
      lines: ["support@blacklovers.in"],
      link: "mailto:support@blacklovers.in",
      linkLabel: "PaperPlaneTilt Email",
    },
    {
      icon: <Clock className="h-5 w-5" />,
      title: "Business Hours",
      lines: ["Mon - Sat: 10:00 AM - 7:00 PM", "Sunday: Closed"],
    },
  ];

  return (
    <Layout>
      <div className="bg-gray-50 min-h-[60vh]">
        {/* Hero */}
        <div className="bg-[#800000] text-white py-12 md:py-16">
          <div className="container mx-auto px-4 text-center">
            <h1 className="font-heading text-3xl md:text-4xl font-bold mb-3">
              Contact Us
            </h1>
            <p className="text-white/80 max-w-lg mx-auto">
              We'd love to hear from you. Reach out via WhatsApp, email or fill the form below.
            </p>
          </div>
        </div>

        <div className="container mx-auto px-4 py-10 md:py-14 max-w-6xl">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-12">
            {/* Contact Details */}
            <div className="lg:col-span-2 space-y-5">
              {contactInfo.map((info) => (
                <Card key={info.title}>
                  <CardContent className="p-5 flex gap-4">
                    <div className="shrink-0 w-10 h-10 rounded-full bg-[#800000]/10 text-[#800000] flex items-center justify-center">
                      {info.icon}
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1">{info.title}</h3>
                      {info.lines.map((line, i) => (
                        <p key={i} className="text-sm text-gray-600">
                          {line}
                        </p>
                      ))}
                      {info.link && (
                        <a
                          href={info.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-[#800000] font-medium mt-2 hover:underline"
                        >
                          {info.linkLabel}
                          <ChatCircle className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {/* WhatsApp CTA */}
              <a
                href="https://wa.me/918939048873?text=Hi%2C%20I%20have%20a%20query%20about%20Black%20Lovers%20products"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-[#25D366] text-white rounded-lg font-medium hover:bg-[#1fb855] transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                Chat with us on WhatsApp
              </a>
            </div>

            {/* Contact Form */}
            <div className="lg:col-span-3">
              <Card>
                <CardContent className="p-6 md:p-8">
                  {isSubmitted ? (
                    <div className="text-center py-12">
                      <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-green-600" />
                      </div>
                      <h3 className="text-xl font-semibold mb-2">
                        Message Sent!
                      </h3>
                      <p className="text-gray-500 mb-6">
                        Thank you for reaching out. We'll get back to you within 24 hours.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setIsSubmitted(false)}
                      >
                        PaperPlaneTilt Another Message
                      </Button>
                    </div>
                  ) : (
                    <>
                      <h2 className="text-xl font-semibold mb-1">PaperPlaneTilt us a Message</h2>
                      <p className="text-sm text-gray-500 mb-6">
                        Fill out the form and we'll get back to you as soon as possible.
                      </p>

                      <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="name">
                              Name <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="name"
                              name="name"
                              placeholder="Your name"
                              value={formData.name}
                              onChange={handleChange}
                              required
                              className="h-11"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="email">
                              Email <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="email"
                              name="email"
                              type="email"
                              placeholder="your@email.com"
                              value={formData.email}
                              onChange={handleChange}
                              required
                              className="h-11"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="phone">Phone</Label>
                            <Input
                              id="phone"
                              name="phone"
                              type="tel"
                              placeholder="+91 XXXXXXXXXX"
                              value={formData.phone}
                              onChange={handleChange}
                              className="h-11"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="subject">Subject</Label>
                            <Input
                              id="subject"
                              name="subject"
                              placeholder="What is this about?"
                              value={formData.subject}
                              onChange={handleChange}
                              className="h-11"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="message">
                            Message <span className="text-red-500">*</span>
                          </Label>
                          <Textarea
                            id="message"
                            name="message"
                            placeholder="Tell us how we can help..."
                            value={formData.message}
                            onChange={handleChange}
                            required
                            rows={5}
                            className="resize-none"
                          />
                        </div>

                        <Button
                          type="submit"
                          className="w-full h-11 bg-[#800000] hover:bg-[#600000] text-white"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <>
                              <CircleNotch className="mr-2 h-4 w-4 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <PaperPlaneTilt className="mr-2 h-4 w-4" />
                              PaperPlaneTilt Message
                            </>
                          )}
                        </Button>
                      </form>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Contact;
