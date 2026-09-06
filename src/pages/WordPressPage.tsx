import { useParams, useLocation } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import PageBand from "@/components/layout/PageBand";
import { useWordPressPageBySlugs } from "@/hooks/useWooCommerce";
import { Skeleton } from "@/components/ui/skeleton";

/** Decode HTML entities like &amp; &lt; &#8217; etc. */
const decodeHtmlEntities = (text: string) => {
  const doc = new DOMParser().parseFromString(text, "text/html");
  return doc.documentElement.textContent || text;
};

// Map route slugs to WordPress page/post slugs (tried in order)
// Kayals Lifestyle: about-us, privacy-policy, refund-returns, shipping-policy, terms-condtions
const slugMap: Record<string, string[]> = {
  "about": ["about-us", "about", "about-us-2"],
  "about-us": ["about-us", "about"],
  "terms": ["terms-condtions", "terms-conditions", "terms-and-conditions", "terms", "tnc"],
  "shipping": ["shipping-policy", "shipping", "delivery-policy"],
  "privacy": ["privacy-policy", "privacy"],
  "refund": ["refund-returns", "refund-and-returns", "refund", "returns", "return-policy"],
};

const pageTitles: Record<string, string> = {
  "about": "About Us",
  "about-us": "About Us",
  "terms": "Terms & Conditions",
  "shipping": "Shipping Policy",
  "privacy": "Privacy Policy",
  "refund": "Refund & Returns",
};

interface WordPressPageProps {
  /** When set, used instead of pathname/params so the correct WordPress page is fetched (fixes footer links all showing same page). */
  routeSlug?: string;
}

const WordPressPage = ({ routeSlug: propSlug }: WordPressPageProps) => {
  const { slug: paramSlug } = useParams();
  const location = useLocation();

  const pathSlug = location.pathname.replace("/", "").split("/")[0];
  const routeSlug = propSlug ?? paramSlug ?? pathSlug;

  const possibleSlugs = routeSlug ? (slugMap[routeSlug] || [routeSlug]) : [];
  const fallbackTitle = routeSlug ? (pageTitles[routeSlug] || routeSlug) : "";

  // Fetch content directly from WordPress by trying each slug (pages then posts)
  const { data: page, isLoading, error } = useWordPressPageBySlugs(possibleSlugs);

  const displayTitle = page?.title ? decodeHtmlEntities(page.title) : fallbackTitle;

  return (
    <Layout>
      {/* Page header — same gold band as the archive pages. */}
      <PageBand title={isLoading ? " " : displayTitle} crumbs={[{ label: displayTitle }]} />

      <div className="container mx-auto px-4 py-8 lg:py-12">
        {isLoading ? (
          <div className="max-w-4xl mx-auto space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Failed to load page content. Please try again later.</p>
          </div>
        ) : page ? (
          <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-6 lg:p-10">
            <article
              className="prose prose-lg max-w-none text-left
                prose-headings:font-heading prose-headings:text-foreground prose-headings:font-bold prose-headings:text-left
                prose-h1:text-3xl prose-h1:mb-6 prose-h1:mt-8 prose-h1:border-b prose-h1:border-border prose-h1:pb-3 prose-h1:text-left
                prose-h2:text-2xl prose-h2:mb-4 prose-h2:mt-8 prose-h2:font-semibold prose-h2:text-left
                prose-h3:text-xl prose-h3:mb-3 prose-h3:mt-6 prose-h3:font-semibold prose-h3:text-left
                prose-h4:text-lg prose-h4:mb-2 prose-h4:mt-4 prose-h4:text-left
                prose-p:text-foreground prose-p:leading-7 prose-p:mb-4 prose-p:text-base prose-p:text-left
                prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-a:font-medium
                prose-strong:text-foreground prose-strong:font-bold
                prose-ul:text-foreground prose-ul:my-4 prose-ul:pl-6 prose-ul:text-left
                prose-ol:text-foreground prose-ol:my-4 prose-ol:pl-6 prose-ol:text-left
                prose-li:mb-2 prose-li:leading-7 prose-li:text-base prose-li:text-left
                prose-li:marker:text-primary prose-li:marker:font-bold
                prose-blockquote:border-l-4 prose-blockquote:border-primary prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:my-4 prose-blockquote:text-left
                prose-hr:my-8 prose-hr:border-border
                prose-table:w-full prose-table:my-6 prose-table:border-collapse prose-table:text-left
                prose-th:border prose-th:border-border prose-th:bg-muted prose-th:p-3 prose-th:text-left prose-th:font-semibold
                prose-td:border prose-td:border-border prose-td:p-3 prose-td:text-left
                prose-img:rounded-lg prose-img:my-6 prose-img:shadow-md prose-img:mx-auto
                prose-code:text-sm prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded
                prose-pre:bg-muted prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: page.content }}
            />
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Page not found.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default WordPressPage;
