import { useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { CircleNotch, Package, Truck, CheckCircle, Clock, WarningCircle } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";

interface OrderStatus {
    id: number;
    status: string;
    date: string;
    total: string;
    items: number;
    payment_method: string;
}

const TrackOrder = () => {
    const [orderId, setOrderId] = useState("");
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
    const [hasSearched, setHasSearched] = useState(false);
    const { toast } = useToast();

    const handleTrack = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!orderId || !email) {
            toast({
                title: "Missing Information",
                description: "Please enter both Order ID and Billing Email.",
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        setOrderStatus(null);
        setHasSearched(true);

        try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
            const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

            // Fetch orders by email
            const response = await fetch(
                `${supabaseUrl}/functions/v1/woocommerce-orders?email=${encodeURIComponent(email)}`,
                {
                    method: "GET",
                    headers: {
                        "apikey": supabaseKey,
                        "Authorization": `Bearer ${supabaseKey}`,
                        "Content-Type": "application/json",
                    },
                }
            );

            if (!response.ok) {
                throw new Error("Failed to fetch order information");
            }

            const data = await response.json();
            const orders = data.orders || [];

            // Find the specific order
            const foundOrder = orders.find((o: any) => o.id.toString() === orderId.toString());

            if (foundOrder) {
                setOrderStatus({
                    id: foundOrder.id,
                    status: foundOrder.status,
                    date: new Date(foundOrder.date_created).toLocaleDateString(),
                    total: foundOrder.total + " " + foundOrder.currency,
                    items: foundOrder.line_items.reduce((acc: number, item: any) => acc + item.quantity, 0),
                    payment_method: foundOrder.payment_method_title,
                });
                toast({
                    title: "Order Found",
                    description: `Showing status for Order #${foundOrder.id}`,
                });
            } else {
                toast({
                    title: "Order Not Found",
                    description: "We couldn't find an order with that ID and email combination.",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Tracking error:", error);
            toast({
                title: "Error",
                description: "Something went wrong while tracking your order. Please try again.",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const getStatusStep = (status: string) => {
        const s = status.toLowerCase();
        if (s === "completed") return 4;
        if (s === "processing" || s === "on-hold") return 2;
        if (s === "pending") return 1;
        if (s === "cancelled" || s === "failed" || s === "refunded") return -1;
        return 1;
    };

    const steps = [
        { title: "Order Placed", icon: Clock },
        { title: "Processing", icon: Package },
        { title: "On The Way", icon: Truck },
        { title: "Delivered", icon: CheckCircle },
    ];

    const currentStep = orderStatus ? getStatusStep(orderStatus.status) : 0;
    const isCancelled = orderStatus && currentStep === -1;

    return (
        <Layout>
            <div className="bg-gray-50 min-h-[60vh] py-12 md:py-20">
                <div className="container mx-auto px-4 max-w-3xl">
                    <div className="text-center mb-10">
                        <h1 className="font-heading text-3xl md:text-4xl font-bold mb-4">Track Your Order</h1>
                        <p className="text-gray-600">Enter your order details below to check the current status.</p>
                    </div>

                    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 md:p-8">
                        <form onSubmit={handleTrack} className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                            <div className="space-y-2">
                                <Label htmlFor="order-id">Order ID</Label>
                                <Input
                                    id="order-id"
                                    placeholder="e.g. 12345"
                                    value={orderId}
                                    onChange={(e) => setOrderId(e.target.value)}
                                    className="h-12"
                                />
                                <p className="text-xs text-muted-foreground ml-1">Found in your order confirmation email.</p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Billing Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="e.g. john@example.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="h-12"
                                />
                                <p className="text-xs text-muted-foreground ml-1">Email address used during checkout.</p>
                            </div>

                            <div className="md:col-span-2 pt-2">
                                <Button
                                    type="submit"
                                    className="w-full h-12 text-base font-medium bg-primary hover:bg-brand-ink text-white"
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <>
                                            <CircleNotch className="mr-2 h-5 w-5 animate-spin" />
                                            Tracking...
                                        </>
                                    ) : (
                                        "Track Order"
                                    )}
                                </Button>
                            </div>
                        </form>

                        {hasSearched && !orderStatus && !isLoading && (
                            <div className="text-center py-8 bg-gray-50 rounded-lg">
                                <WarningCircle className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                                <h3 className="text-lg font-medium text-gray-900">No order found</h3>
                                <p className="text-gray-500 max-w-xs mx-auto mt-1">
                                    Please check your Order ID and Billing Email and try again.
                                </p>
                            </div>
                        )}

                        {orderStatus && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                <div className="border-t border-gray-100 pt-8 mt-4">
                                    <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                                        <div>
                                            <h3 className="text-xl font-bold">Order #{orderStatus.id}</h3>
                                            <p className="text-gray-500">Placed on {orderStatus.date}</p>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-2xl font-bold text-primary">{orderStatus.total}</span>
                                            <span className="text-sm text-gray-500">{orderStatus.items} items</span>
                                        </div>
                                    </div>

                                    {isCancelled ? (
                                        <div className="bg-red-50 border border-red-100 rounded-lg p-4 flex items-center gap-3 text-red-700">
                                            <WarningCircle className="h-5 w-5" />
                                            <span className="font-medium">This order has been {orderStatus.status.toLowerCase()}.</span>
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            {/* Progress Bar Background */}
                                            <div className="absolute top-5 left-0 w-full h-1 bg-gray-100 rounded-full hidden md:block"></div>

                                            {/* Progress Bar Fill */}
                                            <div
                                                className="absolute top-5 left-0 h-1 bg-primary rounded-full transition-all duration-1000 hidden md:block"
                                                style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
                                            ></div>

                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-0 relative">
                                                {steps.map((step, index) => {
                                                    const StepIcon = step.icon;
                                                    const isActive = index + 1 <= currentStep;
                                                    const isCurrent = index + 1 === currentStep;

                                                    return (
                                                        <div key={index} className="flex flex-row md:flex-col items-center gap-4 md:gap-2 z-10">
                                                            <div className={`
                                w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-300
                                ${isActive ? "bg-primary border-primary text-white" : "bg-white border-gray-200 text-gray-300"}
                                ${isCurrent ? "ring-4 ring-primary/20 scale-110" : ""}
                              `}>
                                                                <StepIcon className="h-5 w-5" />
                                                            </div>
                                                            <div className="flex flex-col md:items-center md:text-center">
                                                                <span className={`font-medium ${isActive ? "text-gray-900" : "text-gray-400"}`}>
                                                                    {step.title}
                                                                </span>
                                                                {isCurrent && (
                                                                    <span className="text-xs text-primary font-medium mt-0.5 md:mt-1 px-2 py-0.5 bg-primary/10 rounded-full">
                                                                        Current Status
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="mt-10 bg-blue-50 text-blue-800 p-4 rounded-lg text-sm">
                                        <p>
                                            Status: <span className="font-bold capitalize">{orderStatus.status}</span>.
                                            Payment Method: <span className="font-semibold">{orderStatus.payment_method}</span>.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Layout>
    );
};

export default TrackOrder;
