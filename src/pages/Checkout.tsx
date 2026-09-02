import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronLeft, Lock, Loader2 } from "lucide-react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { useWooCommercePaymentGateways, useCreateOrder } from "@/hooks/useWooCommerce";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const Checkout = () => {
  const { items, totalPrice, clearCart, validateCartStock } = useCart();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { data: paymentGateways, isLoading: isLoadingGateways } = useWooCommercePaymentGateways();
  const createOrder = useCreateOrder();

  const [formData, setFormData] = useState({
    name: "",
    houseNo: "",
    street: "",
    landmark: "",
    pincode: "",
    city: "",
    state: "",
    country: "India",
    phone: "",
    whatsapp: "",
    alternatePhone: "",
    email: "",
    saveInfo: true,
  });

  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFetchingPincode, setIsFetchingPincode] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [formErrors, setFormErrors] = useState({
    name: "",
    phone: "",
    alternatePhone: "",
    whatsapp: "",
  });

  // Set default payment method when gateways are loaded
  useEffect(() => {
    if (paymentGateways && paymentGateways.length > 0 && !paymentMethod) {
      const enabledGateways = paymentGateways.filter(g => g.enabled).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      if (enabledGateways.length > 0) {
        setPaymentMethod(enabledGateways[0].id);
      }
    }
  }, [paymentGateways, paymentMethod]);

  // Load Razorpay Script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  // Load EaseBuzz Script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/v2.0.0/easebuzz-checkout-v2.min.js";
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const formatPrice = (price: number) => `Rs. ${price.toLocaleString("en-IN")}.00`;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));

    // Clear error when user starts typing
    if (name === "phone" || name === "alternatePhone" || name === "whatsapp") {
      setFormErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }

    if (name === "pincode" && value.length === 6) {
      fetchPincodeDetails(value);
    }
  };

  const fetchPincodeDetails = async (pincode: string) => {
    if (!/^\d{6}$/.test(pincode)) return;

    setIsFetchingPincode(true);

    // api.postalpincode.in has an expired SSL cert + no CORS, so it can't be
    // called from the browser. zippopotam.us has spotty coverage for rural
    // Indian pincodes. Solution: call a deployed edge function that proxies
    // postalpincode.in server-side (full India Post coverage, public data only).
    const PINCODE_LOOKUP_URL = "https://tjjpedhwruqiiybuwsgy.supabase.co/functions/v1/pincode-lookup";

    try {
      const response = await fetch(`${PINCODE_LOOKUP_URL}?pincode=${pincode}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      if (!result.city || !result.state) {
        throw new Error(result.error || "Pincode not found");
      }

      setFormData((prev) => ({
        ...prev,
        city: result.city,
        state: result.state,
      }));
      toast({
        title: "Address Found",
        description: `City: ${result.city}, State: ${result.state}`,
      });
    } catch (error) {
      console.error("Error fetching pincode:", error);
      toast({
        variant: "destructive",
        title: "Invalid Pincode",
        description: "Could not fetch details for this pincode. Please enter city and state manually.",
      });
      setFormData((prev) => ({ ...prev, city: "", state: "" }));
    } finally {
      setIsFetchingPincode(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let hasError = false;
    const newErrors = { name: "", phone: "", alternatePhone: "", whatsapp: "" };

    // Name validation: must have at least 3 alphabetic characters
    const nameAlphaOnly = formData.name.replace(/[^a-zA-Z]/g, "");
    if (!formData.name.trim()) {
      newErrors.name = "Name is required.";
      hasError = true;
    } else if (nameAlphaOnly.length < 3) {
      newErrors.name = "Name must have at least 3 letters (a-z).";
      hasError = true;
    }

    // Basic digit validation regex for 10-12 digits
    const phoneRegex = /^\d{10,12}$/;
    // WhatsApp validation: exactly 10 digits for Indian numbers
    const whatsappRegex = /^\d{10}$/;

    if (formData.phone.length < 10) {
      newErrors.phone = "Please enter at least 10 digits for the phone number.";
      hasError = true;
    } else if (!phoneRegex.test(formData.phone)) {
      newErrors.phone = "Phone number contains invalid characters.";
      hasError = true;
    }

    // WhatsApp validation
    if (!formData.whatsapp) {
      newErrors.whatsapp = "WhatsApp number is required.";
      hasError = true;
    } else if (formData.whatsapp.length !== 10) {
      newErrors.whatsapp = "Please enter exactly 10 digits for WhatsApp number.";
      hasError = true;
    } else if (!whatsappRegex.test(formData.whatsapp)) {
      newErrors.whatsapp = "WhatsApp number should contain only digits.";
      hasError = true;
    }

    // Since alternatePhone is required
    if (formData.alternatePhone.length < 10) {
      newErrors.alternatePhone = "Please enter at least 10 digits for the alternate phone number.";
      hasError = true;
    } else if (!phoneRegex.test(formData.alternatePhone)) {
      newErrors.alternatePhone = "Alternate phone number contains invalid characters.";
      hasError = true;
    }

    if (hasError) {
      setFormErrors(newErrors);
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Please correct the errors in the form.",
      });
      return;
    }

    setShowConfirmDialog(true);
  };

  const handleConfirmOrder = async () => {
    setIsProcessing(true);
    setShowConfirmDialog(false);

    try {
      // Final stock validation before creating order
      const stockIssues = await validateCartStock();
      if (stockIssues.length > 0) {
        const outOfStock = stockIssues.filter(i => i.issue === 'out_of_stock' || i.issue === 'product_removed');
        const adjusted = stockIssues.filter(i => i.issue === 'quantity_exceeded');

        let msg = "";
        if (outOfStock.length > 0) {
          msg += outOfStock.map(i => `${i.productName}${i.size ? ` (${i.size})` : ""} is out of stock`).join(". ");
        }
        if (adjusted.length > 0) {
          msg += (msg ? ". " : "") + adjusted.map(i => `${i.productName}${i.size ? ` (${i.size})` : ""} reduced to ${i.availableStock}`).join(". ");
        }

        toast({
          variant: "destructive",
          title: "Cart Updated",
          description: msg + ". Please review your cart before placing the order.",
        });
        setIsProcessing(false);
        navigate("/cart");
        return;
      }
      // Find selected payment gateway details
      const selectedGateway = paymentGateways?.find(g => g.id === paymentMethod);
      const totalAmount = totalPrice;

      const orderData = {
        payment_method: paymentMethod || "cod",
        payment_method_title: selectedGateway?.title || "Cash on Delivery",
        set_paid: false,
        status: (paymentMethod === "razorpay" || paymentMethod === "easebuzz" || paymentMethod === "payeasebuzz") ? "pending" : "processing",
        billing: {
          first_name: formData.name,
          last_name: "",
          address_1: `${formData.houseNo}, ${formData.street}`,
          address_2: formData.landmark,
          city: formData.city,
          state: formData.state,
          postcode: formData.pincode,
          country: formData.country,
          email: formData.email,
          phone: formData.phone
        },
        shipping: {
          first_name: formData.name,
          last_name: "",
          address_1: `${formData.houseNo}, ${formData.street}`,
          address_2: formData.landmark,
          city: formData.city,
          state: formData.state,
          postcode: formData.pincode,
          country: formData.country
        },
        line_items: items.map(item => ({
          product_id: parseInt(item.product.id),
          variation_id: item.variationId,
          quantity: item.quantity,
          subtotal: String(item.product.price * item.quantity),
          total: String(item.product.price * item.quantity),
          meta_data: [
            ...(item.size ? [{ key: "Size", value: item.size }] : []),
            ...(item.color ? [{ key: "Color", value: item.color }] : [])
          ]
        })),
        meta_data: [
          { key: "whatsapp_number", value: formData.whatsapp },
          { key: "alternate_phone", value: formData.alternatePhone }
        ]
      };

      const response = await createOrder(orderData);

      // Safety check: verify WooCommerce order total matches expected total
      const wooTotal = parseFloat(response.total);
      if (!wooTotal || Math.abs(wooTotal - totalAmount) > 1) {
        console.error("WooCommerce order total mismatch!", {
          expected: totalAmount,
          woocommerce_total: wooTotal,
          order_id: response.id,
        });

        // Attempt to fix the order total via update
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
          const fixResponse = await fetch(
            `${supabaseUrl}/functions/v1/woocommerce-orders?id=${response.id}`,
            {
              method: "PUT",
              headers: {
                "apikey": supabaseKey,
                "Authorization": `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                id: response.id,
                line_items: items.map(item => ({
                  id: response.line_items?.find((li: any) =>
                    li.product_id === parseInt(item.product.id)
                  )?.id,
                  product_id: parseInt(item.product.id),
                  variation_id: item.variationId,
                  quantity: item.quantity,
                  subtotal: String(item.product.price * item.quantity),
                  total: String(item.product.price * item.quantity),
                })),
              }),
            }
          );
          if (fixResponse.ok) {
            const fixedOrder = await fixResponse.json();
            const fixedTotal = parseFloat(fixedOrder.total);
            console.log("Order total corrected:", { order_id: response.id, corrected_total: fixedTotal });
            if (!fixedTotal || Math.abs(fixedTotal - totalAmount) > 1) {
              toast({
                variant: "destructive",
                title: "Order Error",
                description: "Could not set correct order total. Please try again or contact support.",
              });
              setIsProcessing(false);
              return;
            }
          } else {
            console.error("Failed to fix order total:", await fixResponse.text());
            toast({
              variant: "destructive",
              title: "Order Error",
              description: "Order total mismatch detected. Please try again or contact support.",
            });
            setIsProcessing(false);
            return;
          }
        } catch (fixError) {
          console.error("Error fixing order total:", fixError);
          toast({
            variant: "destructive",
            title: "Order Error",
            description: "Order total mismatch detected. Please try again or contact support.",
          });
          setIsProcessing(false);
          return;
        }
      }

      if (paymentMethod === "razorpay") {
        // Initiate Razorpay Flow
        try {
          const razorpayPayload = {
            amount: totalAmount,
            currency: "INR",
            receipt: `order_${response.id}`
          };
          const { data: razorpayOrder, error: razorpayError } = await supabase.functions.invoke("create-razorpay-order", {
            body: razorpayPayload,
          });

          if (razorpayError || !razorpayOrder) {
            throw new Error(razorpayError?.message || "Failed to create Razorpay order");
          }

          const options = {
            key: import.meta.env.VITE_RAZORPAY_KEY_ID, // Enter the Key ID generated from the Dashboard
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            name: "Blacklovers",
            description: `Order #${response.number || response.id}`,
            image: "/logo.webp",
            order_id: razorpayOrder.id,
            handler: async function (response_razorpay: any) {
              // Payment Success Handler — verify signature server-side
              try {
                const { data: verifyData, error: verifyError } = await supabase.functions.invoke("verify-razorpay-payment", {
                  body: {
                    razorpay_order_id: response_razorpay.razorpay_order_id,
                    razorpay_payment_id: response_razorpay.razorpay_payment_id,
                    razorpay_signature: response_razorpay.razorpay_signature,
                    woocommerce_order_id: response.id,
                  },
                });

                if (verifyError || !verifyData?.verified) {
                  console.error("Payment verification failed:", verifyError || verifyData);
                  toast({
                    variant: "destructive",
                    title: "Payment Verification Failed",
                    description: "Payment could not be verified. Please contact support with your order ID.",
                  });
                } else if (!verifyData?.updated) {
                  console.error("Payment verified but order update failed:", verifyData);
                  toast({
                    variant: "destructive",
                    title: "Status Sync Failed",
                    description: `Payment verified for order #${response.number || response.id}, but store sync failed. Please contact support.`,
                  });
                } else {
                  console.log("Payment verified and order updated:", verifyData);
                  toast({
                    title: "Payment Successful",
                    description: "Your order has been placed and payment confirmed.",
                  });

                  // Send WhatsApp notification via Meta Cloud API
                  try {
                    const firstProductImage = items[0]?.product.images?.[0];
                    const whatsappNum = formData.whatsapp || formData.phone;
                    console.log("Triggering Razorpay WhatsApp notification for:", whatsappNum);
                    const { error: waError } = await supabase.functions.invoke("whatsapp-order-notification", {
                      body: {
                        phoneNumber: whatsappNum,
                        customerName: formData.name,
                        orderId: String(response.number || response.id),
                        productImage: firstProductImage,
                        amount: totalAmount,
                        currency: "₹",
                        buttonValue: "https://blacklovers.in/",
                      },
                    });
                    if (waError) {
                      console.error("Failed to send WhatsApp notification:", waError);
                    } else {
                      console.log("WhatsApp notification sent successfully");
                    }
                  } catch (whatsappError) {
                    console.error("Error calling WhatsApp edge function:", whatsappError);
                  }
                }
              } catch (updateError: any) {
                console.error("Unexpected error in success handler:", updateError);
                toast({
                  variant: "destructive",
                  title: "System Error",
                  description: "Could not verify payment. Please contact support.",
                });
              }

              // Prepare order details for thank you page
              const orderDetails = {
                orderId: String(response.number || response.id),
                name: formData.name,
                address: `${formData.houseNo}, ${formData.street}\n${formData.landmark ? formData.landmark + "\n" : ""}${formData.city}, ${formData.state} - ${formData.pincode}\n${formData.country}`,
                phone: formData.phone,
                whatsapp: formData.whatsapp,
                email: formData.email,
                items: items.map(item => ({
                  name: item.product.name,
                  quantity: item.quantity,
                  price: item.product.price,
                  size: item.size,
                  color: item.color,
                  image: item.image || item.product.images[0],
                })),
                total: totalAmount,
              };

              clearCart();
              navigate("/thank-you", { state: orderDetails });
            },
            prefill: {
              name: formData.name,
              email: formData.email,
              contact: formData.phone,
            },
            theme: {
              color: "#000000",
            },
            modal: {
              ondismiss: async function () {
                // Update WooCommerce order to cancelled/failed when user dismisses payment
                try {
                  const { error: cancelError } = await supabase.functions.invoke("woocommerce-orders", {
                    method: "PUT",
                    body: { id: response.id, status: "cancelled" },
                  });
                  if (cancelError) {
                    console.error("Failed to cancel order in WooCommerce:", cancelError);
                  } else {
                    console.log("Order cancelled in WooCommerce:", response.id);
                  }
                } catch (err) {
                  console.error("Error cancelling order:", err);
                }
                setIsProcessing(false);
                toast({
                  title: "Payment Cancelled",
                  description: "Your order has been cancelled. No payment was charged.",
                });
              }
            }
          };

          const rzp1 = (window as any).Razorpay(options);

          // Handle payment failure (bank decline, network error, etc.)
          rzp1.on("payment.failed", async function (failResponse: any) {
            console.error("Razorpay payment failed:", failResponse.error);
            try {
              const { error: failError } = await supabase.functions.invoke("woocommerce-orders", {
                method: "PUT",
                body: {
                  id: response.id,
                  status: "failed",
                  meta_data: [
                    { key: "_razorpay_failure_reason", value: failResponse.error?.description || "Payment failed" },
                    { key: "_razorpay_failure_code", value: failResponse.error?.code || "unknown" },
                  ],
                },
              });
              if (failError) {
                console.error("Failed to update order status to failed:", failError);
              } else {
                console.log("Order marked as failed in WooCommerce:", response.id);
              }
            } catch (err) {
              console.error("Error updating failed order:", err);
            }
            setIsProcessing(false);
            toast({
              variant: "destructive",
              title: "Payment Failed",
              description: failResponse.error?.description || "Your payment was declined. Please try again.",
            });
          });

          rzp1.open();
          return; // Wait for handler or dismiss
        } catch (err: any) {
          console.error("Razorpay error:", err);
          toast({
            variant: "destructive",
            title: "Payment Initialization Failed",
            description: err.message || "Could not initialize Razorpay. Please try again.",
          });
          setIsProcessing(false);
          return;
        }
      }

      if (paymentMethod === "easebuzz" || paymentMethod === "payeasebuzz") {
        try {
          const txnid = `BL_${response.id}_${Date.now()}`;
          const currentUrl = window.location.origin;
          console.log("Initiating EaseBuzz payment:", { txnid, totalAmount, orderId: response.id, name: formData.name, email: formData.email, phone: formData.phone });

          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

          // EaseBuzz requires firstname to be alphabets and spaces only, min 3 chars
          const sanitizedName = formData.name
            .replace(/[^a-zA-Z\s]/g, "")
            .replace(/\s+/g, " ")
            .trim() || "Customer";

          const ebzPayload = {
            txnid,
            amount: totalAmount,
            productinfo: `Order ${response.number || response.id}`,
            firstname: sanitizedName,
            email: formData.email,
            phone: formData.phone,
            surl: currentUrl.includes("localhost") ? "https://blacklovers.in/thank-you" : `${currentUrl}/thank-you`,
            furl: currentUrl.includes("localhost") ? "https://blacklovers.in/checkout" : `${currentUrl}/checkout`,
            udf1: String(response.id),
            udf2: "",
            udf3: "",
            udf4: "",
            udf5: "",
          };
          console.log("EaseBuzz payload:", ebzPayload);

          const ebzResponse = await fetch(`${supabaseUrl}/functions/v1/initiate-easebuzz-payment`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "apikey": supabaseKey,
              "Authorization": `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify(ebzPayload),
          });

          const ebzData = await ebzResponse.json();
          console.log("EaseBuzz initiation response:", ebzData);

          if (!ebzResponse.ok || !ebzData || ebzData.status !== 1) {
            console.error("EaseBuzz initiation failed:", ebzData);
            throw new Error(ebzData?.error || "Failed to initiate EaseBuzz payment");
          }

          const easebuzzCheckout = new (window as any).EasebuzzCheckout(ebzData.access_key, ebzData.env === "test" ? "test" : "prod");

          easebuzzCheckout.initiatePayment({
            access_key: ebzData.access_key,
            onResponse: async (ebzResponse: any) => {
              console.log("EaseBuzz response:", ebzResponse);

              if (ebzResponse.status === "success") {
                try {
                  const verifyRes = await fetch(`${supabaseUrl}/functions/v1/verify-easebuzz-payment`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "apikey": supabaseKey,
                      "Authorization": `Bearer ${supabaseKey}`,
                    },
                    body: JSON.stringify({
                      easebuzz_response: ebzResponse,
                      woocommerce_order_id: response.id,
                    }),
                  });
                  const verifyData = await verifyRes.json();
                  console.log("EaseBuzz verification response:", verifyData);

                  if (!verifyRes.ok || !verifyData?.payment_success) {
                    console.error("EaseBuzz verification failed:", verifyData);
                    toast({
                      variant: "destructive",
                      title: "Payment Verification Failed",
                      description: "Payment could not be verified. Please contact support with your order ID.",
                    });
                  } else if (!verifyData?.updated) {
                    toast({
                      variant: "destructive",
                      title: "Status Sync Failed",
                      description: `Payment verified for order #${response.number || response.id}, but store sync failed. Please contact support.`,
                    });
                    toast({
                      title: "Payment Successful",
                      description: "Your order has been placed and payment confirmed.",
                    });
                  }
                } catch (updateError: any) {
                  console.error("EaseBuzz verification error:", updateError);
                  toast({
                    variant: "destructive",
                    title: "System Error",
                    description: "Could not verify payment. Please contact support.",
                  });
                }

                const orderDetails = {
                  orderId: String(response.number || response.id),
                  name: formData.name,
                  address: `${formData.houseNo}, ${formData.street}\n${formData.landmark ? formData.landmark + "\n" : ""}${formData.city}, ${formData.state} - ${formData.pincode}\n${formData.country}`,
                  phone: formData.phone,
                  whatsapp: formData.whatsapp,
                  email: formData.email,
                  items: items.map(item => ({
                    name: item.product.name,
                    quantity: item.quantity,
                    price: item.product.price,
                    size: item.size,
                    color: item.color,
                    image: item.image || item.product.images[0],
                  })),
                  total: totalAmount,
                };

                clearCart();
                navigate("/thank-you", { state: orderDetails });
              } else if (ebzResponse.status === "failure") {
                // Payment failed
                try {
                  await supabase.functions.invoke("woocommerce-orders", {
                    method: "PUT",
                    body: {
                      id: response.id,
                      status: "failed",
                      meta_data: [
                        { key: "_easebuzz_failure_reason", value: ebzResponse.error_Message || "Payment failed" },
                      ],
                    },
                  });
                } catch (err) {
                  console.error("Error updating failed order:", err);
                }
                setIsProcessing(false);
                toast({
                  variant: "destructive",
                  title: "Payment Failed",
                  description: ebzResponse.error_Message || "Your payment was declined. Please try again.",
                });
              } else {
                // User closed / cancelled
                try {
                  await supabase.functions.invoke("woocommerce-orders", {
                    method: "PUT",
                    body: { id: response.id, status: "cancelled" },
                  });
                } catch (err) {
                  console.error("Error cancelling order:", err);
                }
                setIsProcessing(false);
                toast({
                  title: "Payment Cancelled",
                  description: "Your order has been cancelled. No payment was charged.",
                });
              }
            },
            theme: "#000000",
          });

          return;
        } catch (err: any) {
          console.error("EaseBuzz error:", err);
          toast({
            variant: "destructive",
            title: "Payment Initialization Failed",
            description: err.message || "Could not initialize EaseBuzz. Please try again.",
          });
          setIsProcessing(false);
          return;
        }
      }

      // Handle COD or other non-instant payments
      const orderDetails = {
        orderId: String(response.number || response.id),
        name: formData.name,
        address: `${formData.houseNo}, ${formData.street}\n${formData.landmark ? formData.landmark + "\n" : ""}${formData.city}, ${formData.state} - ${formData.pincode}\n${formData.country}`,
        phone: formData.phone,
        whatsapp: formData.whatsapp,
        email: formData.email,
        items: items.map(item => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.product.price,
          size: item.size,
          color: item.color,
          image: item.image || item.product.images[0],
        })),
        total: totalAmount,
      };

      clearCart();
      navigate("/thank-you", { state: orderDetails });
    } catch (error) {
      console.error("Order processing failed:", error);
      toast({
        variant: "destructive",
        title: "Order Failed",
        description: "There was an error placing your order. Please try again.",
      });
    } finally {
      if (paymentMethod !== "razorpay" && paymentMethod !== "easebuzz") {
        setIsProcessing(false);
      }
    }
  };

  if (items.length === 0) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Your cart is empty</h1>
          <p className="text-muted-foreground mb-8">
            Add some items to your cart before checking out.
          </p>
          <Link to="/collections/all">
            <Button className="bg-foreground text-background hover:bg-foreground/90 rounded-none font-bold">
              CONTINUE SHOPPING
            </Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <Link to="/cart" className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
              <ChevronLeft className="h-4 w-4" />
              Back to Cart
            </Link>
            <Link to="/">
              <img src="/logo.webp" alt="Blacklovers" className="h-12" />
            </Link>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" />
              Secure Checkout
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid lg:grid-cols-2 gap-12">
              {/* Left - Form */}
              <div className="space-y-8">

                {/* Shipping Address */}
                <div>
                  <h2 className="text-xl font-bold mb-4">Shipping Address</h2>
                  <div className="space-y-4">

                    {/* Name */}
                    <div>
                      <Label htmlFor="name" className="font-bold">Name</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        className="mt-1 rounded-none"
                        required
                        placeholder="Full Name (e.g. Sathish Kumar)"
                      />
                      {formErrors.name && (
                        <p className="text-red-500 text-sm mt-1">{formErrors.name}</p>
                      )}
                    </div>

                    {/* House no / building name */}
                    <div>
                      <Label htmlFor="houseNo" className="font-bold">House no / Building name</Label>
                      <Input
                        id="houseNo"
                        name="houseNo"
                        value={formData.houseNo}
                        onChange={handleInputChange}
                        className="mt-1 rounded-none"
                        required
                        placeholder="e.g. Flat 101, Galaxy Apartments"
                      />
                    </div>

                    {/* Street / Area / colony */}
                    <div>
                      <Label htmlFor="street" className="font-bold">Street / Area / Colony</Label>
                      <Input
                        id="street"
                        name="street"
                        value={formData.street}
                        onChange={handleInputChange}
                        className="mt-1 rounded-none"
                        required
                        placeholder="e.g. MG Road, Indiranagar"
                      />
                    </div>

                    {/* Landmark */}
                    <div>
                      <Label htmlFor="landmark" className="font-bold">Landmark</Label>
                      <Input
                        id="landmark"
                        name="landmark"
                        value={formData.landmark}
                        onChange={handleInputChange}
                        className="mt-1 rounded-none"
                        required
                        placeholder="e.g. Near City Hospital"
                      />
                    </div>

                    {/* Pincode */}
                    <div>
                      <Label htmlFor="pincode" className="font-bold">Pincode</Label>
                      <div className="relative">
                        <Input
                          id="pincode"
                          name="pincode"
                          value={formData.pincode}
                          onChange={handleInputChange}
                          className="mt-1 rounded-none"
                          required
                          placeholder="6 Digit Pincode"
                          maxLength={6}
                        />
                        {isFetchingPincode && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground animate-pulse">
                            Fetching...
                          </span>
                        )}
                      </div>
                    </div>

                    {/* City & State (Auto-fetched from pincode, editable as fallback) */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="city" className="font-bold">City</Label>
                        <Input
                          id="city"
                          name="city"
                          value={formData.city}
                          onChange={handleInputChange}
                          className="mt-1 rounded-none"
                          required
                          placeholder="City"
                        />
                      </div>
                      <div>
                        <Label htmlFor="state" className="font-bold">State</Label>
                        <Input
                          id="state"
                          name="state"
                          value={formData.state}
                          onChange={handleInputChange}
                          className="mt-1 rounded-none"
                          required
                          placeholder="State"
                        />
                      </div>
                    </div>

                    {/* Country (Default India) */}
                    <div>
                      <Label htmlFor="country" className="font-bold">Country</Label>
                      <Input
                        id="country"
                        name="country"
                        value={formData.country}
                        onChange={handleInputChange}
                        className="mt-1 rounded-none bg-muted"
                        required
                        readOnly
                      />
                    </div>

                    {/* Phone number */}
                    <div>
                      <Label htmlFor="phone" className="font-bold">Phone number</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleInputChange}
                        className="mt-1 rounded-none"
                        required
                        maxLength={12}
                        placeholder="10-12 digit mobile number"
                      />
                      {formErrors.phone && (
                        <p className="text-sm text-red-500 mt-1 font-medium animate-pulse">
                          {formErrors.phone}
                        </p>
                      )}
                    </div>

                    {/* WhatsApp number */}
                    <div>
                      <Label htmlFor="whatsapp" className="font-bold flex items-center gap-2">
                        WhatsApp number
                        <svg
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="#25D366"
                          className="inline-block"
                        >
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                        </svg>
                      </Label>
                      <Input
                        id="whatsapp"
                        name="whatsapp"
                        type="tel"
                        value={formData.whatsapp}
                        onChange={handleInputChange}
                        className="mt-1 rounded-none"
                        required
                        maxLength={10}
                        placeholder="10 digit WhatsApp number"
                      />
                      {formErrors.whatsapp ? (
                        <p className="text-sm text-red-500 mt-1 font-medium animate-pulse">
                          {formErrors.whatsapp}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">To receive tracking and order details</p>
                      )}
                    </div>

                    {/* Alternate number */}
                    <div>
                      <Label htmlFor="alternatePhone" className="font-bold">Alternate number</Label>
                      <Input
                        id="alternatePhone"
                        name="alternatePhone"
                        type="tel"
                        value={formData.alternatePhone}
                        onChange={handleInputChange}
                        className="mt-1 rounded-none"
                        required
                        maxLength={12}
                        placeholder="10-12 digit number"
                      />
                      {formErrors.alternatePhone && (
                        <p className="text-sm text-red-500 mt-1 font-medium animate-pulse">
                          {formErrors.alternatePhone}
                        </p>
                      )}
                    </div>

                    {/* Email ID */}
                    <div>
                      <Label htmlFor="email" className="font-bold">Email ID</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        className="mt-1 rounded-none"
                        required
                        placeholder="your@email.com"
                      />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer pt-2">
                      <input
                        type="checkbox"
                        name="saveInfo"
                        checked={formData.saveInfo}
                        onChange={handleInputChange}
                        className="rounded"
                      />
                      <span className="text-sm font-medium">Save this information for next time</span>
                    </label>
                  </div>
                </div>

                {/* Payment Method */}
                <div>
                  <h2 className="text-xl font-bold mb-4">Payment Method</h2>
                  <div className="space-y-3">
                    {isLoadingGateways ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        <span className="ml-2 text-muted-foreground">Loading payment methods...</span>
                      </div>
                    ) : !paymentGateways || paymentGateways.filter(g => g.enabled).length === 0 ? (
                      <div className="text-center py-8 border border-border rounded-lg bg-muted/30">
                        <p className="text-muted-foreground">No payment options available</p>
                        <p className="text-sm text-muted-foreground mt-1">Please contact support for assistance</p>
                      </div>
                    ) : (
                      paymentGateways.filter(gateway => gateway.enabled).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((gateway) => (
                        <label
                          key={gateway.id}
                          className={`flex items-center gap-3 p-4 border cursor-pointer transition-colors ${paymentMethod === gateway.id
                            ? "border-foreground bg-muted"
                            : "border-border hover:border-foreground"
                            }`}
                        >
                          <input
                            type="radio"
                            name="paymentMethod"
                            value={gateway.id}
                            checked={paymentMethod === gateway.id}
                            onChange={() => setPaymentMethod(gateway.id)}
                            className="accent-foreground"
                          />
                          <div>
                            <p className="font-bold">{gateway.title}</p>
                            <p className="text-sm text-muted-foreground">{gateway.description}</p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Right - Order Summary */}
              <div>
                <div className="bg-muted p-6 sticky top-28">
                  <h2 className="text-xl font-bold mb-6">Order Summary</h2>

                  {/* Items */}
                  <div className="space-y-4 max-h-64 overflow-auto">
                    {items.map((item) => (
                      <div key={`${item.product.id}-${item.size}`} className="flex gap-4">
                        <div className="relative w-16 h-20 bg-background flex-shrink-0 overflow-hidden">
                          <img
                            src={item.image || item.product.images[0] || "/placeholder.svg"}
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute -top-1 -right-1 w-5 h-5 bg-foreground text-background text-xs font-bold rounded-full flex items-center justify-center">
                            {item.quantity}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm truncate">{item.product.name}</p>
                          {(item.size || item.color) && (
                            <p className="text-xs text-muted-foreground uppercase">
                              {[item.size, item.color].filter(Boolean).join(", ")}
                            </p>
                          )}
                          <p className="font-bold text-sm mt-1">{formatPrice(item.product.price * item.quantity)}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="mt-6 pt-6 border-t border-border space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-bold">{formatPrice(totalPrice)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Shipping</span>
                      <span className="font-bold text-green-600">FREE</span>
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-border">
                    <div className="flex justify-between text-lg">
                      <span className="font-bold">Total</span>
                      <span className="font-bold">{formatPrice(totalPrice)}</span>
                    </div>
                  </div>

                  {/* Place Order Button */}
                  <Button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full h-14 mt-6 bg-foreground text-background hover:bg-foreground/90 rounded-none font-bold text-base"
                  >
                    {isProcessing ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Processing...
                      </span>
                    ) : (
                      `PLACE ORDER - ${formatPrice(totalPrice)}`
                    )}
                  </Button>

                  {/* Trust indicators */}
                  <div className="mt-6 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Lock className="h-3 w-3" />
                      Secure
                    </span>
                    <span>|</span>
                    <span>Free Shipping</span>
                    <span>|</span>
                    <span>Premium Quality</span>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Details</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-foreground font-medium">
              <p className="mb-4">
                Kindly reconfirm your address and phone number before dispatch. If the parcel is returned due to incorrect or incomplete details, the customer will be responsible for the reshipping charges.
              </p>
              <div className="bg-muted p-4 rounded-md text-sm space-y-1 text-left">
                <p className="font-bold">{formData.name}</p>
                <p>{formData.houseNo}, {formData.street}</p>
                {formData.landmark && <p>{formData.landmark}</p>}
                <p>{formData.city}, {formData.state} - {formData.pincode}</p>
                <div className="mt-2 space-y-1">
                  <p className="font-bold">Phone: {formData.phone}</p>
                  <p className="font-bold">Alternate Phone: {formData.alternatePhone}</p>
                  <p className="font-bold flex items-center gap-1">
                    WhatsApp: {formData.whatsapp}
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="#25D366"
                      className="inline-block"
                    >
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                  </p>
                  <p className="font-bold">Email: {formData.email}</p>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowConfirmDialog(false);
              window.scrollTo(0, 0);
            }}>Edit</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmOrder} className="bg-foreground text-background hover:bg-foreground/90">
              Yes, Place Order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
};

export default Checkout;
