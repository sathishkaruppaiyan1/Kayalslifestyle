import {
    Carousel,
    CarouselContent,
    CarouselItem,
    CarouselNext,
    CarouselPrevious,
} from "@/components/ui/carousel";
import { useCarouselAutoplay } from "@/hooks/useCarouselAutoplay";

const reviewImages = [
    {
        src: "/Kayals-1.jpeg",
        alt: "Kayals Lifestyle customer review 1",
    },
    {
        src: "/Kayals-2.jpeg",
        alt: "Kayals Lifestyle customer review 2",
    },
    {
        src: "/Kayals-3.jpeg",
        alt: "Kayals Lifestyle customer review 3",
    },
];

const INSTAGRAM_REVIEWS_URL =
    "https://www.instagram.com/kayalslifestylefamily?stkn=bjk3NGJwM3kwMmo4";

interface ReviewsSliderProps {
    /** Images from the homepage builder; omit to use the bundled screenshots. */
    images?: { src: string; alt: string }[];
    title?: string;
}

const ReviewsSlider = ({ images = reviewImages, title = "kayalslifestyle Family Happy Customers" }: ReviewsSliderProps = {}) => {
    const autoplay = useCarouselAutoplay(4000);

    if (images.length === 0) return null;

    return (
        <div className="py-12 bg-muted/30">
            <div className="container mx-auto px-4">
                <div className="flex justify-center text-center">
                    <h2 className="section-title rule-gold text-xl font-extrabold text-[#6B1F2A] text-center mb-[10px] md:text-2xl">
                        <span className="section-title-highlight">{title}</span>
                    </h2>
                </div>

                <Carousel
                    opts={{ align: "start", loop: true }}
                    plugins={autoplay}
                    className="w-full"
                >
                    <CarouselContent className="-ml-3 sm:-ml-5">
                        {images.map((image) => (
                            <CarouselItem
                                key={image.src}
                                className="basis-full pl-3 sm:basis-1/2 sm:pl-5 lg:basis-1/3"
                            >
                                <div className="overflow-hidden rounded-lg border-2 border-brand-tint-strong bg-background p-1 shadow-md transition-shadow hover:shadow-lg">
                                    <img
                                        src={image.src}
                                        alt={image.alt}
                                        loading="lazy"
                                        decoding="async"
                                        className="aspect-[4/3] w-full object-cover"
                                    />
                                </div>
                            </CarouselItem>
                        ))}
                    </CarouselContent>

                    <CarouselPrevious className="hidden lg:flex" />
                    <CarouselNext className="hidden lg:flex" />
                </Carousel>

                <div className="mt-8 flex justify-center">
                    <a
                        href={INSTAGRAM_REVIEWS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-brand-ink"
                    >
                        See More Customer Reviews
                    </a>
                </div>
            </div>
        </div>
    );
};

export default ReviewsSlider;
