import products from '@/data/products.json';
import categories from '@/data/categories.json';
import type { Localized } from '@/i18n/utils';

export interface Product {
  slug: string; category: string; order: number; featured: boolean;
  name: Localized; tagline: Localized; description: Localized;
  features: Localized[]; tags: string[];
  image: string; gallery: string[]; sourceImages: string[];
  shape: string; shapeParams: Record<string, unknown>;
  model: boolean; accent: string;
}
export interface Category { slug: string; order: number; icon: string; name: Localized; blurb: Localized; image: string }

export const allProducts = (products as Product[]).slice().sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);
export const allCategories = (categories as Category[]).slice().sort((a, b) => a.order - b.order);
export const byCategory = (slug: string) => allProducts.filter((p) => p.category === slug).sort((a, b) => a.order - b.order);
export const featured = () => allProducts.filter((p) => p.featured);
export const categoryOf = (p: Product) => allCategories.find((c) => c.slug === p.category)!;
