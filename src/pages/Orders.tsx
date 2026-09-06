import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useUserOrders } from "@/hooks/useWooCommerce";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CircleNotch, Package, Phone, ChatText, Clock, Truck, CheckCircle, WarningCircle } from "@phosphor-icons/react";

type LoginStep = "phone" | "otp";

const Orders = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated, login } = useAuth();

  // OTP login state
  const [step, setStep] = useState<LoginStep>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch orders if logged in
  const normalizedPhone = user?.phoneNumber
    ? user.phoneNumber.replace(/^\+?91/, "").replace(/\D/g, "").slice(-10)
    : undefined;

  const { data: orders = [], isLoading: ordersLoading } = useUserOrders(
    user?.email,
    normalizedPhone
  );

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      completed: "bg-green-100 text-green-800",
      processing: "bg-blue-100 text-blue-800",
      "on-hold": "bg-yellow-100 text-yellow-800",
      pending: "bg-yellow-100 text-yellow-800",
      cancelled: "bg-red-100 text-red-800",
      refunded: "bg-gray-100 text-gray-800",
      failed: "bg-red-100 text-red-800",
    };
    return map[status] || "bg-gray-100 text-gray-800";
  };

  const getStatusIcon = (status: string) => {
    const s = status.toLowerCase();
    if (s === "completed") return <CheckCircle className="h-4 w-4" />;
    if (s === "processing" || s === "on-hold") return <Truck className="h-4 w-4" />;
    if (s === "cancelled" || s === "failed") return <WarningCircle className="h-4 w-4" />;
    return <Clock className="h-4 w-4" />;
  };

  const startCountdown = () => {
    setCountdown(60);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleSendOTP = async () => {
    if (!phoneNumber || phoneNumber.length !== 10) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-send-otp", {
        body: { phoneNumber, countryCode: "+91" },
      });

      if (error) throw error;

      if (data?.success) {
        toast.success("OTP sent to your WhatsApp!");
        setStep("otp");
        startCountdown();
      } else {
        throw new Error(data?.error || "Failed to send OTP");
      }
    } catch (error: any) {
      console.error("Error sending OTP:", error);
      toast.error(error?.message || "Failed to send OTP. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6) {
      toast.error("Please enter the 6-digit OTP");
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-verify-otp", {
        body: {
          phoneNumber,
          otp,
          name: name || undefined,
          email: email || undefined,
        },
      });

      if (error) throw error;

      if (data?.success) {
        login(phoneNumber, data.user?.name || name, data.user?.email || email);
        toast.success("Login successful!");
      } else {
        throw new Error(data?.error || "Invalid OTP");
      }
    } catch (error: any) {
      console.error("Error verifying OTP:", error);
      toast.error(error?.message || "Invalid OTP. Please try again.");
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setOtp("");
    setCountdown(0);
    handleSendOTP();
  };

  return (
    <Layout>
      <div className="bg-gray-50 min-h-[60vh]">
        <div className="container mx-auto px-4 py-8 md:py-12 max-w-4xl">
          <h1 className="font-heading text-3xl md:text-4xl font-bold mb-2 text-center">
            My Orders
          </h1>
          <p className="text-gray-500 text-center mb-8">
            {isAuthenticated
              ? "View and track all your orders"
              : "Login with WhatsApp OTP to view your orders"}
          </p>

          {/* Logged-in: Show order history */}
          {isAuthenticated && user ? (
            <div>
              {ordersLoading ? (
                <div className="flex items-center justify-center py-16">
                  <CircleNotch className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : orders.length === 0 ? (
                <Card>
                  <CardContent className="text-center py-16">
                    <Package className="mx-auto h-14 w-14 text-gray-300 mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
                    <p className="text-gray-500 mb-6">
                      You haven't placed any orders. Start shopping to see your orders here.
                    </p>
                    <Button
                      onClick={() => navigate("/collections/all")}
                      className="bg-primary hover:bg-brand-ink text-white"
                    >
                      Start Shopping
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {orders.map((order) => (
                    <Card key={order.id} className="overflow-hidden">
                      <CardHeader className="pb-3 bg-white">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div>
                            <CardTitle className="text-lg">Order #{order.id}</CardTitle>
                            <CardDescription>{formatDate(order.date_created)}</CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className={getStatusColor(order.status)}>
                              <span className="mr-1">{getStatusIcon(order.status)}</span>
                              {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4">
                        <div className="space-y-2">
                          {order.line_items.map((item) => (
                            <div key={item.id} className="flex justify-between text-sm py-1">
                              <span className="text-gray-700">
                                {item.name} <span className="text-gray-400">x{item.quantity}</span>
                              </span>
                              <span className="font-medium">
                                {order.currency === "INR" ? "₹" : order.currency}{" "}
                                {item.total}
                              </span>
                            </div>
                          ))}
                          <div className="border-t pt-3 mt-3 flex justify-between items-center">
                            <span className="text-sm text-gray-500">
                              {order.payment_method_title}
                            </span>
                            <span className="text-lg font-bold">
                              {order.currency === "INR" ? "₹" : order.currency}{" "}
                              {order.total}
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Not logged in: WhatsApp OTP login form */
            <div className="max-w-md mx-auto">
              {step === "phone" && (
                <Card>
                  <CardHeader className="text-center">
                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-2">
                      <Phone className="w-8 h-8 text-green-600" />
                    </div>
                    <CardTitle>Login with WhatsApp</CardTitle>
                    <CardDescription>
                      Enter your phone number to receive an OTP and view your orders
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="orders-phone">Phone Number</Label>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-medium">+91</span>
                        <Input
                          id="orders-phone"
                          type="tel"
                          placeholder="10 digit phone number"
                          value={phoneNumber}
                          onChange={(e) =>
                            setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 10))
                          }
                          maxLength={10}
                          className="flex-1 h-11"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="orders-name">Name (Optional)</Label>
                      <Input
                        id="orders-name"
                        placeholder="Your name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="h-11"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="orders-email">Email (Optional)</Label>
                      <Input
                        id="orders-email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-11"
                      />
                    </div>

                    <Button
                      className="w-full h-11 bg-primary text-white hover:bg-brand-ink"
                      onClick={handleSendOTP}
                      disabled={isLoading || phoneNumber.length !== 10}
                    >
                      {isLoading ? (
                        <>
                          <CircleNotch className="mr-2 h-4 w-4 animate-spin" />
                          Sending OTP...
                        </>
                      ) : (
                        <>
                          <ChatText className="mr-2 h-4 w-4" />
                          Send OTP via WhatsApp
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              )}

              {step === "otp" && (
                <Card>
                  <CardHeader className="text-center">
                    <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-2">
                      <ChatText className="w-8 h-8 text-green-600" />
                    </div>
                    <CardTitle>Enter OTP</CardTitle>
                    <CardDescription>
                      We sent a 6-digit OTP to <strong>+91 {phoneNumber}</strong> via WhatsApp
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label className="block text-center">Enter 6-digit OTP</Label>
                      <div className="flex justify-center">
                        <InputOTP maxLength={6} value={otp} onChange={(value) => setOtp(value)}>
                          <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                          </InputOTPGroup>
                        </InputOTP>
                      </div>
                    </div>

                    <Button
                      className="w-full h-11 bg-primary text-white hover:bg-brand-ink"
                      onClick={handleVerifyOTP}
                      disabled={isLoading || otp.length !== 6}
                    >
                      {isLoading ? (
                        <>
                          <CircleNotch className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        "Verify OTP"
                      )}
                    </Button>

                    <div className="text-center space-y-2">
                      {countdown > 0 ? (
                        <p className="text-sm text-muted-foreground">Resend OTP in {countdown}s</p>
                      ) : (
                        <button
                          type="button"
                          onClick={handleResendOTP}
                          className="text-sm text-primary hover:underline"
                          disabled={isLoading}
                        >
                          Resend OTP
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setStep("phone");
                          setOtp("");
                          setCountdown(0);
                        }}
                        className="text-sm text-muted-foreground hover:underline block mx-auto"
                      >
                        Change phone number
                      </button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Orders;
