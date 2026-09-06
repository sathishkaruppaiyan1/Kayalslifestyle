import { Link } from "react-router-dom";

/**
 * PageBand — the full-width gold title band that opens every archive-style
 * page, matching the reference storefront (kayalslifestyle.com).
 *
 * Used by the collection/archive page, cart, wishlist, size chart and CMS
 * pages so all of them share one band, one type scale and one palette.
 */

export interface Crumb {
  label: string;
  href?: string;
}

interface PageBandProps {
  title: string;
  /** Optional line under the breadcrumb, e.g. "128 products". */
  subtitle?: string;
  /** Breadcrumb trail; "Home" is prepended automatically. */
  crumbs?: Crumb[];
}

const PageBand = ({ title, subtitle, crumbs = [] }: PageBandProps) => {
  const trail: Crumb[] = [{ label: "Home", href: "/" }, ...crumbs];

  return (
    <>
      <div className="page-band py-10 lg:py-14 text-center">
        <div className="container mx-auto px-4">
          <h1 className="page-band-title">{title}</h1>
        </div>
      </div>

      {(trail.length > 1 || subtitle) && (
        <div className="container mx-auto px-4 pt-5">
          <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
            {trail.map((crumb, i) => {
              const isLast = i === trail.length - 1;
              return (
                <span key={`${crumb.label}-${i}`}>
                  {i > 0 && <span className="mx-2 text-border">/</span>}
                  {crumb.href && !isLast ? (
                    <Link to={crumb.href} className="hover:text-brand-ink transition-colors">
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className={isLast ? "font-semibold text-foreground" : ""}>
                      {crumb.label}
                    </span>
                  )}
                </span>
              );
            })}
          </nav>

          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      )}
    </>
  );
};

export default PageBand;
