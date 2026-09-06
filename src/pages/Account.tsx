import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CircleNotch, Phone, ChatText, Package, MapPin, User, SignOut, PencilSimple, FloppyDisk, X } from "@phosphor-icons/react";
import { useUserOrders, type WooCommerceOrder } from "@/hooks/useWooCommerce";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Step = "phone" | "otp" | "success";
type AccountTab = "orders" | "addresses" | "details";

const Account = () => {
  const navigate = useNavigate();
  const { user, login, logout, isAuthenticated } = useAuth();
  const [step, setStep] = useState<Step>("phone");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Account page states
  const [activeTab, setActiveTab] = useState<AccountTab>("orders");
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedEmail, setEditedEmail] = useState("");

  // Fetch orders - normalize phone number (remove +91 if present, keep just 10 digits)
  const normalizedPhone = user?.phoneNumber 
    ? user.phoneNumber.replace(/^\+?91/, '').replace(/\D/g, '').slice(-10)
    : undefined;
  
  const { data: orders = [], isLoading: ordersLoading } = useUserOrders(
    user?.email,
    normalizedPhone
  );

  // Extract unique addresses from orders
  const addresses = orders.reduce((acc: any[], order: WooCommerceOrder) => {
    const billingAddress = {
      type: "Billing",
      name: `${order.billing.first_name} ${order.billing.last_name}`.trim(),
      address: `${order.billing.address_1}${order.billing.address_2 ? `, ${order.billing.address_2}` : ""}`,
      city: order.billing.city,
      state: order.billing.state,
      postcode: order.billing.postcode,
      country: order.billing.country,
      phone: order.billing.phone,
      email: order.billing.email,
    };

    const shippingAddress = {
      type: "Shipping",
      name: `${order.shipping.first_name} ${order.shipping.last_name}`.trim(),
      address: `${order.shipping.address_1}${order.shipping.address_2 ? `, ${order.shipping.address_2}` : ""}`,
      city: order.shipping.city,
      state: order.shipping.state,
      postcode: order.shipping.postcode,
      country: order.shipping.country,
    };

    // Check if address already exists
    const billingExists = acc.some(
      (addr) =>
        addr.address === billingAddress.address &&
        addr.city === billingAddress.city &&
        addr.postcode === billingAddress.postcode
    );
    if (!billingExists) acc.push(billingAddress);

    const shippingExists = acc.some(
      (addr) =>
        addr.address === shippingAddress.address &&
        addr.city === shippingAddress.city &&
        addr.postcode === shippingAddress.postcode
    );
    if (!shippingExists && JSON.stringify(billingAddress) !== JSON.stringify(shippingAddress)) {
      acc.push(shippingAddress);
    }

    return acc;
  }, []);

  // Initialize edit states
  useEffect(() => {
    if (user) {
      setEditedName(user.name || "");
      setEditedEmail(user.email || "");
    }
  }, [user]);

  // Cleanup countdown interval on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const handleUpdateDetails = async () => {
    if (!user) return;

    setIsLoading(true);
    try {
      // Update in Supabase users table
      const { error } = await supabase
        .from("users")
        .update({
          name: editedName || null,
          email: editedEmail || null,
          updated_at: new Date().toISOString(),
        })
        .eq("phone_number", user.phoneNumber);

      if (error) throw error;

      // Update in AuthContext
      login(user.phoneNumber, editedName || undefined, editedEmail || undefined);
      
      toast.success("Account details updated successfully!");
      setIsEditingDetails(false);
    } catch (error: any) {
      console.error("Error updating details:", error);
      toast.error(error?.message || "Failed to update account details");
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = (status: string) => {
    const statusMap: Record<string, string> = {
      completed: "bg-green-100 text-green-800",
      processing: "bg-blue-100 text-blue-800",
      pending: "bg-yellow-100 text-yellow-800",
      cancelled: "bg-red-100 text-red-800",
      refunded: "bg-gray-100 text-gray-800",
    };
    return statusMap[status] || "bg-gray-100 text-gray-800";
  };

  // If already logged in, show account info
  if (isAuthenticated && user) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-heading">My Account</h1>
            <Button
              variant="outline"
              onClick={() => {
                logout();
                setStep("phone");
                setPhoneNumber("");
                setOtp("");
              }}
            >
              <SignOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AccountTab)} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="orders">
                <Package className="mr-2 h-4 w-4" />
                Orders
              </TabsTrigger>
              <TabsTrigger value="addresses">
                <MapPin className="mr-2 h-4 w-4" />
                Addresses
              </TabsTrigger>
              <TabsTrigger value="details">
                <User className="mr-2 h-4 w-4" />
                Account Details
              </TabsTrigger>
            </TabsList>

            <TabsContent value="orders" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>My Orders</CardTitle>
                  <CardDescription>View all your past and current orders</CardDescription>
                </CardHeader>
                <CardContent>
                  {ordersLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <CircleNotch className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No orders found</p>
                      <Button
                        className="mt-4"
                        onClick={() => navigate("/")}
                      >
                        Start Shopping
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {orders.map((order) => (
                        <Card key={order.id} className="border">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <CardTitle className="text-lg">
                                  Order #{order.id}
                                </CardTitle>
                                <CardDescription>
                                  {formatDate(order.date_created)}
                                </CardDescription>
                              </div>
                              <Badge className={getStatusColor(order.status)}>
                                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Total:</span>
                                <span className="font-semibold">
                                  {order.currency} {order.total}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Payment:</span>
                                <span>{order.payment_method_title}</span>
                              </div>
                              <div className="mt-3 pt-3 border-t">
                                <p className="text-sm font-medium mb-2">Items:</p>
                                <div className="space-y-1">
                                  {order.line_items.map((item) => (
                                    <div key={item.id} className="flex justify-between text-sm">
                                      <span>
                                        {item.name} × {item.quantity}
                                      </span>
                                      <span>{order.currency} {item.total}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="addresses" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Saved Addresses</CardTitle>
                  <CardDescription>Addresses from your orders</CardDescription>
                </CardHeader>
                <CardContent>
                  {addresses.length === 0 ? (
                    <div className="text-center py-12">
                      <MapPin className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">No addresses found</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Your addresses will appear here after you place an order
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {addresses.map((address, index) => (
                        <Card key={index} className="border">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base">{address.type} Address</CardTitle>
                              <Badge variant="outline">{address.type}</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-1 text-sm">
                            <p className="font-medium">{address.name}</p>
                            <p>{address.address}</p>
                            <p>
                              {address.city}, {address.state} {address.postcode}
                            </p>
                            <p>{address.country}</p>
                            {address.phone && <p className="pt-2">Phone: {address.phone}</p>}
                            {address.email && <p>Email: {address.email}</p>}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="details" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Account Details</CardTitle>
                      <CardDescription>Manage your account information</CardDescription>
                    </div>
                    {!isEditingDetails && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditingDetails(true)}
                      >
                        <PencilSimple className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Phone Number</Label>
                      <Input value={`+91 ${user.phoneNumber}`} disabled />
                      <p className="text-xs text-muted-foreground">
                        Phone number cannot be changed
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="account-name">Name</Label>
                      {isEditingDetails ? (
                        <Input
                          id="account-name"
                          value={editedName}
                          onChange={(e) => setEditedName(e.target.value)}
                          placeholder="Your name"
                        />
                      ) : (
                        <Input value={user.name || "Not set"} disabled />
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="account-email">Email</Label>
                      {isEditingDetails ? (
                        <Input
                          id="account-email"
                          type="email"
                          value={editedEmail}
                          onChange={(e) => setEditedEmail(e.target.value)}
                          placeholder="your@email.com"
                        />
                      ) : (
                        <Input value={user.email || "Not set"} disabled />
                      )}
                    </div>

                    {isEditingDetails && (
                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={handleUpdateDetails}
                          disabled={isLoading}
                          className="flex-1"
                        >
                          {isLoading ? (
                            <>
                              <CircleNotch className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <FloppyDisk className="mr-2 h-4 w-4" />
                              FloppyDisk Changes
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setIsEditingDetails(false);
                            setEditedName(user.name || "");
                            setEditedEmail(user.email || "");
                          }}
                          disabled={isLoading}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </Layout>
    );
  }

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

      if (error) {
        throw error;
      }

      if (data?.success) {
        toast.success("OTP sent to your WhatsApp!");
        setOtpSent(true);
        setStep("otp");
        setCountdown(60); // 60 second countdown
        
        // Clear any existing interval
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
        }
        
        // Start countdown
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

      if (error) {
        throw error;
      }

      if (data?.success) {
        // Login user
        login(phoneNumber, data.user?.name || name, data.user?.email || email);
        toast.success("Login successful!");
        setStep("success");
        setTimeout(() => {
          navigate("/");
        }, 1500);
      } else {
        throw new Error(data?.error || "Invalid OTP");
      }
    } catch (error: any) {
      console.error("Error verifying OTP:", error);
      toast.error(error?.message || "Invalid OTP. Please try again.");
      setOtp(""); // Clear OTP on error
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = () => {
    // Clear existing interval
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setOtp("");
    setOtpSent(false);
    setCountdown(0);
    handleSendOTP();
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-md">
        <h1 className="text-3xl font-heading text-center mb-8">Login / Sign Up</h1>

        {step === "phone" && (
          <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <Phone className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold">Login with WhatsApp</h2>
              <p className="text-sm text-muted-foreground">
                Enter your phone number to receive OTP via WhatsApp
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground font-medium">+91</span>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="10 digit phone number"
                    value={phoneNumber}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setPhoneNumber(value);
                    }}
                    maxLength={10}
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name (Optional)</Label>
                <Input
                  id="name"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email (Optional)</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <Button
                className="w-full bg-primary text-white hover:bg-brand-ink"
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
            </div>
          </div>
        )}

        {step === "otp" && (
          <div className="bg-white rounded-lg shadow-sm p-6 space-y-6">
            <div className="text-center space-y-2">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <ChatText className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold">Enter OTP</h2>
              <p className="text-sm text-muted-foreground">
                We sent a 6-digit OTP to <strong>+91 {phoneNumber}</strong> via WhatsApp
              </p>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Enter 6-digit OTP</Label>
                <div className="flex justify-center">
                  <InputOTP
                    maxLength={6}
                    value={otp}
                    onChange={(value) => setOtp(value)}
                  >
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
                className="w-full bg-primary text-white hover:bg-brand-ink"
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
                  <p className="text-sm text-muted-foreground">
                    Resend OTP in {countdown}s
                  </p>
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
                    setOtpSent(false);
                    setCountdown(0);
                  }}
                  className="text-sm text-muted-foreground hover:underline block mx-auto"
                >
                  Change phone number
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="bg-white rounded-lg shadow-sm p-6 text-center space-y-4">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"

                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold">Login Successful!</h2>
            <p className="text-sm text-muted-foreground">Redirecting to home...</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Account;
