import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";

const StorySection = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="py-12 lg:py-20 bg-muted">
      <div className="container mx-auto px-4 max-w-5xl">
        <h2 className="font-heading text-2xl lg:text-3xl font-semibold text-center mb-10">
          Our Story
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Founder Image */}
          <div className="flex justify-center lg:sticky lg:top-24">
            <div className="relative">
              <img
                src="/founder.jpg"
                alt="Usha Nandhini Saravanan - Founder of Kayals Lifestyle"
                className="w-72 md:w-80 lg:w-full max-w-sm rounded-2xl shadow-lg object-cover"
                loading="lazy"
                decoding="async"
                width="384"
                height="512"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent rounded-b-2xl p-4 pt-10">
                <p className="text-white font-heading font-semibold text-lg">Usha Nandhini Saravanan</p>
                <p className="text-white/80 text-sm">Founder, Kayals Lifestyle</p>
              </div>
            </div>
          </div>

          {/* Story Content */}
          <div className="text-muted-foreground leading-relaxed space-y-4 text-[15px]">
            <p className="text-foreground font-semibold text-lg italic">
              "Why not create a brand dedicated to people like me who love black?"
            </p>
            <p>
              That's how <strong className="text-foreground">Kayals Lifestyle</strong> was born.
            </p>
            <p>
              I'm Usha Nandhini Saravanan, the founder of this brand. I was born and raised in Chennai in a simple lower-middle-class family. Growing up, life was never easy financially. From a young age, I was constantly told that education was the only way to build a secure future, so I focused entirely on studying and scoring well.
            </p>
            <p>
              I worked hard and scored 493/500 in my 10th standard, which earned me a free seat at Velammal School. Later, with strong scores again, I secured admission to Anna University. Instead of choosing a common path, I took up Automobile Engineering because I wanted to do something different.
            </p>
            <p>
              But somewhere along the way, I realized something important — I had always been living based on what others expected from me. Good marks, good college, good placement... everything planned by others. Nothing was truly my choice.
            </p>
            <p className="text-foreground font-medium">
              For the first time, I asked myself: What do I really want to do?
            </p>
            <p>
              I didn't have a clear answer. But I knew one thing — <strong className="text-foreground">I loved black.</strong> Black outfits, black bags, black accessories... everything black.
            </p>

            {/* Expandable section */}
            <div className={`space-y-4 overflow-hidden transition-all duration-500 ${expanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}`}>
              <p>
                I started with almost no investment. I borrowed small amounts from friends and began selling online through Instagram. I curated only black dresses and accessories. Slowly, customers started noticing. Orders came in. The brand began to grow.
              </p>
              <p>
                But the journey wasn't smooth. There was no family support initially. I was pressured to attend placements and take a regular job. It took me nearly two years to convince my family that this business was my dream. Eventually, they understood and stood by me.
              </p>
              <p>
                As the brand grew, customers requested more colors and wider collections. So I evolved. From a niche black-only store, we expanded into a full-fledged fashion brand while still keeping black as our signature identity.
              </p>
              <p>
                To provide better quality at better prices, I researched fabrics and suppliers and discovered that most major sourcing happens in Surat, Gujarat. With limited income at home and family responsibilities, I made a bold decision — I moved to Surat alone to grow the business.
              </p>
              <p className="text-foreground font-medium">
                It was not easy. Language barriers. Dealer issues. Accommodation struggles. Food problems. Even discrimination at times. But quitting was never an option.
              </p>
              <p>
                Slowly, we built strong supplier networks, opened our own office, and strengthened operations. One of the biggest pillars of my journey has been my husband. Even though he had different career goals, he chose to support my dream wholeheartedly and helped take this business to the next level.
              </p>
              <p>
                Today, we have our own office and our own manufacturing unit in Surat. From reselling, we've moved into in-house production, which allows us to control quality and offer the best prices to our customers.
              </p>
              <p>We are continuously working to improve:</p>
              <ul className="list-disc list-inside space-y-1 pl-2">
                <li>Quality</li>
                <li>Customer service</li>
                <li>Faster delivery</li>
                <li>Better experience</li>
              </ul>
              <p>
                None of this would have been possible without our customers and followers. As an introvert who once never stepped out much, the love and support from our community gave me the courage to grow beyond my limits.
              </p>
              <p className="text-foreground font-medium italic">
                My biggest dream is to open a premium flagship showroom in Chennai — a building fully designed around our brand identity, with an entire floor dedicated exclusively to Kayals Lifestyle and black collections.
              </p>
              <p>
                And this is just the beginning. We still have a long way to go, and we are committed to improving every single day. Your feedback, trust, and support mean everything to us.
              </p>
              <p className="text-sm text-muted-foreground/80">
                Many of you often ask why we speak Tamil in our videos while our website shows a Surat address. The reason is simple — we are originally from Chennai, but we moved our operations to Surat to scale the business, source better fabrics, and manufacture directly. Being in Surat helps us reduce costs and deliver better quality products at more affordable prices. No matter where we operate from, our roots will always remain Tamil, and Chennai will always be home.
              </p>
              <p className="text-foreground font-semibold pt-2">
                Thank you for being part of our journey.
              </p>
              <p className="text-muted-foreground italic">
                With gratitude,<br />
                Usha Nandhini Saravanan<br />
                Founder, Kayals Lifestyle
              </p>
            </div>

            {/* Read More / Less button */}
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#800000] hover:text-[#600000] transition-colors pt-1"
            >
              {expanded ? (
                <>Read Less <CaretUp className="w-4 h-4" /></>
              ) : (
                <>Read Full Story <CaretDown className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StorySection;
