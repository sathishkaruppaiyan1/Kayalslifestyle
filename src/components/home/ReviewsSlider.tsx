import { Star, User } from "@phosphor-icons/react";
import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";

const reviews = [
    {
        id: 1,
        name: "Priya Sharma",
        rating: 5,
        text: "The quality of the fabric is amazing! Exceeded my expectations. Will definitely shop again.",
        date: "2 days ago"
    },
    {
        id: 2,
        name: "Anjali Gupta",
        rating: 5,
        text: "Beautiful design and perfect fit. I received so many compliments.",
        date: "1 week ago"
    },
    {
        id: 3,
        name: "Neha Patel",
        rating: 4,
        text: "Lovely collection. Shipping was fast and packaging was secure.",
        date: "2 weeks ago"
    },
    {
        id: 4,
        name: "Sneha Reddy",
        rating: 5,
        text: "Absolutely in love with the ethnic wear collection. Great prices too!",
        date: "3 weeks ago"
    },
    {
        id: 5,
        name: "Meera Singh",
        rating: 5,
        text: "Best customer service and returns were hassle-free. Highly recommended.",
        date: "1 month ago"
    }
];

const ReviewsSlider = () => {
    return (
        <div className="py-12 bg-muted/30">
            <div className="container mx-auto px-4">
                <h2 className="text-2xl font-heading font-bold mb-8 text-center">
                    What Our Customers Say
                </h2>

                <Carousel className="w-full max-w-4xl mx-auto">
                    <CarouselContent>
                        {reviews.map((review) => (
                            <CarouselItem key={review.id} className="md:basis-1/2 lg:basis-1/3 p-2">
                                <div className="bg-background p-6 rounded-lg shadow-sm border border-border h-full flex flex-col">
                                    <div className="flex items-center gap-1 mb-3 text-yellow-500">
                                        {[...Array(5)].map((_, i) => (
                                            <Star
                                                key={i}
                                                className={`h-4 w-4 ${i < review.rating ? "fill-current" : "text-muted"}`}
                                             weight="fill" />
                                        ))}
                                    </div>
                                    <p className="text-sm text-foreground mb-4 flex-1">"{review.text}"</p>
                                    <div className="flex items-center gap-2 mt-auto">
                                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                            <User className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold">{review.name}</p>
                                            <p className="text-xs text-muted-foreground">{review.date}</p>
                                        </div>
                                    </div>
                                </div>
                            </CarouselItem>
                        ))}
                    </CarouselContent>
                    <CarouselPrevious className="hidden md:flex" />
                    <CarouselNext className="hidden md:flex" />
                </Carousel>
            </div>
        </div>
    );
};

export default ReviewsSlider;
