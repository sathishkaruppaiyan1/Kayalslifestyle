export interface ProductColor {
  name: string;
  hex: string;
  image: string;
}

export interface VariationImages {
  color: string;
  images: string[];
  attributes?: {
    id: number;
    name: string;
    option: string;
  }[];
  id?: number;
  stockQuantity?: number;
  stockStatus?: string;
}

export interface Variation {
  id: number;
  color: string;
  size: string | null;
  /** Values of any other variation attributes (e.g. { Model: "iPhone 15" }) */
  extras?: Record<string, string>;
  stockQuantity: number | null;
  stockStatus: string;
  manageStock: boolean;
}

export interface ExtraAttribute {
  name: string;
  options: string[];
}

export interface Product {
  id: string;
  name: string;
  slug?: string;
  price: number;
  originalPrice?: number;
  category: string;
  categorySlug?: string;
  categoryId?: string;
  colors: ProductColor[] | string[];
  sizes: string[];
  images: string[];
  variationImages?: VariationImages[];
  variations?: Variation[];
  /** Variation attributes other than color/size (e.g. Model) */
  extraAttributes?: ExtraAttribute[];
  description: string;
  shortDescription?: string;
  fabric?: string;
  length?: string;
  isNew?: boolean;
  isSoldOut?: boolean;
  inStock?: boolean;
  stockQuantity?: number;
  discount?: number;
  sku?: string;
  type?: 'simple' | 'variable' | 'grouped' | 'external';
  averageRating?: string;
  ratingCount?: number;
  dispatchTime?: string; // Dispatch time in days (e.g., "5 days", "3-5 days", "7 days")
  shippingPolicy?: string;
  returnPolicy?: string;
  washCare?: string;
}

export interface Category {
  id: string;
  name: string;
  image: string;
  slug: string;
  parentId?: string | null;
}
