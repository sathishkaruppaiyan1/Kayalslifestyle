import { Link, Navigate, useParams } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import PageBand from "@/components/layout/PageBand";
import CategoryGrid, { useCategoryTree } from "@/components/home/CategoryGrid";
import type { Category } from "@/types/product";

/**
 * /categories            → top-level categories only
 * /categories/<slug>     → that category's sub-categories, plus a "shop all"
 *                          link for the products filed directly under it.
 * Leaf categories (no children) never get a page here — their cards link
 * straight to /collections/<slug>.
 */
const Categories = () => {
  const { slug } = useParams<{ slug?: string }>();
  const { categories, childrenOf, isLoading } = useCategoryTree();

  // Top level
  if (!slug) {
    return (
      <Layout>
        <CategoryGrid title="Categories" />
      </Layout>
    );
  }

  const current = categories.find((c) => c.slug === slug);

  if (isLoading) {
    return (
      <Layout>
        <CategoryGrid parentId="__loading__" title="Categories" />
      </Layout>
    );
  }

  // Unknown slug, or a leaf category — the products page is the right place.
  if (!current || !(childrenOf.get(current.id)?.length)) {
    return <Navigate to={current ? `/collections/${current.slug}` : "/categories"} replace />;
  }

  // Breadcrumb trail: walk up the parents.
  const trail: Category[] = [];
  let cursor: Category | undefined = current;
  while (cursor) {
    trail.unshift(cursor);
    const parentId = cursor.parentId;
    cursor = parentId && String(parentId) !== "0" ? categories.find((c) => c.id === String(parentId)) : undefined;
  }

  return (
    <Layout>
      <PageBand
        title={current.name}
        crumbs={[
          { label: "Categories", href: "/categories" },
          ...trail.map((c, i) => ({
            label: c.name,
            href: i < trail.length - 1 ? `/categories/${c.slug}` : undefined,
          })),
        ]}
      />
      <div className="container mx-auto px-4 pt-6 flex justify-center">
        <Link
          to={`/collections/${current.slug}`}
          className="inline-flex items-center rounded-md border border-foreground px-5 py-2 text-sm font-semibold hover:bg-foreground hover:text-background transition-colors"
        >
          Shop all {current.name}
        </Link>
      </div>
      <CategoryGrid parentId={current.id} title={`${current.name} Collections`} />
    </Layout>
  );
};

export default Categories;
