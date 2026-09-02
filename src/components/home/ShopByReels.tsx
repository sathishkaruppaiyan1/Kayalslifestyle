import { Play } from "@phosphor-icons/react";
import { Link } from "react-router-dom";

const reels = [
    {
        id: 1,
        video: "https://assets.mixkit.co/videos/preview/mixkit-fashion-model-posing-in-neon-light-398-large.mp4",
        title: "Summer Vibes",
        productLink: "/collections/all"
    },
    {
        id: 2,
        video: "https://assets.mixkit.co/videos/preview/mixkit-woman-posing-for-camera-in-winter-outfit-40039-large.mp4",
        title: "Winter Collection",
        productLink: "/collections/all"
    },
    {
        id: 3,
        video: "https://assets.mixkit.co/videos/preview/mixkit-young-woman-showing-dress-in-a-field-40040-large.mp4",
        title: "Floral Dreams",
        productLink: "/collections/all"
    },
    {
        id: 4,
        video: "https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-1232-large.mp4",
        title: "Night Out",
        productLink: "/collections/all"
    },
    {
        id: 5,
        video: "https://assets.mixkit.co/videos/preview/mixkit-woman-walking-in-slow-motion-40038-large.mp4",
        title: "Elegant Walk",
        productLink: "/collections/all"
    },
];

const ShopByReels = () => {
    return (
        <div className="py-12 bg-background border-t border-b border-border">
            <div className="container mx-auto px-4">
                <h2 className="text-2xl font-heading font-bold mb-8 text-center flex items-center justify-center gap-2">
                    Shop By Reels <span className="text-2xl ">🎬</span>
                </h2>

                <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
                    {reels.map((reel) => (
                        <div key={reel.id} className="relative flex-shrink-0 w-48 h-80 rounded-lg overflow-hidden group cursor-pointer">
                            <video
                                src={reel.video}
                                className="w-full h-full object-cover"
                                loop
                                muted
                                playsInline
                                onMouseOver={(e) => e.currentTarget.play()}
                                onMouseOut={(e) => e.currentTarget.pause()}
                            />
                            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <Play className="text-white fill-white h-12 w-12"  weight="fill" />
                            </div>

                            <Link to={reel.productLink} className="absolute bottom-4 left-4 right-4">
                                <button className="w-full bg-white/90 hover:bg-white text-black text-xs font-bold py-2 rounded">
                                    SHOP NOW
                                </button>
                            </Link>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ShopByReels;
