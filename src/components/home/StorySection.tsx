import { useState } from "react";
import { CaretDown, CaretUp } from "@phosphor-icons/react";
import type { StoryContent } from "@/hooks/useHomepage";

/**
 * Our Story — the founders' account of how Kayalslifestyle Boutique began.
 *
 * Desktop: founders' portrait on the left (sticky, so it stays in view while
 * the story scrolls), story on the right. Mobile: portrait above the story.
 * Everything after the opening sits behind "Read Full Story" so the homepage
 * does not turn into a 700-word wall of text.
 *
 * The copy comes from the WordPress Homepage Builder plugin (Founder Story
 * section, plugin ≥ 1.6). DEFAULT_STORY below is the same text, kept so the
 * section still reads correctly when the plugin is absent or older — it is
 * what the plugin itself pre-fills on install, so the two never disagree.
 */

/** Ships with the storefront; used when the plugin sets no portrait. */
const DEFAULT_PORTRAIT = "/Kayals-4.jpeg";

const DEFAULT_STORY: StoryContent = {
  title: "Our Story",
  subtitle: "Two Sisters. One Dream. One Journey.",
  image: "",
  image_alt: "Kayal and Madhu, Founders of Kayalslifestyle Boutique",
  name: "Kayal & Madhu",
  role: "Founders, Kayalslifestyle Boutique",
  read_more: "Read Full Story",
  read_less: "Read Less",
  intro: `
<p>Hi, I'm Kayal, one of the founders of <strong>Kayalslifestyle Boutique</strong>, alongside my sister Madhu.</p>
<p>From childhood, I have always loved dressing up. I was naturally drawn to clothes, colours, designs, fabrics, and the little details that make an outfit special. I was always curious about clothing and the world behind it.</p>
<p>My Appa had a passion for tailoring and creating, but somewhere along the way, he had to let go of that passion.</p>
<p>Watching that stayed with me.</p>
<p>And somewhere inside, I made a strong promise to myself:</p>
<blockquote><p>"The passion that my Appa had to leave behind… I will never let mine stop."</p></blockquote>
<p>That belief became one of the strongest reasons I wanted to build something of my own.</p>
<p>Somewhere along the way, that curiosity became a thought:</p>
<blockquote><p>"One day, I want to start something of my own in clothing."</p></blockquote>
<p>But I never imagined that this little thought would one day become Kayalslifestyle Boutique.</p>
<h3>It All Started During COVID</h3>
<p>In 2020, during the uncertainty of the COVID period, I decided to start Kayalslifestyle as a second source of income while I was working as an Accountant.</p>
<p>It was a small beginning.</p>
<p>It wasn't a huge business in the beginning.</p>
<p>It was simply a small step towards something I had always wanted to do.</p>
<p>I started with limited collections, learning everything along the way — understanding customers, selecting designs, handling orders, packing, communicating with customers, and slowly learning what women truly wanted.</p>
<p>There was no perfect business plan.</p>
<p>There was just faith, curiosity, and the courage to start.</p>
<p>And that little beginning slowly started becoming something much bigger.</p>
`,
  more: `
<h3>In 2024, my sister Madhu joined this journey</h3>
<p>After completing her college, Madhu joined me in 2024 and chose to fully dedicate herself to this business, leaving behind further job opportunities.</p>
<p>That was a very special turning point.</p>
<p>What started as my little dream became our shared dream.</p>
<p>Together, we started exploring more collections, understanding fashion trends, meeting suppliers, making decisions, handling challenges, and dreaming bigger.</p>
<h3>It gave us an identity</h3>
<p>Every order, every customer, every message, every repeat purchase, every new connection has been a small part of our journey.</p>
<p>Over these 6 years, we have earned something we value more than numbers.</p>
<h3>More Than a Boutique</h3>
<p>Kayalslifestyle is not simply a clothing business for us.</p>
<p>It is a reminder of where we came from.</p>
<p>It has given us opportunities we once only dreamed about.</p>
<p>It has given us confidence.</p>
<p>It has given us an identity.</p>
<p>And above all, it has taught us that you don't need to start big to build something meaningful.</p>
<p><strong>You just need to start — and never stop believing in your journey.</strong></p>
<h3>Six Years. Countless Lessons. One Beautiful Journey</h3>
<p>When we look back, we don't just see orders and sales.</p>
<p>We see people who trusted us.</p>
<p>From our early customers to the many women who continue to shop with us, every order has been a small chapter in our story.</p>
<p>We have been fortunate to send many shipments across India and abroad, receive wholesale orders, and create reselling opportunities for women entrepreneurs who wanted to start something of their own.</p>
<p>Being able to become a small part of another woman's entrepreneurial journey is something we are truly proud of.</p>
<h3>Kayalslifestyle is more than a business to us</h3>
<p>It is our passion, our identity, our family legacy, and the journey that brought us to where we are today.</p>
`,
};

/**
 * Editor HTML styled to match the rest of the page. `space-y-4` handles the
 * gaps between blocks, so the element rules only set what a paragraph does
 * not already get right. (Tailwind's typography plugin isn't installed here,
 * so `prose-*` classes would do nothing.)
 */
const PROSE =
  "space-y-4 " +
  "[&_h3]:font-heading [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:pt-4 " +
  "[&_strong]:text-foreground [&_strong]:font-semibold " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-4 [&_blockquote]:py-1 " +
  "[&_blockquote]:italic [&_blockquote]:text-foreground [&_blockquote]:font-medium " +
  "[&_blockquote_p]:m-0 " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 " +
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2";

const StorySection = ({ story }: { story?: Partial<StoryContent> }) => {
  const [expanded, setExpanded] = useState(false);

  // A section saved with an empty field means "nothing here", not "use the
  // default" — except for the portrait, which lives with the storefront.
  const s: StoryContent = { ...DEFAULT_STORY, ...story };
  const portrait = s.image || DEFAULT_PORTRAIT;
  const hasMore = s.more.trim().length > 0;

  return (
    <section className="py-12 lg:py-20 bg-muted">
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Heading */}
        <div className="flex flex-col items-center text-center mb-8">
          {s.title && (
            <h2 className="section-title rule-gold text-xl font-extrabold text-[#6B1F2A] text-center mb-[10px] md:text-2xl">
              {s.title}
            </h2>
          )}
          {s.subtitle && (
            <p className="mt-5 text-base lg:text-lg italic text-brand-ink font-medium">
              {s.subtitle}
            </p>
          )}
        </div>

        {/* Portrait left / story right on desktop; stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 lg:gap-16 items-start">
          <figure className="text-center lg:sticky lg:top-28">
            <img
              src={portrait}
              alt={s.image_alt}
              loading="lazy"
              decoding="async"
              className="w-full aspect-[4/3] object-[center_28%] lg:h-auto lg:max-w-[480px] lg:aspect-[4/5] lg:object-[center_top] mx-auto rounded-lg object-cover shadow-card transition-transform duration-300 hover:scale-[1.02]"
            />
            {(s.name || s.role) && (
              <figcaption className="mt-4">
                {s.name && (
                  <p className="text-foreground font-semibold text-base lg:text-lg">
                    {s.name}
                  </p>
                )}
                {s.role && (
                  <p className="text-sm text-muted-foreground">{s.role}</p>
                )}
              </figcaption>
            )}
          </figure>

          {/* Story */}
          <div className="text-muted-foreground leading-relaxed space-y-4 text-[15px]">
            <div
              className={PROSE}
              dangerouslySetInnerHTML={{ __html: s.intro }}
            />

            {hasMore && (
              <>
                {/* Collapsed until "Read Full Story" */}
                <div
                  className={`overflow-hidden transition-all duration-500 ${
                    expanded ? "max-h-[6000px] opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <div
                    className={PROSE}
                    dangerouslySetInnerHTML={{ __html: s.more }}
                  />

                  {/* Sign-off */}
                  {(s.name || s.role) && (
                    <div className="pt-4 border-t border-border mt-6">
                      {s.name && (
                        <p className="text-foreground font-semibold">— {s.name}</p>
                      )}
                      {s.role && <p className="text-sm">{s.role} ❤️</p>}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setExpanded(!expanded)}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink hover:text-primary transition-colors pt-2"
                >
                  {expanded ? (
                    <>
                      {s.read_less} <CaretUp className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      {s.read_more} <CaretDown className="w-4 h-4" />
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default StorySection;
