import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";

/**
 * Our Story — the founders' account of how Kayalslifestyle Boutique began.
 *
 * Opens with the "Happy Customers Family" group photo as a full-width banner,
 * then runs the story in a single centred column. Everything from the 2024
 * chapter onward sits behind "Read Full Story" so the homepage does not turn
 * into a 700-word wall of text.
 *
 * TODO: a portrait of Kayal & Madhu goes above the sign-off — drop the file in
 * public/ and render it where FOUNDER_PORTRAIT is referenced below.
 */

const StorySection = () => {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="py-12 lg:py-20 bg-muted">
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Heading */}
        <div className="flex flex-col items-center text-center mb-8">
          <h2 className="section-title rule-gold">Our Story</h2>
          <p className="mt-5 text-base lg:text-lg italic text-brand-ink font-medium">
            Two Sisters. One Dream. One Journey.
          </p>
        </div>

        {/* Happy Customers Family banner */}
        <figure className="mb-10">
          <img
            src="/happy-customers-family.jpg"
            alt="The Happy Customers Family of Kayalslifestyle, photographed together in gold sarees"
            className="w-full h-auto rounded-lg shadow-card animate-zoom-out"
            loading="lazy"
            decoding="async"
            width="1200"
            height="801"
          />
        </figure>

        {/* Story */}
        <div className="text-muted-foreground leading-relaxed space-y-4 text-[15px]">
          <p>
            Hi, I'm Kayal, one of the founders of{" "}
            <strong className="text-foreground font-semibold">Kayalslifestyle Boutique</strong>,
            alongside my sister Madhu.
          </p>
          <p>
            From childhood, I have always loved dressing up. I was naturally drawn to clothes,
            colours, designs, fabrics, and the little details that make an outfit special. I was
            always curious about clothing and the world behind it.
          </p>
          <p>
            My Appa had a passion for tailoring and creating, but somewhere along the way, he had to
            let go of that passion.
          </p>
          <p>Watching that stayed with me.</p>
          <p>And somewhere inside, I made a strong promise to myself:</p>

          <blockquote className="border-l-2 border-primary pl-4 py-1 italic text-foreground font-medium">
            "The passion that my Appa had to leave behind… I will never let mine stop."
          </blockquote>

          <p>
            That belief became one of the strongest reasons I wanted to build something of my own.
          </p>
          <p>Somewhere along the way, that curiosity became a thought:</p>

          <blockquote className="border-l-2 border-primary pl-4 py-1 italic text-foreground font-medium">
            "One day, I want to start something of my own in clothing."
          </blockquote>

          <p>
            But I never imagined that this little thought would one day become Kayalslifestyle
            Boutique.
          </p>

          <h3 className="font-heading text-lg font-semibold text-foreground pt-4">
            It All Started During COVID
          </h3>
          <p>
            In 2020, during the uncertainty of the COVID period, I decided to start Kayalslifestyle
            as a second source of income while I was working as an Accountant.
          </p>
          <p>It was a small beginning.</p>
          <p>It wasn't a huge business in the beginning.</p>
          <p>It was simply a small step towards something I had always wanted to do.</p>
          <p>
            I started with limited collections, learning everything along the way — understanding
            customers, selecting designs, handling orders, packing, communicating with customers,
            and slowly learning what women truly wanted.
          </p>
          <p>There was no perfect business plan.</p>
          <p>There was just faith, curiosity, and the courage to start.</p>
          <p>And that little beginning slowly started becoming something much bigger.</p>

          {/* Everything below is collapsed until "Read Full Story" */}
          <div
            className={`space-y-4 overflow-hidden transition-all duration-500 ${
              expanded ? "max-h-[6000px] opacity-100" : "max-h-0 opacity-0"
            }`}
          >
            <h3 className="font-heading text-lg font-semibold text-foreground pt-4">
              In 2024, my sister Madhu joined this journey
            </h3>
            <p>
              After completing her college, Madhu joined me in 2024 and chose to fully dedicate
              herself to this business, leaving behind further job opportunities.
            </p>
            <p>That was a very special turning point.</p>
            <p>What started as my little dream became our shared dream.</p>
            <p>
              Together, we started exploring more collections, understanding fashion trends, meeting
              suppliers, making decisions, handling challenges, and dreaming bigger.
            </p>

            <h3 className="font-heading text-lg font-semibold text-foreground pt-4">
              It gave us an identity
            </h3>
            <p>
              Every order, every customer, every message, every repeat purchase, every new
              connection has been a small part of our journey.
            </p>
            <p>
              Over these 6 years, we have earned something we value more than numbers.
            </p>

            <h3 className="font-heading text-lg font-semibold text-foreground pt-4">
              More Than a Boutique
            </h3>
            <p>Kayalslifestyle is not simply a clothing business for us.</p>
            <p>It is a reminder of where we came from.</p>
            <p>It has given us opportunities we once only dreamed about.</p>
            <p>It has given us confidence.</p>
            <p>It has given us an identity.</p>
            <p>
              And above all, it has taught us that you don't need to start big to build something
              meaningful.
            </p>
            <p className="text-foreground font-medium">
              You just need to start — and never stop believing in your journey.
            </p>

            <h3 className="font-heading text-lg font-semibold text-foreground pt-4">
              Six Years. Countless Lessons. One Beautiful Journey
            </h3>
            <p>When we look back, we don't just see orders and sales.</p>
            <p>We see people who trusted us.</p>
            <p>
              From our early customers to the many women who continue to shop with us, every order
              has been a small chapter in our story.
            </p>
            <p>
              We have been fortunate to send many shipments across India and abroad, receive
              wholesale orders, and create reselling opportunities for women entrepreneurs who
              wanted to start something of their own.
            </p>
            <p>
              Being able to become a small part of another woman's entrepreneurial journey is
              something we are truly proud of.
            </p>

            <h3 className="font-heading text-lg font-semibold text-foreground pt-4">
              Kayalslifestyle is more than a business to us
            </h3>
            <p>
              It is our passion, our identity, our family legacy, and the journey that brought us to
              where we are today.
            </p>

            {/* Sign-off */}
            <div className="pt-4 border-t border-border mt-6">
              <p className="text-foreground font-semibold">— Kayal &amp; Madhu</p>
              <p className="text-sm">Founders, Kayalslifestyle Boutique ❤️</p>
            </div>
          </div>

          {/* Read More / Less */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink hover:text-primary transition-colors pt-2"
          >
            {expanded ? (
              <>
                Read Less <CaretUp className="w-4 h-4" />
              </>
            ) : (
              <>
                Read Full Story <CaretDown className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
};

export default StorySection;
