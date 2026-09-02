import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { CheckCircle } from "@phosphor-icons/react";
import Layout from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";

interface OrderDetails {
  orderId: string;
  name: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
    size?: string;
    color?: string;
    image?: string;
  }>;
  total: number;
}

const ThankYou = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const orderDetails = location.state as OrderDetails | null;

  useEffect(() => {
    // Redirect to home if no order details
    if (!orderDetails) {
      navigate("/");
    }
  }, [orderDetails, navigate]);

  if (!orderDetails) {
    return null;
  }

  const formatPrice = (price: number) => `Rs. ${price.toLocaleString("en-IN")}.00`;

  return (
    <Layout>
      <div className="min-h-screen bg-background py-12">
        <div className="container mx-auto px-4 max-w-2xl">
          {/* Success Icon */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold mb-4">Thank You So Much!</h1>
            <p className="text-lg text-muted-foreground">
              Thank you so much for ordering from us.
            </p>
          </div>

          {/* Order Confirmation Card */}
          <div className="bg-muted p-6 mb-8">
            <div className="text-center mb-6">
              <p className="text-lg font-bold mb-2">Your order is confirmed.</p>
              <p className="text-xl font-bold">
                Your order id: <span className="text-primary">{orderDetails.orderId}</span>
              </p>
            </div>

            <div className="border-t border-border pt-6 space-y-4">
              <div className="flex items-start gap-3">
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="#25D366"
                  className="flex-shrink-0 mt-0.5"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                <div>
                  <p className="text-sm text-muted-foreground">
                    You will receive order confirmation to your WhatsApp from our number:
                  </p>
                  <p className="font-bold text-lg">7990190234</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <svg
                  viewBox="0 0 24 24"
                  width="24"
                  height="24"
                  fill="#25D366"
                  className="flex-shrink-0 mt-0.5"
                >
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                <div>
                  <p className="text-sm text-muted-foreground">
                    For any enquiries kindly WhatsApp to this number only:
                  </p>
                  <p className="font-bold text-lg">7990190234</p>
                </div>
              </div>
            </div>
          </div>

          {/* Order Details */}
          <div className="bg-background border border-border p-6 mb-8">
            <h2 className="text-lg font-bold mb-4">Order Details</h2>
            
            <div className="space-y-4">
              {orderDetails.items.map((item, index) => (
                <div key={index} className="flex justify-between items-start border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="flex gap-4">
                    {item.image && (
                      <div className="w-16 h-20 flex-shrink-0 bg-muted">
                        <img 
                          src={item.image} 
                          alt={item.name} 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    <div>
                      <p className="font-bold">{item.name}</p>
                      {(item.size || item.color) && (
                        <p className="text-sm text-muted-foreground">
                          {[item.size, item.color].filter(Boolean).join(" / ")}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                  </div>
                  <p className="font-bold">{formatPrice(item.price * item.quantity)}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-border mt-4 pt-4">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total</span>
                <span>{formatPrice(orderDetails.total)}</span>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          <div className="bg-background border border-border p-6 mb-8">
            <h2 className="text-lg font-bold mb-4">Shipping Address</h2>
            <p className="font-bold">{orderDetails.name}</p>
            <p className="text-muted-foreground whitespace-pre-line">{orderDetails.address}</p>
            <p className="mt-2">Phone: {orderDetails.phone}</p>
            <p>Email: {orderDetails.email}</p>
          </div>

          {/* Continue Shopping */}
          <div className="text-center">
            <Link to="/collections/all">
              <Button className="bg-foreground text-background hover:bg-foreground/90 rounded-none font-bold px-8 h-12">
                CONTINUE SHOPPING
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ThankYou;
